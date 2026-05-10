/**
 * MiniLandingPage — `/mini-app`
 *
 * First surface users see on the mini-app. The sign-in flow is "prove
 * ownership of a Twitter account by posting a tweet from it" — three
 * steps surfaced inline:
 *   1. User types their @username
 *   2. We give them a tweet template with a per-session secret code,
 *      and an "Open Twitter" button that opens the native app via
 *      the `twitter.com/intent/tweet` universal link.
 *   3. User pastes the tweet URL back; backend fetches the tweet via
 *      Twitter's public syndication endpoint, verifies the author and
 *      content, and issues a 7-day JWT — same shape as the previous
 *      OAuth flow so every other mini-app endpoint just keeps working.
 *
 * Why we ditched OAuth: on iOS PWAs, the in-PWA webview has its own
 * cookie jar separate from Safari, so users had to log in to Twitter
 * again inside the PWA window. The tweet-proof flow sidesteps that
 * entirely — the user already IS logged in to the Twitter app on
 * their phone, posting a tweet is a one-tap action.
 *
 * If the user already has a session token we skip straight to the
 * onboarding funnel so returning users don't see the sign-in form.
 */

import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Loader2,
  Copy,
  ExternalLink,
  CheckCircle2,
} from "lucide-react"
import { useMiniAuth } from "@/hooks/useMiniAuth"
import MiniLayout from "@/components/Mini/MiniLayout"
import { ROUTES } from "@/utils/routes"
import {
  getMiniMe,
  getLiveHackathonId,
  postMiniTwitterChallenge,
  postMiniTwitterVerify,
  MiniAuthError,
  MINI_TOKEN_STORAGE_KEY,
  MINI_USER_STORAGE_KEY,
  DEV_BYPASS_TOKEN,
  DEV_BYPASS_USER,
  type MiniTwitterChallengeResponse,
  type MiniMeResponse,
} from "@/data/api/miniApi"
import {
  readCache,
  writeCache,
  MINI_CACHE_KEYS,
  ME_CACHE_AUTH_REDIRECT_MAX_MS,
} from "@/utils/miniCache"

export default function MiniLandingPage() {
  const navigate = useNavigate()
  const { isAuthenticated, logout } = useMiniAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If a valid session already exists, skip the landing screen and route
  // the returning user through the onboarding funnel check:
  //   - not yet deposited → /m/deposit
  //   - deposited, live hackathon exists → /m/hackathons/:liveId
  //   - deposited, nothing live → /m/hackathons (list)
  //
  // Mirrors the logic in OAuthCallbackPage.handleMini so the landing
  // page behaves the same whether the user just finished auth or is
  // reopening the PWA cold. The sole source of truth is the server's
  // `deposit_completed` flag — no client-cached onboarding state.
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false

    // Stale-while-revalidate fast path: if we have a recent /me
    // payload in localStorage, redirect IMMEDIATELY based on it
    // (no network round-trip required). This kills the 5-second
    // "Connect Twitter" flash on the morning's first cold open
    // when Helius RPC + the proposal-registry decode cost 2-4s.
    // The fresh fetch below still runs and either confirms the
    // redirect (no-op) or corrects it if the deposit state changed
    // since yesterday.
    const cached = readCache<MiniMeResponse>(
      MINI_CACHE_KEYS.ME,
      ME_CACHE_AUTH_REDIRECT_MAX_MS,
    )
    if (cached?.deposit_completed) {
      // Don't bother with the live-hackathon lookup on the cached
      // path — that's also a network call. Send the user to the
      // hackathons list immediately; if a live one exists, they
      // can tap straight into it from there. The fresh fetch below
      // will redirect to the live one if appropriate.
      navigate(ROUTES.MINI_HACKATHONS, { replace: true })
    } else if (cached && !cached.deposit_completed) {
      navigate(ROUTES.MINI_DEPOSIT, { replace: true })
    }
    // No cache → fall through to the network path below.

    ;(async () => {
      try {
        const me = await getMiniMe()
        if (cancelled) return
        // Persist the fresh result so the next cold open is also
        // instant. Cache writes are best-effort (silent on
        // quota/blocked storage).
        writeCache(MINI_CACHE_KEYS.ME, me)
        if (!me.deposit_completed) {
          navigate(ROUTES.MINI_DEPOSIT, { replace: true })
          return
        }
        const live = await getLiveHackathonId().catch(() => ({ id: null }))
        if (cancelled) return
        if (live.id) {
          navigate(`/mini-app/hackathons/${live.id}`, { replace: true })
          return
        }
        navigate(ROUTES.MINI_HACKATHONS, { replace: true })
      } catch (err) {
        if (cancelled) return
        if (err instanceof MiniAuthError) {
          // Stale token — clear it so the auth-flash guard above
          // (which gates on `isAuthenticated`) flips to false and the
          // "Connect Twitter" form renders. Without this, the loading
          // spinner stays up forever because the token is still in
          // localStorage even though the server rejected it.
          logout()
          return
        }
        // Any other failure: fall back to /m/me so we don't leave the
        // user stranded on a spinning landing page.
        console.error("[mini-landing] post-auth redirect failed:", err)
        navigate(ROUTES.MINI_ME, { replace: true })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, navigate])

  // Step state for the tweet-proof flow. `username` is what the user
  // claims; `challenge` is set after step 1 (server gave us a code +
  // tweet template). `tweetUrl` is what the user pastes back in step 3.
  const [step, setStep] = useState<"username" | "tweet" | "verifying">("username")
  const [username, setUsername] = useState("")
  const [challenge, setChallenge] = useState<MiniTwitterChallengeResponse | null>(null)
  const [tweetUrl, setTweetUrl] = useState("")
  const [copied, setCopied] = useState(false)

  const startChallenge = async () => {
    setError(null)
    setLoading(true)
    try {
      const cleaned = username.trim().replace(/^@/, "")
      if (!/^[A-Za-z0-9_]{1,15}$/.test(cleaned)) {
        throw new Error("Twitter usernames are 1–15 characters: letters, digits, underscore.")
      }
      const data = await postMiniTwitterChallenge(cleaned)
      setChallenge(data)
      setUsername(cleaned)
      setStep("tweet")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start sign-in")
    } finally {
      setLoading(false)
    }
  }

  const submitTweet = async () => {
    if (!challenge) return
    setError(null)
    setStep("verifying")
    try {
      const result = await postMiniTwitterVerify({
        tweet_url: tweetUrl.trim(),
        code: challenge.code,
      })
      // Persist the session in the same shape OAuth used to so
      // `useMiniAuth` and downstream pages don't care which auth path
      // produced the token. The hook validates the stored user has
      // `id` + `username` (see useMiniAuth.safeReadUser) — anything
      // else is treated as a corrupt session and `isAuthenticated`
      // stays false, which would silently bounce us back to this
      // landing page.
      try {
        localStorage.setItem(MINI_TOKEN_STORAGE_KEY, result.token)
        localStorage.setItem(
          MINI_USER_STORAGE_KEY,
          JSON.stringify({
            id: result.user.id,
            username: result.user.username,
            name: result.user.name,
            profile_image_url: result.user.profile_image_url,
          }),
        )
      } catch {
        /* private mode — the session ends with this tab. The
           authenticated useEffect above will still navigate this
           render since it reads from localStorage on next mount;
           if the write failed entirely, the user re-tries from /me. */
      }
      // Force a hard reload of the landing route so the auth-aware
      // useEffect (top of this component) routes the user through the
      // onboarding funnel without us having to duplicate that logic.
      window.location.href = ROUTES.MINI
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed")
      setStep("tweet")
    }
  }

  const copyTweet = async () => {
    if (!challenge) return
    try {
      await navigator.clipboard.writeText(challenge.tweet_text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — user can still hit "Open Twitter" which
         pre-fills the compose box, no copy needed. */
    }
  }

  const xGlyph = useMemo(
    () => (
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    [],
  )

  // Auth-flash guard: when the user already has a valid session token
  // in localStorage, `isAuthenticated` flips true at first render
  // (the hook reads localStorage synchronously). The useEffect above
  // then fires `getMiniMe()` to figure out where to redirect — but
  // that's a 3-5s network round-trip on a cold mini-app open.
  //
  // Without this guard, during that window the user sees the
  // "Connect Twitter" sign-in form and thinks they're logged out.
  // Five seconds later the redirect lands and they're whisked away,
  // which feels like a bug. Rendering a clean loading screen
  // instead removes the flash entirely — the user sees the Spark
  // logo + spinner on cold open, then jumps straight to the right
  // page when /me resolves.
  if (isAuthenticated) {
    return (
      <MiniLayout hideBottomNav hideHeader>
        <div className="flex flex-col items-center justify-center min-h-screen text-center py-10 px-2 gap-4">
          <img src="/sparklogo.png" alt="Spark" className="h-12 w-auto" />
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
        </div>
      </MiniLayout>
    )
  }

  return (
    <MiniLayout hideBottomNav hideHeader>
      <div className="flex flex-col items-center min-h-screen text-center py-10 px-2">
        {/* Brand — the Spark logo is the hero wordmark here, which is why
            MiniLayout's top header is suppressed on this route. */}
        <div className="flex flex-col items-center mb-6">
          <img src="/sparklogo.png" alt="Spark" className="h-12 w-auto mb-3" />
          <p className="text-xs text-neutral-400 font-satoshi">
            Trade the hackathon. From your phone.
          </p>
        </div>

        {step === "username" && (
          <div className="w-full max-w-sm flex flex-col gap-4">
            <div className="text-left">
              <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                Step 1 · Your Twitter handle
              </label>
              <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-white/[0.04] focus-within:border-amber-500/50">
                <span className="pl-3 text-neutral-500 text-sm">@</span>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="yourhandle"
                  className="flex-1 bg-transparent border-0 outline-none px-2 py-3 text-sm text-white placeholder:text-neutral-600"
                />
              </div>
              <p className="mt-2 text-[11px] text-neutral-500 leading-snug">
                We'll ask you to post a tweet from this account to prove
                it's yours. No password, no OAuth.
              </p>
            </div>
            <button
              onClick={startChallenge}
              disabled={loading || !username.trim()}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  {xGlyph} Continue
                </>
              )}
            </button>
          </div>
        )}

        {step !== "username" && challenge && (
          <div className="w-full max-w-sm flex flex-col gap-4 text-left">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                Step 2 · Post this tweet from @{username}
              </label>
              <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-[12px] text-neutral-200 leading-relaxed whitespace-pre-wrap break-words">
                {challenge.tweet_text}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={copyTweet}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white text-[12px] py-2 px-3 transition-colors"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </>
                  )}
                </button>
                <a
                  href={challenge.intent_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-semibold text-[12px] py-2 px-3 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open Twitter
                </a>
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                Step 3 · Paste the tweet URL
              </label>
              <input
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={tweetUrl}
                onChange={e => setTweetUrl(e.target.value)}
                placeholder="https://x.com/you/status/…"
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] outline-none focus:border-amber-500/50 px-3 py-3 text-sm text-white placeholder:text-neutral-600"
              />
              <button
                onClick={submitTweet}
                disabled={step === "verifying" || !tweetUrl.trim()}
                className="mt-3 w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors"
              >
                {step === "verifying" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
                  </>
                ) : (
                  <>Verify and sign in</>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("username")
                  setChallenge(null)
                  setTweetUrl("")
                  setError(null)
                }}
                className="mt-2 w-full text-[11px] text-neutral-500 hover:text-white transition-colors"
              >
                ← Use a different handle
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 text-xs text-red-400 max-w-sm">{error}</p>
        )}

        {/* Dev bypass — shown ONLY in a Vite dev build.
            `import.meta.env.DEV` is set by Vite to `true` during
            `vite dev` and `false` for production builds (it's
            tree-shaken to a literal at build time). Doesn't depend
            on the user having a `VITE_ENVIRONMENT_TYPE` var in
            their .env, which they often don't.
            The matching server-side check in `_auth.ts` requires
            `VITE_ENVIRONMENT_TYPE === "develop"` AT RUNTIME, so
            even if this button somehow leaked into a prod bundle
            the API would still 401 the sentinel token. */}
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(MINI_TOKEN_STORAGE_KEY, DEV_BYPASS_TOKEN)
                localStorage.setItem(
                  MINI_USER_STORAGE_KEY,
                  JSON.stringify(DEV_BYPASS_USER),
                )
              } catch {
                /* private mode — bypass won't persist; user re-clicks */
              }
              // Hard reload so the auth-aware effect at the top of this
              // component picks up the new session and routes onward.
              window.location.href = ROUTES.MINI_HACKATHONS
            }}
            className="mt-6 px-4 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-[11px] uppercase tracking-wider text-amber-300 hover:bg-amber-500/10 transition-colors"
          >
            ▸ Continue as dev (skip auth)
          </button>
        )}

        <p className="mt-auto pt-8 text-[10px] text-neutral-600 text-center px-6">
          We never see your Twitter password. The tweet proves you own
          @{username || "your handle"}.
        </p>
      </div>
    </MiniLayout>
  )
}
