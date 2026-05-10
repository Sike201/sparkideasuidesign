/**
 * Public endpoint for builders to update their own proposal.
 * POST /api/update-proposal
 * Body: { proposal_id, builder_wallet, title, description_md, approach_md, timeline_md, github_url, demo_url, team_members, milestones }
 *
 * The builder_wallet must match the proposal's builder wallet to authorize the update.
 */
import { jsonResponse } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const db = ctx.env.DB
    const body = await ctx.request.json() as {
      proposal_id: string
      builder_wallet: string
      title?: string
      description_md?: string
      approach_md?: string
      timeline_md?: string
      github_url?: string
      demo_url?: string
      team_members?: string[]
      milestones?: { title: string; amount: string; deadline: string }[]
    }

    if (!body.proposal_id || !body.builder_wallet) {
      return jsonResponse({ error: "proposal_id and builder_wallet are required" }, 400)
    }

    // Verify ownership: get the proposal and check the builder's wallet
    const proposal = await db.prepare(
      "SELECT p.id, p.builder_id, b.data as builder_data FROM hackathon_proposals p LEFT JOIN builders b ON p.builder_id = b.id WHERE p.id = ?"
    ).bind(body.proposal_id).first() as { id: string; builder_id: string; builder_data: string } | null

    if (!proposal) {
      return jsonResponse({ error: "Proposal not found" }, 404)
    }

    // Parse builder data to check wallet
    const builderData = JSON.parse(proposal.builder_data || "{}")
    const builderWallet = builderData.wallet_address || ""
    const additionalWallets: string[] = builderData.additional_wallets || []

    if (builderWallet !== body.builder_wallet && !additionalWallets.includes(body.builder_wallet)) {
      return jsonResponse({ error: "Unauthorized: wallet does not match proposal builder" }, 403)
    }

    // Build update
    const setClauses: string[] = []
    const values: (string | number | null)[] = []

    if (body.title !== undefined) { setClauses.push("title = ?"); values.push(body.title) }
    if (body.description_md !== undefined) { setClauses.push("description_md = ?"); values.push(body.description_md) }
    if (body.approach_md !== undefined) { setClauses.push("approach_md = ?"); values.push(body.approach_md || null) }
    if (body.timeline_md !== undefined) { setClauses.push("timeline_md = ?"); values.push(body.timeline_md || null) }
    if (body.github_url !== undefined) { setClauses.push("github_url = ?"); values.push(body.github_url || null) }
    if (body.demo_url !== undefined) { setClauses.push("demo_url = ?"); values.push(body.demo_url || null) }
    if (body.team_members !== undefined || body.milestones !== undefined) {
      setClauses.push("team_members = ?")
      values.push(JSON.stringify({
        members: body.team_members || [],
        milestones: body.milestones || [],
      }))
    }

    if (setClauses.length === 0) {
      return jsonResponse({ error: "No fields to update" }, 400)
    }

    // Log the changes before applying them
    const existingProposal = await db.prepare(
      "SELECT title, description_md, approach_md, timeline_md, github_url, demo_url, team_members, hackathon_id FROM hackathon_proposals WHERE id = ?"
    ).bind(body.proposal_id).first() as Record<string, string | null> | null

    if (existingProposal) {
      const changes: { field: string; from: string; to: string }[] = []
      const fields = ["title", "description_md", "approach_md", "timeline_md", "github_url", "demo_url"] as const
      for (const field of fields) {
        const bodyField = body[field as keyof typeof body]
        if (bodyField !== undefined && bodyField !== existingProposal[field]) {
          changes.push({
            field,
            from: (existingProposal[field] || "").toString().substring(0, 500),
            to: (bodyField || "").toString().substring(0, 500),
          })
        }
      }
      if (body.team_members !== undefined || body.milestones !== undefined) {
        changes.push({
          field: "team_members/milestones",
          from: (existingProposal.team_members || "").toString().substring(0, 500),
          to: JSON.stringify({ members: body.team_members || [], milestones: body.milestones || [] }).substring(0, 500),
        })
      }

      if (changes.length > 0) {
        const editId = crypto.randomUUID()
        await db.prepare(
          "INSERT INTO proposal_edit_history (id, proposal_id, hackathon_id, builder_wallet, changes, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(
          editId,
          body.proposal_id,
          existingProposal.hackathon_id || null,
          body.builder_wallet,
          JSON.stringify(changes),
          new Date().toISOString()
        ).run()
      }
    }

    values.push(body.proposal_id)
    await db.prepare(
      `UPDATE hackathon_proposals SET ${setClauses.join(", ")} WHERE id = ?`
    ).bind(...values).run()

    return jsonResponse({ success: true })

  } catch (error) {
    console.error("[update-proposal] Error:", error)
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500)
  }
}
