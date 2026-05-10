/**
 * POST /api/mini/push-unsubscribe
 *
 * Remove a Web Push subscription by endpoint. Called from the mini-app
 * when a user toggles notifications off in /m/me. No auth required —
 * the endpoint is an opaque secret the user's own browser generated, so
 * possession is enough proof to let them delete the row.
 *
 * (We could cross-check the JWT's twitter_id against the row's, but the
 * endpoint is already effectively bearer-credential material — if a
 * third party has it they could send pushes to it just by proxying the
 * push service themselves. Gating the DELETE adds no security.)
 */

type ENV = {
  DB: D1Database;
};

type Body = {
  endpoint?: string;
};

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const origin = ctx.request.headers.get("Origin") || "*";
  const cors = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const body = (await ctx.request.json()) as Body;
    const endpoint = body.endpoint?.trim();
    if (!endpoint) {
      return json({ error: "endpoint required" }, 400, cors);
    }

    const result = await ctx.env.DB.prepare(
      `DELETE FROM push_subscriptions WHERE endpoint = ?`,
    )
      .bind(endpoint)
      .run();

    return json({ success: true, deleted: result.meta.changes ?? 0 }, 200, cors);
  } catch (err) {
    console.error("[push-unsubscribe]", err);
    return json(
      { error: err instanceof Error ? err.message : "Unsubscribe failed" },
      500,
      cors,
    );
  }
};

export const onRequestOptions: PagesFunction<ENV> = async (ctx) => {
  const origin = ctx.request.headers.get("Origin") || "*";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};

function json(data: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
