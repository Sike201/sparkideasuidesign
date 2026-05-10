// File: functions/api/agent-project-comments.ts
// Comments API for agent projects

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
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS, PUT",
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

// GET - Fetch comments for an agent project
async function handleGetRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return jsonResponse({ message: "Project ID is required" }, 400);
    }

    // Fetch all comments including replies with vote counts and author investment, sorted by creation date
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

    // Calculate author investment for each comment
    // Link Twitter username to wallet via twitter_users table, then sum investments
    const commentsWithInvestment = await Promise.all(
      (comments.results || []).map(async (comment: any) => {
        // Find wallet address for this Twitter username
        const twitterUser = await db
          .prepare("SELECT wallet_address FROM twitter_users WHERE username = ?")
          .bind(comment.author_username)
          .first<{ wallet_address?: string }>();

        let authorInvestment = 0;

        if (twitterUser?.wallet_address) {
          // Sum all investments by this wallet for this project
          const investmentResult = await db
            .prepare(
              `SELECT SUM(amount_usdc) as total_invested
               FROM agent_project_investments
               WHERE project_id = ? AND investor_wallet = ? AND status = 'active'`
            )
            .bind(projectId, twitterUser.wallet_address)
            .first<{ total_invested: number }>();

          authorInvestment = investmentResult?.total_invested || 0;
        }

        return {
          ...comment,
          author_investment: authorInvestment,
        };
      })
    );

    return jsonResponse({ comments: commentsWithInvestment }, 200);
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong..." }, 500);
  }
}

// POST - Create a new comment or reply
async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      projectId?: string;
      parentCommentId?: string;
      content?: string;
      authorUsername?: string;
      authorAvatar?: string;
      authorTwitterId?: string;
      isTeam?: boolean;
    };

    const { projectId, parentCommentId, content, authorUsername, authorAvatar, authorTwitterId, isTeam } = body;

    // Validate required fields
    if (!projectId || !content) {
      return new Response(
        JSON.stringify({ message: "Project ID and content are required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // Check if project exists
    const project = await db
      .prepare("SELECT id FROM agent_projects WHERE id = ?")
      .bind(projectId)
      .first();

    if (!project) {
      return new Response(JSON.stringify({ message: "Project not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    // If replying, verify parent comment exists
    if (parentCommentId) {
      const parentComment = await db
        .prepare("SELECT id FROM agent_project_comments WHERE id = ?")
        .bind(parentCommentId)
        .first();

      if (!parentComment) {
        return new Response(JSON.stringify({ message: "Parent comment not found" }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        });
      }
    }

    const id = generateUUID();
    const createdAt = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO agent_project_comments (id, project_id, parent_comment_id, content, author_username, author_avatar, author_twitter_id, is_team, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      )
      .bind(
        id,
        projectId,
        parentCommentId || null,
        content,
        authorUsername || "anonymous",
        authorAvatar || "",
        authorTwitterId || null,
        isTeam ? 1 : 0,
        createdAt
      )
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        id,
        parentCommentId: parentCommentId || null,
        message: parentCommentId ? "Reply added successfully" : "Comment added successfully",
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

// PUT - Vote on a comment
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
    };
    const { id, action, userId, voterTwitterId, voterUsername, voteType } = body;

    if (!id) {
      return new Response(JSON.stringify({ message: "Comment ID is required" }), {
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
        .prepare("SELECT * FROM agent_project_comment_votes WHERE comment_id = ? AND user_id = ?")
        .bind(id, userId)
        .first<{ vote_type: string }>();

      if (existingVote) {
        // If same vote type, remove vote (toggle off)
        if (existingVote.vote_type === actualVoteType) {
          await db
            .prepare("DELETE FROM agent_project_comment_votes WHERE comment_id = ? AND user_id = ?")
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
            .prepare("UPDATE agent_project_comment_votes SET vote_type = ?, voter_twitter_id = ?, voter_username = ? WHERE comment_id = ? AND user_id = ?")
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
        const voteId = generateUUID();
        await db
          .prepare(
            "INSERT INTO agent_project_comment_votes (id, comment_id, user_id, voter_twitter_id, voter_username, vote_type, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
          )
          .bind(voteId, id, userId, voterTwitterId || null, voterUsername || null, actualVoteType, new Date().toISOString())
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

// DELETE - Delete a comment
async function handleDeleteRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ message: "Comment ID is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    await db.prepare("DELETE FROM agent_project_comments WHERE id = ?").bind(id).run();

    return new Response(
      JSON.stringify({ success: true, message: "Comment deleted" }),
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
