/**
 * Public API for builders.
 * GET  /api/builders                  — list all builders
 * GET  /api/builders?id=X             — get single builder
 * GET  /api/builders?username=X       — get builder by username
 * GET  /api/builders?wallet=X         — get builder by wallet (primary + additional)
 * GET  /api/builders?search_social=X  — search unclaimed builder by social URL
 * GET  /api/builders?find_by_social=X — find any builder by social URL
 * POST /api/builders                  — upsert builder profile by wallet address
 * POST /api/builders {action:"add_wallet"} — add wallet to existing builder
 */
import { jsonResponse } from "./cfPagesFunctionsUtils"
import { parseBuilderRow, buildBuilderData } from "../../shared/models/hackathonModel"

type ENV = {
  DB: D1Database
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    const { searchParams } = new URL(ctx.request.url)
    const id = searchParams.get("id")
    const username = searchParams.get("username")
    const wallet = searchParams.get("wallet")

    if (id) {
      const row = await ctx.env.DB
        .prepare("SELECT * FROM builders WHERE id = ?")
        .bind(id)
        .first()
      if (!row) return jsonResponse({ error: "Builder not found" }, 404)
      return jsonResponse({ builder: parseBuilderRow(row as any) })
    }

    if (wallet) {
      const row = await ctx.env.DB
        .prepare(`
          SELECT * FROM builders
          WHERE json_extract(data, '$.wallet_address') = ?1
          OR EXISTS (
            SELECT 1 FROM json_each(
              coalesce(json_extract(data, '$.additional_wallets'), '[]')
            ) WHERE value = ?1
          )
          LIMIT 1
        `)
        .bind(wallet)
        .first()
      if (!row) return jsonResponse({ builder: null })
      return jsonResponse({ builder: parseBuilderRow(row as any) })
    }

    // Search unclaimed builder by social link — case-insensitive
    const searchSocial = searchParams.get("search_social")
    if (searchSocial) {
      const lowerSocial = searchSocial.toLowerCase()
      const row = await ctx.env.DB
        .prepare(`
          SELECT * FROM builders
          WHERE json_extract(data, '$.claimed') = false
          AND (
            lower(json_extract(data, '$.twitter_url')) = ?
            OR lower(json_extract(data, '$.github_url')) = ?
            OR lower(json_extract(data, '$.telegram_url')) = ?
            OR lower(json_extract(data, '$.username')) = ?
          )
          LIMIT 1
        `)
        .bind(lowerSocial, lowerSocial, lowerSocial, lowerSocial)
        .first()
      if (!row) return jsonResponse({ builder: null })
      return jsonResponse({ builder: parseBuilderRow(row as any) })
    }

    // Find builder by social URL or email (all builders, including claimed) — case-insensitive
    const findBySocial = searchParams.get("find_by_social")
    if (findBySocial) {
      const lower = findBySocial.toLowerCase()
      const row = await ctx.env.DB
        .prepare(`
          SELECT * FROM builders
          WHERE lower(json_extract(data, '$.twitter_url')) = ?
          OR lower(json_extract(data, '$.github_url')) = ?
          OR lower(json_extract(data, '$.telegram_url')) = ?
          OR lower(json_extract(data, '$.google_email')) = ?
          LIMIT 1
        `)
        .bind(lower, lower, lower, lower)
        .first()
      if (!row) return jsonResponse({ builder: null })
      return jsonResponse({ builder: parseBuilderRow(row as any) })
    }

    if (username) {
      const row = await ctx.env.DB
        .prepare("SELECT * FROM builders WHERE json_extract(data, '$.username') = ?")
        .bind(username)
        .first()
      if (!row) return jsonResponse({ error: "Builder not found" }, 404)

      // Get proposals for this builder
      const builder = parseBuilderRow(row as any)
      const proposals = await ctx.env.DB
        .prepare("SELECT p.*, h.data as hackathon_data FROM hackathon_proposals p JOIN hackathons h ON h.id = p.hackathon_id WHERE p.builder_id = ? ORDER BY p.submitted_at DESC")
        .bind(builder.id)
        .all()

      const parsedProposals = (proposals.results || []).map((p: any) => {
        const hackathonData = JSON.parse(p.hackathon_data || "{}")
        return {
          id: p.id,
          hackathon_id: p.hackathon_id,
          hackathon_title: hackathonData.idea_title || "",
          title: p.title,
          description_md: p.description_md,
          submitted_at: p.submitted_at,
          team_members: p.team_members ? (() => { try { return JSON.parse(p.team_members) } catch { return [] } })() : [],
        }
      })

      return jsonResponse({ builder, proposals: parsedProposals })
    }

    // List all builders
    const rows = await ctx.env.DB
      .prepare("SELECT * FROM builders ORDER BY json_extract(data, '$.created_at') DESC")
      .all()

    const builders = (rows.results || []).map((row: any) => parseBuilderRow(row))

    return jsonResponse({ builders })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    )
  }
}

/**
 * POST /api/builders — upsert builder profile by wallet address
 */
export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const body = await ctx.request.json() as {
      wallet_address: string
      data: Record<string, unknown>
      action?: string
      builder_id?: string
    }

    if (!body.wallet_address) {
      return jsonResponse({ error: "wallet_address is required" }, 400)
    }

    // Action: add_wallet — add an additional wallet to an existing builder
    if (body.action === "add_wallet" && body.builder_id) {
      const builder = await ctx.env.DB
        .prepare("SELECT * FROM builders WHERE id = ?")
        .bind(body.builder_id)
        .first()
      if (!builder) return jsonResponse({ error: "Builder not found" }, 404)

      const data = JSON.parse((builder as any).data)
      const additionalWallets: string[] = data.additional_wallets || []

      // Skip if wallet already present
      if (data.wallet_address === body.wallet_address || additionalWallets.includes(body.wallet_address)) {
        return jsonResponse({ builder: parseBuilderRow(builder as any) })
      }

      additionalWallets.push(body.wallet_address)
      await ctx.env.DB
        .prepare("UPDATE builders SET data = json_set(data, '$.additional_wallets', json(?)) WHERE id = ?")
        .bind(JSON.stringify(additionalWallets), body.builder_id)
        .run()

      const updated = await ctx.env.DB
        .prepare("SELECT * FROM builders WHERE id = ?")
        .bind(body.builder_id)
        .first()
      return jsonResponse({ builder: parseBuilderRow(updated as any) })
    }

    // Check if builder exists by wallet (primary or additional)
    const existing = await ctx.env.DB
      .prepare(`
        SELECT * FROM builders
        WHERE json_extract(data, '$.wallet_address') = ?1
        OR EXISTS (
          SELECT 1 FROM json_each(
            coalesce(json_extract(data, '$.additional_wallets'), '[]')
          ) WHERE value = ?1
        )
        LIMIT 1
      `)
      .bind(body.wallet_address)
      .first()

    // Helper: apply json_set updates and claim
    const applyUpdates = async (builderId: string, updates: Record<string, unknown>, claim: boolean) => {
      let query = "UPDATE builders SET data = json_set(data"
      const binds: unknown[] = []

      // Always set wallet_address and claimed
      query += ", '$.wallet_address', ?"
      binds.push(body.wallet_address)
      if (claim) {
        query += ", '$.claimed', ?"
        binds.push(true)
      }

      for (const [key, value] of Object.entries(updates)) {
        query += `, '$.${key}', ?`
        binds.push(typeof value === "object" ? JSON.stringify(value) : value)
      }
      query += ") WHERE id = ?"
      binds.push(builderId)

      await ctx.env.DB.prepare(query).bind(...binds).run()

      const updated = await ctx.env.DB
        .prepare("SELECT * FROM builders WHERE id = ?")
        .bind(builderId)
        .first()
      return jsonResponse({ builder: parseBuilderRow(updated as any) })
    }

    if (existing) {
      // Update existing builder (already linked to this wallet)
      return applyUpdates((existing as any).id, body.data, false)
    }

    // Try to find an unclaimed Colosseum profile to claim
    // Match by username, twitter, github, or telegram
    const username = (body.data.username as string) || ""
    const twitter = (body.data.twitter_url as string) || ""
    const github = (body.data.github_url as string) || ""
    const telegram = (body.data.telegram_url as string) || ""

    let unclaimed: Record<string, unknown> | null = null

    if (username) {
      unclaimed = await ctx.env.DB
        .prepare("SELECT * FROM builders WHERE json_extract(data, '$.username') = ? AND json_extract(data, '$.claimed') = false")
        .bind(username)
        .first()
    }
    if (!unclaimed && twitter) {
      unclaimed = await ctx.env.DB
        .prepare("SELECT * FROM builders WHERE json_extract(data, '$.twitter_url') = ? AND json_extract(data, '$.claimed') = false")
        .bind(twitter)
        .first()
    }
    if (!unclaimed && github) {
      unclaimed = await ctx.env.DB
        .prepare("SELECT * FROM builders WHERE json_extract(data, '$.github_url') = ? AND json_extract(data, '$.claimed') = false")
        .bind(github)
        .first()
    }
    if (!unclaimed && telegram) {
      unclaimed = await ctx.env.DB
        .prepare("SELECT * FROM builders WHERE json_extract(data, '$.telegram_url') = ? AND json_extract(data, '$.claimed') = false")
        .bind(telegram)
        .first()
    }

    if (unclaimed) {
      // Claim the Colosseum profile: update with user's data + wallet + claimed=true
      return applyUpdates((unclaimed as any).id, body.data, true)
    }

    // No existing profile found — create new builder
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const builderData = buildBuilderData({
      username,
      display_name: (body.data.display_name as string) || "",
      avatar_url: "",
      position: (body.data.position as string) || "",
      city: (body.data.city as string) || "",
      about: (body.data.about as string) || "",
      skills: (body.data.skills as string[]) || [],
      i_am_a: (body.data.i_am_a as string[]) || [],
      looking_for: (body.data.looking_for as string[]) || [],
      interested_in: (body.data.interested_in as string[]) || [],
      languages: (body.data.languages as string[]) || [],
      looking_for_teammates_text: (body.data.looking_for_teammates_text as string) || "",
      is_student: (body.data.is_student as boolean) || false,
      twitter_url: twitter,
      github_url: github,
      telegram_url: telegram,
      google_email: (body.data.google_email as string) || "",
      wallet_address: body.wallet_address,
      claimed: true,
      source: "signup",
      created_at: now,
    })

    await ctx.env.DB
      .prepare("INSERT INTO builders (id, data) VALUES (?, ?)")
      .bind(id, builderData)
      .run()

    const row = await ctx.env.DB
      .prepare("SELECT * FROM builders WHERE id = ?")
      .bind(id)
      .first()

    return jsonResponse({ builder: parseBuilderRow(row as any) })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    )
  }
}
