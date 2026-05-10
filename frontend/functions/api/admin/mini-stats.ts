/**
 * GET /api/admin/mini-stats
 *
 * Aggregated metrics for the mini-app, served as one JSON payload so
 * the BackOffice dashboard renders without a fan-out of admin calls.
 *
 * Auth mirrors the rest of the admin surface: `Authorization: <api key>`
 * with the `write` permission verified via `isApiKeyValid`.
 *
 * Sections returned:
 *   - overview: totals + conversion rates
 *   - signups_by_day / deposits_by_day / trades_by_day (last 30 days)
 *   - funnel: signed_in → deposited → traded
 *   - signin_conversion: twitter_challenges attempts vs completions (7 days)
 *   - notifications: subscription health
 *   - top_traders / top_markets: leaderboards
 *
 * Every section is wrapped in its own try/catch so a missing migration
 * (e.g. `proposal_upvotes` table absent on a fresh DB) never 500s the
 * whole dashboard — the consumer sees zeros / an empty list for the
 * affected slice and the rest still renders.
 */
import { jsonResponse } from "../cfPagesFunctionsUtils"
import { isApiKeyValid } from "../../services/apiKeyService"

type ENV = {
  DB: D1Database
}

async function safeFirst<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T | null> {
  try {
    return await db.prepare(sql).bind(...binds).first<T>()
  } catch {
    return null
  }
}

async function safeAll<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> {
  try {
    const r = await db.prepare(sql).bind(...binds).all<T>()
    return r.results || []
  } catch {
    return []
  }
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  // Same gate as the other admin endpoints — Authorization header
  // hashed + matched against the `api_key` table, `write` permission
  // required. The inline form mirrors the canonical pattern used in
  // `presignedurl.ts` / `bonus-wallets.ts`.
  if (!await isApiKeyValid({ ctx, permissions: ['write'] })) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const db = ctx.env.DB

  // ── Overview ───────────────────────────────────────────────
  const totalSignups = await safeFirst<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM twitter_users`,
  )
  const walletsProvisioned = await safeFirst<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM custodial_wallets WHERE wallet_type = 'public'`,
  )
  const depositsCompleted = await safeFirst<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM custodial_wallets
     WHERE wallet_type = 'public' AND deposit_completed_at IS NOT NULL`,
  )
  const totalTrades = await safeFirst<{ c: number; v: number; u: number }>(
    db,
    `SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS v,
            COUNT(DISTINCT wallet) AS u
       FROM combinator_trades`,
  )
  const notifSubs = await safeFirst<{ active: number; total: number }>(
    db,
    `SELECT
        SUM(CASE WHEN last_failure_at IS NULL THEN 1 ELSE 0 END) AS active,
        COUNT(*) AS total
       FROM push_subscriptions`,
  )
  const withdrawCount = await safeFirst<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM mini_withdraw_ata_creations`,
  )

  const wallets = walletsProvisioned?.c ?? 0
  const deposits = depositsCompleted?.c ?? 0
  const depositConversionPct = wallets > 0 ? (100 * deposits) / wallets : 0

  // ── Time series (last 30 days) ─────────────────────────────
  const signupsByDay = await safeAll<{ day: string; signups: number }>(
    db,
    `SELECT date(created_at) AS day, COUNT(*) AS signups
       FROM custodial_wallets
       WHERE wallet_type = 'public'
         AND created_at >= datetime('now', '-30 days')
       GROUP BY day
       ORDER BY day DESC`,
  )
  const depositsByDay = await safeAll<{ day: string; deposits: number }>(
    db,
    `SELECT date(deposit_completed_at) AS day, COUNT(*) AS deposits
       FROM custodial_wallets
       WHERE wallet_type = 'public'
         AND deposit_completed_at IS NOT NULL
         AND deposit_completed_at >= datetime('now', '-30 days')
       GROUP BY day
       ORDER BY day DESC`,
  )
  const tradesByDay = await safeAll<{ day: string; trades: number; traders: number; volume: number }>(
    db,
    `SELECT date(timestamp) AS day,
            COUNT(*) AS trades,
            COUNT(DISTINCT wallet) AS traders,
            COALESCE(SUM(amount), 0) AS volume
       FROM combinator_trades
       WHERE timestamp >= datetime('now', '-30 days')
       GROUP BY day
       ORDER BY day DESC`,
  )

  // ── Funnel signin → deposit → first trade ──────────────────
  const funnel = await safeFirst<{ signed_in: number; deposited: number; traded: number }>(
    db,
    `WITH base AS (
        SELECT tu.twitter_id,
               cw.wallet_address,
               cw.deposit_completed_at,
               (SELECT MIN(timestamp) FROM combinator_trades ct
                  WHERE ct.wallet = cw.wallet_address) AS first_trade_at
          FROM twitter_users tu
          LEFT JOIN custodial_wallets cw
            ON cw.twitter_id = tu.twitter_id AND cw.wallet_type = 'public'
      )
      SELECT
        COUNT(*) AS signed_in,
        SUM(CASE WHEN deposit_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS deposited,
        SUM(CASE WHEN first_trade_at IS NOT NULL THEN 1 ELSE 0 END) AS traded
      FROM base`,
  )

  // ── Sign-in conversion (Twitter OAuth challenges, last 7d) ─
  const signinConversion = await safeFirst<{
    attempts: number
    completed: number
  }>(
    db,
    `SELECT COUNT(*) AS attempts,
            SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
       FROM twitter_challenges
       WHERE created_at >= datetime('now', '-7 days')`,
  )

  // ── Top traders + top markets ──────────────────────────────
  const topTraders = await safeAll<{ wallet: string; trades: number; volume: number }>(
    db,
    `SELECT wallet, COUNT(*) AS trades, COALESCE(SUM(amount), 0) AS volume
       FROM combinator_trades
       GROUP BY wallet
       ORDER BY volume DESC
       LIMIT 10`,
  )
  const topMarkets = await safeAll<{ proposal_pda: string; trades: number; traders: number; volume: number }>(
    db,
    `SELECT proposal_pda,
            COUNT(*) AS trades,
            COUNT(DISTINCT wallet) AS traders,
            COALESCE(SUM(amount), 0) AS volume
       FROM combinator_trades
       GROUP BY proposal_pda
       ORDER BY trades DESC
       LIMIT 10`,
  )

  return jsonResponse({
    generated_at: new Date().toISOString(),
    overview: {
      total_signups: totalSignups?.c ?? 0,
      wallets_provisioned: wallets,
      deposits_completed: deposits,
      deposit_conversion_pct: Math.round(depositConversionPct * 10) / 10,
      total_trades: totalTrades?.c ?? 0,
      unique_traders: totalTrades?.u ?? 0,
      total_volume: Math.round((totalTrades?.v ?? 0) * 100) / 100,
      notif_subs_active: notifSubs?.active ?? 0,
      notif_subs_total: notifSubs?.total ?? 0,
      withdraws: withdrawCount?.c ?? 0,
    },
    signups_by_day: signupsByDay,
    deposits_by_day: depositsByDay,
    trades_by_day: tradesByDay,
    funnel: {
      signed_in: funnel?.signed_in ?? 0,
      deposited: funnel?.deposited ?? 0,
      traded: funnel?.traded ?? 0,
    },
    signin_conversion: {
      attempts: signinConversion?.attempts ?? 0,
      completed: signinConversion?.completed ?? 0,
      pct:
        signinConversion?.attempts && signinConversion.attempts > 0
          ? Math.round(
              (1000 * (signinConversion.completed ?? 0)) / signinConversion.attempts,
            ) / 10
          : 0,
    },
    top_traders: topTraders,
    top_markets: topMarkets,
  })
}
