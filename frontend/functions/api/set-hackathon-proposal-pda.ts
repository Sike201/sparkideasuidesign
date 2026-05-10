/**
 * Public endpoint to save a combinator_proposal_pda on a hackathon.
 * If there's already an active PDA, it gets moved to previous_proposal_pdas.
 * Validates that the new PDA exists on the Combinator API before writing.
 * POST /api/set-hackathon-proposal-pda
 * Body: { hackathon_id, proposal_pda }
 */
import { jsonResponse } from "./cfPagesFunctionsUtils"

type ENV = { DB: D1Database }

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const { hackathon_id, proposal_pda } = (await ctx.request.json()) as {
      hackathon_id: string
      proposal_pda: string
    }

    if (!hackathon_id || !proposal_pda) {
      return jsonResponse({ error: "hackathon_id and proposal_pda are required" }, 400)
    }

    const row = await ctx.env.DB
      .prepare(`
        SELECT id,
               json_extract(data, '$.combinator_proposal_pda') as existing_pda,
               json_extract(data, '$.previous_proposal_pdas') as previous_pdas
        FROM hackathons WHERE id = ?
      `)
      .bind(hackathon_id)
      .first<{ id: string; existing_pda: string | null; previous_pdas: string | null }>()

    if (!row) {
      return jsonResponse({ error: "Hackathon not found" }, 404)
    }

    if (row.existing_pda === proposal_pda) {
      return jsonResponse({ error: "This PDA is already the active market" }, 409)
    }

    // Verify the proposal PDA exists on Combinator
    const check = await fetch(`https://api.zcombinator.io/dao/proposal/${proposal_pda}`)
    if (!check.ok) {
      return jsonResponse({ error: "Invalid proposal PDA — not found on Combinator" }, 400)
    }

    // Move existing PDA to previous_proposal_pdas (latest first)
    const previous: string[] = row.previous_pdas ? JSON.parse(row.previous_pdas) : []
    if (row.existing_pda && !previous.includes(row.existing_pda)) {
      previous.unshift(row.existing_pda)
    }

    await ctx.env.DB
      .prepare(`
        UPDATE hackathons SET data = json_set(data,
          '$.combinator_proposal_pda', ?,
          '$.previous_proposal_pdas', json(?)
        ) WHERE id = ?
      `)
      .bind(proposal_pda, JSON.stringify(previous), hackathon_id)
      .run()

    return jsonResponse({ success: true })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    )
  }
}
