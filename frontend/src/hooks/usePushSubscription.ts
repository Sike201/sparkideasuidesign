/**
 * React hook wrapping the Web Push subscription lifecycle for the
 * mini-app's "Enable notifications" toggle.
 *
 * Responsibilities:
 *   - Detect platform capability (`supported`, `requiresHomeScreen`).
 *   - Surface the current permission + subscription state.
 *   - Expose `enable()` / `disable()` that handle the full flow:
 *       • ask for notification permission
 *       • register the PWA service worker subscribing on the browser's
 *         push service with our VAPID public key
 *       • POST the resulting PushSubscription JSON to
 *         `/api/mini/push-subscribe` so the backend can fan broadcasts
 *         out to this device
 *
 * iOS caveat (important): Safari ONLY exposes the Notification + Push
 * APIs when the PWA is installed to the home screen. In an ordinary
 * Safari tab, `window.PushManager` is `undefined`. The hook flags this
 * via `requiresHomeScreen` so the UI can render an "Add to Home Screen"
 * hint instead of a broken toggle.
 *
 * On Android Chrome / desktop Chrome / Firefox the APIs are available
 * in the tab too; `requiresHomeScreen` is always `false`.
 *
 * Token attachment:
 *   - If a mini-app JWT is in localStorage, we attach it as a Bearer
 *     header so the backend links the subscription to the twitter_id.
 *   - Otherwise we still subscribe (anonymously); re-running `enable()`
 *     after login will upsert the row and attach it.
 */

import { useCallback, useEffect, useState } from "react"
import { MINI_TOKEN_STORAGE_KEY } from "@/data/api/miniApi"

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim()

// Stored under this key so MiniMePage's logout flow can read + delete
// the active subscription when the user signs out completely (future
// enhancement — right now we leave anonymous subs in place).
const ACTIVE_ENDPOINT_STORAGE_KEY = "spark_mini_push_endpoint"

export type PushState =
  | { status: "loading" }
  | { status: "unsupported" }
  | { status: "requires-home-screen" } // iOS in-tab
  | { status: "denied" }                // permission permanently denied
  | { status: "subscribed"; endpoint: string }
  | { status: "available" }             // supported + permission default/granted, not yet subscribed

export interface UsePushSubscriptionResult {
  state: PushState
  enable: () => Promise<void>
  disable: () => Promise<void>
  /** Set only when the last enable/disable call failed. */
  error: string | null
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window)
}

function isInStandaloneMode(): boolean {
  // `display-mode: standalone` is the cross-platform signal; Safari also
  // sets the legacy `navigator.standalone` boolean on home-screen PWAs.
  const mq = window.matchMedia?.("(display-mode: standalone)").matches
  // @ts-expect-error — `standalone` is a non-standard Safari property.
  const ios = typeof navigator.standalone === "boolean" ? navigator.standalone : false
  return !!mq || !!ios
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(normalized)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function readToken(): string | null {
  try {
    return localStorage.getItem(MINI_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function usePushSubscription(): UsePushSubscriptionResult {
  const [state, setState] = useState<PushState>({ status: "loading" })
  const [error, setError] = useState<string | null>(null)

  // Initial capability + state probe. Runs once on mount; we refresh
  // again inside enable/disable so the caller always sees the post-
  // mutation state without needing a manual poll.
  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      if (typeof window === "undefined") return
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // iOS Safari in a normal tab lands here — `requires-home-screen`
        // is more actionable than a flat "unsupported".
        if (isIos() && !isInStandaloneMode()) {
          if (!cancelled) setState({ status: "requires-home-screen" })
          return
        }
        if (!cancelled) setState({ status: "unsupported" })
        return
      }
      if (!VAPID_PUBLIC_KEY) {
        console.warn("[push] VITE_VAPID_PUBLIC_KEY not set — push disabled")
        if (!cancelled) setState({ status: "unsupported" })
        return
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setState({ status: "denied" })
        return
      }

      try {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          if (!cancelled) setState({ status: "subscribed", endpoint: existing.endpoint })
        } else {
          if (!cancelled) setState({ status: "available" })
        }
      } catch (err) {
        // If we can't reach the SW for some reason (rare: first mount
        // before register, old PWA install), treat as available — the
        // enable() path will fail more explicitly with the real cause.
        console.warn("[push] probe failed:", err)
        if (!cancelled) setState({ status: "available" })
      }
    }
    probe()
    return () => { cancelled = true }
  }, [])

  const enable = useCallback(async () => {
    setError(null)
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Push notifications are not supported on this browser")
      }
      if (!VAPID_PUBLIC_KEY) {
        throw new Error("Server missing VAPID public key — contact support")
      }

      // requestPermission returns the resolved string on success. iOS
      // rejects the promise when the PWA isn't home-screen-installed,
      // which we already filtered at probe time — but we re-check here
      // for paranoia's sake.
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        setState({ status: "denied" })
        throw new Error("Permission was not granted")
      }

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      // PushSubscription.toJSON() gives us `{ endpoint, keys: {p256dh, auth} }`
      // in exactly the shape the backend expects — no field massaging needed.
      const payload = sub.toJSON()

      const headers: Record<string, string> = { "Content-Type": "application/json" }
      const token = readToken()
      if (token) headers["Authorization"] = `Bearer ${token}`

      const res = await fetch("/api/mini/push-subscribe", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(`Subscribe failed: ${res.status} ${body}`)
      }

      try { localStorage.setItem(ACTIVE_ENDPOINT_STORAGE_KEY, sub.endpoint) } catch { /* ignore */ }
      setState({ status: "subscribed", endpoint: sub.endpoint })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to enable notifications"
      setError(msg)
      throw err
    }
  }, [])

  const disable = useCallback(async () => {
    setError(null)
    try {
      if (!("serviceWorker" in navigator)) return
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) {
        setState({ status: "available" })
        return
      }

      // Tell the backend first — if the push service unsubscribe fails
      // later, we at least stop broadcasting to this endpoint.
      await fetch("/api/mini/push-unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => { /* best-effort — dead sub will be pruned on next broadcast */ })

      await sub.unsubscribe().catch(() => { /* already gone */ })

      try { localStorage.removeItem(ACTIVE_ENDPOINT_STORAGE_KEY) } catch { /* ignore */ }
      setState({ status: "available" })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to disable notifications"
      setError(msg)
      throw err
    }
  }, [])

  return { state, enable, disable, error }
}
