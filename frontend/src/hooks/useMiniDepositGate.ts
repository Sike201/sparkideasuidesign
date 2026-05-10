/**
 * useMiniDepositGate — ensures a logged-in mini-app user has funded their
 * public wallet before they can access protected /m/* pages. Complements
 * the OAuth-callback + landing-page redirects by catching direct
 * navigation / deep links / back-button cases that bypass those entry
 * points (bookmarked /m/me, share link to /m/hackathons/:id, etc.).
 *
 * Strategy:
 *   1. Skip on "open" routes (`/m`, `/m/deposit`) — gating those would
 *      cause a redirect loop.
 *   2. Skip when the user isn't authenticated — the landing page is the
 *      right destination and it will handle its own redirect once auth
 *      completes.
 *   3. Skip when we've already confirmed a completed deposit this
 *      session. `deposit_completed` is sticky server-side (once true,
 *      never false), so caching the positive result in localStorage
 *      eliminates a /me round-trip on every route change.
 *   4. Otherwise: call `/api/mini/me`, cache the result, and redirect
 *      to `/m/deposit` if not completed.
 *
 * Returns `{ checking }` so the caller (MiniLayout) can render a blank
 * frame during the first check instead of flashing the protected page.
 * Subsequent navigations are O(0) thanks to the localStorage cache.
 *
 * The cache is cleared on logout (see `useMiniAuth.logout`) — TODO:
 * wire that up once we add the explicit "remember me" UI. For now the
 * flag lingers until localStorage is wiped, which is fine because a
 * stale "already deposited" flag for a user who actually hasn't is
 * self-healing: the server returns `deposit_completed: false` on the
 * next /me fetch and re-runs the gate.
 */

import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useMiniAuth } from "./useMiniAuth"
import { getMiniMe, MiniAuthError, DEV_BYPASS_TOKEN, MINI_TOKEN_STORAGE_KEY } from "@/data/api/miniApi"
import { ROUTES } from "@/utils/routes"

const CACHE_KEY = "spark_mini_deposit_completed"

/**
 * In dev-bypass mode the stub user has no `custodial_wallets` row, so
 * `/me` returns `deposit_completed: false` and the gate would loop us
 * back to /m/deposit forever. Detect the bypass session and skip the
 * gate entirely — the bypass is for testing UI flows, not the deposit
 * flow itself, and a dev who DOES want to test deposit can navigate
 * to /m/deposit directly.
 *
 * Gated on `import.meta.env.DEV` (Vite-native, true on `vite dev`,
 * tree-shaken to false in prod builds) — NOT `VITE_ENVIRONMENT_TYPE`,
 * because that var lives in `wrangler.toml` for the Pages-Functions
 * runtime and isn't seen by the Vite bundle. The server-side
 * sentinel-token check is still gated on the runtime env, so the
 * looser client check can't actually grant access in prod.
 */
function isDevBypassSession(): boolean {
  if (!import.meta.env.DEV) return false
  try {
    return localStorage.getItem(MINI_TOKEN_STORAGE_KEY) === DEV_BYPASS_TOKEN
  } catch {
    return false
  }
}

// Routes that must NEVER trigger a deposit redirect. `/mini-app` is the
// landing (unauth users + auth'd users en route to their onboarding
// destination), `/mini-app/deposit` is the gate itself (redirecting from
// there → there = loop).
const OPEN_ROUTES = new Set<string>(["/mini-app", "/mini-app/deposit"])

function readCache(): boolean {
  try {
    return localStorage.getItem(CACHE_KEY) === "1"
  } catch {
    return false
  }
}

function writeCache(value: boolean) {
  try {
    if (value) localStorage.setItem(CACHE_KEY, "1")
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    /* private mode / quota — best effort only */
  }
}

export function useMiniDepositGate(): { checking: boolean } {
  const { isAuthenticated } = useMiniAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [checking, setChecking] = useState<boolean>(() => {
    // Initial state: we're "checking" only when we *might* redirect —
    // i.e. authed, protected route, cache miss. Otherwise start false so
    // the protected page renders immediately on mount.
    if (!isAuthenticated) return false
    if (isDevBypassSession()) return false
    if (OPEN_ROUTES.has(location.pathname)) return false
    return !readCache()
  })
  // Guard against re-firing the fetch on every render when the effect
  // deps don't actually change (strict mode, router re-renders).
  const fetchedThisMountRef = useRef(false)

  useEffect(() => {
    // Open routes + unauth users → never gate, always render children.
    // Dev bypass also skips: the stub user has no DB row, so /me would
    // always return deposit_completed: false and we'd ping-pong back
    // to /m/deposit on every navigation.
    if (!isAuthenticated || isDevBypassSession() || OPEN_ROUTES.has(location.pathname)) {
      setChecking(false)
      return
    }

    // Fast path: we've already confirmed the deposit this browser session.
    if (readCache()) {
      setChecking(false)
      return
    }

    if (fetchedThisMountRef.current) return
    fetchedThisMountRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        const me = await getMiniMe()
        if (cancelled) return
        if (me.deposit_completed) {
          writeCache(true)
          setChecking(false)
          return
        }
        // Not deposited → off to the gate. `replace` so back-button
        // doesn't land the user right back on the protected page.
        navigate(ROUTES.MINI_DEPOSIT, { replace: true })
      } catch (err) {
        if (cancelled) return
        if (err instanceof MiniAuthError) {
          // Token expired / invalid — let the user re-auth on the
          // landing page.
          navigate(ROUTES.MINI, { replace: true })
          return
        }
        // Other errors (network, 5xx): fail open. Blocking the whole
        // app on a transient D1 hiccup is worse UX than letting the
        // user through; the backend still enforces server-side in every
        // protected mutation (trade, withdraw, etc.).
        console.error("[deposit-gate] check failed:", err)
        setChecking(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, location.pathname, navigate])

  return { checking }
}
