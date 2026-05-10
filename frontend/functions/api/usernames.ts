/**
 * Batch wallet → profile resolver.
 *
 * GET /api/usernames?wallets=addr1,addr2,addr3
 * Returns: { map: { [wallet]: { username, display_name, avatar_url, twitter_url, telegram_url, github_url } } }
 *
 * Looks up:
 *  1. `builders` table (primary wallet_address + additional_wallets[]) — uses builder profile.
 *  2. `user` table (address PK) — minimal fallback (username only) if no builder match.
 */
import { jsonResponse } from "./cfPagesFunctionsUtils"

type ENV = { DB: D1Database }

const MAX_WALLETS = 200

type Profile = {
  username: string
  display_name?: string
  avatar_url?: string
  twitter_url?: string
  telegram_url?: string
  github_url?: string
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    const { searchParams } = new URL(ctx.request.url)
    const walletsRaw = searchParams.get("wallets") || ""
    const wallets = Array.from(
      new Set(
        walletsRaw
          .split(",")
          .map(w => w.trim())
          .filter(Boolean)
      )
    ).slice(0, MAX_WALLETS)

    if (wallets.length === 0) {
      return jsonResponse({ map: {} })
    }

    const map: Record<string, Profile> = {}

    // 1) builders: match wallet_address OR any entry in additional_wallets
    const placeholders = wallets.map(() => "?").join(",")
    const builderQuery = `
      SELECT
        json_extract(data, '$.wallet_address')      AS wallet_address,
        json_extract(data, '$.additional_wallets')  AS additional_wallets,
        json_extract(data, '$.username')            AS username,
        json_extract(data, '$.display_name')        AS display_name,
        json_extract(data, '$.avatar_url')          AS avatar_url,
        json_extract(data, '$.twitter_url')         AS twitter_url,
        json_extract(data, '$.telegram_url')        AS telegram_url,
        json_extract(data, '$.github_url')          AS github_url
      FROM builders
      WHERE json_extract(data, '$.wallet_address') IN (${placeholders})
         OR EXISTS (
           SELECT 1 FROM json_each(
             coalesce(json_extract(data, '$.additional_wallets'), '[]')
           ) WHERE value IN (${placeholders})
         )
    `
    const builderRows = await ctx.env.DB
      .prepare(builderQuery)
      .bind(...wallets, ...wallets)
      .all()

    type BuilderRow = {
      wallet_address: string | null
      additional_wallets: string | null
      username: string | null
      display_name: string | null
      avatar_url: string | null
      twitter_url: string | null
      telegram_url: string | null
      github_url: string | null
    }

    for (const row of (builderRows.results || []) as BuilderRow[]) {
      const username = (row.username || "").trim()
      if (!username) continue
      const profile: Profile = {
        username,
        display_name: (row.display_name || "").trim() || undefined,
        avatar_url: (row.avatar_url || "").trim() || undefined,
        twitter_url: (row.twitter_url || "").trim() || undefined,
        telegram_url: (row.telegram_url || "").trim() || undefined,
        github_url: (row.github_url || "").trim() || undefined,
      }
      if (row.wallet_address && wallets.includes(row.wallet_address) && !map[row.wallet_address]) {
        map[row.wallet_address] = profile
      }
      if (row.additional_wallets) {
        try {
          const extra = JSON.parse(row.additional_wallets) as string[]
          for (const w of extra) {
            if (wallets.includes(w) && !map[w]) map[w] = profile
          }
        } catch { /* ignore malformed JSON */ }
      }
    }

    // 2) user table — only for wallets we haven't resolved yet
    const unresolved = wallets.filter(w => !map[w])
    if (unresolved.length > 0) {
      const ph = unresolved.map(() => "?").join(",")
      const userRows = await ctx.env.DB
        .prepare(`SELECT address, json_extract(data, '$.username') AS username FROM user WHERE address IN (${ph})`)
        .bind(...unresolved)
        .all()
      for (const row of (userRows.results || []) as Array<{ address: string; username: string | null }>) {
        const username = (row.username || "").trim()
        if (username) map[row.address] = { username }
      }
    }

    return jsonResponse({ map })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error", map: {} },
      500
    )
  }
}
