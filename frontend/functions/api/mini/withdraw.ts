/**
 * POST /api/mini/withdraw
 *
 * Lets a mini-app user send USDC from their PUBLIC custodial wallet to an
 * arbitrary Solana address. The PRIVATE ("bonus") wallet is intentionally
 * not eligible — those funds come from Spark promos and should stay on the
 * trading surface, not be siphoned back out to a personal wallet.
 *
 * Auth: mini-app JWT in `Authorization: Bearer <token>`. The twitter_id in
 * the token is the source of truth; no body value is trusted for user
 * identity.
 *
 * Body:
 *   {
 *     destination_address: string,  // any Solana base58 pubkey
 *     amount: number,               // human USDC amount (e.g. 1.25)
 *   }
 *
 * Flow:
 *   1. Verify JWT, load the user's PUBLIC custodial row.
 *   2. Decrypt the secret key (AES-GCM via `WALLET_ENCRYPTION_KEY`).
 *   3. Build a SPL Token (classic) transferChecked from the user's USDC
 *      ATA to the destination's USDC ATA. Create the destination ATA in
 *      the same tx if it doesn't exist — that's the friendly path for
 *      sending to fresh wallets.
 *   4. If `FEE_PAYER_SECRET_KEY` is set, the treasury pays the ~5000-lamport
 *      network fee + any ATA rent (~2039280 lamports). Matches the pattern
 *      used for custodial trades so a freshly-deposited user can withdraw
 *      without ever holding SOL themselves.
 *   5. Send, confirm, return the signature.
 *
 * Token program: USDC is a classic SPL token, so TOKEN_PROGRAM_ID (not
 * Token-2022). If we ever want to support USDG withdraw we'll switch on
 * the mint here — but for now the UI only offers USDC and the product
 * intent is "get your deposit back out", which is USDC-shaped.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js"
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token"
import { AnchorProvider, BN } from "@coral-xyz/anchor"
import { FutarchyClient, AMMClient, VaultClient, VaultType } from "@zcomb/programs-sdk"

import { jsonResponse, pickRpcUrl } from "../cfPagesFunctionsUtils"
import { verifyMiniAuth } from "./_auth"

type ENV = {
  DB: D1Database
  WALLET_ENCRYPTION_KEY: string
  JWT_SECRET?: string
  HELIUS_RPC_URL?: string
  VITE_RPC_URL?: string
  VITE_REDEMPTION_MAINNET_RPC_URL?: string
  VITE_REDEMPTION_DEVNET_RPC_URL?: string
  VITE_SOLANA_NETWORK?: "mainnet" | "devnet"
  FEE_PAYER_SECRET_KEY?: string
}

const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
const USDC_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
const USDC_DECIMALS = 6

/**
 * Smallest withdraw we'll accept. Exists to block dust-withdraw spam: a
 * user could otherwise withdraw 0.0000001 USDC over and over to make the
 * treasury create an ATA on each call (~0.002 SOL of rent each time),
 * close that ATA on their wallet to reclaim the SOL, and repeat
 * indefinitely. The minimum doesn't fully fix the exploit on its own —
 * see `mini_withdraw_ata_creations` below — but it kills the casual
 * version and aligns with what users would actually want to withdraw.
 */
const MIN_WITHDRAW_USDC = 0.1

// Rent-exempt floor for creating an ATA (~0.002 SOL). We don't need the
// custodial to have this — the fee-payer (when set) covers it — but the
// constant is handy as documentation.
// const ATA_RENT_LAMPORTS = 2_039_280

// Minimum lamports we'd want the custodial to hold if there's no fee-payer
// configured. The withdraw path doesn't top up — if the user genuinely
// ran out of SOL and there's no treasury, the tx just fails with
// "insufficient lamports" and the user sees the error.
// const MIN_CUSTODIAL_LAMPORTS_NO_FEEPAYER = 10_000

// ── crypto: mirrors custodial-trade.ts exactly. Kept in-file rather
//   than imported to avoid pulling the heavy Anchor/AMMClient imports
//   into a tiny endpoint like this one.
// ─────────────────────────────────────────────────────────────
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

async function decryptSecret(encrypted: string, keyHex: string): Promise<string> {
  const [ivHex, ciphertextHex] = encrypted.split(":")
  const keyBytes = hexToBytes(keyHex.slice(0, 64))
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"])
  const iv = hexToBytes(ivHex)
  const ciphertext = hexToBytes(ciphertextHex)
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
function base58Decode(str: string): Uint8Array {
  let result = BigInt(0)
  for (const char of str) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index === -1) throw new Error("Invalid base58 character")
    result = result * 58n + BigInt(index)
  }
  const bytes: number[] = []
  while (result > 0n) {
    bytes.unshift(Number(result % 256n))
    result = result / 256n
  }
  for (const char of str) {
    if (char !== "1") break
    bytes.unshift(0)
  }
  return new Uint8Array(bytes)
}

function loadFeePayer(secretKeyStr: string | undefined): Keypair | null {
  if (!secretKeyStr) return null
  const trimmed = secretKeyStr.trim()
  try {
    if (trimmed.startsWith("[")) {
      const arr = JSON.parse(trimmed) as number[]
      if (!Array.isArray(arr) || arr.length !== 64) {
        throw new Error(`Expected 64-byte array, got ${arr.length}`)
      }
      return Keypair.fromSecretKey(Uint8Array.from(arr))
    }
    const bytes = base58Decode(trimmed)
    return Keypair.fromSecretKey(bytes)
  } catch (err) {
    console.error("[mini/withdraw] FEE_PAYER_SECRET_KEY parse failed:", err)
    return null
  }
}

function resolveRpc(env: ENV): string {
  const network = env.VITE_SOLANA_NETWORK ?? "devnet"
  if (network === "mainnet") {
    return pickRpcUrl(env.HELIUS_RPC_URL, env.VITE_REDEMPTION_MAINNET_RPC_URL, env.VITE_RPC_URL, "https://api.mainnet-beta.solana.com")
  }
  return pickRpcUrl(env.VITE_REDEMPTION_DEVNET_RPC_URL, env.VITE_RPC_URL, "https://api.devnet.solana.com")
}

function resolveUsdcMint(env: ENV): PublicKey {
  return env.VITE_SOLANA_NETWORK === "mainnet" ? USDC_MAINNET : USDC_DEVNET
}

/**
 * Resolve the $PREDICT mint from the `ideas` table — same lookup the
 * deposit-status / me endpoints use, so the address can be rotated by
 * editing the row instead of redeploying. Returns null if the row is
 * missing or the address fails to parse.
 */
async function resolvePredictMint(db: D1Database): Promise<PublicKey | null> {
  try {
    const row = await db
      .prepare(
        `SELECT json_extract(data, '$.token_address') AS token_address
         FROM ideas
         WHERE upper(json_extract(data, '$.ticker')) = 'PREDICT'
         LIMIT 1`,
      )
      .first<{ token_address: string | null }>()
    const addr = row?.token_address?.trim() || ""
    if (!addr) return null
    return new PublicKey(addr)
  } catch (err) {
    console.warn("[mini/withdraw] failed to resolve $PREDICT mint:", err)
    return null
  }
}

/**
 * Resolve a mint to (program_id, decimals) by reading its on-chain
 * account. PREDICT could be deployed under classic SPL Token or
 * Token-2022 depending on which mint factory was used at launch — we
 * detect at runtime instead of hardcoding so a future redeploy can
 * change the program without a code update.
 *
 * Returns null when the mint doesn't exist on chain or neither token
 * program owns it (which would be a misconfigured `ideas` row).
 */
async function resolveMintProgram(
  connection: Connection,
  mint: PublicKey,
): Promise<{ programId: PublicKey; decimals: number } | null> {
  const info = await connection.getAccountInfo(mint, "confirmed")
  if (!info) return null
  const owner = info.owner.toBase58()
  const programId =
    owner === TOKEN_2022_PROGRAM_ID.toBase58()
      ? TOKEN_2022_PROGRAM_ID
      : owner === TOKEN_PROGRAM_ID.toBase58()
        ? TOKEN_PROGRAM_ID
        : null
  if (!programId) return null
  try {
    const m = await getMint(connection, mint, "confirmed", programId)
    return { programId, decimals: m.decimals }
  } catch {
    return null
  }
}

/**
 * Read the user's plain USDC balance off the source ATA. Returns 0 if
 * the ATA doesn't exist yet (brand-new wallet) — same semantics as
 * `getTokenAccountBalance` returning null on a missing account.
 */
async function fetchPlainUsdcRaw(
  connection: Connection,
  owner: PublicKey,
  usdcMint: PublicKey,
): Promise<bigint> {
  const ata = await getAssociatedTokenAddress(usdcMint, owner, false, TOKEN_PROGRAM_ID)
  try {
    const acct = await getAccount(connection, ata, "confirmed", TOKEN_PROGRAM_ID)
    return acct.amount
  } catch {
    return 0n
  }
}

/**
 * Plan + execute Combinator vault unwinds to top up the user's plain
 * USDC balance until it covers the requested withdraw amount.
 *
 * Phase 2 of the unified-balance feature: when the user asks for an
 * amount larger than what's in their wallet, we walk every Combinator
 * proposal whose quote token is USDC and call
 * `vault.withdraw(VaultType.Quote, X)` to convert their conditional
 * cQuote tokens back into plain USDC.
 *
 * Survivor rule (mirrors `computeLockedBalances` in `me.ts`):
 *   recoverable_per_proposal = min(cQuote_i across options)
 * The vault's withdraw IX burns ONE cQuote_i from EACH option, so the
 * minimum is what the user can recover regardless of which option wins.
 *
 * Limits:
 *   - Only proposals with `quoteMint === USDC` are considered. Markets
 *     quoted in USDG would need an extra USDG → USDC swap step (Jupiter
 *     or a direct pool); not supported in this v1 — those positions are
 *     skipped and the caller may end up short.
 *   - Capped at `MAX_UNWINDS_PER_REQUEST` proposals to bound execution
 *     time. Each unwind is one Solana tx with its own confirmation,
 *     so 5 max keeps the worst-case under ~60s.
 *
 * Returns the list of unwind signatures so the caller can surface
 * them to the client. Throws if any tx fails — partial success is NOT
 * silently committed; the caller should let the error bubble so the
 * downstream USDC transfer doesn't run on a half-unwound state.
 */
const MAX_UNWINDS_PER_REQUEST = 5

async function unwindUsdcFromCombinatorPositions({
  ctx,
  connection,
  custodialKeypair,
  feePayer,
  usdcMint,
  needRaw,
}: {
  ctx: EventContext<ENV, any, Record<string, unknown>>
  connection: Connection
  custodialKeypair: Keypair
  feePayer: Keypair | null
  usdcMint: PublicKey
  needRaw: bigint
}): Promise<{ signatures: string[]; unwoundRaw: bigint; skippedNonUsdcQuote: number }> {
  // 1. Pull every proposal PDA we know about.
  let proposalPdas: string[] = []
  try {
    const r = await ctx.env.DB
      .prepare(
        `SELECT DISTINCT json_extract(data, '$.combinator_proposal_pda') AS pda
         FROM hackathons
         WHERE json_extract(data, '$.combinator_proposal_pda') IS NOT NULL`,
      )
      .all<{ pda: string | null }>()
    proposalPdas = (r.results || [])
      .map(row => (row.pda ?? "").trim())
      .filter(p => p.length > 0)
  } catch {
    proposalPdas = []
  }
  if (proposalPdas.length === 0) {
    return { signatures: [], unwoundRaw: 0n, skippedNonUsdcQuote: 0 }
  }

  // 2. Read-only Anchor provider for decoding.
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async <T,>(tx: T) => tx,
    signAllTransactions: async <T,>(txs: T[]) => txs,
  }
  const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" })
  const futarchy = new FutarchyClient(provider)
  const amm = new AMMClient(provider)
  const vault = new VaultClient(provider)

  // 3. Decode each proposal to learn its vault PDA, quote mint, and
  //    pool keys (one per option). Failures are silently dropped.
  const proposalKeys = proposalPdas.map(pda => new PublicKey(pda))
  const proposalInfos = await connection.getMultipleAccountsInfo(proposalKeys, "confirmed")
  type DecodedProp = {
    pda: string
    vaultPda: PublicKey
    quoteMint: string
    numOptions: number
    poolKeys: PublicKey[]
  }
  const decoded: DecodedProp[] = []
  proposalInfos.forEach((info, idx) => {
    if (!info) return
    try {
      const p = futarchy.program.coder.accounts.decode("proposalAccount", info.data)
      const numOptions: number = p.numOptions
      const poolKeys: PublicKey[] = []
      for (let i = 0; i < numOptions; i++) {
        const pk: PublicKey = p.pools[i]
        if (pk.toString() !== "11111111111111111111111111111111") poolKeys.push(pk)
      }
      decoded.push({
        pda: proposalPdas[idx],
        vaultPda: p.vault,
        quoteMint: p.quoteMint.toString(),
        numOptions,
        poolKeys,
      })
    } catch {
      /* skip unparseable */
    }
  })

  // 4. Filter to USDC-quote proposals. USDG-quote markets would need
  //    a USDG → USDC swap step which we don't support in v1.
  const usdcMintStr = usdcMint.toBase58()
  const usdcQuotePropsAll = decoded.filter(p => p.quoteMint === usdcMintStr)
  const skippedNonUsdcQuote = decoded.length - usdcQuotePropsAll.length
  if (usdcQuotePropsAll.length === 0) {
    return { signatures: [], unwoundRaw: 0n, skippedNonUsdcQuote }
  }

  // 5. Decode each USDC-quote proposal's pools to get cQuoteMint per
  //    option, then read the user's cQuote_i ATA balances on-chain to
  //    derive `recoverable = min(cQuote_i)`.
  const flatPoolKeys: PublicKey[] = []
  const poolOwner: Array<{ propIdx: number; optIdx: number }> = []
  usdcQuotePropsAll.forEach((p, propIdx) => {
    p.poolKeys.forEach((pk, optIdx) => {
      flatPoolKeys.push(pk)
      poolOwner.push({ propIdx, optIdx })
    })
  })
  const poolInfos = await connection.getMultipleAccountsInfo(flatPoolKeys, "confirmed")
  // cQuoteMintsByProp[propIdx][optIdx] = mint string (or "" on decode fail)
  const cQuoteMintsByProp: string[][] = usdcQuotePropsAll.map(p =>
    new Array(p.numOptions).fill(""),
  )
  poolInfos.forEach((info, i) => {
    if (!info) return
    const { propIdx, optIdx } = poolOwner[i]
    try {
      const pool = amm.program.coder.accounts.decode("poolAccount", info.data)
      const reserveAMint = (pool.reserveAMint ?? pool.tokenAMint ?? pool.mintA)?.toString?.()
      if (reserveAMint) cQuoteMintsByProp[propIdx][optIdx] = reserveAMint
    } catch {
      /* leave empty */
    }
  })

  // 6. Read all user cQuote_i ATA balances in one batched call.
  const flatCQuoteAtas: PublicKey[] = []
  const ataOwner: Array<{ propIdx: number; optIdx: number }> = []
  for (let propIdx = 0; propIdx < usdcQuotePropsAll.length; propIdx++) {
    const mints = cQuoteMintsByProp[propIdx]
    for (let optIdx = 0; optIdx < mints.length; optIdx++) {
      const mintStr = mints[optIdx]
      if (!mintStr) continue
      const ata = await getAssociatedTokenAddress(
        new PublicKey(mintStr),
        custodialKeypair.publicKey,
        false,
        TOKEN_PROGRAM_ID,
      )
      flatCQuoteAtas.push(ata)
      ataOwner.push({ propIdx, optIdx })
    }
  }
  const ataInfos = flatCQuoteAtas.length > 0
    ? await connection.getMultipleAccountsInfo(flatCQuoteAtas, "confirmed")
    : []
  // userCQuoteByProp[propIdx][optIdx] = raw amount (BigInt) — Infinity
  // sentinel via -1n means "not present", treated as 0 below.
  const userCQuoteByProp: bigint[][] = usdcQuotePropsAll.map(p =>
    new Array(p.numOptions).fill(0n),
  )
  ataInfos.forEach((info, i) => {
    if (!info?.data) return
    const { propIdx, optIdx } = ataOwner[i]
    // SPL Token account layout: amount is a u64 LE at offset 64.
    try {
      const amt = (info.data as Buffer).readBigUInt64LE(64)
      userCQuoteByProp[propIdx][optIdx] = amt
    } catch {
      /* leave 0 */
    }
  })

  // 7. Compute recoverable per proposal: min across options.
  type Recoverable = { propIdx: number; pda: string; vaultPda: PublicKey; recoverableRaw: bigint }
  const recoverables: Recoverable[] = []
  usdcQuotePropsAll.forEach((p, propIdx) => {
    const balances = userCQuoteByProp[propIdx]
    if (balances.length === 0) return
    let minBal = balances[0]
    for (let i = 1; i < balances.length; i++) {
      if (balances[i] < minBal) minBal = balances[i]
    }
    if (minBal > 0n) {
      recoverables.push({ propIdx, pda: p.pda, vaultPda: p.vaultPda, recoverableRaw: minBal })
    }
  })

  // Sort by recoverable desc — drain the biggest position first to
  // minimize tx count.
  recoverables.sort((a, b) => (a.recoverableRaw > b.recoverableRaw ? -1 : 1))

  // 8. Plan: pick proposals from biggest, capped at MAX_UNWINDS_PER_REQUEST.
  type Plan = { vaultPda: PublicKey; amountRaw: bigint }
  const plan: Plan[] = []
  let remaining = needRaw
  for (const r of recoverables) {
    if (remaining <= 0n) break
    if (plan.length >= MAX_UNWINDS_PER_REQUEST) break
    const take = r.recoverableRaw < remaining ? r.recoverableRaw : remaining
    plan.push({ vaultPda: r.vaultPda, amountRaw: take })
    remaining -= take
  }
  if (plan.length === 0) {
    return { signatures: [], unwoundRaw: 0n, skippedNonUsdcQuote }
  }

  // 9. Execute each unwind sequentially. We confirm before sending the
  //    next so a failure mid-stream stops the chain and the partial
  //    state is whatever already confirmed (the next withdraw call will
  //    see the new wallet balance and re-plan).
  const signatures: string[] = []
  let unwoundRaw = 0n
  for (const step of plan) {
    const builder = await vault.withdraw(
      custodialKeypair.publicKey,
      step.vaultPda,
      VaultType.Quote,
      new BN(step.amountRaw.toString()),
    )
    const anchorTx = await builder.transaction()
    const tx = new Transaction()
    const { blockhash } = await connection.getLatestBlockhash("confirmed")
    tx.recentBlockhash = blockhash
    tx.feePayer = (feePayer ?? custodialKeypair).publicKey
    for (const ix of anchorTx.instructions) tx.add(ix)
    if (feePayer) tx.sign(feePayer, custodialKeypair)
    else tx.sign(custodialKeypair)
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })
    await confirmTx(connection, sig)
    signatures.push(sig)
    unwoundRaw += step.amountRaw
  }
  return { signatures, unwoundRaw, skippedNonUsdcQuote }
}

async function confirmTx(connection: Connection, signature: string, maxAttempts = 20): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await connection.getSignatureStatus(signature)
    if (status?.value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`)
    }
    const conf = status?.value?.confirmationStatus
    if (conf === "confirmed" || conf === "finalized") return
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error(`Transaction ${signature} not confirmed after ${maxAttempts} attempts.`)
}

type Body = {
  destination_address?: string
  amount?: number
  /** Which token to send. Defaults to "USDC" for backwards compatibility
   *  with the original USDC-only client. "PREDICT" routes through the
   *  $PREDICT mint resolved from the `ideas` table. Ignored when
   *  `mint` is provided explicitly. */
  asset?: "USDC" | "PREDICT"
  /** Custom SPL mint to send. Overrides `asset`. Used for the "Spark
   *  ecosystem" tab where the user picks a specific Ideacoin from
   *  their wallet. Program ID + decimals are read off chain at request
   *  time so we don't need a registry of supported mints. The same
   *  ATA-creation rate-limit (`mini_withdraw_ata_creations`) applies
   *  per (twitter_id, destination, mint). */
  mint?: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const auth = await verifyMiniAuth(ctx.request, ctx.env.JWT_SECRET, ctx.env)
    if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status)

    let body: Body
    try {
      body = (await ctx.request.json()) as Body
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400)
    }

    // Routing: an explicit `mint` always wins (custom Ideacoin / SPARK
    // ecosystem tab). Otherwise we fall through the USDC / PREDICT
    // shortcut paths. `asset` here is purely for downstream branching
    // (USDC enables auto-unwind, the others don't).
    const customMintRaw = typeof body.mint === "string" ? body.mint.trim() : ""
    const asset: "USDC" | "PREDICT" | "CUSTOM" =
      customMintRaw.length > 0
        ? "CUSTOM"
        : body.asset === "PREDICT"
          ? "PREDICT"
          : "USDC"

    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: `amount must be a positive number` }, 400)
    }
    // USDC has a hard floor to block dust-spam (cf. MIN_WITHDRAW_USDC
    // rationale above). PREDICT and custom mints skip it because the
    // value-per-unit varies (an Ideacoin can be worth fractions of a
    // cent or much more) and a 0.1 floor doesn't translate cleanly;
    // the destination ATA-creation log still rate-limits the rent
    // exploit on its own.
    if (asset === "USDC" && amount < MIN_WITHDRAW_USDC) {
      return jsonResponse(
        { error: `Minimum withdraw is ${MIN_WITHDRAW_USDC} USDC.` },
        400,
      )
    }

    if (!body.destination_address || typeof body.destination_address !== "string") {
      return jsonResponse({ error: "destination_address is required" }, 400)
    }
    let destPubkey: PublicKey
    try {
      destPubkey = new PublicKey(body.destination_address.trim())
    } catch {
      return jsonResponse({ error: "destination_address is not a valid Solana pubkey" }, 400)
    }

    // Fetch ONLY the PUBLIC custodial wallet. The private wallet is
    // excluded by the WHERE clause — even if the caller were to somehow
    // force a different wallet_type, there is no path to their private
    // row through this endpoint.
    const row = await ctx.env.DB
      .prepare(
        `SELECT wallet_address, encrypted_secret_key
         FROM custodial_wallets
         WHERE wallet_type = 'public'
           AND (twitter_id = ? OR twitter_id = ? OR twitter_username = ?)
         LIMIT 1`,
      )
      .bind(
        auth.twitter_id,
        `username:${auth.username ?? ""}`,
        auth.username ?? "",
      )
      .first<{ wallet_address: string; encrypted_secret_key: string }>()

    if (!row) {
      return jsonResponse({ error: "No public custodial wallet for user" }, 404)
    }

    // Refuse self-sends — they're a no-op (or worse, confuse the user when
    // nothing changes). Comparing as strings is fine; both sides are
    // normalized base58 pubkeys.
    if (destPubkey.toBase58() === row.wallet_address) {
      return jsonResponse({ error: "Cannot withdraw to the same wallet" }, 400)
    }

    const secretKeyBase58 = await decryptSecret(row.encrypted_secret_key, ctx.env.WALLET_ENCRYPTION_KEY)
    const custodialKeypair = Keypair.fromSecretKey(base58Decode(secretKeyBase58))

    const connection = new Connection(resolveRpc(ctx.env), "confirmed")
    const feePayer = loadFeePayer(ctx.env.FEE_PAYER_SECRET_KEY)

    // ── Resolve which mint we're sending ──────────────────────
    // USDC: classic SPL, hardcoded constants per network, 6 decimals.
    // PREDICT: dynamic — mint comes from the `ideas` row, program
    //   ownership (classic vs Token-2022) and decimals are read off
    //   chain so a future redeploy doesn't need a code change.
    // CUSTOM: caller-supplied mint (e.g. an Ideacoin from the SPARK
    //   ecosystem tab). We trust the address but validate it parses
    //   and is owned by a token program before signing anything.
    let mint: PublicKey
    let mintProgramId: PublicKey
    let mintDecimals: number
    if (asset === "USDC") {
      mint = resolveUsdcMint(ctx.env)
      mintProgramId = TOKEN_PROGRAM_ID
      mintDecimals = USDC_DECIMALS
    } else if (asset === "PREDICT") {
      const predictMint = await resolvePredictMint(ctx.env.DB)
      if (!predictMint) {
        return jsonResponse(
          { error: "PREDICT mint isn't configured yet — try again later." },
          400,
        )
      }
      const resolved = await resolveMintProgram(connection, predictMint)
      if (!resolved) {
        return jsonResponse(
          { error: "Couldn't load PREDICT mint metadata. Try again." },
          500,
        )
      }
      mint = predictMint
      mintProgramId = resolved.programId
      mintDecimals = resolved.decimals
    } else {
      // CUSTOM mint path
      let custom: PublicKey
      try {
        custom = new PublicKey(customMintRaw)
      } catch {
        return jsonResponse({ error: "mint is not a valid Solana pubkey" }, 400)
      }
      const resolved = await resolveMintProgram(connection, custom)
      if (!resolved) {
        return jsonResponse(
          { error: "Couldn't load token metadata for that mint — make sure it's a valid SPL Token or Token-2022 mint." },
          400,
        )
      }
      mint = custom
      mintProgramId = resolved.programId
      mintDecimals = resolved.decimals
    }

    // Derive ATAs. `allowOwnerOffCurve: true` for the destination because
    // the user can legitimately withdraw to a PDA-owned wallet (another
    // protocol's vault, for instance). We don't try to block that — if the
    // user pastes a PDA address, it's on them.
    const sourceAta = await getAssociatedTokenAddress(
      mint,
      custodialKeypair.publicKey,
      false,
      mintProgramId,
    )
    const destAta = await getAssociatedTokenAddress(
      mint,
      destPubkey,
      true,
      mintProgramId,
    )

    // ── Phase 2: top-up from Combinator vaults if needed ──────
    // USDC-only feature: the unified balance includes cQuote tokens
    // locked in Combinator markets, and we auto-unwind them when the
    // requested amount exceeds the plain wallet balance.
    //
    // PREDICT: skipped for now. PREDICT positions sit in cBase tokens
    // (the project token side of futarchy markets), which would need a
    // VaultType.Base unwind path; not wired in v1. The cap surfaced to
    // the client is wallet-only for PREDICT, so we don't expect the
    // raw amount to exceed the wallet balance here — but if it does,
    // the transferChecked below will throw with "insufficient funds"
    // and the user will retry with a smaller value.
    const requestedRaw = BigInt(Math.floor(amount * 10 ** mintDecimals))
    let unwindSignatures: string[] = []
    if (asset === "USDC") {
      const walletRawBefore = await fetchPlainUsdcRaw(connection, custodialKeypair.publicKey, mint)
      if (requestedRaw > walletRawBefore) {
        const needRaw = requestedRaw - walletRawBefore
        try {
          const result = await unwindUsdcFromCombinatorPositions({
            ctx,
            connection,
            custodialKeypair,
            feePayer,
            usdcMint: mint,
            needRaw,
          })
          unwindSignatures = result.signatures
          if (result.unwoundRaw < needRaw) {
            // Not enough recoverable USDC even after unwinding everything
            // we could. Tell the user exactly what's possible right now.
            const walletNow = walletRawBefore + result.unwoundRaw
            const walletHuman = Number(walletNow) / 10 ** mintDecimals
            const skipped = result.skippedNonUsdcQuote > 0
              ? ` ${result.skippedNonUsdcQuote} non-USDC-quote market(s) were skipped — those positions can't be unwound to USDC yet.`
              : ""
            return jsonResponse(
              {
                error:
                  `Not enough USDC available. After unwinding your decision-market ` +
                  `positions, you have ${walletHuman.toFixed(4)} USDC.` + skipped,
                wallet_after_unwind: walletHuman,
                unwind_signatures: result.signatures,
              },
              400,
            )
          }
        } catch (err) {
          // A vault.withdraw failed mid-stream. Whatever already confirmed
          // is in the user's wallet now; they can retry the withdraw and
          // the next call will pick up from the new state.
          console.error("[mini/withdraw] unwind failed:", err)
          return jsonResponse(
            {
              error:
                `Couldn't unwind your decision-market positions: ` +
                (err instanceof Error ? err.message : "unknown error"),
            },
            500,
          )
        }
      }
    }

    const tx = new Transaction()
    tx.feePayer = (feePayer ?? custodialKeypair).publicKey

    // Did we create this destination's ATA before? If yes and it's gone
    // now, the user closed it deliberately to reclaim rent — refusing to
    // recreate it from treasury funds is the fix for the rent-farming
    // exploit (cf. `mini_withdraw_ata_creations` migration). The user
    // can still receive: they just have to fund the ATA themselves.
    let ataCreated = false
    try {
      await getAccount(connection, destAta, "confirmed", mintProgramId)
    } catch {
      // ATA missing on chain. Only create it if we haven't already paid
      // for one to this same destination — table tolerated to be missing
      // (try/catch) so an un-migrated DB doesn't break withdraws while
      // the migration is in flight.
      let alreadyCreatedByUs = false
      try {
        const prior = await ctx.env.DB
          .prepare(
            `SELECT id FROM mini_withdraw_ata_creations
             WHERE twitter_id = ? AND destination_wallet = ? AND mint = ?
             LIMIT 1`,
          )
          .bind(auth.twitter_id, destPubkey.toBase58(), mint.toBase58())
          .first<{ id: string }>()
        alreadyCreatedByUs = !!prior
      } catch (err) {
        console.warn("[mini/withdraw] ATA-creation log unavailable:", err)
      }
      if (alreadyCreatedByUs) {
        return jsonResponse(
          {
            error:
              "Spark already opened a USDC token account for this wallet once. " +
              "If you closed it, please re-open it yourself before withdrawing.",
          },
          400,
        )
      }
      tx.add(
        createAssociatedTokenAccountInstruction(
          (feePayer ?? custodialKeypair).publicKey,
          destAta,
          destPubkey,
          mint,
          mintProgramId,
        ),
      )
      ataCreated = true
    }

    // If there's no treasury fee-payer, the custodial is paying for its
    // own gas — make sure it has lamports. This mirrors the top-up in
    // custodial-trade.ts but in reverse: here the transfer into the
    // custodial is impossible without a funded source, so we can only
    // error early with a useful message.
    if (!feePayer) {
      const bal = await connection.getBalance(custodialKeypair.publicKey, "confirmed")
      if (bal < 10_000) {
        return jsonResponse(
          { error: "Wallet is out of SOL for gas. Ask support to top up, or try again later." },
          400,
        )
      }
    } else {
      // Treasury is configured — top the custodial up to cover any CPI rent
      // the transferChecked itself might need. Mirrors the PR-3 behaviour
      // in custodial-trade. For a straight transfer this is usually
      // unnecessary, but it's cheap insurance.
      try {
        const currentBalance = await connection.getBalance(custodialKeypair.publicKey, "confirmed")
        const MIN = 5_000_000 // 0.005 SOL — smaller than trade's 0.015 because we don't open ATAs via CPI here
        if (currentBalance < MIN) {
          tx.add(
            SystemProgram.transfer({
              fromPubkey: feePayer.publicKey,
              toPubkey: custodialKeypair.publicKey,
              lamports: MIN - currentBalance,
            }),
          )
        }
      } catch (err) {
        console.warn("[mini/withdraw] balance check failed — skipping top-up:", err)
      }
    }

    // Raw amount = human × 10^decimals via BigInt to avoid float drift on
    // large withdrawals. `requestedRaw` was already computed above with
    // the correct mintDecimals — reuse it so we don't drift between the
    // unwind sizing and the transferChecked input.
    const rawAmount = requestedRaw
    tx.add(
      createTransferCheckedInstruction(
        sourceAta,
        mint,
        destAta,
        custodialKeypair.publicKey,
        rawAmount,
        mintDecimals,
        [],
        mintProgramId,
      ),
    )

    const { blockhash } = await connection.getLatestBlockhash("confirmed")
    tx.recentBlockhash = blockhash

    if (feePayer) {
      tx.sign(feePayer, custodialKeypair)
    } else {
      tx.sign(custodialKeypair)
    }

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })
    await confirmTx(connection, signature)

    // Record the ATA creation AFTER confirmation so we don't lock the
    // user out if the tx fails mid-way (e.g. blockhash expired).
    // `INSERT OR IGNORE` on the unique tuple makes this idempotent on
    // retries — important if the client retried a perceived-failed call.
    if (ataCreated) {
      try {
        await ctx.env.DB
          .prepare(
            `INSERT OR IGNORE INTO mini_withdraw_ata_creations
               (id, twitter_id, destination_wallet, mint, signature)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            auth.twitter_id,
            destPubkey.toBase58(),
            mint.toBase58(),
            signature,
          )
          .run()
      } catch (err) {
        // Logging only — the on-chain state is the source of truth, and
        // the next withdraw will still see the (now-existing) ATA via
        // `getAccount` and skip creation. Worst case after a logging
        // failure: user closes the ATA and we let them re-create it
        // once more before this row would have blocked them.
        console.error("[mini/withdraw] failed to log ATA creation:", err)
      }
    }

    return jsonResponse({
      success: true,
      signature,
      destination: destPubkey.toBase58(),
      amount,
      mint: mint.toBase58(),
      asset,
      // Pre-transfer vault.withdraw signatures (one per Combinator
      // position we unwound to top up the wallet). Empty array on a
      // pure wallet-balance withdraw — useful for support / debugging
      // when a user reports "I withdrew $50 but only saw one tx".
      unwind_signatures: unwindSignatures,
    })
  } catch (err) {
    console.error("[mini/withdraw]", err)
    const message = err instanceof Error ? err.message : "Unknown error"
    // `createTransferCheckedInstruction` simulation failures commonly
    // surface as "Error: custom program error: 0x1" — translate that into
    // the one the user actually cares about.
    if (/insufficient/i.test(message) || /0x1\b/.test(message)) {
      return jsonResponse({ error: "Insufficient balance in your public wallet." }, 400)
    }
    return jsonResponse({ error: message }, 500)
  }
}
