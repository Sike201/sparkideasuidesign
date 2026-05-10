import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"
import jwt from "@tsndr/cloudflare-worker-jwt"
import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"

type ENV = {
  DB: D1Database
  TWITTER_CLIENT_ID: string
  TWITTER_CLIENT_SECRET: string
  VITE_ENVIRONMENT_TYPE?: string
  JWT_SECRET?: string
  /**
   * AES-256-GCM key (hex) used to encrypt custodial secret keys at rest.
   * Required when `mode=mini` — we auto-provision a public custodial wallet
   * on first login so every mini-app user can trade without going through
   * the admin-assign flow.
   */
  WALLET_ENCRYPTION_KEY?: string
}

// ── Wallet-encryption helpers ────────────────────────────────
// Mirrors `frontend/functions/api/admin/assign-custodial-wallet.ts`.
// Kept inline (rather than a shared util) because the admin endpoint lives
// under `api/admin/*` and would need a relative import across the boundary —
// a tiny duplication is cheaper than an import tangle for two functions.

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
 * Ensure a `public` custodial wallet exists for this Twitter account.
 *
 * Mini-app v1 drops the admin-whitelist gate — every user who connects
 * Twitter gets a server-custodied wallet auto-generated on their first
 * login. The private wallet type is NOT provisioned here; we'll add it
 * later once we decide how to surface the public/private split to users.
 *
 * Idempotent: if a row already exists for (`twitter_id`, `wallet_type=public`)
 * or the legacy `username:<handle>` placeholder an admin used to pre-assign
 * a wallet before the user logged in, we keep that row and return early.
 * A user never loses an existing wallet by re-logging in.
 *
 * Non-fatal — if provisioning fails (e.g. D1 hiccup, missing encryption
 * key) we log and swallow the error so the OAuth flow still completes.
 * The client will surface "no wallet" to the user on their first trade
 * attempt via the existing 403 path in `/api/custodial-trade`.
 */
async function ensurePublicWallet(
  db: D1Database,
  twitterId: string,
  twitterUsername: string,
  encryptionKey: string | undefined,
): Promise<void> {
  if (!encryptionKey) {
    console.error("❌ WALLET_ENCRYPTION_KEY not configured — skipping auto-wallet")
    return
  }

  try {
    // Existing wallet under the real twitter_id OR the username placeholder
    // that `assign-custodial-wallet` uses when admins pre-provision a wallet
    // before the user has ever logged in. Either match counts as "already
    // provisioned" — we should never trample an existing row.
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

    // Fresh keypair — `Keypair.generate()` uses `crypto.getRandomValues`
    // under the hood, which works in the Cloudflare Workers runtime.
    const kp = Keypair.generate()
    const secretBase58 = bs58.encode(kp.secretKey)
    const encrypted = await encryptSecret(secretBase58, encryptionKey)

    await db
      .prepare(
        `INSERT INTO custodial_wallets (id, twitter_id, twitter_username, wallet_address, encrypted_secret_key, proposal_pda, wallet_type, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'public', datetime('now'))
         ON CONFLICT(twitter_id, wallet_type) DO NOTHING`,
      )
      .bind(
        uuidv4(),
        twitterId,
        twitterUsername,
        kp.publicKey.toBase58(),
        encrypted,
      )
      .run()

    console.log(`✅ Auto-provisioned public wallet ${kp.publicKey.toBase58()} for @${twitterUsername}`)
  } catch (err) {
    // Non-fatal: auth still succeeds, the client just sees no wallet until
    // we fix the underlying issue. Better than blocking login on a D1 blip.
    console.error("❌ Failed to auto-provision wallet:", err)
  }
}

/**
 * Bonus (private) wallet auto-provisioning — sibling to `ensurePublicWallet`.
 *
 * Every mini-app user gets TWO wallets:
 *   - public  — where they deposit USDC; this is their "receive address"
 *   - private — the "bonus" stash we fund ourselves (airdrops, rewards,
 *               hackathon prizes, etc.). Admins push tokens here manually
 *               for now; no user-facing deposit flow targets it.
 *
 * Both wallets share the same encryption scheme + column layout — only
 * `wallet_type` differs. The UI lets the user toggle which one signs each
 * trade (future), and balances from both show up on the hackathon page.
 *
 * Simpler existence check than the public variant: there's no legacy
 * `username:<handle>` placeholder for private wallets (admins never
 * pre-provisioned them), so we only look at the real `twitter_id`.
 */
async function ensurePrivateWallet(
  db: D1Database,
  twitterId: string,
  twitterUsername: string,
  encryptionKey: string | undefined,
): Promise<void> {
  if (!encryptionKey) {
    // Same guard as public; message differentiated so log-scanners can tell
    // us which of the two failed if `WALLET_ENCRYPTION_KEY` is ever unset.
    console.error("❌ WALLET_ENCRYPTION_KEY not configured — skipping bonus wallet")
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
    const secretBase58 = bs58.encode(kp.secretKey)
    const encrypted = await encryptSecret(secretBase58, encryptionKey)

    await db
      .prepare(
        `INSERT INTO custodial_wallets (id, twitter_id, twitter_username, wallet_address, encrypted_secret_key, proposal_pda, wallet_type, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, 'private', datetime('now'))
         ON CONFLICT(twitter_id, wallet_type) DO NOTHING`,
      )
      .bind(
        uuidv4(),
        twitterId,
        twitterUsername,
        kp.publicKey.toBase58(),
        encrypted,
      )
      .run()

    console.log(`✅ Auto-provisioned bonus wallet ${kp.publicKey.toBase58()} for @${twitterUsername}`)
  } catch (err) {
    // Non-fatal and independent of the public wallet — if this throws the
    // user still has a usable public wallet and can trade. We'll back-fill
    // the bonus row the next time they log in (idempotent existence check).
    console.error("❌ Failed to auto-provision bonus wallet:", err)
  }
}

type TwitterOAuthTokenRequest = {
  code: string
  redirect_uri: string
  code_verifier: string
  /**
   * Mini-app flow — when set to "mini", the response also includes a 7-day
   * JWT the mini-app stores client-side to authenticate subsequent calls
   * (e.g. `/api/mini/me`). For the legacy web flow this field is omitted
   * and no JWT is issued.
   */
  mode?: "mini"
}

type TwitterTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
  token_type: string
}

type TwitterUserResponse = {
  data: {
    id: string
    username: string
    name: string
    profile_image_url?: string
  }
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    console.log('🔐 Starting Twitter OAuth token exchange...')
    const requestBody = await ctx.request.json()
    console.log('📝 Request body received:', { 
      hasCode: !!requestBody.code, 
      hasRedirectUri: !!requestBody.redirect_uri, 
      hasCodeVerifier: !!requestBody.code_verifier,
      redirectUri: requestBody.redirect_uri 
    })
    
    const { code, redirect_uri, code_verifier, mode }: TwitterOAuthTokenRequest = requestBody

    // Validate required fields
    if (!code || !redirect_uri || !code_verifier) {
      console.error('❌ Missing required fields:', { 
        code: !!code, 
        redirect_uri: !!redirect_uri, 
        code_verifier: !!code_verifier 
      })
      return jsonResponse({ 
        message: "Missing required fields",
        details: {
          code: !!code,
          redirect_uri: !!redirect_uri,
          code_verifier: !!code_verifier
        }
      }, 400)
    }

    // Validate environment variables
    if (!ctx.env.TWITTER_CLIENT_ID || !ctx.env.TWITTER_CLIENT_SECRET) {
      console.error('❌ Twitter OAuth environment variables not configured')
      return jsonResponse({ message: "Twitter OAuth not configured" }, 500)
    }

    console.log('✅ All validations passed, calling Twitter API...')

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${ctx.env.TWITTER_CLIENT_ID}:${ctx.env.TWITTER_CLIENT_SECRET}`)}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirect_uri,
        code_verifier: code_verifier
      })
    })

    console.log(`🐦 Twitter API response status: ${tokenResponse.status}`)

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('❌ Twitter token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        errorData
      })
      return jsonResponse({ 
        message: "Failed to exchange authorization code",
        twitterError: errorData,
        status: tokenResponse.status
      }, 400)
    }

    const tokenData: TwitterTokenResponse = await tokenResponse.json()
    console.log('✅ Successfully got Twitter tokens')

    // Get user information using the access token
    console.log('👤 Fetching user information from Twitter...')
    const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    })

    console.log(`👤 Twitter user API response status: ${userResponse.status}`)

    if (!userResponse.ok) {
      const userErrorData = await userResponse.text()
      console.error('❌ Failed to get user information:', {
        status: userResponse.status,
        statusText: userResponse.statusText,
        errorData: userErrorData
      })
      return jsonResponse({ 
        message: "Failed to get user information",
        twitterError: userErrorData,
        status: userResponse.status
      }, 400)
    }

    const userData: TwitterUserResponse = await userResponse.json()
    console.log('✅ Successfully got user data:', {
      id: userData.data.id,
      username: userData.data.username,
      name: userData.data.name
    })

    // Store user data in database, preserving existing fees_claimed
    console.log('💾 Saving user data to database...')
    try {
      const dbResult = await ctx.env.DB
        .prepare(`
          INSERT INTO twitter_users (twitter_id, username, name, profile_image_url, access_token, refresh_token, expires_at, fees_claimed, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(twitter_id) 
          DO UPDATE SET 
            username = excluded.username,
            name = excluded.name,
            profile_image_url = excluded.profile_image_url,
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            expires_at = excluded.expires_at,
            updated_at = CURRENT_TIMESTAMP
        `)
        .bind(
          userData.data.id,
          userData.data.username,
          userData.data.name,
          userData.data.profile_image_url || null,
          tokenData.access_token,
          tokenData.refresh_token,
          new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        )
        .run()
      
      console.log('✅ Successfully saved user to database:', dbResult)
    } catch (dbError) {
      console.error('❌ Database save failed:', dbError)
      return jsonResponse({ 
        message: "Failed to save user data to database",
        error: dbError instanceof Error ? dbError.message : 'Database error'
      }, 500)
    }

    // Mini-app v1 — issue a 7-day JWT that the PWA stores client-side and
    // replays via `Authorization: Bearer <token>` to mini-app endpoints.
    // The legacy web flow (mode unset) never sees this token.
    let miniToken: string | undefined
    if (mode === "mini") {
      if (!ctx.env.JWT_SECRET) {
        console.error("❌ JWT_SECRET not configured — cannot issue mini-app token")
        return jsonResponse({ message: "Mini-app auth not configured" }, 500)
      }

      // Auto-provision both custodial wallets if the user doesn't already
      // have them. Mini-app dropped the admin-whitelist gate, so every
      // Twitter login yields two tradeable wallets:
      //   - public  → the user's deposit address (USDC lands here)
      //   - private → the "bonus" stash we fund ourselves (airdrops etc.)
      //
      // We await both so the first `/api/mini/me/status` call after this
      // response already sees both rows. Running them in parallel is safe:
      // each targets a distinct (twitter_id, wallet_type) pair, so the
      // composite UNIQUE constraint can't produce a conflict between them.
      await Promise.all([
        ensurePublicWallet(
          ctx.env.DB,
          userData.data.id,
          userData.data.username,
          ctx.env.WALLET_ENCRYPTION_KEY,
        ),
        ensurePrivateWallet(
          ctx.env.DB,
          userData.data.id,
          userData.data.username,
          ctx.env.WALLET_ENCRYPTION_KEY,
        ),
      ])

      miniToken = await jwt.sign(
        {
          sub: userData.data.id,
          twitter_id: userData.data.id,
          username: userData.data.username,
          mode: "mini",
          // 7 days — session-wide usage on mobile, no background refresh
          // needed. Re-login via Twitter rotates the token.
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
        },
        ctx.env.JWT_SECRET
      )
    }

    return jsonResponse({
      success: true,
      user: {
        id: userData.data.id,
        username: userData.data.username,
        name: userData.data.name,
        profile_image_url: userData.data.profile_image_url
      },
      ...(miniToken ? { token: miniToken } : {}),
    }, 200)

  } catch (e) {
    await reportError(ctx.env.DB, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
}

export const onRequestOptions: PagesFunction<ENV> = async (ctx) => {
  try {
    if (ctx.env.VITE_ENVIRONMENT_TYPE !== "develop") return
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:5173',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    return jsonResponse({ message: error }, 500)
  }
} 