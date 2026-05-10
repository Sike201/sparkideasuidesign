// File: functions/api/agent-projects.ts
// Agent Projects API for Colosseum Agent Hackathon projects

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
  VITE_ENVIRONMENT_TYPE: string;
};

// Define a general handler function for applying CORS headers
function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

// Handle all HTTP methods
export const onRequest: PagesFunction<ENV> = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();

  // For OPTIONS requests, return just the CORS headers
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  // Route based on method
  switch (method) {
    case "GET":
      return handleGetRequest(context);
    case "POST":
      return handlePostRequest(context);
    case "PUT":
      return handlePutRequest(context);
    case "DELETE":
      return handleDeleteRequest(context);
    default:
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          ...corsHeaders(request),
          Allow: "OPTIONS, GET, POST, PUT, DELETE",
        },
      });
  }
};

// Helper function to generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

// GET - Fetch agent projects (with optional filters)
async function handleGetRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const projectId = searchParams.get("id");
    const slug = searchParams.get("slug");
    const status = searchParams.get("status");
    const sortBy = searchParams.get("sortBy") || "votes";
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    console.log(`[AGENT-PROJECTS] GET request - id: ${projectId}, slug: ${slug}, status: ${status}, sortBy: ${sortBy}`);

    // If requesting a specific project by ID
    if (projectId) {
      const project = await db
        .prepare(
          `SELECT
            p.*,
            (SELECT COUNT(*) FROM agent_project_votes pv WHERE pv.project_id = p.id AND pv.vote_type = 'up') as upvotes,
            (SELECT COUNT(*) FROM agent_project_votes pv WHERE pv.project_id = p.id AND pv.vote_type = 'down') as downvotes,
            (SELECT COUNT(*) FROM agent_project_comments pc WHERE pc.project_id = p.id) as comments_count
          FROM agent_projects p
          WHERE p.id = ?`
        )
        .bind(projectId)
        .first();

      if (!project) {
        return jsonResponse({ message: "Project not found" }, 404);
      }

      // Also fetch comments for this project (with replies support and vote counts)
      const comments = await db
        .prepare(
          `SELECT
            c.*,
            (SELECT COUNT(*) FROM agent_project_comment_votes cv WHERE cv.comment_id = c.id AND cv.vote_type = 'up') as upvotes,
            (SELECT COUNT(*) FROM agent_project_comment_votes cv WHERE cv.comment_id = c.id AND cv.vote_type = 'down') as downvotes
          FROM agent_project_comments c
          WHERE c.project_id = ?
          ORDER BY c.created_at ASC`
        )
        .bind(projectId)
        .all();

      return jsonResponse({ project, comments: comments.results }, 200);
    }

    // If requesting a specific project by slug
    if (slug) {
      const project = await db
        .prepare(
          `SELECT
            p.*,
            (SELECT COUNT(*) FROM agent_project_votes pv WHERE pv.project_id = p.id AND pv.vote_type = 'up') as upvotes,
            (SELECT COUNT(*) FROM agent_project_votes pv WHERE pv.project_id = p.id AND pv.vote_type = 'down') as downvotes,
            (SELECT COUNT(*) FROM agent_project_comments pc WHERE pc.project_id = p.id) as comments_count
          FROM agent_projects p
          WHERE p.slug = ?`
        )
        .bind(slug)
        .first();

      if (!project) {
        return jsonResponse({ message: "Project not found" }, 404);
      }

      // Also fetch comments for this project (with vote counts)
      const comments = await db
        .prepare(
          `SELECT
            c.*,
            (SELECT COUNT(*) FROM agent_project_comment_votes cv WHERE cv.comment_id = c.id AND cv.vote_type = 'up') as upvotes,
            (SELECT COUNT(*) FROM agent_project_comment_votes cv WHERE cv.comment_id = c.id AND cv.vote_type = 'down') as downvotes
          FROM agent_project_comments c
          WHERE c.project_id = ?
          ORDER BY c.created_at ASC`
        )
        .bind(project.id)
        .all();

      return jsonResponse({ project, comments: comments.results }, 200);
    }

    // Build query for listing projects
    let query = `
      SELECT
        p.*,
        (SELECT COUNT(*) FROM agent_project_votes pv WHERE pv.project_id = p.id AND pv.vote_type = 'up') as upvotes,
        (SELECT COUNT(*) FROM agent_project_votes pv WHERE pv.project_id = p.id AND pv.vote_type = 'down') as downvotes,
        (SELECT COUNT(*) FROM agent_project_comments pc WHERE pc.project_id = p.id) as comments_count
      FROM agent_projects p
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      query += " AND p.status = ?";
      params.push(status);
    }

    // Add sorting
    switch (sortBy) {
      case "newest":
        query += " ORDER BY p.created_at DESC";
        break;
      case "oldest":
        query += " ORDER BY p.created_at ASC";
        break;
      case "raised":
        query += " ORDER BY p.raised_amount DESC, p.created_at DESC";
        break;
      case "colosseum_votes":
        query += " ORDER BY p.total_votes DESC, p.created_at DESC";
        break;
      case "downvotes":
        query += " ORDER BY downvotes DESC, p.created_at DESC";
        break;
      case "votes":
      default:
        query += " ORDER BY (upvotes - downvotes) DESC, p.created_at DESC";
        break;
    }

    // Add pagination
    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const stmt = db.prepare(query);
    const projects = await stmt.bind(...params).all();

    console.log(`[AGENT-PROJECTS] Query returned ${projects.results?.length || 0} projects`);

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) as total FROM agent_projects WHERE 1=1";
    const countParams: any[] = [];

    if (status) {
      countQuery += " AND status = ?";
      countParams.push(status);
    }

    const countStmt = db.prepare(countQuery);
    const countResult = await countStmt.bind(...countParams).first<{ total: number }>();

    console.log(`[AGENT-PROJECTS] Total count in DB: ${countResult?.total || 0}`);

    // If no projects exist, suggest running scraper
    if ((countResult?.total || 0) === 0) {
      console.warn(`[AGENT-PROJECTS] ⚠️  No projects in database! Run: curl -X POST http://localhost:5173/api/admin/refresh-agent-projects`);
    }

    return jsonResponse(
      {
        projects: projects.results,
        pagination: {
          total: countResult?.total || 0,
          limit,
          offset,
        },
      },
      200
    );
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong..." }, 500);
  }
}

// POST - Create a new agent project (admin/scraper only)
async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      title?: string;
      description?: string;
      teamName?: string;
      status?: string;
      humanVotes?: number;
      agentVotes?: number;
      totalVotes?: number;
      colosseumUrl?: string;
      colosseumProjectId?: string;
      estimatedPrice?: number;
    };

    const {
      title,
      description,
      teamName,
      status,
      humanVotes,
      agentVotes,
      totalVotes,
      colosseumUrl,
      colosseumProjectId,
      estimatedPrice
    } = body;

    // Validate required fields
    if (!title || !description || !teamName || !colosseumUrl || !colosseumProjectId) {
      return new Response(
        JSON.stringify({ message: "Title, description, team name, Colosseum URL, and Colosseum project ID are required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    const id = generateUUID();
    const slug = generateSlug(title);
    const createdAt = new Date().toISOString();
    const scrapedAt = new Date().toISOString();

    // Ensure slug is unique by appending a number if needed
    let finalSlug = slug;
    let slugCounter = 1;
    while (true) {
      const existing = await db
        .prepare("SELECT id FROM agent_projects WHERE slug = ?")
        .bind(finalSlug)
        .first();

      if (!existing) break;
      finalSlug = `${slug}-${slugCounter}`;
      slugCounter++;
    }

    await db
      .prepare(
        `INSERT INTO agent_projects (
          id, title, slug, description, team_name, status,
          human_votes, agent_votes, total_votes,
          colosseum_url, colosseum_project_id,
          estimated_price, scraped_at, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`
      )
      .bind(
        id,
        title,
        finalSlug,
        description,
        teamName,
        status || "Draft",
        humanVotes || 0,
        agentVotes || 0,
        totalVotes || 0,
        colosseumUrl,
        colosseumProjectId,
        estimatedPrice || 0,
        scrapedAt,
        createdAt,
        createdAt
      )
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        id,
        slug: finalSlug,
        url: `/agents/${finalSlug}`,
        message: "Agent project created successfully"
      }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      }
    );
  } catch (e) {
    await reportError(db, e);
    return new Response(JSON.stringify({ message: "Something went wrong..." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  }
}

// PUT - Update project (vote, status change, etc.)
async function handlePutRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      id?: string;
      action?: string;
      userId?: string;
      voterTwitterId?: string;
      voterUsername?: string;
      voteType?: 'up' | 'down';
      status?: string;
    };
    const { id, action, userId, voterTwitterId, voterUsername, voteType, status } = body;

    if (!id) {
      return new Response(JSON.stringify({ message: "Project ID is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    // Handle voting (upvote/downvote)
    if ((action === "vote" || action === "upvote" || action === "downvote") && userId) {
      const actualVoteType = action === "downvote" ? "down" : (action === "upvote" ? "up" : (voteType || "up"));

      // Check if user already voted
      const existingVote = await db
        .prepare("SELECT * FROM agent_project_votes WHERE project_id = ? AND user_id = ?")
        .bind(id, userId)
        .first<{ vote_type: string }>();

      if (existingVote) {
        // If same vote type, remove vote (toggle off)
        if (existingVote.vote_type === actualVoteType) {
          await db
            .prepare("DELETE FROM agent_project_votes WHERE project_id = ? AND user_id = ?")
            .bind(id, userId)
            .run();
          return new Response(
            JSON.stringify({ success: true, action: "unvoted", voteType: null }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders(request),
              },
            }
          );
        } else {
          // Different vote type, update vote
          await db
            .prepare("UPDATE agent_project_votes SET vote_type = ?, voter_twitter_id = ?, voter_username = ? WHERE project_id = ? AND user_id = ?")
            .bind(actualVoteType, voterTwitterId || null, voterUsername || null, id, userId)
            .run();
          return new Response(
            JSON.stringify({ success: true, action: "changed", voteType: actualVoteType }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders(request),
              },
            }
          );
        }
      } else {
        // Add new vote
        await db
          .prepare(
            "INSERT INTO agent_project_votes (id, project_id, user_id, voter_twitter_id, voter_username, vote_type, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
          )
          .bind(generateUUID(), id, userId, voterTwitterId || null, voterUsername || null, actualVoteType, new Date().toISOString())
          .run();
        return new Response(JSON.stringify({ success: true, action: "voted", voteType: actualVoteType }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        });
      }
    }

    // Handle status update (admin only)
    if (status) {
      const validStatuses = ["Draft", "Published"];
      if (!validStatuses.includes(status)) {
        return new Response(JSON.stringify({ message: "Invalid status" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        });
      }

      await db
        .prepare("UPDATE agent_projects SET status = ?, updated_at = ? WHERE id = ?")
        .bind(status, new Date().toISOString(), id)
        .run();

      return new Response(JSON.stringify({ success: true, status }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    return new Response(JSON.stringify({ message: "No valid action provided" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  } catch (e) {
    await reportError(db, e);
    return new Response(JSON.stringify({ message: "Something went wrong..." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  }
}

// DELETE - Delete a project (admin only)
async function handleDeleteRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ message: "Project ID is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    // Delete related votes, comments, and investments first
    await db.prepare("DELETE FROM agent_project_votes WHERE project_id = ?").bind(id).run();
    await db.prepare("DELETE FROM agent_project_comment_votes WHERE comment_id IN (SELECT id FROM agent_project_comments WHERE project_id = ?)").bind(id).run();
    await db.prepare("DELETE FROM agent_project_comments WHERE project_id = ?").bind(id).run();
    await db.prepare("DELETE FROM agent_project_investments WHERE project_id = ?").bind(id).run();
    await db.prepare("DELETE FROM agent_projects WHERE id = ?").bind(id).run();

    return new Response(JSON.stringify({ success: true, message: "Project deleted" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  } catch (e) {
    await reportError(db, e);
    return new Response(JSON.stringify({ message: "Something went wrong..." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  }
}

// Helper function to generate UUID
function generateUUID() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16)
  );
}
