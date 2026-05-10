/**
 * Admin endpoint to get the raw JSON data of an idea.
 *
 * POST /api/admin/get-idea
 * Body: { auth: { address, message, signature }, ideaId }
 */
import { AdminAuthFields } from "../../../shared/models"
import { checkAdminAuthorization, isAdminReturnValue } from "../../services/authService"
import { jsonResponse } from "../cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
  ADMIN_ADDRESSES: string
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const { auth, ideaId } = (await ctx.request.json()) as {
      auth: AdminAuthFields
      ideaId: string
    }

    if (!auth || !ideaId) {
      return jsonResponse({ error: "auth and ideaId are required" }, 400)
    }

    const authResult: isAdminReturnValue = checkAdminAuthorization({ ctx, auth })
    if (!authResult.isAdmin) {
      const { error: authError } = authResult as { isAdmin: false; error: { code: number; message: string } }
      return jsonResponse({ message: authError.message }, authError.code)
    }

    const result = await ctx.env.DB
      .prepare("SELECT * FROM ideas WHERE id = ?1")
      .bind(ideaId)
      .first()

    if (!result) {
      return jsonResponse({ error: "Idea not found" }, 404)
    }

    // Parse the JSON data column and merge with top-level fields
    const data = typeof result.data === "string" ? JSON.parse(result.data) : result.data
    return jsonResponse({ idea: { id: result.id, ...data } })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    )
  }
}
