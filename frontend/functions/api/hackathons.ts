/**
 * Public API for hackathons.
 * GET /api/hackathons          — list all hackathons
 * GET /api/hackathons?id=X     — get single hackathon with milestones + proposals + builders
 */
import { jsonResponse } from "./cfPagesFunctionsUtils"
import { parseHackathonRow } from "../../shared/models/hackathonModel"

type ENV = {
  DB: D1Database
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    const { searchParams } = new URL(ctx.request.url)
    const id = searchParams.get("id")

    if (id) {
      return handleGetSingle(ctx, id)
    }
    return handleGetAll(ctx)
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    )
  }
}

async function handleGetAll(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB

  const hackathonRows = await db
    .prepare("SELECT * FROM hackathons ORDER BY json_extract(data, '$.created_at') DESC")
    .all()

  const hackathons = (hackathonRows.results || []).map((row: any) => {
    const parsed = parseHackathonRow(row)
    return parsed
  })

  // Attach proposals count + linked-idea token metadata for each
  // hackathon. The `idea_slug` joins us to `ideas.data.slug`; we surface
  // `coin_name` + `ticker` so the mini-app's "My balances" row shows
  // the actual project token name instead of the truncated mint.
  for (const h of hackathons) {
    const result = await db
      .prepare("SELECT COUNT(*) as count FROM hackathon_proposals WHERE hackathon_id = ?")
      .bind(h.id)
      .first<{ count: number }>()
    ;(h as any).proposals_count = result?.count || 0
    await attachIdeaTokenMeta(db, h)
  }

  return jsonResponse({ hackathons })
}

/**
 * Look up the idea linked by `hackathon.idea_slug` and copy its token
 * fields onto the hackathon. Wrapped in try/catch so a missing/orphan
 * idea row never breaks the hackathon response — fields just stay
 * undefined and the client falls back to its existing display rules.
 */
async function attachIdeaTokenMeta(db: D1Database, hackathon: any): Promise<void> {
  if (!hackathon?.idea_slug) return
  try {
    const idea = await db
      .prepare(
        `SELECT
           json_extract(data, '$.coin_name')        AS coin_name,
           json_extract(data, '$.ticker')           AS ticker,
           json_extract(data, '$.token_address')    AS token_address,
           json_extract(data, '$.treasury_wallet')  AS treasury_wallet
         FROM ideas
         WHERE json_extract(data, '$.slug') = ?
         LIMIT 1`,
      )
      .bind(hackathon.idea_slug)
      .first<{
        coin_name: string | null
        ticker: string | null
        token_address: string | null
        treasury_wallet: string | null
      }>()
    if (!idea) return
    if (idea.coin_name) hackathon.coin_name = idea.coin_name
    if (idea.ticker) hackathon.ticker = idea.ticker
    if (idea.token_address) hackathon.token_address = idea.token_address
    // Treasury address is needed by the mini-app's token-market card to
    // display the on-chain treasury balance for the project's own
    // token. Surfaced as a sibling field rather than baked into the
    // existing token_address — the two are different addresses (mint
    // vs. wallet).
    if (idea.treasury_wallet) hackathon.treasury_wallet = idea.treasury_wallet
  } catch (err) {
    console.error("[hackathons] failed to load idea token meta:", err)
  }
}

async function handleGetSingle(ctx: EventContext<ENV, string, unknown>, id: string) {
  const db = ctx.env.DB

  // Get hackathon
  const row = await db
    .prepare("SELECT * FROM hackathons WHERE id = ?")
    .bind(id)
    .first()

  if (!row) {
    return jsonResponse({ error: "Hackathon not found" }, 404)
  }

  const hackathon = parseHackathonRow(row as any)

  // Get milestones
  const milestonesResult = await db
    .prepare("SELECT * FROM hackathon_milestones WHERE hackathon_id = ? ORDER BY milestone_order ASC")
    .bind(id)
    .all()

  // Get proposals with builder data
  const proposalsResult = await db
    .prepare("SELECT * FROM hackathon_proposals WHERE hackathon_id = ? ORDER BY submitted_at DESC")
    .bind(id)
    .all()

  const proposals = proposalsResult.results || []

  // Attach builder data + upvote count to each proposal. We aggregate
  // upvotes from `proposal_upvotes` here (rather than a denormalised
  // counter column) so the count is always consistent with the rows the
  // /api/mini/upvote-proposal endpoint writes — no risk of the counter
  // drifting from reality.
  for (const p of proposals as any[]) {
    if (p.builder_id) {
      const builder = await db
        .prepare("SELECT * FROM builders WHERE id = ?")
        .bind(p.builder_id)
        .first()
      if (builder) {
        p.builder = { id: builder.id, ...JSON.parse(builder.data as string) }
      }
    }
    // Parse team_members JSON
    if (p.team_members) {
      try {
        p.team_members = JSON.parse(p.team_members)
      } catch {
        p.team_members = []
      }
    } else {
      p.team_members = []
    }
    // Upvote count — wrapped in try/catch so an old DB without the
    // `proposal_upvotes` table (i.e. migration not yet applied) still
    // returns the rest of the response. Defaults to 0 on error.
    try {
      const countRow = await db
        .prepare(
          "SELECT COUNT(*) as count FROM proposal_upvotes WHERE proposal_id = ?"
        )
        .bind(p.id)
        .first<{ count: number }>()
      p.upvote_count = countRow?.count ?? 0
    } catch {
      p.upvote_count = 0
    }
  }

  await attachIdeaTokenMeta(db, hackathon)

  return jsonResponse({
    hackathon: {
      ...hackathon,
      milestones: milestonesResult.results || [],
      proposals,
    },
  })
}
