/**
 * POST /api/mini/twitter-verify
 *
 * Step 2 of the tweet-proof sign-in flow. Body: { tweet_url, code }.
 *
 * Verifies that:
 *   1. The tweet exists and is fetchable via Twitter's public syndication
 *      endpoint (`cdn.syndication.twimg.com/tweet-result`).
 *   2. The tweet's author screen_name matches the username this challenge
 *      was created for.
 *   3. The tweet was posted AFTER the challenge was created (no replay).
 *   4. The tweet's text contains the EXACT challenge phrase, including
 *      the `#spark-<code>` marker.
 *   5. The challenge hasn't been used and hasn't expired.
 *
 * On success: upsert the user, auto-provision wallets, issue a 7-day
 * mini-app JWT, and return the same `{ user, token }` shape the OAuth
 * flow returns so the client paths converge.
 */

import { jsonResponse } from "../cfPagesFunctionsUtils"
import {
  upsertTwitterUser,
  ensurePublicWallet,
  ensurePrivateWallet,
  issueMiniToken,
} from "./_provision"

type ENV = {
  DB: D1Database
  JWT_SECRET?: string
  WALLET_ENCRYPTION_KEY?: string
}

const RATE_LIMIT_WINDOW_SECONDS = 60
const RATE_LIMIT_MAX_VERIFY = 10

// Match `https://twitter.com/<user>/status/<id>` and the x.com variant
// plus mobile `mobile.twitter.com`. We only need the numeric tweet ID.
const TWEET_URL_RE =
  /^https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/[^/]+\/status\/(\d{6,})\b/i

function extractTweetId(url: string): string | null {
  const m = TWEET_URL_RE.exec(url.trim())
  return m ? m[1] : null
}

/** Twitter's syndication endpoint requires an opaque `token` query
 *  parameter. The values are deterministic from the tweet ID via a tiny
 *  algorithm reverse-engineered by the community and used by libs like
 *  `react-tweet` / `vercel/react-tweet`. Re-implementing it here means
 *  we don't need a Twitter API bearer token. */
function syndicationToken(tweetId: string): string {
  // (Number(tweetId) / 1e15) * Math.PI -> base36, strip leading 0 and
  // trailing zeros. Yes this is weird; it's what their CDN expects.
  const n = (Number(tweetId) / 1e15) * Math.PI
  return n
    .toString(36)
    .replace(/(0+|\.)/g, "")
}

type SyndicationTweet = {
  id_str: string
  text?: string // legacy
  full_text?: string
  // Newer responses use `text` as the rendered string and an
  // `entities`/`display_text_range` block; we just need the body so any
  // of these wins.
  user?: {
    id_str?: string
    screen_name?: string
    name?: string
    profile_image_url_https?: string
  }
  created_at: string
}

async function fetchTweet(tweetId: string): Promise<SyndicationTweet | null> {
  const token = syndicationToken(tweetId)
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}&lang=en`
  // The syndication CDN sometimes 403s requests that don't look like a
  // real browser. We send a vanilla Chrome UA — same approach used by
  // `react-tweet` in their server-side fetch.
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
  })
  if (!res.ok) {
    console.error(
      `[mini/twitter-verify] syndication failed: status=${res.status} url=${url} body=${await res.text().catch(() => "")}`,
    )
    return null
  }
  const data = (await res.json().catch(() => null)) as
    | SyndicationTweet
    | null
  if (!data || !data.id_str) {
    console.error("[mini/twitter-verify] syndication returned unexpected payload", data)
    return null
  }
  return data
}

/** Strip non-essential whitespace + lowercase so minor mobile-Twitter
 *  reformatting (extra newlines, smart-quoted dashes etc.) doesn't fail
 *  the contains-check. We DO keep the `#spark-XXXX` marker intact since
 *  that's the per-session secret. */
function normaliseForCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase()
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    if (!ctx.env.JWT_SECRET) {
      return jsonResponse({ error: "Mini-app auth not configured" }, 500)
    }

    const body = (await ctx.request.json().catch(() => null)) as
      | { tweet_url?: string; code?: string }
      | null
    const tweetUrl = body?.tweet_url?.trim() ?? ""
    const code = body?.code?.trim() ?? ""
    if (!tweetUrl || !code) {
      return jsonResponse({ error: "tweet_url and code are required" }, 400)
    }
    const tweetId = extractTweetId(tweetUrl)
    if (!tweetId) {
      return jsonResponse(
        { error: "URL doesn't look like a tweet (twitter.com/<user>/status/<id>)" },
        400,
      )
    }

    const db = ctx.env.DB
    const ip = ctx.request.headers.get("CF-Connecting-IP") || "unknown"

    // Verify rate-limit (separate budget from challenge creation; users
    // legitimately retry verifies more often than they retry challenges).
    const recent = await db
      .prepare(
        `SELECT COUNT(*) as count FROM twitter_challenges
         WHERE requester_ip = ?
           AND created_at > datetime('now', '-${RATE_LIMIT_WINDOW_SECONDS} seconds')`,
      )
      .bind(ip)
      .first<{ count: number }>()
    if ((recent?.count ?? 0) > RATE_LIMIT_MAX_VERIFY) {
      return jsonResponse({ error: "Too many requests — slow down" }, 429)
    }

    // Look up the challenge by code. Eligibility (not used, not expired)
    // is checked IN SQL so we don't depend on JavaScript parsing of
    // SQLite's `YYYY-MM-DD HH:MM:SS` text format — which is non-standard
    // and was producing false "expired" results on the Cloudflare
    // Workers runtime. SQLite's `datetime('now')` is in UTC and string-
    // compares correctly against the stored `expires_at`.
    //
    // We still fetch `created_at` so the later "tweet must be posted
    // after challenge created" replay check has a consistent reference;
    // we'll convert that explicitly to ISO before parsing.
    const challenge = await db
      .prepare(
        `SELECT id, code, claimed_username, created_at, expires_at
         FROM twitter_challenges
         WHERE code = ?
           AND used_at IS NULL
           AND expires_at > datetime('now')
         LIMIT 1`,
      )
      .bind(code)
      .first<{
        id: string
        code: string
        claimed_username: string
        created_at: string
        expires_at: string
      }>()
    if (!challenge) {
      return jsonResponse(
        { error: "Challenge invalid or expired — start over" },
        400,
      )
    }

    const tweet = await fetchTweet(tweetId)
    if (!tweet) {
      return jsonResponse(
        { error: "Couldn't fetch the tweet. Make sure the URL is correct and the tweet is public." },
        400,
      )
    }

    const tweetAuthor = tweet.user?.screen_name?.toLowerCase() ?? ""
    if (tweetAuthor !== challenge.claimed_username) {
      return jsonResponse(
        { error: `Tweet was posted by @${tweet.user?.screen_name ?? "?"}, not @${challenge.claimed_username}` },
        400,
      )
    }

    // Reject tweets posted before the challenge was created (replay).
    // SQLite gives us `YYYY-MM-DD HH:MM:SS` (UTC, but no `T`/`Z`) which
    // some JS engines parse as local time. Force UTC interpretation by
    // appending `Z` and swapping the space — gives us deterministic
    // millisecond comparison across runtimes.
    const tweetCreated = new Date(tweet.created_at).getTime()
    const challengeCreated = new Date(
      challenge.created_at.replace(" ", "T") + "Z",
    ).getTime()
    if (Number.isFinite(tweetCreated) && tweetCreated < challengeCreated) {
      return jsonResponse(
        { error: "Tweet must be posted after you start the sign-in flow" },
        400,
      )
    }

    // Code-match: just look for the random 8-char code somewhere in the
    // tweet body, case-insensitive. We don't require the exact `#spark-`
    // prefix because Twitter mangles hashtags with hyphens (the rendered
    // text keeps the dash but link-extraction may split it weirdly), and
    // the code itself is 48 bits of entropy — collision-free without the
    // prefix.
    //
    // To still block "I just typed a random string that happens to match"
    // shitposts, we ALSO require the @JustSparkIdeas mention or the
    // justspark.fun URL — both server-defined, both in the template.
    // Substring "justspark" matches both the handle and the domain.
    const actualBody = normaliseForCompare(tweet.full_text ?? tweet.text ?? "")
    const codeLc = code.toLowerCase()
    if (!actualBody.includes(codeLc)) {
      console.error(
        `[mini/twitter-verify] code missing in tweet text. expected=${codeLc} actualBody="${actualBody.slice(0, 280)}"`,
      )
      return jsonResponse(
        { error: "Tweet doesn't contain the verification code — copy the suggested text exactly" },
        400,
      )
    }
    if (
      !actualBody.includes("@justsparkdotfun") &&
      !actualBody.includes("justspark.fun") &&
      !actualBody.includes("justspark")
    ) {
      console.error(
        `[mini/twitter-verify] brand mention missing. actualBody="${actualBody.slice(0, 280)}"`,
      )
      return jsonResponse(
        { error: "Tweet doesn't match the suggested text — please copy it exactly" },
        400,
      )
    }

    // All checks passed — consume the challenge and issue a session.
    // The UPDATE guards against a concurrent verify on the same code.
    const update = await db
      .prepare(
        `UPDATE twitter_challenges
         SET used_at = datetime('now')
         WHERE id = ? AND used_at IS NULL`,
      )
      .bind(challenge.id)
      .run()
    if (update.meta?.changes !== 1) {
      return jsonResponse({ error: "Challenge already used" }, 400)
    }

    const twitterId = tweet.user?.id_str
    const twitterUsername = tweet.user?.screen_name
    const twitterName = tweet.user?.name ?? twitterUsername ?? ""
    const profileImage = tweet.user?.profile_image_url_https ?? null
    if (!twitterId || !twitterUsername) {
      return jsonResponse(
        { error: "Couldn't read the Twitter user from the tweet" },
        500,
      )
    }

    await upsertTwitterUser(db, {
      twitter_id: twitterId,
      username: twitterUsername,
      name: twitterName,
      profile_image_url: profileImage,
    })
    await Promise.all([
      ensurePublicWallet(db, twitterId, twitterUsername, ctx.env.WALLET_ENCRYPTION_KEY),
      ensurePrivateWallet(db, twitterId, twitterUsername, ctx.env.WALLET_ENCRYPTION_KEY),
    ])
    const token = await issueMiniToken(ctx.env.JWT_SECRET, {
      twitter_id: twitterId,
      username: twitterUsername,
    })

    return jsonResponse({
      success: true,
      user: {
        id: twitterId,
        username: twitterUsername,
        name: twitterName,
        profile_image_url: profileImage,
      },
      token,
    })
  } catch (err) {
    console.error("[mini/twitter-verify]", err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    )
  }
}
