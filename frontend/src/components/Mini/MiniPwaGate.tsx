/**
 * MiniPwaGate — hard install gate for the /m/* surface.
 *
 * When the user opens any /m/* URL in a regular browser tab (not launched
 * from the home-screen icon), this screen takes over the viewport and
 * refuses to render the underlying page until they install the PWA. The
 * gate is the enforcement mechanism that turns "nice-to-have install
 * prompt" into "you have to install to use Spark".
 *
 * Platform branching:
 *   - **iOS Safari** (iPhone/iPad)
 *       No programmatic install exists. Show the Share → Add to Home
 *       Screen hint with a visual cue matching iOS 17+ UX (… menu).
 *   - **Android Chromium**
 *       Listen for `beforeinstallprompt`, stash the event, and surface a
 *       big "Install Spark" button that calls `.prompt()`. If Chrome
 *       throttled the event (already installed once, too many dismisses)
 *       we fall back to the manual "menu → Install app" hint so the user
 *       still has a path forward.
 *   - **Desktop / other**
 *       PWAs-on-desktop technically work but Spark is mobile-first, so we
 *       nudge desktop users to open the site on their phone and show the
 *       mobile URL / a QR-like prompt.
 *
 * Dev bypass: the gate is skipped when localStorage `spark_skip_pwa_gate`
 * is `"1"` (see `usePwaStandalone`). This component renders a tiny link
 * in the corner that sets that flag — saves a trip to devtools during
 * local dev. It's visible to users too, but the label is deliberately
 * unobtrusive and clicking it is an explicit opt-out, so we consider that
 * acceptable leakage.
 */

import { useEffect, useState } from "react"
import { Helmet } from "react-helmet-async"
import { ArrowDown, Download, MoreHorizontal, MoreVertical, Smartphone } from "lucide-react"

// Not in lib.dom yet — narrow locally.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
  prompt(): Promise<void>
}

function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop"
  const ua = navigator.userAgent
  // iPadOS 13+ reports as Mac — catch it via touch support.
  const isIpadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(ua) || isIpadOs) return "ios"
  if (/Android/.test(ua)) return "android"
  return "desktop"
}

export default function MiniPwaGate() {
  const [platform] = useState(detectPlatform)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    setInstalling(true)
    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
      // No matter the outcome, the event is single-use — clear it.
      // If the user accepted, the page will reload into standalone mode
      // (the display-mode mq listener in usePwaStandalone flips the gate off).
      setDeferredPrompt(null)
    } catch {
      /* some Chromium builds throw outside a user gesture — we're inside
       * onClick so this is rare, but we swallow to avoid an uncaught
       * promise rejection surfacing in the console. */
    } finally {
      setInstalling(false)
    }
  }

  const handleDevBypass = () => {
    try {
      localStorage.setItem("spark_skip_pwa_gate", "1")
    } catch { /* private mode — nothing to do */ }
    // Reload so the App/Layout re-evaluates with the flag set.
    window.location.reload()
  }

  const isDev = import.meta.env.DEV

  return (
    <>
      <Helmet>
        <link rel="manifest" href="/manifest-mini.webmanifest" />
        <meta name="theme-color" content="#030303" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Helmet>
      <div
        className="min-h-screen bg-[#030303] text-white flex flex-col font-satoshi"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="w-full max-w-md mx-auto px-6 pt-8 pb-10 flex flex-col">
          {/* Hero — pinned near the top so the install CTA sits in the
              upper two-thirds of the viewport rather than pushed off-screen
              on short phones. We used to `flex-1 justify-center` the hero
              which looked balanced on a 6.7" device but buried the button
              on anything smaller / on landscape. */}
          <div className="flex flex-col items-center text-center">
            <img
              src="/sparklogo.png"
              alt="Spark"
              className="h-12 w-auto mb-6"
            />
            <h1 className="text-[26px] font-bold leading-tight tracking-tight">
              Install Spark to continue
            </h1>
            <p className="mt-3 text-[13px] text-white/60 leading-relaxed max-w-xs">
              Spark runs as an installed app for full-screen trading, push
              alerts, and one-tap launch. Add it to your home screen to get in.
            </p>
          </div>

          {/* Platform-specific instructions */}
          <div className="mt-6 space-y-3">
            {platform === "ios" && <IosInstructions />}
            {platform === "android" && (
              <AndroidInstructions
                canPrompt={!!deferredPrompt}
                onInstall={handleInstall}
                installing={installing}
              />
            )}
            {platform === "desktop" && <DesktopInstructions />}
          </div>

          {/* Dev bypass — only shown during local development so we don't
              tempt real users to opt out. In prod `import.meta.env.DEV` is
              statically false, so the branch is DCE'd out of the bundle. */}
          {isDev && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={handleDevBypass}
                className="text-[11px] text-white/30 hover:text-white/60 underline underline-offset-2"
              >
                Continue in browser (dev only)
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Platform-specific instruction blocks
// ─────────────────────────────────────────────────────────────────────

function IosInstructions() {
  return (
    <>
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="shrink-0 w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center">
            <MoreHorizontal className="w-5 h-5 text-amber-300" />
          </div>
          <div className="text-[13px] font-semibold text-amber-200">On iPhone / iPad</div>
        </div>
        <ol className="space-y-2 text-[12px] text-amber-100/80 leading-snug">
          <li>
            <span className="font-semibold text-amber-200">1.</span> Tap the
            <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-amber-500/10">…</span>
            menu in the Safari address bar (bottom of the screen).
          </li>
          <li>
            <span className="font-semibold text-amber-200">2.</span> Tap
            <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-amber-500/10">Share</span>.
          </li>
          <li>
            <span className="font-semibold text-amber-200">3.</span> Tap
            <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-amber-500/10">More…</span>.
          </li>
          <li>
            <span className="font-semibold text-amber-200">4.</span> Tap
            <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-amber-500/10">Add to Home Screen</span>.
          </li>
          <li>
            <span className="font-semibold text-amber-200">5.</span> Open Spark
            from your home screen — you're in.
          </li>
        </ol>
      </div>
      {/* Arrow pointing down to the Safari address bar at the bottom of
          the viewport. iOS Safari pins its URL bar to the bottom edge by
          default, and the … menu lives inside it — first-time users
          easily miss it because they're trained to look at the top of
          web pages, so we draw an explicit pointer. The arrow sits in
          the empty space between the instructions and the safe-area
          inset, growing to fill whatever room is left on the device. */}
      <div className="flex flex-col items-center justify-end pt-6 pb-2 text-amber-300/70 select-none pointer-events-none">
        <span className="text-[11px] font-semibold tracking-wide mb-2">
          Safari menu is down here
        </span>
        <ArrowDown className="w-12 h-12 animate-bounce" strokeWidth={2.5} />
      </div>
    </>
  )
}

function AndroidInstructions({
  canPrompt,
  onInstall,
  installing,
}: {
  canPrompt: boolean
  onInstall: () => void
  installing: boolean
}) {
  if (canPrompt) {
    return (
      <button
        type="button"
        onClick={onInstall}
        disabled={installing}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold py-4 transition-colors"
      >
        <Download className="w-5 h-5" />
        {installing ? "Installing…" : "Install Spark"}
      </button>
    )
  }
  // Chrome throttled `beforeinstallprompt` — fall back to manual hint.
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-5 py-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="shrink-0 w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center">
          <MoreVertical className="w-5 h-5 text-amber-300" />
        </div>
        <div className="text-[13px] font-semibold text-amber-200">On Android</div>
      </div>
      <ol className="space-y-2 text-[12px] text-amber-100/80 leading-snug">
        <li>
          <span className="font-semibold text-amber-200">1.</span> Tap the
          <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-amber-500/10">⋮</span>
          menu in Chrome's top-right corner.
        </li>
        <li>
          <span className="font-semibold text-amber-200">2.</span> Choose
          <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-amber-500/10">Install app</span>
          (or <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-amber-500/10">Add to Home screen</span>).
        </li>
        <li>
          <span className="font-semibold text-amber-200">3.</span> Launch Spark
          from your home screen.
        </li>
      </ol>
    </div>
  )
}

function DesktopInstructions() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="shrink-0 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-white/80" />
        </div>
        <div className="text-[13px] font-semibold">Open on your phone</div>
      </div>
      <p className="text-[12px] text-white/60 leading-snug">
        Spark is designed for mobile — point your phone's browser at
        <span className="font-mono mx-1 px-1.5 py-0.5 rounded bg-white/10">
          {typeof window !== "undefined" ? window.location.host : "spark.fun"}
        </span>
        and install it from there.
      </p>
    </div>
  )
}
