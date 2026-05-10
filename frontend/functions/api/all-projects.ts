// File: functions/api/all-projects.ts
// Public API that returns all Spark projects (ideas + agent projects) with key metrics

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";
import { parseIdeaRow } from "../../shared/models/ideaModel";

type ENV = {
  DB: D1Database;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export const onRequest: PagesFunction<ENV> = async (context) => {
  const request = context.request;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders(request) },
    });
  }

  const db = context.env.DB;

  try {
    // --- Ideas ---
    const ideasRows = await db
      .prepare(
        `SELECT
          i.id, i.data,
          (SELECT COUNT(*) FROM idea_votes iv WHERE iv.idea_id = i.id AND iv.vote_type = 'up') as upvotes,
          (SELECT COUNT(*) FROM idea_votes iv WHERE iv.idea_id = i.id AND iv.vote_type = 'down') as downvotes,
          (SELECT COUNT(DISTINCT investor_wallet) FROM idea_investments ii WHERE ii.idea_id = i.id AND ii.status = 'active') as investor_count,
          (SELECT COALESCE(SUM(amount_usdc), 0) FROM idea_investments ii WHERE ii.idea_id = i.id AND ii.status = 'active') as total_raised
        FROM ideas i
        ORDER BY json_extract(i.data, '$.created_at') DESC`
      )
      .all();

    const ideas = (ideasRows.results || []).map((row: any) => {
      const parsed = parseIdeaRow(row);
      const raisedAmount = row.total_raised || parsed.raised_amount || 0;
      const estimatedPrice = parsed.estimated_price || 0;

      // Determine fundraise status
      let fundraise_status: string;
      if (parsed.status === "completed" || parsed.token_address) {
        fundraise_status = "completed";
      } else if (parsed.cap_reached_at) {
        fundraise_status = "completed";
      } else if (raisedAmount > 0 && estimatedPrice > 0) {
        fundraise_status = "raising";
      } else if (parsed.status === "pending" || parsed.status === "planned") {
        fundraise_status = "pending";
      } else {
        fundraise_status = parsed.status;
      }

      return {
        type: "idea" as const,
        id: parsed.id,
        title: parsed.title,
        slug: parsed.slug,
        description: parsed.description,
        category: parsed.category,
        status: parsed.status,
        fundraise_status,

        // Funding
        estimated_price: estimatedPrice,
        raised_amount: raisedAmount,
        investor_count: row.investor_count || 0,
        cap_reached_at: parsed.cap_reached_at || null,

        // Votes
        upvotes: row.upvotes || 0,
        downvotes: row.downvotes || 0,

        // Token
        token_address: parsed.token_address || null,
        coin_name: parsed.coin_name || null,
        ticker: parsed.ticker || null,
        initial_token_price: parsed.initial_token_price || null,

        // Wallets
        wallets: {
          treasury: parsed.treasury_wallet || null,
          fee: parsed.fee_wallet || null,
          buyback: parsed.buyback_wallet || null,
          ideator: parsed.ideator_wallet || null,
        },

        // Pools
        pools: {
          omnipair: parsed.pool_omnipair || null,
          dammv2_1: parsed.pool_dammv2_1 || null,
          dammv2_2: parsed.pool_dammv2_2 || null,
        },

        // Fee tracking
        fees: {
          total_collected: parsed.total_fees_collected || 0,
          ideator_available: parsed.ideator_fees_available || 0,
          ideator_claimed: parsed.ideator_fees_claimed || 0,
        },

        // Metadata
        author_username: parsed.author_username,
        source: parsed.source,
        generated_image_url: parsed.generated_image_url || null,
        timeline_phase: parsed.timeline_phase || null,
        legends_url: parsed.legends_url || null,
        superteam_url: parsed.superteam_url || null,
        created_at: parsed.created_at,
        updated_at: parsed.updated_at,
      };
    });

    // --- Agent Projects ---
    const agentRows = await db
      .prepare(
        `SELECT
          p.*,
          (SELECT COUNT(*) FROM agent_project_votes pv WHERE pv.project_id = p.id AND pv.vote_type = 'up') as upvotes,
          (SELECT COUNT(*) FROM agent_project_votes pv WHERE pv.project_id = p.id AND pv.vote_type = 'down') as downvotes,
          (SELECT COUNT(DISTINCT investor_wallet) FROM agent_project_investments ai WHERE ai.project_id = p.id AND ai.status = 'active') as investor_count,
          (SELECT COALESCE(SUM(amount_usdc), 0) FROM agent_project_investments ai WHERE ai.project_id = p.id AND ai.status = 'active') as total_raised
        FROM agent_projects p
        ORDER BY p.created_at DESC`
      )
      .all();

    const agentProjects = (agentRows.results || []).map((row: any) => {
      const raisedAmount = row.total_raised || row.raised_amount || 0;
      const estimatedPrice = row.estimated_price || 0;

      let fundraise_status: string;
      if (row.token_address) {
        fundraise_status = "completed";
      } else if (raisedAmount > 0 && estimatedPrice > 0 && raisedAmount >= estimatedPrice) {
        fundraise_status = "completed";
      } else if (raisedAmount > 0) {
        fundraise_status = "raising";
      } else {
        fundraise_status = "pending";
      }

      return {
        type: "agent_project" as const,
        id: row.id,
        title: row.title,
        slug: row.slug,
        description: row.description,
        category: row.categories || null,
        status: row.status,
        fundraise_status,

        // Funding
        estimated_price: estimatedPrice,
        raised_amount: raisedAmount,
        investor_count: row.investor_count || 0,
        cap_reached_at: null,

        // Votes
        upvotes: row.upvotes || 0,
        downvotes: row.downvotes || 0,
        colosseum_votes: {
          human: row.human_votes || 0,
          agent: row.agent_votes || 0,
          total: row.total_votes || 0,
        },

        // Token
        token_address: row.token_address || null,
        coin_name: null,
        ticker: null,
        initial_token_price: null,

        // Wallets
        wallets: {
          treasury: row.treasury_wallet || null,
          fee: null,
          buyback: null,
          ideator: null,
        },

        // Pools
        pools: {
          omnipair: null,
          dammv2_1: null,
          dammv2_2: null,
        },

        // Fee tracking
        fees: {
          total_collected: 0,
          ideator_available: 0,
          ideator_claimed: 0,
        },

        // Metadata
        team_name: row.team_name || null,
        colosseum_url: row.colosseum_url || null,
        colosseum_project_id: row.colosseum_project_id || null,
        repository_url: row.repository_url || null,
        demo_url: row.demo_url || null,
        generated_image_url: row.generated_image_url || null,
        market_analysis: row.market_analysis || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    // --- Summary stats ---
    const allProjects = [...ideas, ...agentProjects];
    const summary = {
      total_projects: allProjects.length,
      ideas_count: ideas.length,
      agent_projects_count: agentProjects.length,
      by_fundraise_status: {
        completed: allProjects.filter((p) => p.fundraise_status === "completed").length,
        raising: allProjects.filter((p) => p.fundraise_status === "raising").length,
        pending: allProjects.filter((p) => p.fundraise_status === "pending").length,
      },
      total_raised_usdc: allProjects.reduce((sum, p) => sum + p.raised_amount, 0),
      total_investors: allProjects.reduce((sum, p) => sum + p.investor_count, 0),
    };

    return new Response(
      JSON.stringify({ summary, ideas, agent_projects: agentProjects }, null, 2),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      }
    );
  } catch (e) {
    await reportError(db, e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(request) },
    });
  }
};
