// File: functions/api/idea-voters.ts
// API to fetch upvoters, downvoters, and investors for an idea

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
  VITE_ENVIRONMENT_TYPE: string;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export const onRequest: PagesFunction<ENV> = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  if (method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        ...corsHeaders(request),
        Allow: "OPTIONS, GET",
      },
    });
  }

  return handleGetRequest(context);
};

// GET - Fetch upvoters, downvoters, and investors for an idea
async function handleGetRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const ideaId = searchParams.get("ideaId");

    if (!ideaId) {
      return jsonResponse({ message: "ideaId is required" }, 400);
    }

    // Fetch upvoters
    const upvoters = await db
      .prepare(
        `SELECT DISTINCT 
          iv.voter_username,
          iv.voter_twitter_id,
          tu.profile_image_url as voter_avatar,
          tu.name as voter_name,
          COUNT(*) as vote_count
        FROM idea_votes iv
        LEFT JOIN twitter_users tu ON iv.voter_twitter_id = tu.twitter_id
        WHERE iv.idea_id = ? AND iv.vote_type = 'up'
        GROUP BY iv.voter_username, iv.voter_twitter_id, tu.profile_image_url, tu.name
        ORDER BY iv.created_at DESC
        LIMIT 20`
      )
      .bind(ideaId)
      .all();

    // Fetch downvoters
    const downvoters = await db
      .prepare(
        `SELECT DISTINCT 
          iv.voter_username,
          iv.voter_twitter_id,
          tu.profile_image_url as voter_avatar,
          tu.name as voter_name,
          COUNT(*) as vote_count
        FROM idea_votes iv
        LEFT JOIN twitter_users tu ON iv.voter_twitter_id = tu.twitter_id
        WHERE iv.idea_id = ? AND iv.vote_type = 'down'
        GROUP BY iv.voter_username, iv.voter_twitter_id, tu.profile_image_url, tu.name
        ORDER BY iv.created_at DESC
        LIMIT 20`
      )
      .bind(ideaId)
      .all();

    // Fetch total invested per wallet
    const investorsRaw = await db
      .prepare(
        `SELECT
          inv.investor_wallet,
          SUM(inv.amount_usdc) as total_invested,
          COALESCE((SELECT SUM(w.amount_usdc) FROM idea_withdrawals w WHERE w.idea_id = inv.idea_id AND w.investor_wallet = inv.investor_wallet), 0) as total_withdrawn,
          COUNT(*) as investment_count,
          MAX(inv.created_at) as last_investment_at,
          (SELECT inv2.transaction_signature FROM idea_investments inv2 WHERE inv2.idea_id = inv.idea_id AND inv2.investor_wallet = inv.investor_wallet AND inv2.status = 'active' ORDER BY inv2.created_at DESC LIMIT 1) as last_transaction_signature
        FROM idea_investments inv
        WHERE inv.idea_id = ? AND inv.status = 'active'
        GROUP BY inv.investor_wallet
        ORDER BY total_invested DESC, last_investment_at DESC`
      )
      .bind(ideaId)
      .all<{ investor_wallet: string; total_invested: number; total_withdrawn: number; investment_count: number; last_investment_at: string; last_transaction_signature?: string }>();

    const investors = (investorsRaw.results || [])
      .map(r => ({
        investor_wallet: r.investor_wallet,
        total_invested: Math.max(0, Math.round((r.total_invested - r.total_withdrawn) * 100) / 100),
        investment_count: r.investment_count,
        last_investment_at: r.last_investment_at,
        last_transaction_signature: r.last_transaction_signature,
      }))
      .filter(r => r.total_invested > 0.001);

    return jsonResponse({
      upvoters: upvoters.results || [],
      downvoters: downvoters.results || [],
      investors,
    }, 200);
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong..." }, 500);
  }
}
