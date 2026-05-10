/**
 * Shared helpers for mini-app account provisioning.
 *
 * Both authentication flows (legacy OAuth in `twitter-oauth-token.ts` and
 * the new tweet-proof flow in `twitter-verify.ts`) need to:
 *   1. Upsert the Twitter user row in `twitter_users`
 *   2. Auto-provision the public + private custodial wallets
 *   3. Issue a 7-day mini-app JWT
 *
 * Keeping these in one file means a fix to the wallet schema, the JWT
 * shape, or the upsert logic only needs to be made once. The OAuth
 * endpoint still has its own copy for now (different signature — it has
 * full Twitter access tokens to persist) but the wallet + JWT helpers
 * here are the canonical pair.
 */

import jwt from "@tsndr/cloudflare-worker-jwt"
import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
}

async function encryptSecret(plaintext: string, keyHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex.slice(0, 64))
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded)
  return bytesToHex(iv) + ":" + bytesToHex(new Uint8Array(ciphertext))
}

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
  )
}

/**
 * Upsert the canonical user row in `twitter_users`. The tweet-proof flow
 * never has access tokens (it doesn't talk to Twitter's OAuth at all), so
 * we write empty strings for them — the schema declares
 * `access_token`/`refresh_token`/`expires_at` as NOT NULL (legacy from
 * the OAuth-only days), and migrating the columns to nullable is more
 * disruptive than a sentinel empty string. Existing OAuth-issued rows
 * keep their real tokens because the upsert deliberately doesn't touch
 * those columns on conflict.
 */
export async function upsertTwitterUser(
  db: D1Database,
  user: {
    twitter_id: string
    username: string
    name: string
    profile_image_url: string | null
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO twitter_users (twitter_id, username, name, profile_image_url, access_token, refresh_token, expires_at, fees_claimed, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', '', CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(twitter_id) DO UPDATE SET
         username = excluded.username,
         name = excluded.name,
         profile_image_url = excluded.profile_image_url,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      user.twitter_id,
      user.username,
      user.name,
      user.profile_image_url,
    )
    .run()
}

/**
 * Auto-provision the public custodial wallet for this user. Idempotent —
 * existing rows (under the real `twitter_id` or the legacy
 * `username:<handle>` placeholder used by admin pre-assignments) are
 * preserved. Failures are non-fatal; logged + swallowed so auth still
 * completes and the client surfaces the missing wallet on next /me.
 */
export async function ensurePublicWallet(
  db: D1Database,
  twitterId: string,
  twitterUsername: string,
  encryptionKey: string | undefined,
): Promise<void> {
  if (!encryptionKey) {
    console.error("❌ WALLET_ENCRYPTION_KEY not configured — skipping public wallet")
    return
  }
  try {
    const existing = await db
      .prepare(
        `SELECT id FROM custodial_wallets
         WHERE wallet_type = 'public'
           AND (twitter_id = ? OR twitter_id = ? OR twitter_username = ?)
         LIMIT 1`,
      )
      .bind(twitterId, `username:${twitterUsername}`, twitterUsername)
      .first<{ id: string }>()
    if (existing) return

    const kp = Keypair.generate()
    const encrypted = await encryptSecret(bs58.encode(kp.secretKey), encryptionKey)
    await db
      .prepare(
        `INSERT INTO custodial_wallets (id, twitter_id, twitter_username, wallet_address, encrypted_secret_key, proposal_pda, wallet_type, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'public', datetime('now'))
         ON CONFLICT(twitter_id, wallet_type) DO NOTHING`,
      )
      .bind(uuidv4(), twitterId, twitterUsername, kp.publicKey.toBase58(), encrypted)
      .run()
  } catch (err) {
    console.error("❌ Failed to auto-provision public wallet:", err)
  }
}

/**
 * Sibling of `ensurePublicWallet` for the bonus / private wallet. Same
 * idempotency + non-fatal contract.
 */
export async function ensurePrivateWallet(
  db: D1Database,
  twitterId: string,
  twitterUsername: string,
  encryptionKey: string | undefined,
): Promise<void> {
  if (!encryptionKey) {
    console.error("❌ WALLET_ENCRYPTION_KEY not configured — skipping private wallet")
    return
  }
  try {
    const existing = await db
      .prepare(
        `SELECT id FROM custodial_wallets
         WHERE wallet_type = 'private' AND twitter_id = ?
         LIMIT 1`,
      )
      .bind(twitterId)
      .first<{ id: string }>()
    if (existing) return

    const kp = Keypair.generate()
    const encrypted = await encryptSecret(bs58.encode(kp.secretKey), encryptionKey)
    await db
      .prepare(
        `INSERT INTO custodial_wallets (id, twitter_id, twitter_username, wallet_address, encrypted_secret_key, proposal_pda, wallet_type, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'private', datetime('now'))
         ON CONFLICT(twitter_id, wallet_type) DO NOTHING`,
      )
      .bind(uuidv4(), twitterId, twitterUsername, kp.publicKey.toBase58(), encrypted)
      .run()
  } catch (err) {
    console.error("❌ Failed to auto-provision private wallet:", err)
  }
}

/**
 * Issue a 30-day mini-app JWT.
 *
 * Originally 7 days, bumped to 30 because users were getting bounced
 * back to the tweet-proof flow more often than felt right for a
 * trading PWA. Combined with the sliding-refresh logic in
 * `_auth.ts:verifyMiniAuth` (any successful API call when ≤7 days
 * remain mints a fresh 30-day token and ships it back via the
 * `X-Refreshed-Token` header), an actively-used app effectively
 * never logs the user out — and a 30-day idle window is long enough
 * that re-auth on return is rare.
 *
 * `iat` (issued-at, RFC 7519) is stamped explicitly so the refresh
 * logic can compute remaining lifetime without trusting clock skew
 * between regions; we already trust `exp`, but having both lets
 * future audit rows record "this token was minted at T".
 */
export const MINI_JWT_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

export async function issueMiniToken(
  jwtSecret: string,
  user: { twitter_id: string; username: string },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    {
      sub: user.twitter_id,
      twitter_id: user.twitter_id,
      username: user.username,
      mode: "mini",
      iat: now,
      exp: now + MINI_JWT_TTL_SECONDS,
    },
    jwtSecret,
  )
}
