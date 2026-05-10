// File: functions/api/ideas.ts
// Ideas API for product feedback system

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";
import { parseIdeaRow, buildIdeaData } from "../../shared/models/ideaModel";
import { generateLandingPage } from './generate-landing-page';

type ENV = {
  DB: D1Database;
  VITE_ENVIRONMENT_TYPE: string;
  OPENAI_API_KEY?: string;
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

// GET - Fetch ideas (with optional filters)
async function handleGetRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const ideaId = searchParams.get("id");
    const slug = searchParams.get("slug");
    const category = searchParams.get("category");
    const status = searchParams.get("status");
    const authorUsername = searchParams.get("authorUsername");
    const voterUsername = searchParams.get("voterUsername");
    const sortBy = searchParams.get("sortBy") || "votes"; // votes, newest, oldest, raised
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // If requesting a specific idea by ID
    if (ideaId) {
      const row = await db
        .prepare(
          `SELECT
            i.id, i.data,
            (SELECT COUNT(*) FROM idea_votes iv WHERE iv.idea_id = i.id AND iv.vote_type = 'up') as upvotes,
            (SELECT COUNT(*) FROM idea_votes iv WHERE iv.idea_id = i.id AND iv.vote_type = 'down') as downvotes,
            (SELECT COUNT(*) FROM idea_comments ic WHERE ic.idea_id = i.id) as comments_count
          FROM ideas i
          WHERE i.id = ?`
        )
        .bind(ideaId)
        .first();

      if (!row) {
        return jsonResponse({ message: "Idea not found" }, 404);
      }

      const idea = parseIdeaRow(row as any);

      // Also fetch comments for this idea (with replies support and vote counts)
      const comments = await db
        .prepare(
          `SELECT
            c.*,
            (SELECT COUNT(*) FROM idea_comment_votes cv WHERE cv.comment_id = c.id AND cv.vote_type = 'up') as upvotes,
            (SELECT COUNT(*) FROM idea_comment_votes cv WHERE cv.comment_id = c.id AND cv.vote_type = 'down') as downvotes
          FROM idea_comments c
          WHERE c.idea_id = ?
          ORDER BY c.created_at ASC`
        )
        .bind(ideaId)
        .all();

      // Calculate author investment for each comment
      const commentsWithInvestment = await Promise.all(
        (comments.results || []).map(async (comment: any) => {
          let authorInvestment = 0;

          const byUsername = await db
            .prepare(
              `SELECT SUM(amount_usdc) as total_invested
               FROM idea_investments
               WHERE idea_id = ? AND investor_twitter_username = ? AND status = 'active'`
            )
            .bind(ideaId, comment.author_username)
            .first<{ total_invested: number }>();
          authorInvestment = byUsername?.total_invested || 0;

          if (authorInvestment === 0) {
            const twitterUser = await db
              .prepare("SELECT wallet_address FROM twitter_users WHERE username = ?")
              .bind(comment.author_username)
              .first<{ wallet_address?: string }>();
            if (twitterUser?.wallet_address) {
              const byWallet = await db
                .prepare(
                  `SELECT SUM(amount_usdc) as total_invested
                   FROM idea_investments
                   WHERE idea_id = ? AND investor_wallet = ? AND status = 'active'`
                )
                .bind(ideaId, twitterUser.wallet_address)
                .first<{ total_invested: number }>();
              authorInvestment = byWallet?.total_invested || 0;
            }
          }

          return { ...comment, author_investment: authorInvestment };
        })
      );

      return jsonResponse({ idea, comments: commentsWithInvestment }, 200);
    }

    // If requesting a specific idea by slug
    if (slug) {
      const row = await db
        .prepare(
          `SELECT
            i.id, i.data,
            (SELECT COUNT(*) FROM idea_votes iv WHERE iv.idea_id = i.id AND iv.vote_type = 'up') as upvotes,
            (SELECT COUNT(*) FROM idea_votes iv WHERE iv.idea_id = i.id AND iv.vote_type = 'down') as downvotes,
            (SELECT COUNT(*) FROM idea_comments ic WHERE ic.idea_id = i.id) as comments_count
          FROM ideas i
          WHERE json_extract(i.data, '$.slug') = ?`
        )
        .bind(slug)
        .first();

      if (!row) {
        return jsonResponse({ message: "Idea not found" }, 404);
      }

      const idea = parseIdeaRow(row as any);

      // Also fetch comments for this idea (with vote counts)
      const comments = await db
        .prepare(
          `SELECT
            c.*,
            (SELECT COUNT(*) FROM idea_comment_votes cv WHERE cv.comment_id = c.id AND cv.vote_type = 'up') as upvotes,
            (SELECT COUNT(*) FROM idea_comment_votes cv WHERE cv.comment_id = c.id AND cv.vote_type = 'down') as downvotes
          FROM idea_comments c
          WHERE c.idea_id = ?
          ORDER BY c.created_at ASC`
        )
        .bind(idea.id)
        .all();

      // Calculate author investment for each comment
      const commentsWithInvestment = await Promise.all(
        (comments.results || []).map(async (comment: any) => {
          let authorInvestment = 0;

          const byUsername = await db
            .prepare(
              `SELECT SUM(amount_usdc) as total_invested
               FROM idea_investments
               WHERE idea_id = ? AND investor_twitter_username = ? AND status = 'active'`
            )
            .bind(idea.id, comment.author_username)
            .first<{ total_invested: number }>();
          authorInvestment = byUsername?.total_invested || 0;

          if (authorInvestment === 0) {
            const twitterUser = await db
              .prepare("SELECT wallet_address FROM twitter_users WHERE username = ?")
              .bind(comment.author_username)
              .first<{ wallet_address?: string }>();
            if (twitterUser?.wallet_address) {
              const byWallet = await db
                .prepare(
                  `SELECT SUM(amount_usdc) as total_invested
                   FROM idea_investments
                   WHERE idea_id = ? AND investor_wallet = ? AND status = 'active'`
                )
                .bind(idea.id, twitterUser.wallet_address)
                .first<{ total_invested: number }>();
              authorInvestment = byWallet?.total_invested || 0;
            }
          }

          return { ...comment, author_investment: authorInvestment };
        })
      );

      return jsonResponse({ idea, comments: commentsWithInvestment }, 200);
    }

    // If requesting ideas by a specific author (for profile page)
    if (authorUsername) {
      const ideas = await db
        .prepare(
          `SELECT
            i.id, i.data,
            (SELECT COUNT(*) FROM idea_votes iv WHERE iv.idea_id = i.id AND iv.vote_type = 'up') as upvotes,
            (SELECT COUNT(*) FROM idea_votes iv WHERE iv.idea_id = i.id AND iv.vote_type = 'down') as downvotes,
            (SELECT COUNT(*) FROM idea_comments ic WHERE ic.idea_id = i.id) as comments_count
          FROM ideas i
          WHERE json_extract(i.data, '$.author_username') = ?
          ORDER BY json_extract(i.data, '$.created_at') DESC
          LIMIT ? OFFSET ?`
        )
        .bind(authorUsername, limit, offset)
        .all();

      const countResult = await db
        .prepare("SELECT COUNT(*) as total FROM ideas WHERE json_extract(data, '$.author_username') = ?")
        .bind(authorUsername)
        .first<{ total: number }>();

      return jsonResponse({
        ideas: ideas.results.map((r: any) => parseIdeaRow(r)),
        pagination: { total: countResult?.total || 0, limit, offset }
      }, 200);
    }

    // If requesting votes by a specific user (for profile page)
    if (voterUsername) {
      const votes = await db
        .prepare(
          `SELECT
            iv.*,
            json_extract(i.data, '$.title') as idea_title,
            json_extract(i.data, '$.slug') as idea_slug,
            json_extract(i.data, '$.category') as idea_category
          FROM idea_votes iv
          JOIN ideas i ON iv.idea_id = i.id
          WHERE iv.voter_username = ?
          ORDER BY iv.created_at DESC
          LIMIT ? OFFSET ?`
        )
        .bind(voterUsername, limit, offset)
        .all();

      const countResult = await db
        .prepare("SELECT COUNT(*) as total FROM idea_votes WHERE voter_username = ?")
        .bind(voterUsername)
        .first<{ total: number }>();

      return jsonResponse({
        votes: votes.results,
        pagination: { total: countResult?.total || 0, limit, offset }
      }, 200);
    }

    // Build query for listing ideas
    let query = `
      SELECT
        i.id, i.data,
        (SELECT COUNT(*) FROM idea_votes iv WHERE iv.idea_id = i.id AND iv.vote_type = 'up') as upvotes,
        (SELECT COUNT(*) FROM idea_votes iv WHERE iv.idea_id = i.id AND iv.vote_type = 'down') as downvotes,
        (SELECT COUNT(*) FROM idea_comments ic WHERE ic.idea_id = i.id) as comments_count
      FROM ideas i
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category) {
      query += " AND json_extract(i.data, '$.category') = ?";
      params.push(category);
    }

    if (status) {
      query += " AND json_extract(i.data, '$.status') = ?";
      params.push(status);
    }

    // Add sorting
    switch (sortBy) {
      case "newest":
        query += " ORDER BY json_extract(i.data, '$.created_at') DESC";
        break;
      case "oldest":
        query += " ORDER BY json_extract(i.data, '$.created_at') ASC";
        break;
      case "raised":
        query += " ORDER BY CAST(json_extract(i.data, '$.raised_amount') AS REAL) DESC, json_extract(i.data, '$.created_at') DESC";
        break;
      case "downvotes":
        query += " ORDER BY downvotes DESC, json_extract(i.data, '$.created_at') DESC";
        break;
      case "votes":
      default:
        query += " ORDER BY (upvotes - downvotes) DESC, json_extract(i.data, '$.created_at') DESC";
        break;
    }

    // Add pagination
    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const stmt = db.prepare(query);
    const ideas = await stmt.bind(...params).all();

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) as total FROM ideas WHERE 1=1";
    const countParams: any[] = [];

    if (category) {
      countQuery += " AND json_extract(data, '$.category') = ?";
      countParams.push(category);
    }
    if (status) {
      countQuery += " AND json_extract(data, '$.status') = ?";
      countParams.push(status);
    }

    const countStmt = db.prepare(countQuery);
    const countResult = await countStmt.bind(...countParams).first<{ total: number }>();

    return jsonResponse(
      {
        ideas: ideas.results.map((r: any) => parseIdeaRow(r)),
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

// POST - Create a new idea
async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      title?: string;
      description?: string;
      category?: string;
      authorUsername?: string;
      authorAvatar?: string;
      authorTwitterId?: string;
      source?: string;
      tweetUrl?: string;
      tweetContent?: string;
      estimatedPrice?: number;
      coinName?: string;
      ticker?: string;
      ideatorWallet?: string;
      sparkedByUsername?: string;
    };

    const { title, description, category, authorUsername, authorAvatar, authorTwitterId, source, tweetUrl, tweetContent, estimatedPrice, coinName, ticker, ideatorWallet, sparkedByUsername } = body;

    // Validate required fields
    if (!title || !description || !category) {
      return new Response(
        JSON.stringify({ message: "Title, description, and category are required" }),
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

    // Ensure slug is unique by appending a number if needed
    let finalSlug = slug;
    let slugCounter = 1;
    while (true) {
      const existing = await db
        .prepare("SELECT id FROM ideas WHERE json_extract(data, '$.slug') = ?")
        .bind(finalSlug)
        .first();

      if (!existing) break;
      finalSlug = `${slug}-${slugCounter}`;
      slugCounter++;
    }

    const data = buildIdeaData({
      title,
      slug: finalSlug,
      description,
      category,
      author_username: authorUsername || "anonymous",
      author_avatar: authorAvatar || "",
      author_twitter_id: authorTwitterId || undefined,
      source: source || "user",
      tweet_url: tweetUrl || undefined,
      tweet_content: tweetContent || undefined,
      estimated_price: estimatedPrice || 0,
      raised_amount: 0,
      coin_name: coinName || undefined,
      ticker: ticker || undefined,
      ideator_wallet: ideatorWallet || undefined,
      sparked_by_username: sparkedByUsername || undefined,
      status: "pending",
      created_at: createdAt,
      updated_at: createdAt,
    });

    await db
      .prepare(
        `INSERT INTO ideas (id, data) VALUES (?1, ?2)`
      )
      .bind(id, data)
      .run();

    // Generate landing page in background (non-blocking)
    if (ctx.env.OPENAI_API_KEY) {
      ctx.waitUntil(generateLandingPage(db, id, ctx.env.OPENAI_API_KEY));
    }

    return new Response(
      JSON.stringify({
        success: true,
        id,
        slug: finalSlug,
        url: `/ideas/${finalSlug}`,
        message: "Idea submitted successfully"
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

// PUT - Update idea (vote, status change, etc.)
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
      walletAddress?: string;
    };
    const { id, action, userId, voterTwitterId, voterUsername, voteType, status, walletAddress } = body;

    if (!id) {
      return new Response(JSON.stringify({ message: "Idea ID is required" }), {
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
        .prepare("SELECT * FROM idea_votes WHERE idea_id = ? AND user_id = ?")
        .bind(id, userId)
        .first<{ vote_type: string }>();

      if (existingVote) {
        // If same vote type, remove vote (toggle off)
        if (existingVote.vote_type === actualVoteType) {
          await db
            .prepare("DELETE FROM idea_votes WHERE idea_id = ? AND user_id = ?")
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
            .prepare("UPDATE idea_votes SET vote_type = ?, voter_twitter_id = ?, voter_username = ? WHERE idea_id = ? AND user_id = ?")
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
            "INSERT INTO idea_votes (id, idea_id, user_id, voter_twitter_id, voter_username, vote_type, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
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

    // Handle idea edit by owner
    if (action === "edit") {
      const editBody = body as {
        id: string;
        action: string;
        author_twitter_id?: string;
        title?: string;
        description?: string;
        category?: string;
        coin_name?: string;
        ticker?: string;
        estimated_price?: number;
      };

      if (!editBody.author_twitter_id) {
        return new Response(JSON.stringify({ message: "author_twitter_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        });
      }

      // Fetch existing idea and verify ownership
      const idea = await db.prepare("SELECT data FROM ideas WHERE id = ?").bind(id).first<{ data: string }>();
      if (!idea) {
        return new Response(JSON.stringify({ message: "Idea not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        });
      }

      const ideaData = JSON.parse(idea.data);
      if (ideaData.author_twitter_id !== editBody.author_twitter_id) {
        return new Response(JSON.stringify({ message: "Not authorized to edit this idea" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        });
      }

      // Build dynamic json_set for provided fields only
      const editableFields: Record<string, unknown> = {};
      if (editBody.title !== undefined) editableFields.title = editBody.title;
      if (editBody.description !== undefined) editableFields.description = editBody.description;
      if (editBody.category !== undefined) editableFields.category = editBody.category;
      if (editBody.coin_name !== undefined) editableFields.coin_name = editBody.coin_name;
      if (editBody.ticker !== undefined) editableFields.ticker = editBody.ticker;
      if (editBody.estimated_price !== undefined) editableFields.estimated_price = editBody.estimated_price;
      editableFields.updated_at = new Date().toISOString();

      const setParts = Object.keys(editableFields).map((k) => `'$.${k}', ?`).join(", ");
      const values = Object.values(editableFields);

      await db
        .prepare(`UPDATE ideas SET data = json_set(data, ${setParts}) WHERE id = ?`)
        .bind(...values, id)
        .run();

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    }

    // Handle status update (admin only)
    if (status) {
      const validStatuses = ["pending", "in_progress", "completed", "planned"];
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
        .prepare("UPDATE ideas SET data = json_set(data, '$.status', ?, '$.updated_at', ?) WHERE id = ?")
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

// DELETE - Delete an idea (admin only)
async function handleDeleteRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ message: "Idea ID is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    // Delete related votes and comments first
    await db.prepare("DELETE FROM idea_votes WHERE idea_id = ?").bind(id).run();
    await db.prepare("DELETE FROM idea_comments WHERE idea_id = ?").bind(id).run();
    await db.prepare("DELETE FROM ideas WHERE id = ?").bind(id).run();

    return new Response(JSON.stringify({ success: true, message: "Idea deleted" }), {
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
