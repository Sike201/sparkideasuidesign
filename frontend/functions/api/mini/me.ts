/**
 * GET /api/mini/me
 *
 * Returns the authenticated Twitter user + their pre-funded custodial wallets
 * (public + private) with SOL and USDG balances. Used as the top-level "who
 * am I" call for the mini-app — drives the whitelist gate on `/m/me`.
 *
 * Auth: mini-app JWT in `Authorization: Bearer <token>` (see `_auth.ts`).
 *
 * Response shape — the wallet objects are `null` when the admin hasn't
 * assigned that wallet type yet, so the client can show the "You're not
 * invited yet" screen based on whether *both* wallets are missing.
 *
 *   {
 *     user: { twitter_id, username, name, profile_image_url },
 *     wallets: {
 *       public:  { address, sol, usdg } | null,
 *       private: { address, sol, usdg } | null,
 *     }
 *   }
 */

import { Connection, PublicKey } from "@solana/web3.js"
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token"
import { AnchorProvider } from "@coral-xyz/anchor"
import { FutarchyClient, AMMClient } from "@zcomb/programs-sdk"

import { jsonResponse, pickRpcUrl } from "../cfPagesFunctionsUtils"
import { verifyMiniAuth, attachRefreshedToken } from "./_auth"

type ENV = {
  DB: D1Database
  JWT_SECRET?: string
  // Prefer the redemption RPC env vars (authenticated), fall back to
  // VITE_RPC_URL. Public endpoints 403 on mainnet so these matter.
  // HELIUS_RPC_URL is preferred and unaffected by the browser proxy
  // setup (where VITE_RPC_URL becomes `/api/rpc`).
  HELIUS_RPC_URL?: string
  VITE_RPC_URL?: string
  VITE_REDEMPTION_MAINNET_RPC_URL?: string
  VITE_REDEMPTION_DEVNET_RPC_URL?: string
  VITE_SOLANA_NETWORK?: "mainnet" | "devnet"
  // Dev bypass — when "develop" we tolerate a missing twitter_users
  // row by synthesizing a stub profile.
  VITE_ENVIRONMENT_TYPE?: string
  DEV_BYPASS_TWITTER_ID?: string
}

// USDG is a Token-2022 mint — must use TOKEN_2022_PROGRAM_ID everywhere.
const USDG_DEVNET = new PublicKey("4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7")
const USDG_MAINNET = new PublicKey("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH")

/**
 * Mint → human-readable symbol map for tokens we expect traders to hold.
 * Anything not in this map is returned with `symbol: null` and the client
 * falls back to a truncated mint address. Keep the list tight — adding a
 * wrong symbol here would mislead users about what they own.
 */
const KNOWN_TOKEN_SYMBOLS: Record<string, string> = {
  // USDG (Token-2022) — quote asset for every decision market.
  "4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7": "USDG",
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH": "USDG",
  // Circle USDC — users often bridge/deposit this even though markets use USDG.
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "USDC",
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": "USDC", // devnet
  // Tether
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "USDT",
}

/**
 * Mints attached to a single Combinator proposal — one entry per option,
 * for both the conditional quote (cUSDG_i) and conditional base (cTokenX_i)
 * mints that get minted to a user's wallet when they deposit / trade.
 *
 * The flat shape (rather than `{quote: [...], base: [...]}`) is what the
 * lookup loop expects: each cMint maps to `{proposalIdx, optionIdx, kind}`
 * so a single pass over the user's SPL holdings can classify every
 * conditional token without an inner search.
 */
type ProposalConditionals = {
  proposalPda: string
  baseMint: string
  quoteMint: string
  numOptions: number
  cQuoteMints: string[] // length = numOptions
  cBaseMints: string[]  // length = numOptions
}

/**
 * In-isolate cache of the proposal → conditional-mint registry. Decoding
 * a proposal + its N pools is several RPC reads per proposal, so we
 * cache for 5 minutes. Proposals are immutable once deployed (only their
 * pool reserves change), so the registry doesn't decay with trades.
 *
 * The registry is keyed by the comma-joined sorted list of proposal PDAs
 * passed in, so adding a new hackathon naturally invalidates the entry.
 */
const PROPOSAL_REGISTRY_CACHE = new Map<
  string,
  { entries: ProposalConditionals[]; expiresAt: number }
>()
const PROPOSAL_REGISTRY_TTL_MS = 5 * 60_000

/**
 * Decode a list of Combinator proposals to extract the conditional mint
 * registry needed to classify a user's SPL holdings as "in markets".
 *
 * Returns ONE entry per proposal that decoded successfully; failures
 * are silently dropped (typically: an old PDA whose program version
 * doesn't match, or a vault that was never deployed). The fallback is
 * to under-count locked balances rather than 500 the whole `/me` call.
 */
async function fetchProposalRegistry(
  connection: Connection,
  proposalPdas: string[],
): Promise<ProposalConditionals[]> {
  if (proposalPdas.length === 0) return []
  const cacheKey = [...proposalPdas].sort().join(",")
  const now = Date.now()
  const cached = PROPOSAL_REGISTRY_CACHE.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.entries

  // Read-only Anchor provider — no signing, just decoding.
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async <T,>(tx: T) => tx,
    signAllTransactions: async <T,>(txs: T[]) => txs,
  }
  const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" })
  const futarchy = new FutarchyClient(provider)
  const amm = new AMMClient(provider)

  const proposalKeys = proposalPdas.map(pda => new PublicKey(pda))
  let proposalInfos: (import("@solana/web3.js").AccountInfo<Buffer> | null)[] = []
  try {
    proposalInfos = await connection.getMultipleAccountsInfo(proposalKeys, "confirmed")
  } catch {
    return []
  }

  // First pass: decode every proposal to learn its (vault, base/quote
  // mints, pools[]). We keep failures around as `null` so we can match
  // the index back to `proposalPdas`.
  type DecodedProposal = {
    pda: string
    baseMint: string
    quoteMint: string
    numOptions: number
    poolKeys: PublicKey[]
  } | null
  const decodedProposals: DecodedProposal[] = proposalInfos.map((info, idx) => {
    if (!info) return null
    try {
      const decoded = futarchy.program.coder.accounts.decode("proposalAccount", info.data)
      const numOptions: number = decoded.numOptions
      const poolKeys: PublicKey[] = []
      for (let i = 0; i < numOptions; i++) {
        const pk: PublicKey = decoded.pools[i]
        // Skip the zero sentinel a la `sdkSubscribeMarket`.
        if (pk.toString() !== "11111111111111111111111111111111") poolKeys.push(pk)
      }
      return {
        pda: proposalPdas[idx],
        baseMint: decoded.baseMint.toString(),
        quoteMint: decoded.quoteMint.toString(),
        numOptions,
        poolKeys,
      }
    } catch {
      return null
    }
  })

  // Second pass: batch all the pool accounts into ONE multi-fetch and
  // decode each pool to extract cQuoteMint + cBaseMint for that option.
  const flatPoolKeys: PublicKey[] = []
  const poolKeyOwner: Array<{ propIdx: number; optIdx: number }> = []
  decodedProposals.forEach((p, propIdx) => {
    if (!p) return
    p.poolKeys.forEach((pk, optIdx) => {
      flatPoolKeys.push(pk)
      poolKeyOwner.push({ propIdx, optIdx })
    })
  })
  let poolInfos: (import("@solana/web3.js").AccountInfo<Buffer> | null)[] = []
  if (flatPoolKeys.length > 0) {
    try {
      poolInfos = await connection.getMultipleAccountsInfo(flatPoolKeys, "confirmed")
    } catch {
      poolInfos = flatPoolKeys.map(() => null)
    }
  }

  // Allocate slot maps for each decoded proposal so we can fill them as
  // we walk the flat pool results.
  const cQuoteByProposal: Record<number, string[]> = {}
  const cBaseByProposal: Record<number, string[]> = {}
  decodedProposals.forEach((p, idx) => {
    if (!p) return
    cQuoteByProposal[idx] = new Array(p.numOptions).fill("")
    cBaseByProposal[idx] = new Array(p.numOptions).fill("")
  })
  poolInfos.forEach((info, i) => {
    if (!info) return
    const { propIdx, optIdx } = poolKeyOwner[i]
    try {
      const pool = amm.program.coder.accounts.decode("poolAccount", info.data)
      const reserveAMint = (pool.reserveAMint ?? pool.tokenAMint ?? pool.mintA)?.toString?.()
      const reserveBMint = (pool.reserveBMint ?? pool.tokenBMint ?? pool.mintB)?.toString?.()
      // Convention: A = quote, B = base (matches `combinatorSdk.ts`
      // resolveSpotPrice math). cQuote_i is reserveAMint; cBase_i is
      // reserveBMint.
      if (reserveAMint) cQuoteByProposal[propIdx][optIdx] = reserveAMint
      if (reserveBMint) cBaseByProposal[propIdx][optIdx] = reserveBMint
    } catch {
      /* leave the slot empty — we'll skip it during classification */
    }
  })

  const entries: ProposalConditionals[] = []
  decodedProposals.forEach((p, idx) => {
    if (!p) return
    entries.push({
      proposalPda: p.pda,
      baseMint: p.baseMint,
      quoteMint: p.quoteMint,
      numOptions: p.numOptions,
      cQuoteMints: cQuoteByProposal[idx] ?? [],
      cBaseMints: cBaseByProposal[idx] ?? [],
    })
  })

  PROPOSAL_REGISTRY_CACHE.set(cacheKey, {
    entries,
    expiresAt: Date.now() + PROPOSAL_REGISTRY_TTL_MS,
  })
  return entries
}

/**
 * In-memory cache for the $PREDICT spot price. The `/api/mini/me` endpoint
 * is hit on every Me-tab open + a 30s poll, so caching the Jupiter call for
 * 60s keeps the spot price displayed in the UI fresh enough while keeping
 * upstream load flat. Mirrors `deposit-status.ts` — duplication is fine
 * because consolidating would require a shared module and the two call
 * sites diverge in error-tolerance (deposit-status fails-soft to 0, here
 * the field is informational).
 */
const PREDICT_PRICE_CACHE: { priceUsd: number; expiresAt: number } = {
  priceUsd: 0,
  expiresAt: 0,
}
const PREDICT_PRICE_TTL_MS = 60_000

async function fetchPredictPriceUsd(mint: string): Promise<number> {
  const now = Date.now()
  if (PREDICT_PRICE_CACHE.expiresAt > now && PREDICT_PRICE_CACHE.priceUsd > 0) {
    return PREDICT_PRICE_CACHE.priceUsd
  }
  try {
    // Jupiter Price API v3 — `api.jup.ag/price/v3` is canonical;
    // `price.jup.ag/v6` was deprecated and now returns 4xx/5xx.
    const url = `https://api.jup.ag/price/v3?ids=${encodeURIComponent(mint)}`
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; SparkPriceFetcher/1.0; +https://justspark.fun)",
      },
    })
    if (!res.ok) return 0
    const data = (await res.json().catch(() => null)) as
      | Record<string, { usdPrice?: number | string }>
      | null
    const price = Number(data?.[mint]?.usdPrice ?? 0) || 0
    if (price > 0) {
      PREDICT_PRICE_CACHE.priceUsd = price
      PREDICT_PRICE_CACHE.expiresAt = now + PREDICT_PRICE_TTL_MS
    }
    return price
  } catch {
    return 0
  }
}

/**
 * $PREDICT mint isn't hard-coded: it lives in the `ideas` row tagged with
 * ticker "PREDICT" so a future redeploy doesn't require a code change.
 * Returns null if the row doesn't exist or the address is unparseable —
 * holdings will then keep `symbol: null` and the UI falls back to the
 * truncated mint address.
 */
async function resolvePredictMint(db: D1Database): Promise<string | null> {
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
    // Validate it parses as a real PublicKey — bad data in the row should
    // not blow up the /me response.
    new PublicKey(addr)
    return addr
  } catch (err) {
    console.warn("[mini/me] failed to resolve $PREDICT mint:", err)
    return null
  }
}

type WalletRow = {
  wallet_address: string
  wallet_type: "public" | "private"
  deposit_completed_at: string | null
}

type TokenHolding = {
  mint: string
  symbol: string | null
  amount: number
  decimals: number
  programId: "token" | "token-2022"
}

type WalletBalances = {
  address: string
  sol: number
  /** Convenience USDG balance kept for backwards compat with existing UI. */
  usdg: number
  /** All non-zero SPL token holdings across Token + Token-2022 programs. */
  tokens: TokenHolding[]
}

function resolveRpc(env: ENV): string {
  const network = env.VITE_SOLANA_NETWORK ?? "devnet"
  if (network === "mainnet") {
    return pickRpcUrl(env.HELIUS_RPC_URL, env.VITE_REDEMPTION_MAINNET_RPC_URL, env.VITE_RPC_URL, "https://api.mainnet-beta.solana.com")
  }
  return pickRpcUrl(env.VITE_REDEMPTION_DEVNET_RPC_URL, env.VITE_RPC_URL, "https://api.devnet.solana.com")
}

function resolveUsdgMint(env: ENV): PublicKey {
  return env.VITE_SOLANA_NETWORK === "mainnet" ? USDG_MAINNET : USDG_DEVNET
}

/**
 * Fetch all SPL token holdings (Token + Token-2022 programs) for a wallet,
 * plus the SOL balance. On RPC failure we return whatever we managed to
 * fetch — `/me` is a dashboard call and shouldn't break the whole page
 * because one balance lookup flaked.
 *
 * We use `getParsedTokenAccountsByOwner` instead of ATA-by-ATA lookups so
 * we don't need to know the mint list ahead of time. Outcome tokens from
 * decision markets, USDC from deposits, stray airdrops — everything shows up.
 */
async function fetchBalances(
  connection: Connection,
  walletAddress: string,
  usdgMint: PublicKey,
  predictMint: string | null,
): Promise<WalletBalances> {
  const owner = new PublicKey(walletAddress)

  // SOL — one RPC call, independent of token accounts.
  let sol = 0
  try {
    const lamports = await connection.getBalance(owner, "confirmed")
    sol = lamports / 1_000_000_000
  } catch {
    /* stay at 0 */
  }

  // Parsed token accounts — one call per program. `getParsedTokenAccountsByOwner`
  // returns decimals + uiAmount in the parsed payload so we don't need a
  // second round-trip to `getMint`.
  const tokens: TokenHolding[] = []
  const usdgMintStr = usdgMint.toBase58()
  let usdg = 0

  const programIds: Array<[PublicKey, "token" | "token-2022"]> = [
    [TOKEN_PROGRAM_ID, "token"],
    [TOKEN_2022_PROGRAM_ID, "token-2022"],
  ]

  for (const [programId, label] of programIds) {
    try {
      const resp = await connection.getParsedTokenAccountsByOwner(
        owner,
        { programId },
        "confirmed"
      )
      for (const { account } of resp.value) {
        // `account.data` is narrowed to ParsedAccountData when we pass parsed
        // filters — the structure lives under `parsed.info.tokenAmount`.
        const info = (account.data as { parsed?: { info?: Record<string, unknown> } })?.parsed?.info
        if (!info) continue
        const mint = String(info.mint ?? "")
        const tokenAmount = info.tokenAmount as
          | { uiAmount: number | null; decimals: number; amount: string }
          | undefined
        if (!mint || !tokenAmount) continue
        const uiAmount = tokenAmount.uiAmount ?? Number(tokenAmount.amount) / 10 ** tokenAmount.decimals
        // Skip dust / empty ATAs. Trader positions can be fractional so we
        // keep anything strictly > 0 — the UI decides whether to show it.
        if (!Number.isFinite(uiAmount) || uiAmount <= 0) continue

        // Resolve symbol: hard-coded map first, then the dynamic $PREDICT
        // mint pulled from the ideas table. Order matters only if there's
        // a collision (there isn't), but keeping the static map first
        // makes the precedence explicit.
        const symbol =
          KNOWN_TOKEN_SYMBOLS[mint] ??
          (predictMint && mint === predictMint ? "PREDICT" : null)

        tokens.push({
          mint,
          symbol,
          amount: uiAmount,
          decimals: tokenAmount.decimals,
          programId: label,
        })

        if (mint === usdgMintStr) usdg = uiAmount
      }
    } catch {
      /* One program failed — keep whatever we already have and move on. */
    }
  }

  // Order: USDG first, then other known symbols, then unknown mints by amount.
  tokens.sort((a, b) => {
    const aUsdg = a.mint === usdgMintStr ? 0 : 1
    const bUsdg = b.mint === usdgMintStr ? 0 : 1
    if (aUsdg !== bUsdg) return aUsdg - bUsdg
    const aKnown = a.symbol ? 0 : 1
    const bKnown = b.symbol ? 0 : 1
    if (aKnown !== bKnown) return aKnown - bKnown
    return b.amount - a.amount
  })

  return { address: walletAddress, sol, usdg, tokens }
}

/**
 * Compute the "in-markets" (locked) component of a wallet's USDC- and
 * PREDICT-equivalent balance. Walks the wallet's SPL holdings against
 * the proposal registry to identify cQuote / cBase tokens and applies
 * the conditional-token survivor rule:
 *
 *   locked_quote_per_proposal = min(cQuote_i across options)
 *
 * Why min: depositing X USDG into a proposal with N options mints
 * `X cQuote` PER OPTION (one set per option). Only ONE option will
 * win, so the actually-redeemable amount is the minimum across the
 * sets — that's the floor of what the user is guaranteed to recover
 * regardless of outcome. Trading shifts cQuote between options so the
 * min naturally drops as the user takes a side.
 *
 * For PREDICT-equivalent the same rule applies on cBase, but ONLY
 * for proposals whose `baseMint === predictMint` (other hackathons
 * may have a different project token; we don't claim those as PREDICT).
 *
 * Quote totals are denominated in stablecoin units (assume USDG ≈ $1)
 * and rolled into `usdc_locked` so the UI can present a single
 * stablecoin total to the user.
 */
function computeLockedBalances(
  tokens: TokenHolding[],
  registry: ProposalConditionals[],
  predictMint: string | null,
): { usdc_locked: number; predict_locked: number } {
  if (registry.length === 0) return { usdc_locked: 0, predict_locked: 0 }

  // Index user holdings by mint for O(1) lookup. Multiple ATAs for the
  // same mint sum (rare but possible after user-driven ATA creation).
  const userByMint = new Map<string, number>()
  for (const t of tokens) {
    userByMint.set(t.mint, (userByMint.get(t.mint) ?? 0) + t.amount)
  }

  let usdcLocked = 0
  let predictLocked = 0
  for (const prop of registry) {
    if (prop.cQuoteMints.length !== prop.numOptions) continue
    let minQuote = Infinity
    let minBase = Infinity
    let anyOption = false
    for (let i = 0; i < prop.numOptions; i++) {
      const cQ = prop.cQuoteMints[i]
      const cB = prop.cBaseMints[i]
      const qBal = cQ ? userByMint.get(cQ) ?? 0 : 0
      const bBal = cB ? userByMint.get(cB) ?? 0 : 0
      if (qBal < minQuote) minQuote = qBal
      if (bBal < minBase) minBase = bBal
      anyOption = true
    }
    if (!anyOption) continue
    if (Number.isFinite(minQuote) && minQuote > 0) usdcLocked += minQuote
    if (
      predictMint &&
      prop.baseMint === predictMint &&
      Number.isFinite(minBase) &&
      minBase > 0
    ) {
      predictLocked += minBase
    }
  }
  return { usdc_locked: usdcLocked, predict_locked: predictLocked }
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    // 1. Auth gate — JWT must be present and valid.
    const auth = await verifyMiniAuth(ctx.request, ctx.env.JWT_SECRET, ctx.env)
    if (!auth.ok) {
      return jsonResponse({ error: auth.message }, auth.status)
    }

    // 2. User identity from `twitter_users` (profile image, display name).
    let user = await ctx.env.DB
      .prepare(
        `SELECT twitter_id, username, name, profile_image_url
         FROM twitter_users WHERE twitter_id = ?`
      )
      .bind(auth.twitter_id)
      .first<{ twitter_id: string; username: string; name: string; profile_image_url: string | null }>()

    if (!user) {
      // In production this shouldn't happen — the JWT is only ever
      // issued after a successful `twitter-oauth-token` call that
      // upserts this row. In DEV-bypass mode we may have a stub
      // twitter_id that doesn't exist in `twitter_users` (e.g.
      // the default `dev_user_local` fallback before
      // DEV_BYPASS_TWITTER_ID is wired up to a real id). Synthesize
      // a minimal profile so the rest of the endpoint can complete
      // — wallets / quiz / etc. all key on `auth.twitter_id` so a
      // missing profile row doesn't actually break anything.
      if (ctx.env.VITE_ENVIRONMENT_TYPE === "develop") {
        user = {
          twitter_id: auth.twitter_id,
          username: auth.username || `dev_${auth.twitter_id.slice(0, 6)}`,
          name: auth.username ? `Dev (${auth.username})` : "Dev (no profile)",
          profile_image_url: null,
        }
      } else {
        return jsonResponse({ error: "User record not found" }, 404)
      }
    }

    // 3. Wallets — match on twitter_id OR the `username:<handle>` placeholder
    // admins use when pre-assigning a wallet before the user has logged in.
    const walletRows = await ctx.env.DB
      .prepare(
        `SELECT wallet_address, wallet_type, deposit_completed_at FROM custodial_wallets
         WHERE twitter_id = ? OR twitter_id = ? OR twitter_username = ?`
      )
      .bind(auth.twitter_id, `username:${user.username}`, user.username)
      .all<WalletRow>()

    const byType: Record<"public" | "private", WalletRow | undefined> = {
      public: undefined,
      private: undefined,
    }
    for (const row of walletRows.results || []) {
      if (row.wallet_type === "public" || row.wallet_type === "private") {
        byType[row.wallet_type] = row
      }
    }

    // 4. Balances — fetched in parallel. If neither wallet exists the
    // connection is never opened, saving an RPC hit for non-whitelisted users.
    let publicBalances: WalletBalances | null = null
    let privateBalances: WalletBalances | null = null

    let predictPriceUsd = 0
    let proposalRegistry: ProposalConditionals[] = []
    // Hoisted so the response can include it at top-level (the trade
    // page uses it to detect "this is a PREDICT market" without
    // depending on the SDK's symbol resolution, which sometimes
    // returns a truncated mint instead of a clean ticker).
    let predictMint: string | null = null
    if (byType.public || byType.private) {
      const connection = new Connection(resolveRpc(ctx.env), "confirmed")
      const usdgMint = resolveUsdgMint(ctx.env)
      // Resolve once and pass into both wallet fetches — the mint is the
      // same regardless of which wallet we're reading.
      predictMint = await resolvePredictMint(ctx.env.DB)

      // Pull every Combinator proposal PDA we know about from the
      // hackathons table. Powers the unified-balance computation:
      // walk the user's wallet tokens, attribute conditional cTokens
      // back to their proposal+option, and sum the locked component
      // (see `computeLockedBalances`). Wrapped in try/catch so a
      // missing column doesn't 500 the whole /me response.
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

      // Fetch the price + balance reads + proposal-mint registry in
      // parallel so the Me page doesn't pay sequential latency. The
      // registry is in-isolate cached for 5 min so this is usually a
      // no-op after the first hit.
      const [publicResult, privateResult, priceResult, registryResult] = await Promise.all([
        byType.public ? fetchBalances(connection, byType.public.wallet_address, usdgMint, predictMint) : null,
        byType.private ? fetchBalances(connection, byType.private.wallet_address, usdgMint, predictMint) : null,
        predictMint ? fetchPredictPriceUsd(predictMint) : Promise.resolve(0),
        proposalPdas.length > 0 ? fetchProposalRegistry(connection, proposalPdas) : Promise.resolve([]),
      ])
      publicBalances = publicResult
      privateBalances = privateResult
      predictPriceUsd = priceResult
      proposalRegistry = registryResult

      // Run the locked-balance reducer over each wallet's tokens and
      // attach the result as a parallel `unified` object. We DON'T
      // mutate the inner `WalletBalances` shape (downstream consumers
      // depend on its exact fields); the unified totals live as a
      // sibling so the aggregation is opt-in for new readers.
      const predictMintStr = predictMint
      const enrichWithUnified = (w: WalletBalances | null) => {
        if (!w) return w
        const usdcWallet = w.tokens
          .filter(t => t.symbol === "USDC")
          .reduce((s, t) => s + t.amount, 0)
        const predictWallet = w.tokens
          .filter(t => t.symbol === "PREDICT")
          .reduce((s, t) => s + t.amount, 0)
        const { usdc_locked, predict_locked } = computeLockedBalances(
          w.tokens,
          proposalRegistry,
          predictMintStr,
        )
        return {
          ...w,
          unified: {
            usdc_wallet: usdcWallet,
            usdc_locked,
            usdc_total: usdcWallet + usdc_locked,
            predict_wallet: predictWallet,
            predict_locked,
            predict_total: predictWallet + predict_locked,
          },
        }
      }
      publicBalances = enrichWithUnified(publicBalances) as WalletBalances | null
      privateBalances = enrichWithUnified(privateBalances) as WalletBalances | null
    }

    // `deposit_completed` is derived from the PUBLIC wallet row only —
    // the private wallet is admin-funded and has no user-initiated
    // deposit concept. Clients use this flag for the onboarding redirect
    // ("should I send them to /m/deposit or straight into the app?").
    const depositCompleted = !!byType.public?.deposit_completed_at

    // Pull all proposals this user has upvoted so the client can render
    // the toggle state on every proposal card without an extra round-
    // trip per card. Wrapped in a try/catch because the table is added
    // by a migration — if it hasn't run yet we still want /me to work.
    let myProposalUpvotes: string[] = []
    try {
      const upvotesResult = await ctx.env.DB.prepare(
        "SELECT proposal_id FROM proposal_upvotes WHERE twitter_id = ?"
      )
        .bind(user.twitter_id)
        .all<{ proposal_id: string }>()
      myProposalUpvotes = (upvotesResult.results || []).map(r => r.proposal_id)
    } catch {
      myProposalUpvotes = []
    }

    return attachRefreshedToken(jsonResponse(
      {
        user: {
          twitter_id: user.twitter_id,
          username: user.username,
          name: user.name,
          profile_image_url: user.profile_image_url,
        },
        wallets: {
          public: publicBalances,
          private: privateBalances,
        },
        deposit_completed: depositCompleted,
        deposit_completed_at: byType.public?.deposit_completed_at ?? null,
        my_proposal_upvotes: myProposalUpvotes,
        // Spot price for $PREDICT, surfaced so the Me page can show the
        // USD-equivalent of the user's PREDICT balance next to the raw
        // token count. Zero when the mint isn't deployed or Jupiter
        // returned no price — the UI hides the dollar parenthetical in
        // that case rather than showing a misleading "$0.00".
        predict_price_usd: predictPriceUsd,
        // PREDICT mint (resolved server-side from the ideas table), so
        // the trade page can robustly detect "this is a PREDICT-base
        // market" via `market.baseMint === predict_mint`. Comparing
        // against `baseSymbol` was fragile — the SDK occasionally
        // returns a truncated mint address ("ARDF...QSPK") instead of
        // a clean ticker, which made the unified-balance fallback
        // miss and the trade page show 0 even when the user had
        // PREDICT.
        predict_mint: predictMint ?? null,
      },
      200
    ), auth)
  } catch (err) {
    console.error("[mini/me]", err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500
    )
  }
}
