/**
 * POST /api/mini/upvote-proposal
 *
 * Toggle an upvote on a hackathon proposal for the authenticated mini-app
 * user. Body: { proposal_id }. Response: { upvoted, upvote_count }.
 *
 * Idempotent on the client side — sending the same request twice flips
 * the state both ways. The unique constraint on (proposal_id, twitter_id)
 * means we never store duplicate rows even under racing requests.
 *
 * Auth: mini-app JWT via `Authorization: Bearer <token>` (see _auth.ts).
 */

import { jsonResponse } from "../cfPagesFunctionsUtils"
import { verifyMiniAuth } from "./_auth"

type ENV = {
  DB: D1Database
  JWT_SECRET?: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const auth = await verifyMiniAuth(ctx.request, ctx.env.JWT_SECRET, ctx.env)
    if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status)

    const body = (await ctx.request.json().catch(() => null)) as
      | { proposal_id?: string }
      | null
    const proposalId = body?.proposal_id?.trim()
    if (!proposalId) {
      return jsonResponse({ error: "proposal_id is required" }, 400)
    }

    const db = ctx.env.DB

    // Verify the proposal exists — without this an attacker could spam
    // arbitrary proposal_ids and the unique constraint would silently
    // create dangling rows that never get cleaned up.
    const proposal = await db
      .prepare("SELECT id FROM hackathon_proposals WHERE id = ?")
      .bind(proposalId)
      .first()
    if (!proposal) {
      return jsonResponse({ error: "Proposal not found" }, 404)
    }

    const existing = await db
      .prepare(
        "SELECT id FROM proposal_upvotes WHERE proposal_id = ? AND twitter_id = ?"
      )
      .bind(proposalId, auth.twitter_id)
      .first()

    let upvoted: boolean
    if (existing) {
      await db
        .prepare("DELETE FROM proposal_upvotes WHERE id = ?")
        .bind((existing as { id: string }).id)
        .run()
      upvoted = false
    } else {
      const id = crypto.randomUUID()
      await db
        .prepare(
          "INSERT INTO proposal_upvotes (id, proposal_id, twitter_id) VALUES (?, ?, ?)"
        )
        .bind(id, proposalId, auth.twitter_id)
        .run()
      upvoted = true
    }

    const countRow = await db
      .prepare(
        "SELECT COUNT(*) as count FROM proposal_upvotes WHERE proposal_id = ?"
      )
      .bind(proposalId)
      .first<{ count: number }>()

    return jsonResponse({
      upvoted,
      upvote_count: countRow?.count ?? 0,
    })
  } catch (err) {
    console.error("[mini/upvote-proposal]", err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500
    )
  }
}
