/**
 * Combinator API service for decision market integration.
 *
 * Main API: https://api.zcombinator.io
 *
 * Trading flow: deposit → swap → withdraw/redeem
 * All state-changing operations use build/execute pattern with base58-encoded transactions.
 * See: https://docs.combinator.trade/api-reference/trading/overview
 *
 * Stats (volume/trades/traders) and chart history are served from our own
 * D1 tables (`combinator_trades`, `combinator_prices`). We intentionally
 * do NOT hit the third-party percent.markets monitor — it rate-limits,
 * lags real on-chain state, and makes the mini-app dependent on a service
 * we don't control.
 */

// REST APIs — used only for legacy trade operations (build/execute pattern)
// Market status + chart data now use the SDK + our own DB
const COMBINATOR_API = "https://api.zcombinator.io";

// ── Types ────────────────────────────────────────────────────

/** Raw proposal response from /dao/proposal/:pda */
export interface ProposalDetail {
  id: number;
  proposalPda: string;
  title: string;
  description: string;
  options: string[];
  status: "Pending" | "Resolved" | "Initialized";
  winningIndex: number | null;
  numOptions: number;
  createdAt: number; // unix ms
  endsAt: number;    // unix ms
  warmupEndsAt: number; // unix ms
  moderator: string;
  creator: string;
  vault: string;
  baseMint: string;
  quoteMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  pools: string[]; // pool addresses per option (11111... = no pool)
  metadataCid: string;
  daoPda: string;
  config: {
    length: number;      // seconds
    warmupDuration: number; // seconds
    marketBias: number;
    fee: number;
  };
}

/** Response from /dao/proposal/:pda/market-status */
export interface MarketStatusResponse {
  proposalPda: string;
  state: "initialized" | "pending" | "resolved";
  numOptions: number;
  winningIndex?: number;
  pools: {
    index: number;
    poolPda: string;
    spotPrice: string;
    twap: string | null;
    oracle?: { createdAt: number; warmupDuration: number; lastUpdate: number };
  }[];
  leadingOption: number | null;
  timing: {
    createdAt: number;
    length: number;
    endTime: number;
    timeRemaining: number;
    hasEnded: boolean;
  };
}

/** Response from /dao/proposal/:pda/balances/:wallet */
export interface BalancesResponse {
  proposalPda: string;
  wallet: string;
  vaultPda: string;
  base: { regular: string; conditionalBalances: string[] };
  quote: { regular: string; conditionalBalances: string[] };
}

/** Response from build endpoints (swap/deposit/withdraw/redeem) */
export interface BuildResponse {
  requestId: string;
  transaction: string; // base58-encoded unsigned transaction
  expiresAt: number;
  quote?: {
    inputAmount: string;
    outputAmount: string;
    minOutputAmount: string;
    priceImpact: number;
  };
  vaultPda?: string;
  vaultType?: string;
  amount?: string;
  winningIndex?: number;
}

/** Response from execute endpoints */
export interface ExecuteResponse {
  success: boolean;
  signature: string;
  proposalPda: string;
  poolPda?: string;
  vaultPda?: string;
  vaultType?: string;
}

/** Quote response from /dao/proposal/:pda/quote */
export interface QuoteResponse {
  proposalPda: string;
  poolIndex: number;
  poolPda: string;
  swapAToB: boolean;
  inputAmount: string;
  outputAmount: string;
  minOutputAmount: string;
  feeAmount: string;
  priceImpact: number;
  spotPriceBefore: string;
  spotPriceAfter: string;
}

/** Derived market status from proposal detail + monitoring data */
export interface MarketStatus {
  proposalPda: string;
  title: string;
  description: string;
  status: string;
  options: MarketOption[];
  startTime: number;    // unix ms
  warmupEndTime: number; // unix ms
  endTime: number;      // unix ms
  isWarmup: boolean;
  isActive: boolean;
  isFinalized: boolean;
  isTwapActive: boolean;
  leadingOption: string | null;
  winningIndex: number | null;
  volume: number;
  trades: number;
  traders: number;
  daoPda: string;
  vaultPda: string;
  baseMint: string;
  quoteMint: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseDecimals: number;
  quoteDecimals: number;
}

export interface MarketOption {
  index: number;
  label: string;
  poolAddress: string;
  twapPrice: number;
  spotPrice: number;
  isLeading: boolean;
}

// ── Helper ──────────────────────────────────────────────────

async function apiError(res: Response, fallback: string): Promise<never> {
  const err = await res.json().catch(() => ({}));
  throw new Error((err as { error?: string }).error || `${fallback}: ${res.status}`);
}

// ── Main API ─────────────────────────────────────────────────

/** Fetch proposal details */
export async function getProposalDetail(
  proposalPda: string
): Promise<ProposalDetail> {
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}`);
  if (!res.ok) return apiError(res, "Proposal detail failed");
  return res.json();
}

/** Fetch real-time market status (TWAP, spot prices, leading option) */
export async function getMarketStatusAPI(
  proposalPda: string
): Promise<MarketStatusResponse> {
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}/market-status`);
  if (!res.ok) return apiError(res, "Market status failed");
  return res.json();
}

/** Build a MarketStatus using on-chain SDK data + optional monitoring stats */
export async function getProposalMarketStatus(
  proposalPda: string,
  optionLabels?: string[]
): Promise<MarketStatus> {
  // Primary: use SDK to read on-chain state (no CORS issues). We do NOT
  // pass a decimals override — the SDK now reads base/quote decimals from
  // the mint accounts themselves so prices are correct regardless of
  // which Ideacoin backs the market. Hardcoding 9/6 here silently broke
  // any market whose base token wasn't 9-decimal (most of them).
  const { sdkGetMarketStatus } = await import("./combinatorSdk");
  const [sdk, stats] = await Promise.all([
    sdkGetMarketStatus(proposalPda, optionLabels),
    // Stats come from our own D1 `combinator_trades` table — every trade
    // the app writes is recorded there post-confirmation. Swallow failures
    // so a flaky stats call never blocks the on-chain market state.
    fetchOwnTradeStats(proposalPda).catch(() => ({
      trades: 0,
      traders: 0,
      volume: 0,
    })),
  ]);

  const options: MarketOption[] = sdk.options.map((opt) => ({
    index: opt.index,
    label: opt.label,
    poolAddress: opt.poolAddress,
    spotPrice: opt.spotPrice,
    twapPrice: opt.twapPrice,
    isLeading: opt.isLeading,
  }));

  return {
    proposalPda: sdk.proposalPda,
    title: "", // metadata may have title
    description: "",
    status: sdk.state,
    options,
    startTime: sdk.createdAt,
    warmupEndTime: sdk.warmupEndsAt,
    endTime: sdk.endsAt,
    isWarmup: sdk.isWarmup,
    isActive: sdk.isActive,
    isFinalized: sdk.isFinalized || sdk.isExpired,
    isTwapActive: sdk.isTwapActive,
    leadingOption: sdk.leadingOption,
    winningIndex: sdk.winningIndex,
    volume: stats.volume,
    trades: stats.trades,
    traders: stats.traders,
    daoPda: "",
    vaultPda: sdk.vaultPda,
    baseMint: sdk.baseMint,
    quoteMint: sdk.quoteMint,
    baseSymbol: resolveSymbol(sdk.baseMint),
    quoteSymbol: resolveSymbol(sdk.quoteMint),
    // Decimals come from the mint accounts themselves (read on-chain in the
    // SDK), not from KNOWN_MINTS — the latter only covers USDC/USDT/SOL
    // and would silently default to 9 for every Ideacoin, breaking trade
    // amount scaling as well as the price math.
    baseDecimals: sdk.baseDecimals,
    quoteDecimals: sdk.quoteDecimals,
  };
}

/** Known SPL token mints → symbol */
const KNOWN_MINTS: Record<string, { symbol: string; decimals: number }> = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC", decimals: 6 },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": { symbol: "USDT", decimals: 6 },
  "So11111111111111111111111111111111111111112": { symbol: "SOL", decimals: 9 },
};

function resolveSymbol(mint: string): string {
  return KNOWN_MINTS[mint]?.symbol || mint.slice(0, 4) + "..." + mint.slice(-4);
}

function resolveDecimals(mint: string): number {
  return KNOWN_MINTS[mint]?.decimals ?? 9; // default to 9 (most SPL tokens)
}

// ── Trading API ─────────────────────────────────────────────

/** Get swap quote */
export async function getSwapQuote(
  proposalPda: string,
  poolIndex: number,
  swapAToB: boolean,
  inputAmount: string
): Promise<QuoteResponse> {
  const params = new URLSearchParams({
    poolIndex: poolIndex.toString(),
    swapAToB: swapAToB.toString(),
    inputAmount,
  });
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}/quote?${params}`);
  if (!res.ok) return apiError(res, "Quote failed");
  return res.json();
}

/** Get user balances for a proposal */
export async function getUserBalances(
  proposalPda: string,
  wallet: string
): Promise<BalancesResponse> {
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}/balances/${wallet}`);
  if (!res.ok) return apiError(res, "Balances failed");
  return res.json();
}

// ── Swap (build/execute) ────────────────────────────────────

export async function buildSwap(
  proposalPda: string,
  wallet: string,
  poolIndex: number,
  swapAToB: boolean,
  inputAmount: string,
  slippageBps = 200
): Promise<BuildResponse> {
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}/swap/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, poolIndex, swapAToB, inputAmount, slippageBps }),
  });
  if (!res.ok) return apiError(res, "Build swap failed");
  return res.json();
}

export async function executeSwap(
  proposalPda: string,
  requestId: string,
  signedTransaction: string
): Promise<ExecuteResponse> {
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}/swap/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, signedTransaction }),
  });
  if (!res.ok) return apiError(res, "Execute swap failed");
  return res.json();
}

// ── Deposit (build/execute) ─────────────────────────────────

export async function buildDeposit(
  proposalPda: string,
  wallet: string,
  vaultType: "base" | "quote",
  amount: string
): Promise<BuildResponse> {
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}/deposit/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, vaultType, amount }),
  });
  if (!res.ok) return apiError(res, "Build deposit failed");
  return res.json();
}

export async function executeDeposit(
  proposalPda: string,
  requestId: string,
  signedTransaction: string
): Promise<ExecuteResponse> {
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}/deposit/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, signedTransaction }),
  });
  if (!res.ok) return apiError(res, "Execute deposit failed");
  return res.json();
}

// ── Withdraw (build/execute) ─────────────────────────────────

export async function buildWithdraw(
  proposalPda: string,
  wallet: string,
  vaultType: "base" | "quote",
  amount: string
): Promise<BuildResponse> {
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}/withdraw/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, vaultType, amount }),
  });
  if (!res.ok) return apiError(res, "Build withdraw failed");
  return res.json();
}

export async function executeWithdraw(
  proposalPda: string,
  requestId: string,
  signedTransaction: string
): Promise<ExecuteResponse> {
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}/withdraw/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, signedTransaction }),
  });
  if (!res.ok) return apiError(res, "Execute withdraw failed");
  return res.json();
}

// ── Redeem (build/execute) ───────────────────────────────────

export async function buildRedeem(
  proposalPda: string,
  wallet: string,
  vaultType: "base" | "quote"
): Promise<BuildResponse> {
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}/redeem/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, vaultType }),
  });
  if (!res.ok) return apiError(res, "Build redeem failed");
  return res.json();
}

export async function executeRedeem(
  proposalPda: string,
  requestId: string,
  signedTransaction: string
): Promise<ExecuteResponse> {
  const res = await fetch(`${COMBINATOR_API}/dao/proposal/${proposalPda}/redeem/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, signedTransaction }),
  });
  if (!res.ok) return apiError(res, "Execute redeem failed");
  return res.json();
}

// ── Create proposal (decision market) ─────────────────────────

export interface CreateProposalParams {
  wallet: string;
  dao_pda: string;
  title: string;
  description: string;
  options: string[];
}

export interface CreateProposalResponse {
  proposal_pda: string;
  proposal_id: number;
  metadata_cid: string;
  dao_pda: string;
  status: string;
}

/**
 * Sign a Combinator API request body using the wallet's signMessage.
 * Message format: "Combinator Authentication\n\nSign this message to verify your request.\n\nRequest hash: <sha256hex>"
 */
export async function signCombinatorRequest(
  payload: Record<string, unknown>,
  signMessage: (message: string) => Promise<Uint8Array>,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const message = `Combinator Authentication\n\nSign this message to verify your request.\n\nRequest hash: ${hashHex}`;
  const signatureBytes = await signMessage(message);
  // base58 encode the signature
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (const byte of signatureBytes) num = num * 256n + BigInt(byte);
  let encoded = "";
  while (num > 0n) { encoded = ALPHABET[Number(num % 58n)] + encoded; num /= 58n; }
  for (const byte of signatureBytes) { if (byte === 0) encoded = "1" + encoded; else break; }
  return encoded;
}

const PROPOSAL_LENGTH_SECS = 72 * 3600; // 72h
const PROPOSAL_WARMUP_SECS = 24 * 3600; // 24h

export async function createCombinatorProposal(
  params: CreateProposalParams,
  signMessage: (message: string) => Promise<Uint8Array>,
): Promise<CreateProposalResponse> {
  const payload: Record<string, unknown> = {
    wallet: params.wallet,
    dao_pda: params.dao_pda,
    title: params.title,
    description: params.description,
    length_secs: PROPOSAL_LENGTH_SECS,
    warmup_secs: PROPOSAL_WARMUP_SECS,
    options: params.options,
  };
  const signedHash = await signCombinatorRequest(payload, signMessage);
  const res = await fetch(`${COMBINATOR_API}/dao/proposal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, signed_hash: signedHash }),
  });
  if (!res.ok) return apiError(res, "Create proposal failed");
  return res.json();
}

// ── Own trade stats (D1: combinator_trades) ──────────────────

/**
 * One row from the `combinator_trades` D1 table as returned by
 * `GET /api/combinator-trades`. Only the fields the stats aggregation
 * needs are typed — everything else is ignored.
 */
interface OwnTradeRow {
  wallet: string;
  action: string;
  side: string | null;
  amount: number | null;
  token: string | null;
  timestamp: string;
}

/**
 * Aggregate volume / trade count / unique traders from our own D1 table.
 *
 * Volume is summed only for BUY legs, where `amount` is in USDG (the
 * quote token). SELL legs have `amount` denominated in the outcome token
 * and would need the per-fill price to convert back to USDG, which we
 * don't store. Skipping them is a conservative underestimate, not drift.
 *
 * We accept both `side === "BUY"` (our own custodial-trade writer) and
 * `token === "USDG"` (desktop CombinatorTrade writer) so the same stats
 * surface works across both entry points.
 */
async function fetchOwnTradeStats(
  proposalPda: string,
): Promise<{ trades: number; traders: number; volume: number }> {
  const res = await fetch(
    `/api/combinator-trades?proposal_pda=${encodeURIComponent(proposalPda)}&limit=500`,
  );
  if (!res.ok) throw new Error(`Trade stats failed: ${res.status}`);
  const json = (await res.json()) as { data?: OwnTradeRow[] };
  const rows = Array.isArray(json.data) ? json.data : [];

  const traders = new Set<string>();
  let volume = 0;
  for (const row of rows) {
    if (row.wallet) traders.add(row.wallet);
    const amt = Number(row.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const isBuy = (row.side ?? "").toUpperCase() === "BUY";
    if (isBuy || row.token === "USDG") volume += amt;
  }

  return { trades: rows.length, traders: traders.size, volume };
}

/**
 * Record a just-confirmed trade into our D1 `combinator_trades` table.
 * Fire-and-forget — the trade is already settled on-chain, and failing to
 * log it should never surface as a user-facing error. Callers must pass
 * the `tx_signature` returned by the swap endpoint so we can de-dupe
 * against it later if needed.
 */
export async function recordCombinatorTrade(params: {
  proposalPda: string;
  wallet: string;
  action: string;
  amount: number;
  token: string;
  txSignature: string;
  optionLabel?: string;
  optionIndex?: number;
  side?: string;
}): Promise<void> {
  try {
    await fetch("/api/combinator-trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposal_pda: params.proposalPda,
        wallet: params.wallet,
        action: params.action,
        option_label: params.optionLabel,
        option_index: params.optionIndex,
        side: params.side,
        amount: params.amount,
        token: params.token,
        tx_signature: params.txSignature,
      }),
    });
  } catch {
    /* stats write is best-effort — never block the trade UI on it */
  }
}
