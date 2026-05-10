// File: functions/api/link-wallet-to-twitter.ts
// API to link a Solana wallet address to a Twitter user account

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
  VITE_ENVIRONMENT_TYPE: string;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  if (method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        ...corsHeaders(request),
        Allow: "OPTIONS, POST",
      },
    });
  }

  return handlePostRequest(context);
};

// POST - Link wallet address to Twitter user
async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      twitterId?: string;
      username?: string;
      walletAddress?: string;
    };

    const { twitterId, username, walletAddress } = body;

    if (!walletAddress) {
      return jsonResponse({ message: "walletAddress is required" }, 400);
    }

    if (!twitterId && !username) {
      return jsonResponse({ message: "twitterId or username is required" }, 400);
    }

    // Update wallet_address for the Twitter user
    let updateResult;
    if (twitterId) {
      updateResult = await db
        .prepare("UPDATE twitter_users SET wallet_address = ? WHERE twitter_id = ?")
        .bind(walletAddress, twitterId)
        .run();
    } else {
      updateResult = await db
        .prepare("UPDATE twitter_users SET wallet_address = ? WHERE username = ?")
        .bind(walletAddress, username)
        .run();
    }

    if (updateResult.meta.changes === 0) {
      return jsonResponse({ message: "Twitter user not found" }, 404);
    }

    return jsonResponse({
      success: true,
      message: "Wallet linked successfully",
    }, 200);
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong..." }, 500);
  }
}
