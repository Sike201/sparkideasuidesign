import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
};

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    const url = new URL(ctx.request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

    const rows = await ctx.env.DB
      .prepare(
        `SELECT
          u.address,
          json_extract(u.data, '$.points') as points,
          json_extract(u.data, '$.username') as username,
          t.username as twitter_username,
          t.profile_image_url as avatar
        FROM user u
        LEFT JOIN twitter_users t ON t.wallet_address = u.address
        WHERE json_extract(u.data, '$.points') > 0
        ORDER BY json_extract(u.data, '$.points') DESC
        LIMIT ?`
      )
      .bind(limit)
      .all();

    const leaderboard = (rows.results || []).map((row: any, index: number) => ({
      rank: index + 1,
      address: row.address,
      points: row.points || 0,
      username: row.twitter_username || row.username || null,
      avatar: row.avatar || null,
    }));

    return jsonResponse({ leaderboard });
  } catch (e) {
    await reportError(ctx.env.DB, e);
    return jsonResponse({ message: "Something went wrong..." }, 500);
  }
};
