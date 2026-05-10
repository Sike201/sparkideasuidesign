/**
 * Admin endpoint to list all hackathons.
 * POST /api/admin/hackathons
 * Body: { auth: AdminAuthFields }
 */
import { AdminAuthFields } from "../../../shared/models"
import { checkAdminAuthorization, isAdminReturnValue } from "../../services/authService"
import { jsonResponse } from "../cfPagesFunctionsUtils"
import { parseHackathonRow } from "../../../shared/models/hackathonModel"

type ENV = {
  DB: D1Database
  ADMIN_ADDRESSES: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const { auth } = (await ctx.request.json()) as { auth: AdminAuthFields }

    if (!auth) {
      return jsonResponse({ error: "auth is required" }, 400)
    }

    const authResult: isAdminReturnValue = checkAdminAuthorization({ ctx, auth })
    if (!authResult.isAdmin) {
      const { error: authError } = authResult as { isAdmin: false; error: { code: number; message: string } }
      return jsonResponse({ message: authError.message }, authError.code)
    }

    // Fetch all hackathons
    const hackathonRows = await ctx.env.DB
      .prepare("SELECT * FROM hackathons ORDER BY json_extract(data, '$.created_at') DESC")
      .all()

    const hackathons = (hackathonRows.results || []).map((row: any) => parseHackathonRow(row))

    // Fetch milestones and proposals counts
    for (const h of hackathons) {
      const milestones = await ctx.env.DB
        .prepare("SELECT * FROM hackathon_milestones WHERE hackathon_id = ? ORDER BY milestone_order ASC")
        .bind(h.id)
        .all()
      ;(h as any).milestones = milestones.results || []

      const proposalCount = await ctx.env.DB
        .prepare("SELECT COUNT(*) as count FROM hackathon_proposals WHERE hackathon_id = ?")
        .bind(h.id)
        .first<{ count: number }>()
      ;(h as any).proposals_count = proposalCount?.count || 0
    }

    return jsonResponse({ hackathons })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    )
  }
}
