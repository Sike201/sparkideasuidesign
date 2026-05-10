/**
 * MiniNotificationsPrompt — soft-prompt for Web Push opt-in.
 *
 * Mounted globally inside `MiniLayout` so it can ask any authenticated user
 * to enable notifications without the page being aware of it. The prompt
 * is a bottom-sheet modal styled to match the rest of `/m/*`, with two
 * actions: "Enable" (kicks the real `Notification.requestPermission`) and
 * "Maybe later" (silences us for a week).
 *
 * Why a custom soft-prompt instead of just calling `requestPermission`
 * directly? Browsers permanently remember a "denied" answer — once a user
 * dismisses the OS-level permission dialog, we can't ask again from JS,
 * the only way back is the browser's site-settings panel. Asking through
 * a custom UI first gives us a "Maybe later" path that doesn't burn the
 * single shot we get with the real API.
 *
 * Visibility rules:
 *   - User must be authenticated (no point asking strangers — they have
 *     no twitter_id to attach the subscription to).
 *   - Push state must be `available` (supported, not denied, not yet
 *     subscribed). Anything else means the prompt is either useless
 *     ("subscribed" / "unsupported") or the system dialog is the wrong
 *     fix ("denied" / "requires-home-screen" — surfaced in /m/me instead).
 *   - Dismissal lives in localStorage for 7 days, then we ask again. A
 *     hard "Enable" success persists subscribed state via the hook itself
 *     so we never re-show after success.
 *   - 1.5 s mount delay so the sheet doesn't slam in on top of a route
 *     transition the user is still parsing.
 */

import { useEffect, useState } from "react"
import { Bell, X } from "lucide-react"
import { useMiniAuth } from "@/hooks/useMiniAuth"
import { usePushSubscription } from "@/hooks/usePushSubscription"

const DISMISS_KEY = "spark_mini_notif_prompt_dismissed_at"
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const SHOW_DELAY_MS = 1500

function isRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < DISMISS_TTL_MS
  } catch {
    return false
  }
}

export default function MiniNotificationsPrompt() {
  const { isAuthenticated } = useMiniAuth()
  const { state, enable, error } = usePushSubscription()

  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  // Eligible = authed, push available, not dismissed in last 7 days.
  // We check this whenever the inputs flip so the sheet appears as soon
  // as a user logs in (e.g. after OAuth callback) without a remount.
  useEffect(() => {
    if (!isAuthenticated) {
      setVisible(false)
      return
    }
    if (state.status !== "available") {
      setVisible(false)
      return
    }
    if (isRecentlyDismissed()) return

    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isAuthenticated, state.status])

  const handleEnable = async () => {
    if (busy) return
    setBusy(true)
    try {
      await enable()
      // The hook flips `state` to `subscribed`; the visibility effect
      // above will hide us on the next render. Belt-and-braces hide too.
      setVisible(false)
    } catch {
      // The hook surfaces `error` for the inline message. If the user
      // hit "Block" on the OS dialog, state flips to `denied` and the
      // visibility effect will hide us automatically.
    } finally {
      setBusy(false)
    }
  }

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* private mode — accept that we'll re-ask next route change */
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-none">
      {/* Scrim — tap to dismiss. Slightly translucent so the page below
          stays readable; this is a soft-prompt, not a hard block. */}
      <button
        type="button"
        aria-label="Dismiss notifications prompt"
        onClick={handleDismiss}
        className="absolute inset-0 bg-black/60 pointer-events-auto"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-prompt-title"
        className="relative w-full max-w-md mx-auto pointer-events-auto rounded-t-3xl border border-white/10 bg-[#0a0a0a] px-5 pt-5 pb-6 shadow-2xl"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        {/* Drag handle visual cue + close X for users who prefer the
            explicit dismiss affordance over the scrim. */}
        <div className="flex items-center justify-center mb-3">
          <div className="h-1 w-10 rounded-full bg-white/10" />
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-full text-neutral-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3">
          <div className="shrink-0 w-11 h-11 rounded-full bg-amber-500/15 text-amber-300 flex items-center justify-center">
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="notif-prompt-title" className="text-base font-bold text-white leading-tight">
              Turn on notifications
            </h2>
            <p className="mt-1 text-[12px] text-neutral-400 leading-snug">
              Get a ping the moment a market you're trading resolves, when a
              new hackathon goes live, and when builders ship. We won't spam
              you — drops only.
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-[11px] text-red-300">{error}</p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="w-full rounded-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold py-3 text-sm transition-colors"
          >
            {busy ? "Enabling…" : "Enable notifications"}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 font-medium py-3 text-sm transition-colors"
          >
            Maybe later
          </button>
        </div>

        <p className="mt-3 text-center text-[10px] text-neutral-600">
          You can change this anytime in your profile.
        </p>
      </div>
    </div>
  )
}
