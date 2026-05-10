/**
 * Chat messages for a combinator decision market.
 *
 * GET  /api/combinator-chat?proposal_pda=...&limit=100&after=<iso>
 *      Returns messages ordered ASC. `after` is optional for incremental polling.
 *
 * POST /api/combinator-chat
 *      Body: { proposal_pda, wallet, content }
 *      No auth. Pseudonym is the truncated wallet, enforced on render.
 */
import { jsonResponse } from "./cfPagesFunctionsUtils"

type ENV = { DB: D1Database }

const MAX_CONTENT_LENGTH = 500
const MAX_LIMIT = 200

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  )
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const url = new URL(ctx.request.url)
  const proposalPda = url.searchParams.get("proposal_pda")
  const after = url.searchParams.get("after")
  const limitRaw = parseInt(url.searchParams.get("limit") || "100", 10)
  const limit = Math.min(isNaN(limitRaw) ? 100 : limitRaw, MAX_LIMIT)

  if (!proposalPda) {
    return jsonResponse({ error: "proposal_pda required" }, 400)
  }

  let result
  if (after) {
    result = await ctx.env.DB
      .prepare(
        "SELECT id, wallet, content, created_at FROM combinator_chat_messages WHERE proposal_pda = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?"
      )
      .bind(proposalPda, after, limit)
      .all()
  } else {
    // Fetch the most recent N messages, then return them in chronological order.
    const recent = await ctx.env.DB
      .prepare(
        "SELECT id, wallet, content, created_at FROM combinator_chat_messages WHERE proposal_pda = ? ORDER BY created_at DESC LIMIT ?"
      )
      .bind(proposalPda, limit)
      .all()
    result = { ...recent, results: (recent.results || []).slice().reverse() }
  }

  return jsonResponse({ data: result.results || [] })
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const body = (await ctx.request.json()) as {
      proposal_pda?: string
      wallet?: string
      content?: string
    }

    const proposalPda = (body.proposal_pda || "").trim()
    const wallet = (body.wallet || "").trim()
    const content = (body.content || "").trim()

    if (!proposalPda || !wallet || !content) {
      return jsonResponse({ error: "proposal_pda, wallet and content are required" }, 400)
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return jsonResponse({ error: `content too long (max ${MAX_CONTENT_LENGTH} chars)` }, 400)
    }

    const id = uuidv4()
    const createdAt = new Date().toISOString()

    await ctx.env.DB
      .prepare(
        "INSERT INTO combinator_chat_messages (id, proposal_pda, wallet, content, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(id, proposalPda, wallet, content, createdAt)
      .run()

    return jsonResponse({ success: true, message: { id, wallet, content, created_at: createdAt } })
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    )
  }
}
