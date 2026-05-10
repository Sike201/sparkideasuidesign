/**
 * MiniLayout — mobile-first shell for `/m/*` routes.
 *
 * Differs from the desktop app shell on purpose:
 *   - full-height black PWA frame (no sticky desktop header)
 *   - bottom tab bar with 3 primary destinations (Ideas · Decision market · Me)
 *   - respects iOS safe-area insets (`env(safe-area-inset-*)`)
 *   - hides bottom nav on unauthenticated routes (landing, OAuth callback)
 *     via the `hideBottomNav` prop — set per page.
 *
 * The landing, OAuth flow and "not invited" screen opt out of the tab bar
 * so users never see navigation they can't use.
 */

import { ReactNode, useEffect, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { Helmet } from "react-helmet-async"
import { Lightbulb, LineChart, User } from "lucide-react"
import MiniInstallPrompt from "./MiniInstallPrompt"
import MiniNotificationsPrompt from "./MiniNotificationsPrompt"
import MiniDailyQuiz from "./MiniDailyQuiz"
import MiniPwaGate from "./MiniPwaGate"
import { usePwaStandalone } from "@/hooks/usePwaStandalone"
import { useMiniDepositGate } from "@/hooks/useMiniDepositGate"
import { useMiniAuth } from "@/hooks/useMiniAuth"
import { readCache, MINI_CACHE_KEYS } from "@/utils/miniCache"
import type { MiniMeResponse } from "@/data/api/miniApi"

interface MiniLayoutProps {
  children: ReactNode
  hideBottomNav?: boolean
  /**
   * Hide the top header (Spark logo + X link). The landing page opts out
   * because it already shows the Spark wordmark as its hero and the
   * "Connect Twitter" CTA already carries the Twitter glyph — the header
   * would just duplicate both above the fold.
   */
  hideHeader?: boolean
}

const NAV_ITEMS = [
  { to: "/mini-app/hackathons", label: "Ideas", Icon: Lightbulb },
  { to: "/mini-app/trade", label: "Decision market", Icon: LineChart },
  { to: "/mini-app/me", label: "Me", Icon: User },
]

export default function MiniLayout({ children, hideBottomNav = false, hideHeader = false }: MiniLayoutProps) {
  const location = useLocation()
  const { standalone, loading } = usePwaStandalone()
  const { checking: depositChecking } = useMiniDepositGate()

  // Hard install gate: until the app is launched from the home-screen icon
  // (or the dev bypass flag is set), every /m/* page is replaced by the
  // install screen. Gating in the shared layout means new routes opt in
  // automatically — there's no per-page wiring to forget.
  //
  // We render nothing during the (synchronous, one-tick) `loading` window
  // instead of flashing the gate; `usePwaStandalone` initialises its state
  // synchronously on the client so `loading` is only ever true during SSR.
  if (loading) return null
  if (!standalone) return <MiniPwaGate />

  // Deposit gate: an authed user who hasn't funded their wallet gets
  // bounced to /m/deposit before seeing any protected page. The hook is
  // idempotent (cached after first positive check) so nav doesn't
  // re-thrash the network.
  if (depositChecking) return null

  return (
    <>
      {/* Swap the global PWA manifest for the mini-app one so the browser
          install prompt creates a home-screen icon pointing at /m (not /).
          Same icons, but different name, scope, and start_url. Helmet
          replaces the <link rel="manifest"> tag in <head>, which is what
          the beforeinstallprompt handshake reads. */}
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
        // Reserve space at the bottom for the nav bar when it's shown.
        paddingBottom: hideBottomNav ? "env(safe-area-inset-bottom)" : "0",
      }}
    >
      {/* Install-to-home-screen nudge. Renders nothing in standalone mode
          or after the user dismisses it — safe to mount unconditionally. */}
      <div className="w-full max-w-md mx-auto">
        <MiniInstallPrompt />
      </div>

      {/* Top header — Spark logo on the left, quick wallet switch on
          the right. The X (Twitter) link used to live there but it
          pulled users out of the trading flow into a social tab they
          couldn't easily come back from on mobile, so we stripped it.
          The wallet pill replaces it with something that's actually
          actionable from any page (Trade, Hackathons, Me) — no more
          round-trip to /m/me just to flip Main↔Bonus before a trade. */}
      {!hideHeader && (
        <header className="w-full max-w-md mx-auto px-4 pt-3 pb-2 flex items-center">
          <img
            src="/sparklogo.png"
            alt="Spark"
            className="h-7 w-auto"
          />
          <WalletSwitchPill />
        </header>
      )}

      <main
        className="flex-1 w-full max-w-md mx-auto px-4"
        style={{
          paddingBottom: hideBottomNav ? 0 : "calc(72px + env(safe-area-inset-bottom))",
        }}
      >
        {children}
      </main>

      {/* Soft-prompt for push opt-in. Self-gates on auth + push state +
          dismissal cadence — safe to mount unconditionally. We deliberately
          render it OUTSIDE the bottom-nav branch so it shows on /m/me too,
          but it skips the landing/OAuth pages naturally because they fail
          the `isAuthenticated` check inside the component. */}
      <MiniNotificationsPrompt />

      {/* Daily quiz modal — same self-gating pattern as the push prompt:
          internally checks auth + same-day dismissal + server-side
          one-per-UTC-day cap, so mounting it here means every page
          surfaces the question without per-page wiring. */}
      <MiniDailyQuiz />

      {!hideBottomNav && (
        <nav
          className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.06] bg-[#030303]/95 backdrop-blur"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="max-w-md mx-auto grid grid-cols-3">
            {NAV_ITEMS.map(({ to, label, Icon }) => {
              // Active when the current path starts with the nav path —
              // covers /m/hackathons/:id and future nested routes without
              // relying on react-router's `end` prop semantics.
              const active =
                location.pathname === to || location.pathname.startsWith(`${to}/`)
              return (
                <NavLink
                  key={to}
                  to={to}
                  className={`flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
                    active ? "text-amber-400" : "text-neutral-500 hover:text-white"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{label}</span>
                </NavLink>
              )
            })}
          </div>
        </nav>
      )}
      </div>
    </>
  )
}

/**
 * Quick wallet toggle in the top-right of the mini-app header.
 *
 * Reads / writes the session-wide `activeWalletType` (Main = public,
 * Bonus = private) via `useMiniAuth`. The trade page reads this on
 * every trade / funds-move call, so flipping here is enough to
 * re-route the entire session — no need to navigate to /m/me first.
 *
 * Visibility:
 *   - Hidden when the user isn't authenticated (no session, no
 *     wallets to switch between).
 *   - Hidden when the cached `/me` response says no private wallet
 *     exists yet — toggling to a wallet that's never been provisioned
 *     would just silently fail at trade time. Old accounts predating
 *     the two-wallet migration are the only ones in this bucket;
 *     new logins always get both. We default to "show" when the
 *     cache is empty (first-ever load) so a fresh user with both
 *     wallets sees the toggle without waiting for a refresh — the
 *     downside of a brief flicker for the legacy-account user is
 *     acceptable.
 *
 * Cross-tab sync: `useMiniAuth` already listens on the `storage`
 * event, so flipping in tab A re-renders tab B's pill correctly.
 */
function WalletSwitchPill() {
  const { isAuthenticated, activeWalletType, setActiveWalletType } = useMiniAuth()

  // `hasPrivate` is best-effort from the cached /me payload. We
  // re-check on storage events because /m/me's React Query writes
  // the cache on every refetch, and the user may have just provisioned
  // their bonus wallet.
  const [hasPrivate, setHasPrivate] = useState<boolean>(() => {
    const cached = readCache<MiniMeResponse>(MINI_CACHE_KEYS.ME, 24 * 60 * 60 * 1000)
    // No cache yet → optimistic true. The trade page will surface a
    // toast if the user toggles to a non-existent private wallet.
    if (!cached) return true
    return !!cached.wallets?.private
  })

  useEffect(() => {
    const refresh = () => {
      const cached = readCache<MiniMeResponse>(MINI_CACHE_KEYS.ME, 24 * 60 * 60 * 1000)
      if (!cached) {
        // Don't downgrade an already-true value just because the cache
        // entry expired; the wallet didn't disappear.
        return
      }
      setHasPrivate(!!cached.wallets?.private)
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === MINI_CACHE_KEYS.ME) refresh()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  if (!isAuthenticated || !hasPrivate) return null

  // Tiny haptic on toggle — same 8ms tick the trade form uses for
  // option-card / side toggles. Keeps the cross-page interaction
  // language consistent.
  const toggle = (next: "public" | "private") => {
    if (next === activeWalletType) return
    try {
      navigator.vibrate?.(8)
    } catch {
      /* unsupported */
    }
    setActiveWalletType(next)
  }

  return (
    <div className="ml-auto flex gap-0.5 p-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
      {(["public", "private"] as const).map((type) => {
        const active = activeWalletType === type
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            aria-pressed={active}
            aria-label={`Switch to ${type === "public" ? "Main" : "Bonus"} wallet`}
            className={`px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              active
                ? type === "public"
                  ? "bg-white text-black"
                  : "bg-amber-500 text-black"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            {type === "public" ? "Main" : "Bonus"}
          </button>
        )
      })}
    </div>
  )
}
