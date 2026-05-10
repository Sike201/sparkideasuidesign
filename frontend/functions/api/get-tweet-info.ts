// File: functions/api/get-tweet-info.ts
// API endpoint to get tweet info from fxtwitter API (replaces Sorsa)

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
  VITE_ENVIRONMENT_TYPE: string;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

function parseTweetUrl(url: string): { username: string; tweetId: string } {
  const match = url.match(
    /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/
  );
  if (!match) throw new Error(`Invalid tweet URL: ${url}`);
  return { username: match[1], tweetId: match[2] };
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

// POST - Get tweet info from fxtwitter API
async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      tweet_link?: string;
    };

    const { tweet_link } = body;

    if (!tweet_link) {
      return jsonResponse({ message: "tweet_link is required" }, 400);
    }

    console.log("🔍 [TWEET INFO] Fetching tweet info from fxtwitter:", tweet_link);

    const { username, tweetId } = parseTweetUrl(tweet_link);

    // Call fxtwitter API (free, no API key needed)
    const fxResponse = await fetch(
      `https://api.fxtwitter.com/${username}/status/${tweetId}`,
      {
        headers: {
          "User-Agent": "SparkIt/1.0 (+https://sparkit.app)",
        },
      }
    );

    if (!fxResponse.ok) {
      const errorText = await fxResponse.text();
      console.error("❌ [TWEET INFO] fxtwitter API error:", fxResponse.status, errorText);
      return jsonResponse({
        message: "Failed to fetch tweet info from fxtwitter",
        error: errorText.substring(0, 500)
      }, fxResponse.status);
    }

    const fxData = await fxResponse.json() as {
      tweet?: {
        text?: string;
        author?: {
          screen_name?: string;
          name?: string;
          avatar_url?: string;
          id?: string;
        };
        id?: string;
        created_at?: string;
        likes?: number;
        retweets?: number;
        replies?: number;
        views?: number;
      };
    };

    const tweet = fxData.tweet;

    console.log("✅ [TWEET INFO] Tweet info fetched:", {
      hasText: !!tweet?.text,
      username: tweet?.author?.screen_name,
      tweetId: tweet?.id,
    });

    return jsonResponse({
      success: true,
      tweetContent: tweet?.text || "",
      username: tweet?.author?.screen_name || "",
      userDisplayName: tweet?.author?.name || "",
      userAvatar: tweet?.author?.avatar_url || "",
      userId: tweet?.author?.id || "",
      tweetId: tweet?.id || "",
      createdAt: tweet?.created_at || "",
    }, 200);
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong fetching tweet info..." }, 500);
  }
}
