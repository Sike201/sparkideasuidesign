/**
 * MiniInstallPrompt — dismissible banner nudging the user to install the
 * PWA to their home screen. Mini-app is a mobile-first surface; the full
 * fullscreen / offline / splash-screen feel only kicks in once installed.
 *
 * Logic:
 *   1. Already running in standalone (home-screen launch)? Render nothing.
 *   2. Android/Chromium: listen for `beforeinstallprompt`, stash the
 *      event, and expose an "Install" button that calls `.prompt()`.
 *   3. iOS Safari: no programmatic install — show a short hint pointing
 *      at the Share → Add to Home Screen flow.
 *   4. Dismissal persisted in localStorage so we don't nag on every nav.
 *
 * Deliberately narrow in scope — no analytics, no A/B. If the user ever
 * wipes localStorage or reinstalls their browser, they'll see it again;
 * that's fine.
 */

import { useEffect, useState } from "react"
import { Download, X, MoreHorizontal, MoreVertical } from "lucide-react"

// Chromium-only event — not in lib.dom yet, so we narrow locally.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
  prompt(): Promise<void>
}

const DISMISS_STORAGE_KEY = "spark_mini_install_dismissed"

/** Rough Android-Chromium detection for the manual install hint. We show
 *  the hint when the browser is install-capable but hasn't fired
 *  `beforeinstallprompt` — common when Chrome has throttled the event
 *  (too many dismisses, already installed for a different scope, etc.). */
function isAndroidChromium(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return /Android/.test(ua) && !/iPhone|iPad|iPod/.test(ua)
}

/** Are we already running as an installed PWA (home-screen launch)? */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true
  // Legacy iOS flag — still the only signal on Safari < 17.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return iosStandalone === true
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  // iPadOS 13+ reports as Mac — catch it via touch support.
  const isIpadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/.test(ua) || isIpadOs
}

export default function MiniInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_STORAGE_KEY) === "1"
    } catch {
      return false
    }
  })
  const [standalone, setStandalone] = useState<boolean>(() => isStandalone())
  const [ios] = useState<boolean>(() => isIos())
  const [android] = useState<boolean>(() => isAndroidChromium())

  useEffect(() => {
    // Track display-mode changes (rare but possible — e.g. when the user
    // adds to home screen while the tab is still open).
    const mq = window.matchMedia?.("(display-mode: standalone)")
    if (!mq) return
    const handler = () => setStandalone(isStandalone())
    mq.addEventListener?.("change", handler)
    return () => mq.removeEventListener?.("change", handler)
  }, [])

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Prevent the mini-infobar from showing — we surface our own UI.
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferredPrompt(null)
      setStandalone(true)
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, "1")
    } catch {
      /* private mode — keep the state in memory only */
    }
    setDismissed(true)
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === "accepted") {
        // `appinstalled` will fire — no need to do anything extra.
      } else {
        // User said no; don't offer again this session.
        handleDismiss()
      }
    } catch {
      /* Some Chromium builds throw if prompt() is called outside a user
       * gesture. onClick satisfies the gesture requirement, but we still
       * guard against edge-case throws to avoid an uncaught rejection. */
    } finally {
      setDeferredPrompt(null)
    }
  }

  if (standalone || dismissed) return null
  // iOS has no programmatic install — always show the Share → Add to Home hint.
  // Android+Chromium: if `beforeinstallprompt` fired we use the native prompt
  // via the Install button. If not (Chrome throttled the event, or the app
  // is already registered for a different scope), fall back to a manual
  // "Menu → Install app" hint so the user still gets an install path.
  if (!ios && !android) return null

  const showManualAndroidHint = android && !deferredPrompt

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 flex items-center gap-3">
      <div className="shrink-0 w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center">
        {ios ? (
          // Safari's URL-bar overflow menu (the "…" button) now carries
          // "Add to Home Screen" on iOS 17+, so the three-dots glyph is a
          // more accurate visual hint than the Share square.
          <MoreHorizontal className="w-4 h-4 text-amber-300" />
        ) : showManualAndroidHint ? (
          <MoreVertical className="w-4 h-4 text-amber-300" />
        ) : (
          <Download className="w-4 h-4 text-amber-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-amber-200">Install Spark</div>
        <div className="text-[10px] text-amber-200/70 leading-snug mt-0.5">
          {ios ? (
            <>Tap <span className="font-mono">…</span> → <span className="font-mono">Add to Home Screen</span></>
          ) : showManualAndroidHint ? (
            <>Open the browser menu → <span className="font-mono">Install app</span> (or <span className="font-mono">Add to Home screen</span>)</>
          ) : (
            "Full-screen app, faster launch."
          )}
        </div>
      </div>
      {!ios && deferredPrompt && (
        <button
          type="button"
          onClick={handleInstall}
          className="shrink-0 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-semibold transition-colors"
        >
          Install
        </button>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="shrink-0 p-1 text-amber-200/50 hover:text-amber-200 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
