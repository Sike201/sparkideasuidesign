/**
 * POST /api/mini/export-private-key
 *
 * Reveals the base58 secret key of the user's PUBLIC custodial wallet
 * to the authenticated caller — gated by:
 *
 *   1. Mini-app JWT (existing /api/mini/_auth)
 *   2. An exact-match confirmation phrase in the body, so a stolen
 *      session token alone can't trigger this through a bogus client
 *      that doesn't know the phrase. The UI types the phrase into a
 *      separate state from the rest of the form, surfaced behind a
 *      "Danger zone" warning.
 *   3. A daily rate limit (MAX_EXPORTS_PER_DAY) keyed on twitter_id,
 *      so even after a compromise the blast radius is bounded and
 *      audit rows accumulate visibly.
 *
 * The PRIVATE ("bonus") wallet is NOT eligible — those funds come
 * from Spark promos and the secret key staying server-side is part
 * of the product contract. Any request hitting this endpoint resolves
 * the public row only; private rows are never even loaded.
 *
 * Audit:
 *   - Every successful export writes one row to `mini_key_exports`
 *     (id, twitter_id, twitter_username, wallet_address, ip, user_agent, created_at).
 *   - The decrypted secret is NEVER logged. Only the wallet pubkey
 *     (already public anyway) and the request metadata land in DB.
 *
 * Cache:
 *   - Response carries `Cache-Control: no-store` so neither the
 *     browser nor any edge proxy caches the body.
 *
 * Threats this design intentionally does NOT mitigate:
 *   - Compromised page code (XSS): a malicious script running on
 *     justspark.fun could just call this endpoint with a valid token
 *     + the public phrase. There's no key-derivation step that would
 *     prevent this without an out-of-band factor (hardware key,
 *     server-issued one-time codes, etc.). The rate limit bounds
 *     impact; recovery is "rotate funds out of the exposed wallet".
 *   - Stolen device with active session: same threat surface as the
 *     Withdraw flow. The user can already drain their wallet through
 *     the Send button on the Me page; this endpoint doesn't widen
 *     that surface beyond what an attacker could already do.
 */

import { jsonResponse } from "../cfPagesFunctionsUtils"
import { verifyMiniAuth } from "./_auth"

type ENV = {
  DB: D1Database
  WALLET_ENCRYPTION_KEY: string
  JWT_SECRET?: string
}

/**
 * Phrase the client must echo verbatim. Server-defined, single source
 * of truth — the UI shows it back so the user reads what they're
 * confirming, but a copy-pasted client value is what unlocks the
 * export. Treat this as anti-fat-finger, not as a secret.
 */
const CONFIRM_PHRASE = "I understand this gives full control of my funds"

/**
 * Hard cap per twitter_id per rolling 24h window. 3 leaves room for
 * the legitimate "I exported but lost it before saving" retry while
 * cutting an attacker's blast radius if a session is compromised.
 */
const MAX_EXPORTS_PER_DAY = 3

// ── crypto helpers (mirror withdraw.ts / custodial-trade.ts) ─────
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

async function decryptSecret(encrypted: string, keyHex: string): Promise<string> {
  const [ivHex, ciphertextHex] = encrypted.split(":")
  const keyBytes = hexToBytes(keyHex.slice(0, 64))
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"])
  const iv = hexToBytes(ivHex)
  const ciphertext = hexToBytes(ciphertextHex)
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

type Body = {
  confirm_phrase?: string
}

/**
 * Build the no-store response wrapper. Adds the Cache-Control header
 * on top of `jsonResponse` so the secret-bearing body isn't kept by
 * any intermediary — Cloudflare won't cache POSTs by default but
 * ServiceWorkers and over-eager corporate proxies sometimes do.
 */
function noStoreJson(body: unknown, status = 200): Response {
  const res = jsonResponse(body, status)
  res.headers.set("Cache-Control", "no-store, max-age=0")
  res.headers.set("Pragma", "no-cache")
  return res
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const auth = await verifyMiniAuth(ctx.request, ctx.env.JWT_SECRET, ctx.env)
    if (!auth.ok) return noStoreJson({ error: auth.message }, auth.status)

    let body: Body
    try {
      body = (await ctx.request.json()) as Body
    } catch {
      return noStoreJson({ error: "Invalid JSON body" }, 400)
    }

    // Constant-time-ish equality is overkill here (the phrase is
    // public), but trim + exact match avoids accidental whitespace
    // mismatches when the user types it.
    const phrase = (body.confirm_phrase ?? "").trim()
    if (phrase !== CONFIRM_PHRASE) {
      return noStoreJson(
        {
          error: "Confirmation phrase doesn't match.",
          expected_phrase: CONFIRM_PHRASE,
        },
        400,
      )
    }

    // ── Rate limit ────────────────────────────────────────────
    // Count exports in the last 24h for this twitter_id. We check
    // BEFORE loading the wallet row so a flood of requests doesn't
    // cause unnecessary decryption work.
    try {
      const recent = await ctx.env.DB
        .prepare(
          `SELECT COUNT(*) AS n FROM mini_key_exports
           WHERE twitter_id = ?
             AND created_at >= datetime('now', '-1 day')`,
        )
        .bind(auth.twitter_id)
        .first<{ n: number }>()
      const n = recent?.n ?? 0
      if (n >= MAX_EXPORTS_PER_DAY) {
        return noStoreJson(
          {
            error:
              `You've reached the daily limit of ${MAX_EXPORTS_PER_DAY} key exports. ` +
              `Try again in 24h, or contact support if this wasn't you.`,
          },
          429,
        )
      }
    } catch (err) {
      // Audit table missing → fail CLOSED. The export is high-value
      // enough that we'd rather refuse than skip the rate limit, even
      // if it means a user gets a 500 until the migration runs.
      console.error("[mini/export-private-key] audit table check failed:", err)
      return noStoreJson(
        { error: "Export temporarily unavailable. Try again shortly." },
        503,
      )
    }

    // Load PUBLIC custodial wallet ONLY. Private rows are filtered
    // by the WHERE clause — no client-side flag can flip this.
    const row = await ctx.env.DB
      .prepare(
        `SELECT wallet_address, encrypted_secret_key
         FROM custodial_wallets
         WHERE wallet_type = 'public'
           AND (twitter_id = ? OR twitter_id = ? OR twitter_username = ?)
         LIMIT 1`,
      )
      .bind(
        auth.twitter_id,
        `username:${auth.username ?? ""}`,
        auth.username ?? "",
      )
      .first<{ wallet_address: string; encrypted_secret_key: string }>()

    if (!row) {
      return noStoreJson(
        { error: "No public custodial wallet for this account." },
        404,
      )
    }

    let secretKeyBase58: string
    try {
      secretKeyBase58 = await decryptSecret(
        row.encrypted_secret_key,
        ctx.env.WALLET_ENCRYPTION_KEY,
      )
    } catch (err) {
      // Decryption failures shouldn't surface internals to the user —
      // either the env key is misconfigured or the DB row was
      // corrupted, both of which are operator problems.
      console.error("[mini/export-private-key] decrypt failed (no secret in this log):", err instanceof Error ? err.message : err)
      return noStoreJson(
        { error: "Couldn't decrypt the wallet. Contact support." },
        500,
      )
    }

    // ── Audit ─────────────────────────────────────────────────
    // Best-effort but we log the FAILURE if it happens — losing the
    // audit row is bad enough that operators should see it. We don't
    // refuse the export on audit-write failure: the user already
    // proved the right factors, and refusing here just makes a flaky
    // DB look like a security incident from their side.
    const ip = ctx.request.headers.get("cf-connecting-ip") || ctx.request.headers.get("x-forwarded-for") || null
    const ua = ctx.request.headers.get("user-agent") || null
    try {
      await ctx.env.DB
        .prepare(
          `INSERT INTO mini_key_exports
             (id, twitter_id, twitter_username, wallet_address, ip, user_agent)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          auth.twitter_id,
          auth.username ?? null,
          row.wallet_address,
          ip,
          ua,
        )
        .run()
    } catch (err) {
      console.error("[mini/export-private-key] audit insert failed:", err)
    }

    return noStoreJson({
      success: true,
      wallet_address: row.wallet_address,
      secret_key_base58: secretKeyBase58,
      // Echo the rate-limit context so the UI can show "2/3 exports
      // used today" without a separate round-trip.
      max_exports_per_day: MAX_EXPORTS_PER_DAY,
    })
  } catch (err) {
    // Catch-all: don't leak the actual error message in case it
    // somehow contains parts of the secret (e.g. a TextDecoder error
    // showing a partial buffer dump). Generic message + console log.
    console.error("[mini/export-private-key] uncaught:", err instanceof Error ? err.name : "unknown")
    return noStoreJson({ error: "Export failed." }, 500)
  }
}
