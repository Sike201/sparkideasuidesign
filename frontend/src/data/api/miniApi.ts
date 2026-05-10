/**
 * Mini-app API client.
 *
 * All mini-app endpoints live under `/api/mini/*` and require the 7-day
 * JWT issued at the end of the mode=mini Twitter OAuth flow. This client
 * reads the token from localStorage (`spark_mini_token`) and attaches it
 * automatically as `Authorization: Bearer <token>`.
 *
 * Kept out of `backendSparkApi.ts` on purpose — the mini-app is a distinct
 * surface with a distinct auth model and will get its own backend endpoints
 * (balances, trades, leaderboards) that shouldn't mix with the legacy API.
 */

export type MiniTokenHolding = {
  mint: string
  /** Resolved symbol from the backend's known-token map, or `null` for
   *  unknown mints (outcome tokens, random airdrops) — UI falls back to a
   *  truncated mint address in that case. */
  symbol: string | null
  amount: number
  decimals: number
  programId: "token" | "token-2022"
}

export type MiniWallet = {
  address: string
  sol: number
  usdg: number
  tokens: MiniTokenHolding[]
  /**
   * Unified balance breakdown computed server-side: walks the wallet's
   * cTokens against the Combinator proposal registry and applies the
   * `min(cQuote across options) per proposal` survivor rule to derive
   * what's "locked in markets". `*_total = wallet + locked` is what the
   * 3 mini-app pages (Me, Hackathon, Decision market) display so the
   * same number shows everywhere regardless of where the user is in
   * the app. Absent on legacy responses or when the proposal registry
   * fails to fetch — callers should fall back to the plain wallet
   * count from `tokens`.
   */
  unified?: {
    usdc_wallet: number
    usdc_locked: number
    usdc_total: number
    predict_wallet: number
    predict_locked: number
    predict_total: number
  }
}

export type MiniMeResponse = {
  user: {
    twitter_id: string
    username: string
    name: string
    profile_image_url: string | null
  }
  wallets: {
    public: MiniWallet | null
    private: MiniWallet | null
  }
  /**
   * True once the user has funded their PUBLIC wallet with >= $10 of
   * stablecoins (USDG or USDC). Gates access to `/m/hackathons/*` and
   * `/m/trade/*` — users without a completed deposit are bounced to
   * `/m/deposit`. Sticky once true (doesn't flip back if they withdraw).
   */
  deposit_completed: boolean
  deposit_completed_at: string | null
  /** Proposal IDs the user has upvoted. Used to render the toggled state
   *  on every proposal card without an extra fetch per card. Server-side
   *  this is a single round-trip on `/api/mini/me`. */
  my_proposal_upvotes?: string[]
  /** Spot USD price of $PREDICT from Jupiter v6, cached server-side 60s.
   *  Zero when the price isn't available — the Me page shows the raw
   *  token balance and hides the dollar parenthetical in that case. */
  predict_price_usd?: number
  /** Resolved $PREDICT mint (from the ideas table by ticker = "PREDICT").
   *  Used by the trade page to detect a PREDICT-base market via
   *  `market.baseMint === predict_mint` — comparing on `baseSymbol`
   *  was fragile because the SDK sometimes resolves it to a truncated
   *  mint string instead of a clean ticker. Null when the mint isn't
   *  deployed / not in the ideas table. */
  predict_mint?: string | null
}

export type MiniDepositStatusResponse = {
  public_wallet_address: string
  /** USDC balance (Token program) — counted at face value (1 USDC = 1 USD). */
  usdc_balance: number
  /** $PREDICT balance in token units. Counted toward the gate at the
   *  Jupiter spot price (`predict_price_usd`). 0 if the user holds
   *  none, the mint isn't deployed, or the resolver couldn't find it. */
  predict_balance: number
  /** Spot USD price of $PREDICT from Jupiter v6, cached 60s. 0 when the
   *  pricing call failed — in that case PREDICT doesn't count toward
   *  the gate, USDC still does. */
  predict_price_usd: number
  /** Pre-computed `predict_balance × predict_price_usd` — surfaced so
   *  the UI doesn't have to redo float math. */
  predict_value_usd: number
  /** USD-equivalent total used to evaluate `deposit_completed`. */
  total_usd: number
  /** Currently 10 — server-side constant, surfaced so the UI can show
   *  the exact target without hardcoding it client-side. */
  threshold_usd: number
  /** True once `total_usd` crossed `threshold_usd` at least once. */
  deposit_completed: boolean
  deposit_completed_at: string | null
}

export type MiniLiveHackathonResponse = {
  /** Id of the currently-live hackathon (status === "voting"), or null
   *  if no hackathon is live right now. Client falls back to the list
   *  view (`/m/hackathons`) when null. */
  id: string | null
}

export const MINI_TOKEN_STORAGE_KEY = "spark_mini_token"
export const MINI_USER_STORAGE_KEY = "spark_mini_user"
export const MINI_ACTIVE_WALLET_STORAGE_KEY = "spark_mini_active_wallet"

/**
 * Dev-mode auth bypass — lets a local developer access the mini-app
 * without going through the Twitter OAuth / tweet-proof flow. Writing
 * `MINI_TOKEN_STORAGE_KEY = DEV_BYPASS_TOKEN` plus a matching stub
 * user into localStorage is enough to satisfy `useMiniAuth`. Server
 * endpoints accept this token ONLY when `VITE_ENVIRONMENT_TYPE ===
 * "develop"` (see `functions/api/mini/_auth.ts`); a build that ships
 * to staging/prod will reject it with 401, so the bypass cannot leak
 * past dev.
 *
 * The stub Twitter id is what every server endpoint will see as the
 * authenticated user — DB rows tagged with this id (custodial wallets,
 * quiz responses, etc.) are the dev-bypass account's data. Override
 * via the `DEV_BYPASS_TWITTER_ID` env var on the server side if you
 * want to "be" a different real user during local testing.
 */
export const DEV_BYPASS_TOKEN = "dev-bypass"
export const DEV_BYPASS_TWITTER_ID = "dev_user_local"
export const DEV_BYPASS_USER = {
  id: DEV_BYPASS_TWITTER_ID,
  username: "dev_user",
  name: "Dev User (local bypass)",
  profile_image_url: undefined,
}

export type MiniWalletType = "public" | "private"

function readToken(): string | null {
  try {
    return localStorage.getItem(MINI_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Fetch wrapper that attaches the mini-app JWT and throws a typed error on
 * auth failure. Callers catch `MiniAuthError` to redirect back to `/m`.
 */
export class MiniAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MiniAuthError"
  }
}

/** HTTP header carrying a server-issued refreshed JWT. Mirrors the
 *  constant in `functions/api/mini/_auth.ts` — keep in sync. */
const REFRESHED_TOKEN_HEADER = "X-Refreshed-Token"

async function miniFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = readToken()
  if (!token) {
    throw new MiniAuthError("No mini-app session — log in again")
  }

  const headers = new Headers(init.headers || {})
  headers.set("Authorization", `Bearer ${token}`)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const res = await fetch(path, { ...init, headers })
  if (res.status === 401) {
    // Token expired or invalidated — caller will redirect to `/m` and
    // prompt a fresh Twitter login.
    throw new MiniAuthError("Mini-app session expired")
  }

  // Sliding refresh: when the server detects a token within 7d of
  // expiry, it mints a fresh 30d one and returns it via this header.
  // We swap localStorage transparently — every other consumer
  // (useMiniAuth + the `storage` event listener) picks the change
  // up on the next render, so React state stays in sync across tabs.
  // Best-effort: a write failure (private mode, quota) just leaves
  // the old token in place; it'll keep working until expiry and a
  // future call retries the refresh.
  const refreshed = res.headers.get(REFRESHED_TOKEN_HEADER)
  if (refreshed && refreshed !== token) {
    try {
      localStorage.setItem(MINI_TOKEN_STORAGE_KEY, refreshed)
    } catch {
      /* private mode / quota — silent */
    }
  }
  return res
}

export async function getMiniMe(): Promise<MiniMeResponse> {
  const res = await miniFetch("/api/mini/me")
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Failed to fetch /api/mini/me: ${res.status} ${body}`)
  }
  return res.json()
}

/**
 * Lightweight polling call for the `/m/deposit` page. Safe to call every
 * few seconds — server short-circuits once the deposit is marked complete
 * (no RPC, no DB write), and on the first cross of the threshold it
 * atomically stamps `deposit_completed_at` server-side.
 */
export async function getDepositStatus(): Promise<MiniDepositStatusResponse> {
  const res = await miniFetch("/api/mini/deposit-status")
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Failed to fetch /api/mini/deposit-status: ${res.status} ${body}`)
  }
  return res.json()
}

export type MiniJupiterSwapResponse = {
  success: true
  signature: string
  input_mint: string
  output_mint: string
  /** Raw input units actually consumed by the swap (string because
   *  the value can exceed 2^53; the UI parses it through Number for
   *  display when decimals are known). */
  in_amount: string
  /** Raw output units the user received (same big-int caveat). */
  out_amount: string
  /** Min output the user is guaranteed at the chosen slippage —
   *  Jupiter's `otherAmountThreshold`. The actual `out_amount` is
   *  ≥ this value. */
  other_amount_threshold: string
  price_impact_pct: number
  slippage_bps: number
}

export async function postMiniJupiterSwap(input: {
  input_mint: string
  output_mint: string
  amount: number
  input_decimals: number
  slippage_bps?: number
}): Promise<MiniJupiterSwapResponse> {
  const res = await miniFetch("/api/mini/jupiter-swap", {
    method: "POST",
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as MiniJupiterSwapResponse
}

export type MiniWithdrawResponse = {
  success: true
  signature: string
  destination: string
  amount: number
  mint: string
  /** Vault.withdraw signatures the backend ran BEFORE the transfer to
   *  top up the wallet from Combinator positions. Empty when the
   *  wallet already had enough plain USDC. The Withdraw form's
   *  success notice can list these alongside the main signature so
   *  users see the full chain of events. */
  unwind_signatures?: string[]
}

/**
 * Send a token from the user's PUBLIC custodial wallet to an arbitrary
 * Solana address. The private ("bonus") wallet is server-side excluded
 * from this endpoint — there is no client-side flag to change that.
 *
 * Routing precedence (server-side):
 *   1. `mint` set → custom token. Program ID + decimals resolved on
 *      chain. No Combinator unwind.
 *   2. `asset === "PREDICT"` → resolved $PREDICT mint, wallet-only.
 *   3. else → USDC (default), with auto-unwind from cQuote-locked
 *      Combinator positions.
 */
export async function postMiniWithdraw(input: {
  destination_address: string
  amount: number
  asset?: "USDC" | "PREDICT"
  mint?: string
}): Promise<MiniWithdrawResponse> {
  const res = await miniFetch("/api/mini/withdraw", {
    method: "POST",
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as MiniWithdrawResponse
}

// ── Export private key ──────────────────────────────────────

/**
 * Phrase the user must type to confirm they understand a private-key
 * export. Mirrored on the server (`/api/mini/export-private-key`) —
 * keep both copies in sync. Treated as anti-fat-finger, NOT a secret.
 */
export const EXPORT_KEY_CONFIRM_PHRASE =
  "I understand this gives full control of my funds"

export type MiniExportPrivateKeyResponse = {
  success: true
  wallet_address: string
  secret_key_base58: string
  max_exports_per_day: number
}

/**
 * Reveal the base58 secret key of the user's PUBLIC custodial wallet.
 *
 * Server-side requires:
 *   - mini-app JWT
 *   - the exact `EXPORT_KEY_CONFIRM_PHRASE` in `confirm_phrase`
 *   - rate-limited to N/day per user (audit-logged in `mini_key_exports`)
 *
 * Caller is responsible for clearing the returned secret from React
 * state once the user has saved it. The response carries
 * `Cache-Control: no-store` so it isn't kept by browser caches /
 * proxies.
 */
export async function postMiniExportPrivateKey(input: {
  confirm_phrase: string
}): Promise<MiniExportPrivateKeyResponse> {
  const res = await miniFetch("/api/mini/export-private-key", {
    method: "POST",
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as MiniExportPrivateKeyResponse
}

// ── Daily quiz ──────────────────────────────────────────────

import type { QuizOptionKey } from "shared/quizQuestions"

export type MiniQuizQuestion = {
  id: string
  theme: "spark" | "decision_markets" | "predict"
  question: string
  options: Record<QuizOptionKey, string>
  /** Position in the overall 10-question list. Kept for back-compat /
   *  cross-theme analytics; the UI uses `theme_index`/`theme_total`
   *  for the progress bar. */
  index: number
  total: number
  /** Position within TODAY'S theme (0-based). Drives the progress
   *  dots so the bar reflects "today's quiz" — e.g. 4 dots on a
   *  Spark day, 3 on a DM day. */
  theme_index: number
  theme_total: number
}

export type MiniQuizGetResponse =
  | {
      question: MiniQuizQuestion
      answeredCount: number
    }
  | {
      question: null
      state: "answered_today" | "completed"
      answeredCount: number
      total: number
    }

export type MiniQuizAnswerResponse = {
  correct: boolean
  correctAnswer: QuizOptionKey
  answeredCount: number
  total: number
}

/**
 * Fetch the next quiz question for the authenticated user. Returns
 * `{ question: null }` if they've already answered today or completed
 * the entire quiz — UI uses the `state` field to render the right
 * idle copy ("come back tomorrow" vs "you finished the quiz").
 */
export async function getMiniQuiz(): Promise<MiniQuizGetResponse> {
  const res = await miniFetch("/api/mini/quiz")
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Failed to fetch /api/mini/quiz: ${res.status} ${body}`)
  }
  return res.json()
}

export async function postMiniQuizAnswer(input: {
  question_id: string
  answer: QuizOptionKey
}): Promise<MiniQuizAnswerResponse> {
  const res = await miniFetch("/api/mini/quiz", {
    method: "POST",
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as MiniQuizAnswerResponse
}

/**
 * Which hackathon is currently in `status === "voting"`? Used by the
 * post-login redirect to drop users straight into the live market.
 * Public (no auth) — the set of live hackathons isn't a secret.
 */
export async function getLiveHackathonId(): Promise<MiniLiveHackathonResponse> {
  const res = await fetch("/api/mini/live-hackathon")
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Failed to fetch /api/mini/live-hackathon: ${res.status} ${body}`)
  }
  return res.json()
}

export type MiniTwitterChallengeResponse = {
  /** 8-char base64url token the user must include in their tweet, prefixed
   *  with `#spark-`. Returned for display purposes only — the server holds
   *  the authoritative copy. */
  code: string
  /** Full tweet body the user should post. Pre-formatted so the user can
   *  copy-paste verbatim (or use the Twitter intent URL below). */
  tweet_text: string
  /** `https://twitter.com/intent/tweet?...` deep link. On iOS this is a
   *  universal link → opens the native Twitter app directly. */
  intent_url: string
  /** Hard TTL on the challenge. UI counts down so the user knows to retry
   *  if they wait too long. */
  expires_in_seconds: number
}

export async function postMiniTwitterChallenge(
  username: string,
): Promise<MiniTwitterChallengeResponse> {
  const res = await fetch("/api/mini/twitter-challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as MiniTwitterChallengeResponse
}

export type MiniTwitterVerifyResponse = {
  success: true
  user: {
    id: string
    username: string
    name: string
    profile_image_url: string | null
  }
  token: string
}

export async function postMiniTwitterVerify(input: {
  tweet_url: string
  code: string
}): Promise<MiniTwitterVerifyResponse> {
  const res = await fetch("/api/mini/twitter-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as MiniTwitterVerifyResponse
}

export type MiniUpvoteProposalResponse = {
  /** True when the user now has an active upvote on the proposal. The
   *  endpoint TOGGLES, so this flips on every successful call. */
  upvoted: boolean
  /** Authoritative count after the toggle — render this directly rather
   *  than incrementing the local count, so concurrent upvotes from other
   *  users settle correctly. */
  upvote_count: number
}

/**
 * Toggle an upvote on a hackathon proposal for the authenticated user.
 * Sending the same proposal_id twice flips the state both directions.
 * Server returns the new state + count so callers can render without
 * a separate refetch.
 */
export async function postMiniUpvoteProposal(
  proposalId: string
): Promise<MiniUpvoteProposalResponse> {
  const res = await miniFetch("/api/mini/upvote-proposal", {
    method: "POST",
    body: JSON.stringify({ proposal_id: proposalId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as MiniUpvoteProposalResponse
}
