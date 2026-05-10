/**
 * POST /api/mini/twitter-challenge
 *
 * Step 1 of the tweet-proof sign-in flow. Body: { username }. The server
 * generates a fresh random code, stores it under the claimed username
 * with a 10-minute TTL, and returns the tweet template the user needs
 * to post from that account.
 *
 * Step 2 is in `twitter-verify.ts`.
 *
 * Anti-abuse:
 *   - Rate-limit per IP (5 challenges / minute) so an attacker can't
 *     enumerate codes for thousands of accounts in parallel.
 *   - Code is cryptographically random (8 base64url chars ≈ 48 bits),
 *     not derived from time — see security analysis in PR.
 */

import { jsonResponse } from "../cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
}

// 30-minute TTL — generous enough that "open Twitter, write tweet, get
// distracted by a notification, come back, paste URL" still works on
// mobile. Was 10 min and produced false-expired errors when users
// took the scenic route.
const CHALLENGE_TTL_SECONDS = 30 * 60
const RATE_LIMIT_WINDOW_SECONDS = 60
const RATE_LIMIT_MAX = 5

// Twitter handle: 1-15 chars, [A-Za-z0-9_]. Lowercase the input before
// store so the verify-step comparison against the tweet author's
// `screen_name` (also lowercased) is consistent.
const USERNAME_RE = /^[A-Za-z0-9_]{1,15}$/

/** 8-char base64url token. ~48 bits — collision-free at our scale and
 *  unguessable in any practical attack window. */
function randomCode(): string {
  const bytes = new Uint8Array(6) // 6 bytes → 8 chars when base64url
  crypto.getRandomValues(bytes)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function uuidv4(): string {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16),
  )
}

/** Build the EXACT phrase the verifier looks for. Server-side single
 *  source of truth so the client can't drift the wording. The tweet
 *  must contain this string verbatim (case-insensitive). */
export function buildTweetText(code: string, origin: string): string {
  return `I just joined @JustSparkIdeas mini-app ! Trade and participate in the idea coin life from your phone.\n\nJoin me: ${origin}/mini-app  #spark-${code}`
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const body = (await ctx.request.json().catch(() => null)) as
      | { username?: string }
      | null
    const rawUsername = body?.username?.trim().replace(/^@/, "") ?? ""
    if (!USERNAME_RE.test(rawUsername)) {
      return jsonResponse(
        { error: "Invalid Twitter username (1-15 chars, letters/digits/_)" },
        400,
      )
    }
    const username = rawUsername.toLowerCase()

    const db = ctx.env.DB
    const ip = ctx.request.headers.get("CF-Connecting-IP") || "unknown"

    // Rate-limit: how many challenges has this IP created in the last
    // minute? `created_at` is stored as TEXT so we compare with the
    // matching SQLite datetime modifier.
    const recent = await db
      .prepare(
        `SELECT COUNT(*) as count FROM twitter_challenges
         WHERE requester_ip = ?
           AND created_at > datetime('now', '-${RATE_LIMIT_WINDOW_SECONDS} seconds')`,
      )
      .bind(ip)
      .first<{ count: number }>()
    if ((recent?.count ?? 0) >= RATE_LIMIT_MAX) {
      return jsonResponse(
        { error: "Too many challenge requests — try again in a minute" },
        429,
      )
    }

    const code = randomCode()
    const id = uuidv4()
    await db
      .prepare(
        `INSERT INTO twitter_challenges (id, code, claimed_username, requester_ip, created_at, expires_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+${CHALLENGE_TTL_SECONDS} seconds'))`,
      )
      .bind(id, code, username, ip)
      .run()

    const origin = new URL(ctx.request.url).origin
    const tweetText = buildTweetText(code, origin)
    // `https://twitter.com/intent/tweet` is a universal link on iOS — taps
    // open the Twitter app directly (or web if not installed). On Android
    // Chrome it opens Twitter web with the compose box pre-filled.
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`

    return jsonResponse({
      code,
      tweet_text: tweetText,
      intent_url: intentUrl,
      expires_in_seconds: CHALLENGE_TTL_SECONDS,
    })
  } catch (err) {
    console.error("[mini/twitter-challenge]", err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    )
  }
}
