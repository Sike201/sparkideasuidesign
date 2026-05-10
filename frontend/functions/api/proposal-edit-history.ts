/**
 * GET /api/proposal-edit-history?hackathon_id=X
 * Returns edit history for all proposals in a hackathon.
 */

type ENV = { DB: D1Database };

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const hackathonId = url.searchParams.get("hackathon_id");
  const proposalId = url.searchParams.get("proposal_id");

  if (!hackathonId && !proposalId) {
    return new Response(JSON.stringify({ error: "hackathon_id or proposal_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = ctx.env.DB;
  let result;

  if (proposalId) {
    result = await db
      .prepare("SELECT * FROM proposal_edit_history WHERE proposal_id = ? ORDER BY timestamp DESC LIMIT 100")
      .bind(proposalId)
      .all();
  } else {
    result = await db
      .prepare("SELECT * FROM proposal_edit_history WHERE hackathon_id = ? ORDER BY timestamp DESC LIMIT 200")
      .bind(hackathonId!)
      .all();
  }

  return new Response(JSON.stringify({ data: result.results || [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
