/**
 * MiniDepositPage — `/m/deposit`
 *
 * Onboarding step 3 of 3: after (1) installing the PWA and (2) connecting
 * Twitter, the user must fund their public custodial wallet with at least
 * $10 of USDC before they can trade. This page is the hard gate — every
 * route under `/m/hackathons/*` and `/m/trade/*` bounces back here while
 * `deposit_completed` is false.
 *
 * UX:
 *   - Big QR code of the public wallet address + tap-to-copy
 *   - Live balance indicator ($X.XX / $10.00)
 *   - Poll `/api/mini/deposit-status` every 3s; server flips the deposit
 *     flag atomically once the USDC balance clears the threshold (read
 *     from the same endpoint, never hardcoded on the client).
 *   - The moment the server reports `deposit_completed: true`, we fetch
 *     the live hackathon id and navigate there (or to `/m/hackathons` if
 *     none is voting).
 *
 * This page bypasses `MiniLayout`'s bottom-nav on purpose — the nav tabs
 * all point to routes that would bounce right back here, so hiding them
 * avoids a confusing "tap, get bounced, tap again" loop.
 *
 * The PWA install gate inside `MiniLayout` still fires first, so by the
 * time users see this page they're already in standalone mode.
 */

import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { QRCodeSVG } from "qrcode.react"
import { Copy, Check, Loader2, ArrowDownCircle } from "lucide-react"

import MiniLayout from "@/components/Mini/MiniLayout"
import {
  getDepositStatus,
  getLiveHackathonId,
  MiniAuthError,
  type MiniDepositStatusResponse,
} from "@/data/api/miniApi"

const POLL_INTERVAL_MS = 3_000

export default function MiniDepositPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<MiniDepositStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Keep a ref to the latest status so the polling effect can early-exit
  // after completion without restarting on every render.
  const completedRef = useRef(false)

  // Resolve the destination after deposit completes. If there's a live
  // hackathon (status=voting) we drop the user directly into it; else we
  // fall back to the list. We race the navigate to avoid showing the
  // "completed" state for more than a beat.
  const redirectPostDeposit = async () => {
    try {
      const live = await getLiveHackathonId()
      if (live.id) {
        navigate(`/mini-app/hackathons/${live.id}`, { replace: true })
        return
      }
    } catch {
      /* fall through — list is a valid fallback */
    }
    navigate("/mini-app/hackathons", { replace: true })
  }

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      try {
        const res = await getDepositStatus()
        if (cancelled) return
        setStatus(res)
        setError(null)
        if (res.deposit_completed && !completedRef.current) {
          completedRef.current = true
          // Prime the MiniLayout deposit-gate cache so the next page
          // doesn't re-fetch `/api/mini/me` just to learn what we
          // already know. Same key as `useMiniDepositGate`'s CACHE_KEY.
          try {
            localStorage.setItem("spark_mini_deposit_completed", "1")
          } catch { /* private mode — gate will fall back to the fetch */ }
          // Give React a paint so the user sees the "Done!" state before
          // we navigate away — feels less abrupt than an instant jump.
          setTimeout(redirectPostDeposit, 400)
        }
      } catch (err) {
        if (cancelled) return
        if (err instanceof MiniAuthError) {
          // Token expired mid-onboarding — back to the landing page to
          // re-auth via Twitter. Don't try to preserve the in-progress
          // deposit state; the server will still have the wallet.
          navigate("/mini-app", { replace: true })
          return
        }
        setError(err instanceof Error ? err.message : "Failed to load status")
      }
    }

    // Fire immediately then every POLL_INTERVAL_MS. `setInterval` alone
    // would leave the first render stuck on "loading…" for 3 seconds.
    tick()
    const id = window.setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
    // Effect runs once on mount — the polling loop internally picks up
    // every status update via `setStatus`. Including `navigate` in deps
    // would reset the interval on each render, which we don't want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCopy = async () => {
    if (!status?.public_wallet_address) return
    try {
      await navigator.clipboard.writeText(status.public_wallet_address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: prompt-style select. Rarely needed on modern mobile.
      window.prompt("Copy address:", status.public_wallet_address)
    }
  }

  const total = status?.total_usd ?? 0
  const threshold = status?.threshold_usd ?? 10
  // Clamp the progress bar at 100% so an $800 deposit doesn't render
  // a bar that overshoots the container.
  const progressPct = Math.min(100, Math.round((total / threshold) * 100))
  const done = status?.deposit_completed ?? false

  return (
    <MiniLayout hideBottomNav hideHeader>
      <div className="pt-6 pb-10 flex flex-col items-center text-center">
        <div className="flex items-center gap-2 mb-4">
          <ArrowDownCircle className="w-5 h-5 text-amber-400" />
          <div className="text-[11px] uppercase tracking-[0.16em] text-amber-400/80 font-semibold">
            Step 3 of 3
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-2 leading-tight">Fund your wallet</h1>
        <p className="text-[13px] text-neutral-400 max-w-xs mb-6 leading-relaxed">
          Deposit at least <span className="font-semibold text-white">${threshold.toFixed(0)}</span>{" "}
          in <span className="font-semibold text-white">USDC</span> or{" "}
          <span className="font-semibold text-white">$PREDICT</span> to unlock
          trading. Send to the address below from any Solana wallet or
          exchange — both are counted at their USD value.
        </p>

        {/* QR + address card */}
        {status ? (
          <div className="w-full max-w-xs rounded-3xl bg-white/[0.03] border border-white/10 p-6 flex flex-col items-center">
            <div className="rounded-2xl bg-white p-3 mb-4">
              <QRCodeSVG
                value={status.public_wallet_address}
                size={192}
                level="M"
                // Black on white for scanner reliability across lighting.
                // Embedding a logo looks nice but cuts scan success in dim
                // light, so we skip it for now.
              />
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="w-full rounded-xl bg-white/[0.05] hover:bg-white/[0.08] transition-colors px-3 py-3 flex items-center gap-2 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">
                  Your deposit address
                </div>
                {/* Middle-ellipsis: show first 14 + last 14 chars. The full
                    string is too long to fit on mobile and tail-truncation
                    hides the end — which is exactly the part users eyeball
                    when double-checking they pasted the right address in
                    Phantom/a CEX withdrawal form. 14/14 gets us close to
                    the edges of the card on a 375px-wide viewport without
                    overflowing, so users see as many characters as
                    physically fit. */}
                <div className="font-mono text-[11px] text-white/90">
                  {status.public_wallet_address.length > 30
                    ? `${status.public_wallet_address.slice(0, 14)}…${status.public_wallet_address.slice(-14)}`
                    : status.public_wallet_address}
                </div>
              </div>
              {copied ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-4 h-4 text-neutral-400 shrink-0" />
              )}
            </button>
          </div>
        ) : (
          <div className="w-full max-w-xs rounded-3xl bg-white/[0.03] border border-white/10 p-10 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
          </div>
        )}

        {/* Progress */}
        <div className="w-full max-w-xs mt-6">
          <div className="flex items-baseline justify-between mb-2 text-[12px]">
            <span className="text-neutral-400">
              {done ? "Deposit confirmed" : "Balance detected"}
            </span>
            <span className={done ? "text-emerald-400 font-semibold" : "text-white font-semibold"}>
              ${total.toFixed(2)} / ${threshold.toFixed(0)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                done ? "bg-emerald-400" : "bg-amber-400"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Per-asset breakdown — shown only while the gate is open
              (post-onboard the server zeros these out). Lets the user
              see at a glance which side of the threshold they're
              counting from. We still render PREDICT even with a 0 value
              so users with no PREDICT understand the rule "USDC or
              PREDICT". */}
          {status && !done && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left">
                <div className="text-[9px] uppercase tracking-wider text-neutral-500">
                  USDC
                </div>
                <div className="font-mono text-white">
                  ${(status.usdc_balance ?? 0).toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left">
                <div className="text-[9px] uppercase tracking-wider text-neutral-500">
                  $PREDICT
                </div>
                <div className="font-mono text-white">
                  ${(status.predict_value_usd ?? 0).toFixed(2)}
                </div>
                {/* Show the raw PREDICT amount when non-zero so the user
                    can sanity-check the price the server applied. Hide
                    it when 0 to keep the card tight. */}
                {(status.predict_balance ?? 0) > 0 && (
                  <div className="mt-0.5 text-[9px] text-neutral-500 font-mono">
                    {(status.predict_balance ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}{" "}
                    PREDICT
                    {(status.predict_price_usd ?? 0) > 0 && (
                      <span> · ${status.predict_price_usd.toFixed(6)}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {status && !done && (
            <div className="mt-3 text-[11px] text-neutral-500 leading-snug">
              Waiting for deposit… this page updates every few seconds, no
              need to refresh.
            </div>
          )}
          {done && (
            <div className="mt-3 text-[11px] text-emerald-400 leading-snug flex items-center justify-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Taking you to the live market…
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 text-[11px] text-red-400 max-w-xs">{error}</div>
        )}
      </div>
    </MiniLayout>
  )
}
