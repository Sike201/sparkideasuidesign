/**
 * Shared JWT auth helper for mini-app endpoints.
 *
 * The mini-app issues a 7-day JWT at the end of the Twitter OAuth flow
 * (see `twitter-oauth-token.ts` — `mode: "mini"` branch). Mini endpoints
 * replay it via `Authorization: Bearer <token>` and use this helper to
 * extract the authenticated `twitter_id`.
 *
 * Dev bypass: when `env.VITE_ENVIRONMENT_TYPE === "develop"` AND the
 * bearer token is the sentinel `DEV_BYPASS_TOKEN`, we skip JWT verify
 * and return a stub identity. The bypass is keyed on a runtime env
 * flag (not a build flag) so a production build can never accept it
 * even if the sentinel string somehow leaks into client code. The
 * stub `twitter_id` defaults to `dev_user_local` but can be overridden
 * via the optional `DEV_BYPASS_TWITTER_ID` env var so a developer can
 * "be" a real user (with real wallets / quiz responses) during local
 * testing without rebuilding the client.
 */

import jwt from "@tsndr/cloudflare-worker-jwt"
import { issueMiniToken } from "./_provision"

/** Mirror of `DEV_BYPASS_TOKEN` in `frontend/src/data/api/miniApi.ts`.
 *  Duplicated rather than imported because Cloudflare Pages Functions
 *  shouldn't pull in client-side modules. Keep both copies in sync. */
const DEV_BYPASS_TOKEN = "dev-bypass"
const DEFAULT_DEV_BYPASS_TWITTER_ID = "dev_user_local"

/**
 * Sliding refresh window. When a verified token has fewer seconds
 * left than this, `verifyMiniAuth` mints a fresh one and returns it
 * via `auth.refreshedToken` — the caller relays it back to the
 * client through `X-Refreshed-Token`. The window matches the prior
 * (shorter) TTL so a user who only ever uses the app within a
 * 7-day cadence gets seamless renewal forever.
 */
const REFRESH_WHEN_REMAINING_SECONDS = 60 * 60 * 24 * 7 // 7 days

/** HTTP header carrying a freshly-minted JWT back to the client.
 *  Mirrored on the frontend in `miniApi.ts:miniFetch`. */
export const REFRESHED_TOKEN_HEADER = "X-Refreshed-Token"

export type MiniJwtPayload = {
  sub: string
  twitter_id: string
  username?: string
  mode: "mini"
  /** Issued-at (RFC 7519). Stamped on every fresh issue; absent on
   *  pre-rollout tokens — code must tolerate `undefined`. */
  iat?: number
  exp: number
}

export type MiniAuthSuccess = {
  ok: true
  twitter_id: string
  username?: string
  /** Set when the verified token was within the refresh window —
   *  this is a freshly-minted replacement for the caller to attach
   *  via `REFRESHED_TOKEN_HEADER` on the response. */
  refreshedToken?: string
}

export type MiniAuthFailure = {
  ok: false
  status: number
  message: string
}

/**
 * Verify a mini-app JWT from the `Authorization: Bearer …` header.
 * Returns either the extracted `twitter_id` (+ username) or a ready-to-send
 * failure with an HTTP status — the caller just has to relay it.
 *
 * Optional 2nd param `env` enables the dev bypass — pass `ctx.env`
 * from the calling endpoint. When omitted, the bypass is unavailable
 * (callers that don't supply env behave exactly like before).
 */
export async function verifyMiniAuth(
  request: Request,
  jwtSecret: string | undefined,
  env?: {
    VITE_ENVIRONMENT_TYPE?: string
    DEV_BYPASS_TWITTER_ID?: string
  },
): Promise<MiniAuthSuccess | MiniAuthFailure> {
  const header = request.headers.get("Authorization") || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return { ok: false, status: 401, message: "Missing bearer token" }
  }
  const token = match[1]

  // ── Dev bypass ────────────────────────────────────────────
  // Only accepted in develop builds. In any other environment the
  // sentinel string is just an unknown JWT and falls through to the
  // normal verify path, which 401s.
  if (env?.VITE_ENVIRONMENT_TYPE === "develop" && token === DEV_BYPASS_TOKEN) {
    const stubId = (env.DEV_BYPASS_TWITTER_ID || "").trim() || DEFAULT_DEV_BYPASS_TWITTER_ID
    return {
      ok: true,
      twitter_id: stubId,
      username: "dev_user",
    }
  }

  if (!jwtSecret) {
    return { ok: false, status: 500, message: "Mini-app auth not configured" }
  }

  // `verify` returns the decoded { header, payload } object on success, or
  // `undefined` on signature / exp failure. Reuse it — no need to call
  // `decode` separately.
  const decoded = await jwt.verify<MiniJwtPayload>(token, jwtSecret)
  if (!decoded || !decoded.payload) {
    return { ok: false, status: 401, message: "Invalid or expired token" }
  }

  const payload = decoded.payload
  if (payload.mode !== "mini" || !payload.twitter_id) {
    return { ok: false, status: 401, message: "Token is not a mini-app token" }
  }

  // ── Sliding refresh ────────────────────────────────────────
  // If the token is verified AND it has less than the refresh
  // window remaining, mint a fresh one alongside the auth result.
  // The caller is responsible for actually shipping it back via
  // `REFRESHED_TOKEN_HEADER`. Best-effort: a mint failure must not
  // break the request — we still return a valid success without a
  // refreshed token, and the next successful call will retry.
  let refreshedToken: string | undefined
  try {
    const now = Math.floor(Date.now() / 1000)
    const remaining = payload.exp - now
    if (remaining > 0 && remaining < REFRESH_WHEN_REMAINING_SECONDS) {
      refreshedToken = await issueMiniToken(jwtSecret, {
        twitter_id: payload.twitter_id,
        username: payload.username ?? "",
      })
    }
  } catch (err) {
    console.warn("[mini/_auth] sliding-refresh mint failed:", err)
  }

  return {
    ok: true,
    twitter_id: payload.twitter_id,
    username: payload.username,
    refreshedToken,
  }
}

/**
 * Attach a freshly-minted JWT to a response when the auth helper
 * indicated one was issued this request. Most endpoints already
 * build their `Response` via `jsonResponse(...)`; wrap the return
 * value with this so the new token rides back to the client without
 * each endpoint having to know the header name.
 *
 * No-op when `auth.refreshedToken` is undefined — safe to call
 * unconditionally on any response derived from a successful auth.
 */
export function attachRefreshedToken(
  response: Response,
  auth: MiniAuthSuccess,
): Response {
  if (!auth.refreshedToken) return response
  response.headers.set(REFRESHED_TOKEN_HEADER, auth.refreshedToken)
  // Ensure the header is exposed to the browser fetch — Pages
  // responses go through a CORS path that, by default, only exposes
  // the safelisted set. `Access-Control-Expose-Headers` lets the
  // client read our custom header in `res.headers.get(...)`.
  const exposed = response.headers.get("Access-Control-Expose-Headers")
  response.headers.set(
    "Access-Control-Expose-Headers",
    exposed
      ? `${exposed}, ${REFRESHED_TOKEN_HEADER}`
      : REFRESHED_TOKEN_HEADER,
  )
  return response
}
