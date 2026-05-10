import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
};

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    const url = new URL(ctx.request.url);
    let wallet = url.searchParams.get('wallet');
    const username = url.searchParams.get('username');

    // Resolve wallet from twitter username if no wallet provided
    if (!wallet && username) {
      const twitterUser = await ctx.env.DB
        .prepare('SELECT wallet_address FROM twitter_users WHERE username = ?')
        .bind(username)
        .first<{ wallet_address: string }>();
      wallet = twitterUser?.wallet_address || null;
    }

    if (!wallet) {
      return jsonResponse({ message: "wallet or username query parameter is required" }, 400);
    }

    // Get user points
    const user = await ctx.env.DB
      .prepare('SELECT data FROM user WHERE address = ?')
      .bind(wallet)
      .first<{ data: string }>();

    const userData = user ? JSON.parse(user.data || '{}') : {};
    const points = userData.points || 0;

    // Get rank
    const rankRow = await ctx.env.DB
      .prepare(
        `SELECT COUNT(*) as rank FROM user
         WHERE json_extract(data, '$.points') > ?`
      )
      .bind(points)
      .first<{ rank: number }>();

    const rank = (rankRow?.rank || 0) + 1;

    return jsonResponse({ points, rank });
  } catch (e) {
    await reportError(ctx.env.DB, e);
    return jsonResponse({ message: "Something went wrong..." }, 500);
  }
};
