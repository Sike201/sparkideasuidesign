/**
 * usePwaStandalone — detect whether the page is running as an installed PWA
 * (launched from the home-screen / OS app drawer) rather than in a regular
 * browser tab.
 *
 * Two signals, combined:
 *   - `matchMedia("(display-mode: standalone)")` — cross-platform, respected
 *     by Android Chrome, desktop Chromium, Edge, and modern Safari.
 *   - `navigator.standalone` — legacy iOS-only boolean, still the ONLY
 *     reliable signal on older Safari versions.
 *
 * The hook also listens for display-mode changes so the gate disappears
 * automatically when the user installs while the tab is still open (e.g.
 * Android's "Install app" banner that re-loads into standalone).
 *
 * Dev bypass: set `localStorage.spark_skip_pwa_gate = "1"` (or visit any
 * `/m/*` URL with `?skipPwaGate=1` once to persist it) and the hook will
 * report `standalone: true` even in a regular tab. Keeps `vite dev` on
 * desktop usable without monkey-patching production detection.
 */

import { useEffect, useState } from "react"

const SKIP_STORAGE_KEY = "spark_skip_pwa_gate"
const SKIP_QUERY_PARAM = "skipPwaGate"

function readStandalone(): boolean {
  if (typeof window === "undefined") return true // SSR safety — don't flash the gate
  try {
    const mq = window.matchMedia?.("(display-mode: standalone)").matches
    // @ts-expect-error — `standalone` is a non-standard Safari property.
    const ios = typeof navigator.standalone === "boolean" ? navigator.standalone : false
    return !!mq || !!ios
  } catch {
    return false
  }
}

function readSkipFlag(): boolean {
  if (typeof window === "undefined") return false
  try {
    // Support a one-shot `?skipPwaGate=1` that persists into localStorage so
    // subsequent navigations on the same device stay bypassed without having
    // to keep the query param in every URL.
    const params = new URLSearchParams(window.location.search)
    if (params.get(SKIP_QUERY_PARAM) === "1") {
      localStorage.setItem(SKIP_STORAGE_KEY, "1")
    }
    return localStorage.getItem(SKIP_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export interface PwaStandaloneState {
  /** True if PWA-installed OR the dev-bypass flag is set. */
  standalone: boolean
  /** True before the first client-side measurement completes. */
  loading: boolean
}

export function usePwaStandalone(): PwaStandaloneState {
  // Initialise synchronously so the first render already has the right answer
  // on the client — no flicker of the gate for users who are already installed.
  const [standalone, setStandalone] = useState<boolean>(() => readStandalone() || readSkipFlag())
  const [loading, setLoading] = useState<boolean>(typeof window === "undefined")

  useEffect(() => {
    setLoading(false)
    setStandalone(readStandalone() || readSkipFlag())

    const mq = window.matchMedia?.("(display-mode: standalone)")
    if (!mq) return
    const handler = () => setStandalone(readStandalone() || readSkipFlag())
    // Chromium fires `change` when the display-mode flips (post-install).
    mq.addEventListener?.("change", handler)
    // iOS doesn't fire display-mode change, but the user has to reopen from
    // the home-screen icon anyway — the next mount will pick it up.
    return () => mq.removeEventListener?.("change", handler)
  }, [])

  return { standalone, loading }
}
