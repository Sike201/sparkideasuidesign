/**
 * GET /api/mini/me/deposit-status
 *
 * Lightweight polling endpoint for the `/m/deposit` onboarding page.
 * Checks the authenticated user's PUBLIC custodial wallet for a USD
 * stablecoin balance and flips `deposit_completed_at` the first time the
 * combined balance crosses the threshold.
 *
 * Why a separate endpoint from `/api/mini/me`?
 *   - The deposit page polls every 3s — calling the full `/me` (SOL +
 *     all SPL tokens for both wallets) on that cadence is wasteful.
 *   - Server-side mutation: we mark the deposit timestamp as a side
 *     effect here so the server is the source of truth. The client can't
 *     forge "I deposited" — it reads the stamped timestamp back next time.
 *
 * Stablecoin counted: USDC ONLY (classic SPL Token program). USDG exists
 * in the ecosystem but the product decision is to gate onboarding on USDC
 * specifically — it's what users bring from CEXes, Phantom balances, and
 * bridges, and the mental model "deposit $1 USDC" is the clearest ask we
 * can make of a first-time user. If they somehow hold USDG instead, the
 * in-app swap / trade flows let them convert — but they can't clear the
 * gate with it. Keeping the threshold mono-asset also sidesteps any
 * depeg-arbitrage edge cases.
 *
 * Idempotent: once `deposit_completed_at` is set, we never clear it.
 * A user can withdraw back below $1 after the gate; they stay unlocked.
 *
 * Auth: mini-app JWT in `Authorization: Bearer <token>`.
 *
 * Response:
 *   {
 *     public_wallet_address: string,
 *     usdc_balance: number,            // the gate metric
 *     total_usd: number,               // === usdc_balance, kept for UI compat
 *     threshold_usd: 1,
 *     deposit_completed: boolean,      // true once crossed, sticky
 *     deposit_completed_at: string | null,
 *   }
 */

import { Connection, PublicKey } from "@solana/web3.js"
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token"

import { jsonResponse, pickRpcUrl } from "../cfPagesFunctionsUtils"
import { verifyMiniAuth } from "./_auth"

type ENV = {
  DB: D1Database
  JWT_SECRET?: string
  HELIUS_RPC_URL?: string
  VITE_RPC_URL?: string
  VITE_REDEMPTION_MAINNET_RPC_URL?: string
  VITE_REDEMPTION_DEVNET_RPC_URL?: string
  VITE_SOLANA_NETWORK?: "mainnet" | "devnet"
  // Dev bypass — when "develop" we treat a missing wallet row as
  // "deposit completed" so the bypass user can browse without being
  // bounced to /m/deposit.
  VITE_ENVIRONMENT_TYPE?: string
  DEV_BYPASS_TWITTER_ID?: string
}

// Threshold the user must cross before the app unlocks. Expressed in
// stablecoin units ($10 USD ≈ 10 USDG ≈ 10 USDC). If we ever want a
// different floor we can bump this — the rest of the pipeline just
// reads it (UI copy, gate check, /me response).
const DEPOSIT_THRESHOLD_USD = 10

// USDC (classic Token program) is one of two assets the deposit gate
// counts. Users bring it from Phantom / CEX withdrawals / bridges.
const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
const USDC_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")

/**
 * In-memory price cache for non-stable mints (right now: $PREDICT). Keyed
 * by mint, value is `{ priceUsd, expiresAt }`. The Worker runtime
 * recycles isolates frequently so this cache is best-effort — but on a
 * warm isolate it absorbs back-to-back deposit-status polls (one every
 * 3s from the deposit page) into a single Jupiter call per minute.
 *
 * Lives at module scope so multiple requests on the same isolate share
 * it. Cleared automatically on isolate recycle. We don't bother with
 * KV here: this endpoint is high-frequency and per-isolate caching is
 * cheap and good enough.
 */
const PRICE_CACHE = new Map<string, { priceUsd: number; expiresAt: number }>()
const PRICE_TTL_MS = 60_000

/**
 * Pull the $PREDICT mint from the linked Idea row. We resolve by ticker
 * so a future PREDICT-2 / rename doesn't need a code change — the truth
 * lives in the ideas table next to coin_name. Returns null if the row
 * doesn't exist or the ticker maps to nothing on chain (token not yet
 * deployed). Network mismatches are NOT detected here: if a devnet user
 * somehow has the mainnet mint stored, the on-chain balance read will
 * just return 0 because the ATA won't exist.
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
    console.warn("[mini/deposit-status] failed to resolve $PREDICT mint:", err)
    return null
  }
}

/**
 * Fetch the USD price for a mint via Jupiter Price API v6 (free, no
 * auth). Caches per-mint for 60s on the isolate.
 *
 * Failure modes return 0 — the caller falls back to "this asset doesn't
 * count toward the gate" rather than blocking onboarding on Jupiter
 * being up. Trade-off: if Jupiter is down for everyone the user might
 * see a slightly under-counted balance for a minute, but we never
 * unlock incorrectly nor do we hard-fail.
 */
async function fetchUsdPrice(mint: PublicKey): Promise<number> {
  const key = mint.toBase58()
  const cached = PRICE_CACHE.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.priceUsd

  try {
    // Jupiter Price API v3 — `api.jup.ag/price/v3?ids=<mint>` is the
    // current canonical host. The older `price.jup.ag/v6/price` was
    // deprecated in 2024 and now returns 4xx/5xx. Response shape:
    // `{ [mint]: { usdPrice, decimals, priceChange24h, ... } }` —
    // no `data` wrapper; mints are top-level keys.
    const url = `https://api.jup.ag/price/v3?ids=${encodeURIComponent(key)}`
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; SparkPriceFetcher/1.0; +https://justspark.fun)",
      },
    })
    if (!res.ok) {
      console.warn(`[mini/deposit-status] jupiter ${res.status} for mint=${key}`)
      return 0
    }
    const data = (await res.json().catch(() => null)) as
      | Record<string, { usdPrice?: number | string }>
      | null
    const price = Number(data?.[key]?.usdPrice ?? 0) || 0
    if (price > 0) {
      PRICE_CACHE.set(key, { priceUsd: price, expiresAt: Date.now() + PRICE_TTL_MS })
    }
    return price
  } catch (err) {
    console.warn("[mini/deposit-status] jupiter fetch failed:", err)
    return 0
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
 * Read a single ATA's token balance. Returns 0 if the ATA doesn't exist
 * yet (brand-new wallet → no deposit has landed). We don't differentiate
 * between "ATA missing" and "ATA exists with 0 balance" — both mean the
 * user hasn't funded this mint, which is exactly what the gate needs to
 * know.
 */
async function readAtaBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
  programId: PublicKey,
): Promise<number> {
  try {
    const ata = getAssociatedTokenAddressSync(mint, owner, /*allowOwnerOffCurve*/ false, programId)
    const resp = await connection.getTokenAccountBalance(ata, "confirmed")
    // `uiAmount` can be null if the account is empty; fall back to 0.
    return resp.value.uiAmount ?? 0
  } catch {
    // Typical miss: ATA doesn't exist yet → RPC returns an error. Treat
    // as 0. Real RPC failures also land here, but the deposit page keeps
    // polling so a transient blip is self-healing.
    return 0
  }
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    const auth = await verifyMiniAuth(ctx.request, ctx.env.JWT_SECRET, ctx.env)
    if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status)

    // Pull just the PUBLIC wallet — the private one is admin-funded and
    // its balance doesn't count toward the user-initiated deposit gate.
    const row = await ctx.env.DB
      .prepare(
        `SELECT wallet_address, deposit_completed_at
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
      .first<{ wallet_address: string; deposit_completed_at: string | null }>()

    if (!row) {
      // Dev-bypass tolerance: in develop mode the stub user
      // (e.g. `dev_user_local` or any DEV_BYPASS_TWITTER_ID with no
      // backing custodial_wallets row) would otherwise be stuck on
      // a 404 poll loop on /m/deposit. Treat as "already deposited"
      // so the rest of the app is browsable. The deposit gate also
      // short-circuits dev sessions client-side, so this branch is
      // only hit when something navigates directly to /m/deposit.
      if (ctx.env.VITE_ENVIRONMENT_TYPE === "develop") {
        return jsonResponse({
          public_wallet_address: "",
          usdc_balance: 0,
          predict_balance: 0,
          predict_price_usd: 0,
          predict_value_usd: 0,
          total_usd: 0,
          threshold_usd: DEPOSIT_THRESHOLD_USD,
          deposit_completed: true,
          deposit_completed_at: new Date().toISOString(),
        })
      }
      // Shouldn't happen in the normal flow — `twitter-oauth-token`
      // auto-provisions on every login. Surface as 404 so the client can
      // show a retry CTA rather than hanging on a 0-balance poll loop.
      return jsonResponse({ error: "No public wallet for user" }, 404)
    }

    // If deposit is already completed, short-circuit: no RPC, no DB write.
    // This is the hot path for every page that wants to check "did the
    // user onboard", called on nav + app open, so we keep it cheap.
    if (row.deposit_completed_at) {
      return jsonResponse({
        public_wallet_address: row.wallet_address,
        usdc_balance: 0,
        predict_balance: 0,
        predict_price_usd: 0,
        predict_value_usd: 0,
        total_usd: 0,
        threshold_usd: DEPOSIT_THRESHOLD_USD,
        deposit_completed: true,
        deposit_completed_at: row.deposit_completed_at,
      })
    }

    // First time crossing the gate — read USDC and $PREDICT balances and
    // sum their USD values. Both run in parallel so the deposit page
    // doesn't sit on sequential RPC latency.
    const connection = new Connection(resolveRpc(ctx.env), "confirmed")
    const usdcMint = resolveUsdcMint(ctx.env)
    const owner = new PublicKey(row.wallet_address)
    const predictMint = await resolvePredictMint(ctx.env.DB)

    const [usdcBal, predictBal, predictPriceUsd] = await Promise.all([
      readAtaBalance(connection, owner, usdcMint, TOKEN_PROGRAM_ID),
      predictMint
        ? readAtaBalance(connection, owner, predictMint, TOKEN_PROGRAM_ID)
        : Promise.resolve(0),
      predictMint ? fetchUsdPrice(predictMint) : Promise.resolve(0),
    ])

    // $PREDICT contributes its USD value to the gate. If we couldn't get
    // a price (Jupiter down, mint unknown) the contribution is 0 — the
    // user can still unlock with USDC alone, never the other way.
    const predictValueUsd = predictBal * predictPriceUsd
    const totalUsd = usdcBal + predictValueUsd
    const crossed = totalUsd >= DEPOSIT_THRESHOLD_USD

    let completedAt: string | null = null
    if (crossed) {
      // Atomic-enough stamp: UPDATE … WHERE deposit_completed_at IS NULL
      // means only the first request across the threshold writes, and
      // every subsequent one is a no-op. Two concurrent polls can both
      // fire the UPDATE but D1 serializes them and only one matches.
      completedAt = new Date().toISOString()
      await ctx.env.DB
        .prepare(
          `UPDATE custodial_wallets
           SET deposit_completed_at = ?
           WHERE wallet_type = 'public'
             AND wallet_address = ?
             AND deposit_completed_at IS NULL`,
        )
        .bind(completedAt, row.wallet_address)
        .run()
    }

    return jsonResponse({
      public_wallet_address: row.wallet_address,
      usdc_balance: usdcBal,
      predict_balance: predictBal,
      predict_price_usd: predictPriceUsd,
      predict_value_usd: predictValueUsd,
      total_usd: totalUsd,
      threshold_usd: DEPOSIT_THRESHOLD_USD,
      deposit_completed: crossed,
      deposit_completed_at: completedAt,
    })
  } catch (err) {
    console.error("[mini/deposit-status]", err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    )
  }
}
