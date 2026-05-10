/**
 * Combinator SDK-based trading service.
 * Uses @zcomb/programs-sdk for direct on-chain interactions.
 *
 * This builds transactions client-side using the Anchor SDK,
 * which are then signed by the user's wallet and sent to Solana.
 */

import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { VaultClient, AMMClient, VaultType, FutarchyClient, ProposalState, parseProposalState, PRICE_SCALE, amm as ammUtils } from "@zcomb/programs-sdk";

// ── Types ────────────────────────────────────────────────────

export interface SdkQuote {
  inputAmount: string;
  outputAmount: string;
  minOutputAmount: string;
  priceImpact: number;
  spotPriceBefore: number;
  spotPriceAfter: number;
}

export interface SdkBalances {
  base: { userBalance: BN; condBalances: BN[] };
  quote: { userBalance: BN; condBalances: BN[] };
}

type WalletAdapter = {
  publicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
};

// ── SDK Client Factory ──────────────────────────────────────

import { getRpcUrl, getWsUrl } from "@/utils/rpc";

const RPC_URL = getRpcUrl();
const WS_URL = getWsUrl(RPC_URL);

function createProvider(wallet: WalletAdapter): AnchorProvider {
  const connection = new Connection(RPC_URL, "confirmed");
  return new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

function createVaultClient(wallet: WalletAdapter): VaultClient {
  return new VaultClient(createProvider(wallet));
}

function createAMMClient(wallet: WalletAdapter): AMMClient {
  return new AMMClient(createProvider(wallet));
}

/** Ensure transaction has a recent blockhash and feePayer set */
/** Build a fresh Transaction from Anchor builder instructions */
async function prepareTransaction(anchorTx: Transaction, wallet: WalletAdapter): Promise<Transaction> {
  const connection = new Connection(RPC_URL, "confirmed");
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

  // Create a fresh Transaction (same @solana/web3.js version as the rest of the app)
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = wallet.publicKey;

  // Copy instructions from the Anchor-built transaction
  for (const ix of anchorTx.instructions) {
    tx.add(ix);
  }

  return tx;
}

// ── Read-only provider (no wallet needed) ──────────────────

function createReadOnlyProvider(): AnchorProvider {
  const connection = new Connection(RPC_URL, "confirmed");
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async <T,>(tx: T) => tx,
    signAllTransactions: async <T,>(txs: T[]) => txs,
  };
  return new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
}

// ── Market Status (read-only, on-chain) ────────────────────

export interface SdkMarketOption {
  index: number;
  label: string;
  poolAddress: string;
  spotPrice: number;
  twapPrice: number;
  isLeading: boolean;
}

export interface SdkMarketStatus {
  proposalPda: string;
  state: string;
  numOptions: number;
  options: SdkMarketOption[];
  createdAt: number;
  endsAt: number;
  warmupEndsAt: number;
  isWarmup: boolean;
  isActive: boolean;
  isFinalized: boolean;
  isExpired: boolean;
  isTwapActive: boolean;
  winningIndex: number | null;
  leadingOption: string | null;
  vaultPda: string;
  baseMint: string;
  quoteMint: string;
  /** Decimals read from the base-mint account (offset 44). */
  baseDecimals: number;
  /** Decimals read from the quote-mint account (offset 44). */
  quoteDecimals: number;
  metadata: string | null;
}

const ZERO_POOL = "11111111111111111111111111111111";

/**
 * Read the `decimals` byte from an SPL Mint account buffer. The Mint
 * layout is fixed-offset, so no full deserialize is needed:
 *   mintAuthority (COption<Pubkey>) → 36 bytes
 *   supply        (u64)              →  8 bytes (offset 36)
 *   decimals      (u8)               →  1 byte  (offset 44)
 * Returns `null` if the buffer is too short (i.e. not a mint).
 */
function readMintDecimals(data: Buffer | Uint8Array | null | undefined): number | null {
  if (!data || data.length < 45) return null;
  return data[44];
}

export async function sdkGetMarketStatus(proposalPda: string, externalLabels?: string[], decimals?: { base: number; quote: number }): Promise<SdkMarketStatus> {
  const provider = createReadOnlyProvider();
  const futarchy = new FutarchyClient(provider);
  const connection = new Connection(RPC_URL, { commitment: "confirmed", disableRetryOnRateLimit: true });

  // First: fetch proposal in a single RPC call (no Anchor retries)
  const proposalPk = new PublicKey(proposalPda);
  const proposalInfo = await connection.getAccountInfo(proposalPk);
  if (!proposalInfo) throw new Error("Proposal account not found");
  const proposal = futarchy.program.coder.accounts.decode("proposalAccount", proposalInfo.data);

  // Parse state
  const { state, winningIdx } = parseProposalState(proposal.state);
  const isFinalized = state === ProposalState.Resolved;

  // Use SDK helpers for timing (they know the correct end-time calculation)
  const createdAtMs = proposal.createdAt.toNumber() * 1000;
  const warmupDurationMs = (proposal.config.warmupDuration ?? 0) * 1000;
  const warmupEndsAt = createdAtMs + warmupDurationMs;
  const timeRemainingSec = futarchy.getTimeRemaining(proposal);
  const isExpiredSDK = futarchy.isProposalExpired(proposal);
  const now = Date.now();
  const endsAt = now + timeRemainingSec * 1000;
  const isWarmup = state === ProposalState.Pending && now < warmupEndsAt;
  const isActive = state === ProposalState.Pending && !isExpiredSDK && !isWarmup;
  const isExpired = state === ProposalState.Pending && isExpiredSDK;
  const isTwapActive = !isFinalized && !isExpired && now >= warmupEndsAt;

  // Try to parse metadata as inline JSON (may be a CID — can't resolve without external fetch)
  let optionLabels: string[] = [];
  try {
    if (proposal.metadata) {
      const meta = JSON.parse(proposal.metadata);
      optionLabels = meta.options || meta.optionLabels || [];
    }
  } catch { /* metadata is likely a CID, not inline JSON — labels must be provided externally */ }

  // Fetch all pool accounts in a SINGLE RPC call via getMultipleAccounts
  const numOptions = proposal.numOptions;

  // Collect valid pool public keys + baseMint for supply
  const poolKeys: (PublicKey | null)[] = [];
  for (let i = 0; i < numOptions; i++) {
    const addr = proposal.pools[i].toString();
    poolKeys.push(addr !== ZERO_POOL ? proposal.pools[i] : null);
  }

  // Single RPC call for all pool accounts + baseMint + quoteMint. We read
  // decimals straight off the mint accounts instead of trusting a caller-
  // provided default — a wrong decimal assumption scales every spot/TWAP
  // price by 10^Δ, which was the root cause of historical "prices look way
  // too small" reports when base decimals ≠ 9.
  const validPoolKeys = poolKeys.filter((k): k is PublicKey => k !== null);
  const allKeys = [...validPoolKeys, proposal.baseMint, proposal.quoteMint];
  let allAccountInfos: (import("@solana/web3.js").AccountInfo<Buffer> | null)[] = [];
  try {
    allAccountInfos = await connection.getMultipleAccountsInfo(allKeys);
  } catch (err) {
    console.warn("[SDK] getMultipleAccountsInfo failed:", err);
  }

  // Derive real decimals from the mint accounts (offset 44). Fall back to
  // caller-provided defaults only if the mints aren't readable — e.g. an
  // RPC hiccup truncated the batch response.
  const baseMintInfo = allAccountInfos[validPoolKeys.length];
  const quoteMintInfo = allAccountInfos[validPoolKeys.length + 1];
  const baseDecimals =
    readMintDecimals(baseMintInfo?.data) ?? decimals?.base ?? 9;
  const quoteDecimals =
    readMintDecimals(quoteMintInfo?.data) ?? decimals?.quote ?? 6;

  // Parse base token supply from mint account (needed for market cap later).
  let tokenSupply = 0;
  if (baseMintInfo && baseMintInfo.data.length >= 44) {
    // SPL Mint layout: supply is a u64 at offset 36
    const supplyRaw = baseMintInfo.data.readBigUInt64LE(36);
    tokenSupply = Number(supplyRaw) / Math.pow(10, baseDecimals);
  }

  // Map pool keys to their account infos
  const accountMap = new Map<string, import("@solana/web3.js").AccountInfo<Buffer>>();
  validPoolKeys.forEach((key, i) => {
    if (allAccountInfos[i]) accountMap.set(key.toString(), allAccountInfos[i]!);
  });

  // Parse pool accounts using the AMM program's coder
  const amm = new AMMClient(provider);
  const calcTwap = ammUtils.calculateTwap;
  const options: SdkMarketOption[] = [];
  for (let i = 0; i < numOptions; i++) {
    const poolPk = proposal.pools[i];
    const poolAddr = poolPk.toString();
    const label = externalLabels?.[i] || optionLabels[i] || `Option ${i}`;

    let spotPrice = 0;
    let twapPrice = 0;

    const info = accountMap.get(poolAddr);
    if (info) {
      try {
        const pool = amm.program.coder.accounts.decode("poolAccount", info.data);
        // Use SDK's calculateTwap for correct TWAP (accounts for warmup period)
        const calcTwap = ammUtils.calculateTwap;

        // Oracle observations are in PRICE_SCALE (1e12).
        // Divide by PRICE_SCALE to get the raw price ratio (tokenA/tokenB).
        // Multiply by 10^(decimalsB - decimalsA) to get price in human units.
        // baseDecimals/quoteDecimals were read from the mint accounts above
        // so this matches combinator API's priceUsd field regardless of
        // which Ideacoin this market is built on.
        const priceScale = BigInt(PRICE_SCALE.toString());
        const decimalAdjust = Math.pow(10, baseDecimals - quoteDecimals);

        // Spot uses `lastPrice` (raw reserve ratio updated on every swap),
        // NOT `lastObservation` — the latter is the rate-limited version
        // clamped by `max_observation_delta` per crank for flash-loan
        // resistance on the TWAP. Showing it as "spot" makes a single
        // large trade appear as a slow staircase in the chart instead of
        // the actual post-trade price. `lastObservation` is correct for
        // TWAP inputs only.
        if (pool.oracle?.lastPrice) {
          const raw = BigInt(pool.oracle.lastPrice.toString());
          spotPrice = Number(raw) / Number(priceScale) * decimalAdjust;
        } else if (pool.oracle?.lastObservation) {
          // Fallback for pools initialized before `lastPrice` was tracked.
          const raw = BigInt(pool.oracle.lastObservation.toString());
          spotPrice = Number(raw) / Number(priceScale) * decimalAdjust;
        }

        // TWAP via SDK helper (accounts for warmup period)
        const twapBN = calcTwap(pool.oracle);
        if (twapBN) {
          const raw = BigInt(twapBN.toString());
          twapPrice = Number(raw) / Number(priceScale) * decimalAdjust;
        }
      } catch (err) {
        // decode may fail for uninitialized pools
      }
    }

    options.push({ index: i, label, poolAddress: poolAddr, spotPrice, twapPrice, isLeading: false });
  }

  // Mark leading option (highest TWAP)
  let highestTwap = -1;
  let leadingIdx = -1;
  for (const opt of options) {
    if (opt.twapPrice > highestTwap) {
      highestTwap = opt.twapPrice;
      leadingIdx = opt.index;
    }
  }
  if (leadingIdx >= 0 && options[leadingIdx]) {
    options[leadingIdx].isLeading = true;
  }

  return {
    proposalPda,
    state,
    numOptions,
    options,
    createdAt: createdAtMs,
    endsAt,
    warmupEndsAt,
    isWarmup,
    isActive: isWarmup || isActive,
    isFinalized,
    isExpired,
    isTwapActive,
    winningIndex: winningIdx,
    leadingOption: leadingIdx >= 0 ? options[leadingIdx]?.label : null,
    vaultPda: proposal.vault.toString(),
    baseMint: proposal.baseMint.toString(),
    quoteMint: proposal.quoteMint.toString(),
    baseDecimals,
    quoteDecimals,
    metadata: proposal.metadata || null,
  };
}

// ── Real-time pool subscriptions (on-chain WebSocket) ──────

export interface SdkPoolTick {
  /** Pool / option index (0..numOptions-1). */
  index: number;
  poolPda: string;
  spotPrice: number;
  twapPrice: number;
  /** Server-side slot when the update fired — useful for ordering. */
  slot: number;
}

/**
 * Subscribe to every pool account of a decision-market proposal and emit
 * decoded spot/TWAP prices on every on-chain change. Returns an async
 * unsubscribe fn.
 *
 * Implementation: each pool account is watched via
 * `Connection.onAccountChange`, which opens a WebSocket subscription to
 * the RPC (Helius/mainnet-beta both support it). Solana pushes updates
 * every time the account mutates — i.e. every trade — so the callback
 * fires at the same cadence as the Combinator SSE stream, but fetched
 * directly from chain.
 *
 * We decode with the same Anchor coder used by `sdkGetMarketStatus`, so
 * the numbers match byte-for-byte. Pools that fail to decode (warmup
 * state, migration, etc.) are silently skipped — the caller keeps the
 * last good tick.
 */
export async function sdkSubscribeMarket(
  proposalPda: string,
  onTick: (tick: SdkPoolTick) => void,
  decimals?: { base: number; quote: number }
): Promise<() => Promise<void>> {
  console.log("[combinator-debug] sdkSubscribeMarket: bootstrap start", { proposalPda, rpc: RPC_URL });
  const provider = createReadOnlyProvider();
  const futarchy = new FutarchyClient(provider);
  const amm = new AMMClient(provider);
  // Dedicated Connection so the caller can close subscriptions without
  // affecting any other RPC work tied to the shared provider.
  // `wsEndpoint` is critical when the HTTP URL is the same-origin proxy:
  // Pages Functions don't accept the WS upgrade, so we point web3.js at
  // the upstream wss:// URL directly. WebSockets aren't subject to CORS,
  // so this works without any allowlist on the Helius side.
  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    wsEndpoint: WS_URL,
  });

  // Bootstrap: fetch the proposal once to learn its pool addresses.
  const proposalPk = new PublicKey(proposalPda);
  let proposalInfo;
  try {
    proposalInfo = await connection.getAccountInfo(proposalPk);
  } catch (err) {
    console.error("[combinator-debug] sdkSubscribeMarket: getAccountInfo(proposal) failed — likely CORS or RPC down", err);
    throw err;
  }
  if (!proposalInfo) throw new Error("Proposal account not found");
  const proposal = futarchy.program.coder.accounts.decode("proposalAccount", proposalInfo.data);
  const numOptions: number = proposal.numOptions;

  // Derive real decimals from the base/quote mints — same rationale as in
  // `sdkGetMarketStatus`. Without this, live ticks would be scaled by a
  // different factor than the initial snapshot, producing a visible
  // discontinuity on the chart when the first on-chain change lands.
  let baseDecimals = decimals?.base ?? 9;
  let quoteDecimals = decimals?.quote ?? 6;
  try {
    const [baseMintInfo, quoteMintInfo] = await connection.getMultipleAccountsInfo([
      proposal.baseMint,
      proposal.quoteMint,
    ]);
    const b = readMintDecimals(baseMintInfo?.data);
    const q = readMintDecimals(quoteMintInfo?.data);
    if (b !== null) baseDecimals = b;
    if (q !== null) quoteDecimals = q;
  } catch {
    /* fall back to provided/default decimals */
  }

  const priceScale = BigInt(PRICE_SCALE.toString());
  const decimalAdjust = Math.pow(10, baseDecimals - quoteDecimals);

  // Decode a single pool account buffer to { spot, twap } using the same
  // math as `sdkGetMarketStatus`. Returned 0s mean "couldn't decode".
  //
  // Spot reads `lastPrice` (raw reserve ratio, updated every swap) instead
  // of `lastObservation` (rate-limited observation clamped per crank). The
  // observation is the right input for TWAP, but it intentionally lags the
  // true reserve ratio so a flash-loan can't spike it; using it as the
  // displayed "spot" turned every large trade into a multi-minute staircase
  // on the chart. TWAP still uses the SDK's calculateTwap helper which
  // reads `cumulative_observations`.
  const decodePool = (data: Buffer): { spot: number; twap: number } => {
    try {
      const pool = amm.program.coder.accounts.decode("poolAccount", data);
      let spot = 0;
      let twap = 0;
      const rawPrice = pool.oracle?.lastPrice ?? pool.oracle?.lastObservation;
      if (rawPrice) {
        const raw = BigInt(rawPrice.toString());
        spot = (Number(raw) / Number(priceScale)) * decimalAdjust;
      }
      const twapBN = ammUtils.calculateTwap(pool.oracle);
      if (twapBN) {
        const raw = BigInt(twapBN.toString());
        twap = (Number(raw) / Number(priceScale)) * decimalAdjust;
      }
      return { spot, twap };
    } catch {
      return { spot: 0, twap: 0 };
    }
  };

  const subs: { id: number; index: number }[] = [];

  for (let i = 0; i < numOptions; i++) {
    const poolPk = proposal.pools[i];
    const poolAddr = poolPk.toString();
    if (poolAddr === ZERO_POOL) continue;

    // Emit an initial tick from the current account snapshot so the UI
    // doesn't wait for the first on-chain change.
    const snapshot = await connection.getAccountInfo(poolPk);
    if (snapshot?.data) {
      const { spot, twap } = decodePool(snapshot.data);
      onTick({ index: i, poolPda: poolAddr, spotPrice: spot, twapPrice: twap, slot: 0 });
    }

    const subId = connection.onAccountChange(
      poolPk,
      (accountInfo, context) => {
        const { spot, twap } = decodePool(accountInfo.data);
        console.log("[combinator-debug] onAccountChange tick", { index: i, slot: context.slot, spot, twap });
        if (spot === 0 && twap === 0) return;
        onTick({ index: i, poolPda: poolAddr, spotPrice: spot, twapPrice: twap, slot: context.slot });
      },
      "confirmed"
    );
    console.log("[combinator-debug] WS subscription opened", { index: i, pool: poolAddr, subId });
    subs.push({ id: subId, index: i });
  }

  return async () => {
    await Promise.all(
      subs.map(({ id }) => connection.removeAccountChangeListener(id).catch(() => undefined))
    );
  };
}

// ── Balances (read-only) ───────────────────────────────────

export async function sdkGetBalances(
  wallet: WalletAdapter,
  vaultPda: string
): Promise<SdkBalances> {
  const client = createVaultClient(wallet);
  const vaultPk = new PublicKey(vaultPda);
  const [base, quote] = await Promise.all([
    client.fetchUserBalances(vaultPk, wallet.publicKey, VaultType.Base),
    client.fetchUserBalances(vaultPk, wallet.publicKey, VaultType.Quote),
  ]);
  return { base, quote };
}

// ── Deposit ─────────────────────────────────────────────────

export async function sdkDeposit(
  wallet: WalletAdapter,
  vaultPda: string,
  vaultType: "base" | "quote",
  amount: number,
  decimals: number
): Promise<Transaction> {
  const client = createVaultClient(wallet);
  const rawAmount = new BN(Math.floor(amount * 10 ** decimals));
  const type = vaultType === "base" ? VaultType.Base : VaultType.Quote;

  const builder = await client.deposit(
    wallet.publicKey,
    new PublicKey(vaultPda),
    type,
    rawAmount
  );

  return prepareTransaction(await builder.transaction(), wallet);
}

// ── Withdraw ────────────────────────────────────────────────

export async function sdkWithdraw(
  wallet: WalletAdapter,
  vaultPda: string,
  vaultType: "base" | "quote",
  amount: number,
  decimals: number
): Promise<Transaction> {
  const client = createVaultClient(wallet);
  const rawAmount = new BN(Math.floor(amount * 10 ** decimals));
  const type = vaultType === "base" ? VaultType.Base : VaultType.Quote;

  const builder = await client.withdraw(
    wallet.publicKey,
    new PublicKey(vaultPda),
    type,
    rawAmount
  );

  return prepareTransaction(await builder.transaction(), wallet);
}

// ── Redeem ──────────────────────────────────────────────────

export async function sdkRedeem(
  wallet: WalletAdapter,
  vaultPda: string,
  vaultType: "base" | "quote"
): Promise<Transaction> {
  const client = createVaultClient(wallet);
  const type = vaultType === "base" ? VaultType.Base : VaultType.Quote;

  const builder = await client.redeemWinnings(
    wallet.publicKey,
    new PublicKey(vaultPda),
    type
  );

  return prepareTransaction(await builder.transaction(), wallet);
}

// ── Swap ────────────────────────────────────────────────────

export async function sdkSwap(
  wallet: WalletAdapter,
  poolPda: string,
  swapAToB: boolean,
  amount: number,
  decimals: number,
  slippagePercent = 0.5
): Promise<{ tx: Transaction; quote: SdkQuote }> {
  const client = createAMMClient(wallet);
  const rawAmount = new BN(Math.floor(amount * 10 ** decimals));

  const { builder, quote } = await client.swapWithSlippage(
    wallet.publicKey,
    new PublicKey(poolPda),
    swapAToB,
    rawAmount,
    slippagePercent
  );

  return {
    tx: await prepareTransaction(await builder.transaction(), wallet),
    quote: {
      inputAmount: rawAmount.toString(),
      outputAmount: quote.outputAmount.toString(),
      minOutputAmount: quote.minOutputAmount.toString(),
      priceImpact: Number(quote.priceImpact) || 0,
      spotPriceBefore: Number(quote.spotPriceBefore) || 0,
      spotPriceAfter: Number(quote.spotPriceAfter) || 0,
    },
  };
}

// ── Deposit + Swap (combined atomic transaction) ──────────────

export async function sdkDepositAndSwap(
  wallet: WalletAdapter,
  vaultPda: string,
  depositVaultType: "base" | "quote",
  depositAmount: number,
  depositDecimals: number,
  poolPda: string,
  swapAToB: boolean,
  swapAmount: number,
  swapDecimals: number,
  slippagePercent = 0.5
): Promise<{ tx: Transaction; quote: SdkQuote }> {
  const vaultClient = createVaultClient(wallet);
  const ammClient = createAMMClient(wallet);

  const depositRaw = new BN(Math.floor(depositAmount * 10 ** depositDecimals));
  const type = depositVaultType === "base" ? VaultType.Base : VaultType.Quote;
  const depositBuilder = await vaultClient.deposit(wallet.publicKey, new PublicKey(vaultPda), type, depositRaw);

  const swapRaw = new BN(Math.floor(swapAmount * 10 ** swapDecimals));
  const { builder: swapBuilder, quote } = await ammClient.swapWithSlippage(wallet.publicKey, new PublicKey(poolPda), swapAToB, swapRaw, slippagePercent);

  // Combine both transactions' instructions into one
  const connection = new Connection(RPC_URL, "confirmed");
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = wallet.publicKey;

  const depositTx = await depositBuilder.transaction();
  const swapTx = await swapBuilder.transaction();
  for (const ix of depositTx.instructions) tx.add(ix);
  for (const ix of swapTx.instructions) tx.add(ix);

  return {
    tx,
    quote: {
      inputAmount: swapRaw.toString(),
      outputAmount: quote.outputAmount.toString(),
      minOutputAmount: quote.minOutputAmount.toString(),
      priceImpact: Number(quote.priceImpact) || 0,
      spotPriceBefore: Number(quote.spotPriceBefore) || 0,
      spotPriceAfter: Number(quote.spotPriceAfter) || 0,
    },
  };
}

// ── Quote (read-only, no wallet needed) ─────────────────────

export async function sdkQuote(
  poolPda: string,
  swapAToB: boolean,
  amount: number,
  decimals: number,
  slippagePercent = 0.5
): Promise<SdkQuote> {
  const connection = new Connection(RPC_URL, "confirmed");
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async <T,>(tx: T) => tx,
    signAllTransactions: async <T,>(txs: T[]) => txs,
  };
  const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
  const client = new AMMClient(provider);

  const rawAmount = new BN(Math.floor(amount * 10 ** decimals));
  const quote = await client.quote(new PublicKey(poolPda), swapAToB, rawAmount, slippagePercent);

  return {
    inputAmount: rawAmount.toString(),
    outputAmount: quote.outputAmount.toString(),
    minOutputAmount: quote.minOutputAmount.toString(),
    priceImpact: Number(quote.priceImpact) || 0,
    spotPriceBefore: Number(quote.spotPriceBefore) || 0,
    spotPriceAfter: Number(quote.spotPriceAfter) || 0,
  };
}
