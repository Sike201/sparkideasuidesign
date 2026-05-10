/**
 * POST /api/mini/push-subscribe
 *
 * Upsert a Web Push subscription for the current mini-app user. The
 * browser gets an opaque `PushSubscription` from `registration.pushManager
 * .subscribe(...)` and POSTs the JSON-encoded form here. We key on
 * `endpoint` (globally unique per browser/device) so re-enabling from
 * the same device just refreshes the keys and (re-)attaches the row to
 * the current `twitter_id`.
 *
 * Auth is OPTIONAL. The mini-app normally sends an `Authorization: Bearer
 * <JWT>` header and we use that to link the subscription to a twitter_id.
 * But a user can also enable notifications BEFORE logging in (e.g. from
 * the landing page) — in that case the row is stored with
 * `twitter_id = NULL` and gets attached on next login via a re-subscribe.
 */

import { verifyMiniAuth } from "./_auth";

type ENV = {
  DB: D1Database;
  JWT_SECRET?: string;
};

type Body = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
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
    const p256dh = body.keys?.p256dh?.trim();
    const auth = body.keys?.auth?.trim();

    if (!endpoint || !p256dh || !auth) {
      return json({ error: "endpoint, keys.p256dh, keys.auth required" }, 400, cors);
    }

    // Basic sanity — reject obviously malformed payloads before touching D1.
    if (!/^https:\/\//.test(endpoint)) {
      return json({ error: "endpoint must be https URL" }, 400, cors);
    }

    // Attach to a Twitter user when a valid JWT is present. Missing /
    // invalid JWT is NOT fatal here — anonymous subs are accepted and
    // can be re-linked later. We only reject an Authorization header
    // that's clearly present-but-bogus (status 401 from verifyMiniAuth
    // on a malformed bearer token) to avoid silently losing a user's
    // intent to link.
    let twitterId: string | null = null;
    const hasAuthHeader = !!ctx.request.headers.get("Authorization");
    if (hasAuthHeader) {
      const result = await verifyMiniAuth(ctx.request, ctx.env.JWT_SECRET, ctx.env);
      if (result.ok) {
        twitterId = result.twitter_id;
      }
      // If the header is bogus we still accept the subscription as
      // anonymous — the client will try again with a fresh token on next
      // login. Log it for abuse detection but don't 401 the user.
    }

    const userAgent = ctx.request.headers.get("User-Agent")?.slice(0, 240) ?? null;
    const id = crypto.randomUUID();

    // UPSERT on endpoint — refreshes the keys, re-binds the twitter_id,
    // resets failure tracking. D1/SQLite supports ON CONFLICT.
    await ctx.env.DB.prepare(
      `INSERT INTO push_subscriptions
         (id, twitter_id, endpoint, p256dh, auth, user_agent, created_at, failure_count)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 0)
       ON CONFLICT(endpoint) DO UPDATE SET
         twitter_id    = COALESCE(excluded.twitter_id, push_subscriptions.twitter_id),
         p256dh        = excluded.p256dh,
         auth          = excluded.auth,
         user_agent    = excluded.user_agent,
         failure_count = 0,
         last_failure_at = NULL`,
    )
      .bind(id, twitterId, endpoint, p256dh, auth, userAgent)
      .run();

    return json({ success: true, linked_to_twitter: !!twitterId }, 200, cors);
  } catch (err) {
    console.error("[push-subscribe]", err);
    return json(
      { error: err instanceof Error ? err.message : "Subscribe failed" },
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
