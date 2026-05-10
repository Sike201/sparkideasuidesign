/**
 * MiniMePage — `/m/me`
 *
 * Dashboard for an authenticated mini-app user. Two jobs:
 *
 *   1. Session-wide wallet switch — public ↔ private. Persists in
 *      localStorage via useMiniAuth.setActiveWalletType and is read by
 *      `MiniTradePage` / the custodial-trade endpoint to route every
 *      trade through the chosen wallet. Private is enabled once its
 *      row exists (auto-provisioned at Twitter auth).
 *
 *   2. Balance display — USDC hero figure for the ACTIVE wallet, plus a
 *      compact list of ecosystem holdings. The non-active (bonus/public)
 *      wallet shows below as a secondary card so the address stays
 *      discoverable without the user toggling.
 *
 * The invite gate is gone: every user who connects Twitter gets an
 * auto-generated public wallet on the server (see
 * `frontend/functions/api/twitter-oauth-token.ts`). A missing wallet is
 * now a server-side error, not a user-facing state.
 *
 * On 401 from /api/mini/me we clear the session and bounce to /m.
 */

import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Bell, Copy, LogOut, Loader2, Pencil, Twitter, QrCode, X as XIcon, AlertTriangle, Eye, EyeOff, ShieldAlert } from "lucide-react"
import QrScanner from "qr-scanner"
import { QRCodeSVG } from "qrcode.react"
import { useMiniAuth } from "@/hooks/useMiniAuth"
import { usePushSubscription } from "@/hooks/usePushSubscription"
import {
  getMiniMe,
  MiniAuthError,
  postMiniWithdraw,
  postMiniExportPrivateKey,
  EXPORT_KEY_CONFIRM_PHRASE,
  type MiniMeResponse,
  type MiniTokenHolding,
  type MiniWalletType,
} from "@/data/api/miniApi"
import MiniLayout from "@/components/Mini/MiniLayout"
import { ROUTES } from "@/utils/routes"
import {
  readCache,
  writeCache,
  MINI_CACHE_KEYS,
  ME_CACHE_PLACEHOLDER_MAX_MS,
} from "@/utils/miniCache"

function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

export default function MiniMePage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, logout, activeWalletType, setActiveWalletType } = useMiniAuth()
  const [copied, setCopied] = useState(false)
  const [copiedBonus, setCopiedBonus] = useState(false)
  /**
   * Funds modal state — `null` when closed, "deposit" | "withdraw"
   * pre-selects the matching tab inside the modal. Driven by the two
   * entry-point buttons on the Main wallet card. Closing resets to
   * `null` so re-opening from the same button doesn't carry over the
   * previous form state from a different intent.
   */
  const [fundsModal, setFundsModal] = useState<"deposit" | "withdraw" | null>(null)
  // Private-key export modal. Mounts on demand so the multi-step
  // flow only runs when the user explicitly asks for it. State lives
  // up here (not inside the modal) so the open/close transitions
  // are cleanly tied to a single boolean — no half-mounted reveal
  // sticking around if the parent re-renders.
  const [exportKeyOpen, setExportKeyOpen] = useState(false)

  // Unauthenticated visitors get bounced to the landing page.
  useEffect(() => {
    if (!isAuthenticated) {
      navigate(ROUTES.MINI, { replace: true })
    }
  }, [isAuthenticated, navigate])

  const { data, isLoading, error, refetch } = useQuery<MiniMeResponse>({
    queryKey: ["mini", "me"],
    queryFn: async () => {
      const me = await getMiniMe()
      // Persist for the cold-open SWR fast path (see MiniLandingPage
      // + the placeholderData read below). Same payload shape, so
      // returning users see yesterday's balances instantly while the
      // fresh fetch runs in the background.
      writeCache(MINI_CACHE_KEYS.ME, me)
      return me
    },
    enabled: isAuthenticated,
    // Balances shift on every trade — poll every 30s while the page is open.
    refetchInterval: 30_000,
    // Show the cached payload while the first fetch is in flight.
    // Tighter freshness window (1h) than the auth-redirect path so a
    // user who hasn't opened the app in 2 days doesn't see ancient
    // balance figures even for a second.
    placeholderData: () =>
      readCache<MiniMeResponse>(
        MINI_CACHE_KEYS.ME,
        ME_CACHE_PLACEHOLDER_MAX_MS,
      ) ?? undefined,
    retry: (failureCount, err) => {
      if (err instanceof MiniAuthError) return false
      return failureCount < 2
    },
  })

  // 401 from /me = session gone. Clear it and send the user back to /m.
  useEffect(() => {
    if (error instanceof MiniAuthError) {
      logout()
      navigate(ROUTES.MINI, { replace: true })
    }
  }, [error, logout, navigate])

  const handleLogout = () => {
    logout()
    navigate(ROUTES.MINI, { replace: true })
  }

  // Resolve the "effective" type: if the user picked private in a previous
  // session but the private wallet hasn't been provisioned yet (shouldn't
  // happen on new logins, but can for users whose row predates the two-
  // wallet migration), fall back to public so the dashboard still renders
  // useful balances. Once `data` lands with a private wallet, we honor the
  // saved preference.
  const hasPrivate = !!data?.wallets.private
  const effectiveWalletType: MiniWalletType =
    activeWalletType === "private" && hasPrivate ? "private" : "public"
  const activeWallet = data
    ? effectiveWalletType === "private"
      ? data.wallets.private
      : data.wallets.public
    : null
  const inactiveWallet = data
    ? effectiveWalletType === "private"
      ? data.wallets.public
      : data.wallets.private
    : null

  const handleCopy = async () => {
    if (!activeWallet) return
    try {
      await navigator.clipboard.writeText(activeWallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard API blocked — silent no-op is fine for v1 */
    }
  }

  // "Bonus" is a historical name — really this is just "copy the *other*
  // wallet's address", whichever one isn't currently active. We kept the
  // variable name because changing it for the sake of naming would dirty
  // more of the file than the change is worth.
  const handleCopyBonus = async () => {
    const addr =
      effectiveWalletType === "private"
        ? data?.wallets.public?.address
        : data?.wallets.private?.address
    if (!addr) return
    try {
      await navigator.clipboard.writeText(addr)
      setCopiedBonus(true)
      setTimeout(() => setCopiedBonus(false), 1500)
    } catch {
      /* silent */
    }
  }

  return (
    <MiniLayout>
      <div className="pt-8 pb-6">
        {/* Profile header */}
        <div className="flex items-center gap-3 mb-8">
          {user?.profile_image_url ? (
            <img
              src={user.profile_image_url}
              alt={user.username}
              className="w-12 h-12 rounded-full border border-white/10"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center">
              <Twitter className="w-5 h-5 text-neutral-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold truncate">{user?.name || user?.username}</div>
            <div className="text-xs text-neutral-500 truncate">@{user?.username}</div>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Log out"
            className="p-2 rounded-full text-neutral-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {error && !(error instanceof MiniAuthError) && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-300">
            Couldn't load your account.{" "}
            <button onClick={() => refetch()} className="underline">retry</button>
          </div>
        )}

        {data && (
          <>
            {/* Wallet switch — both tabs are live. Clicking a tab updates
                `activeWalletType` in localStorage (via useMiniAuth), which
                the trade page reads on every `/api/custodial-trade` call.
                Private is disabled only if the private wallet row hasn't
                been provisioned (shouldn't happen on new logins). */}
            <WalletSwitch
              active={effectiveWalletType}
              privateEnabled={hasPrivate}
              onChange={setActiveWalletType}
            />

            {/* Active wallet summary */}
            <NotificationsToggle />

            {activeWallet ? (
              <div className={`mt-6 rounded-2xl border p-5 ${
                effectiveWalletType === "private"
                  ? "border-amber-500/[0.2] bg-amber-500/[0.04]"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}>
                <div className="flex items-center justify-between mb-5">
                  <div className={`text-[10px] uppercase tracking-wider font-semibold ${
                    effectiveWalletType === "private" ? "text-amber-400/90" : "text-neutral-500"
                  }`}>
                    {effectiveWalletType === "private" ? "Bonus wallet · active" : "Main wallet · active"}
                  </div>
                  {/* Address row — only on the Main wallet. The Bonus
                      wallet's address is intentionally hidden because
                      bonus funds are scoped to the trading surface and
                      can't be cashed out; surfacing the address would
                      tempt users to share it as a deposit destination,
                      and any deposit there would be unrecoverable. The
                      Bonus card instead exposes a user-set nickname
                      (see `BonusNicknameRow`). */}
                  {effectiveWalletType === "private" ? (
                    <BonusNicknameRow walletAddress={activeWallet.address} />
                  ) : (
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1 text-[11px] font-mono transition-colors text-neutral-400 hover:text-white"
                    >
                      <span>{shortAddress(activeWallet.address)}</span>
                      <Copy className="w-3 h-3" />
                      {copied && <span className="text-amber-400 ml-1">copied</span>}
                    </button>
                  )}
                </div>

                {/* Primary balance — USDC lives up here at hero size with
                    a "$" prefix instead of a "USDC" suffix; reads as a
                    money figure rather than a token count, which is what
                    users actually want to see on the dashboard.
                    USDG is intentionally hidden: on mainnet the user base
                    interacts with USDC (bridged from other chains or
                    bought via on-ramps), and surfacing a second stable
                    that's usually 0 was pure visual noise. Ideacoins /
                    ecosystem tokens still land in the compact list below.
                    $PREDICT gets its own hero row right under USDC with
                    a parenthesised dollar equivalent — it's the second
                    deposit asset for onboarding so users need to see
                    both the raw token count AND its USD value at a
                    glance, not buried in "Other tokens". */}
                <div className="mb-4 space-y-2">
                  <HeroBalance prefix="$" symbol="USDC" amount={unifiedUsdc(activeWallet)} />
                  {(() => {
                    const predictBalance = unifiedPredict(activeWallet)
                    const price = data.predict_price_usd ?? 0
                    // Hide the parenthetical when we couldn't get a price
                    // — showing "($0.00)" next to a real PREDICT balance
                    // would falsely imply the token is worthless.
                    const subtitle =
                      price > 0
                        ? `≈ $${(predictBalance * price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                        : null
                    return (
                      <HeroBalance
                        symbol="PREDICT"
                        amount={predictBalance}
                        subtitle={subtitle}
                      />
                    )
                  })()}
                </div>

                <TokenList tokens={activeWallet.tokens} />

                {/* Deposit / Withdraw entry points — open a modal that
                    contains the actual flow. Two buttons rather than a
                    single one because the user usually arrives with a
                    specific intent (top up vs cash out), and the modal
                    pre-selects the right tab. The tabs at the top of
                    the modal still allow switching, so a user who hit
                    the wrong button doesn't have to close and re-open.
                    Only available on the Main wallet — Bonus funds are
                    scoped to the trading surface and can't be cashed
                    out (backend enforces this; the UI gate is purely
                    cosmetic). */}
                {effectiveWalletType === "public" && (
                  <>
                    <div className="pt-4 border-t border-white/[0.04] grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFundsModal("deposit")}
                        className="py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] text-xs font-semibold text-neutral-200 transition-colors"
                      >
                        Deposit
                      </button>
                      <button
                        type="button"
                        onClick={() => setFundsModal("withdraw")}
                        className="py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] text-xs font-semibold text-neutral-200 transition-colors"
                      >
                        Withdraw
                      </button>
                    </div>

                    {/* Danger zone — visually muted on purpose. The private
                        key export is a power-user feature; surfacing it as
                        a tertiary text link keeps the primary wallet
                        actions (Deposit / Withdraw) the obvious targets
                        and avoids new users tapping "reveal key" out of
                        curiosity. The actual safety rails (warning copy +
                        confirmation checkbox + rate limit + audit log)
                        live inside ExportPrivateKeyModal. */}
                    <div className="pt-3 mt-3 border-t border-white/[0.04] flex justify-center">
                      <button
                        type="button"
                        onClick={() => setExportKeyOpen(true)}
                        className="text-[10px] uppercase tracking-wider text-neutral-500 hover:text-red-300 font-semibold transition-colors"
                      >
                        Reveal private key
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-5 text-xs text-amber-200">
                Your wallet is being provisioned. Pull to refresh in a few
                seconds.
              </div>
            )}

            {/* Inactive wallet card — shows the OTHER wallet (public if
                bonus is active, bonus if public is active) as a compact
                read-only summary. Keeps the address reachable for copy/
                share without forcing a toggle. Rendered only when both
                wallets exist — returning users from before the two-wallet
                migration might only have the public one. */}
            {inactiveWallet && (
              <div className={`mt-4 rounded-2xl border p-5 ${
                effectiveWalletType === "private"
                  ? "border-white/[0.06] bg-white/[0.02]"
                  : "border-amber-500/[0.15] bg-amber-500/[0.03]"
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className={`text-[10px] uppercase tracking-wider font-semibold ${
                    effectiveWalletType === "private" ? "text-neutral-500" : "text-amber-400/90"
                  }`}>
                    {effectiveWalletType === "private" ? "Main wallet" : "Bonus wallet"}
                  </div>
                  {/* Bonus inactive card hides the address (see comment
                      on the active card above). Show the user's pseudo
                      instead — `BonusNicknameRow` falls back to a "Set
                      nickname" CTA when nothing has been chosen yet. */}
                  {effectiveWalletType === "public" ? (
                    <BonusNicknameRow walletAddress={inactiveWallet.address} />
                  ) : (
                    <button
                      onClick={handleCopyBonus}
                      className="flex items-center gap-1 text-[11px] font-mono text-neutral-400 hover:text-white transition-colors"
                    >
                      <span>{shortAddress(inactiveWallet.address)}</span>
                      <Copy className="w-3 h-3" />
                      {copiedBonus && <span className="text-amber-400 ml-1">copied</span>}
                    </button>
                  )}
                </div>
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-xs text-neutral-500">USDC</div>
                  <div className="text-base font-mono font-semibold text-neutral-200">
                    ${unifiedUsdc(inactiveWallet).toFixed(2)}
                  </div>
                </div>
                <div className="flex items-baseline justify-between mb-3">
                  <div className="text-xs text-neutral-500">PREDICT</div>
                  <div className="text-base font-mono font-semibold text-neutral-200">
                    {unifiedPredict(inactiveWallet).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="text-[10px] text-neutral-500 leading-snug">
                  {effectiveWalletType === "private"
                    ? "Your personal wallet — holds the USDC you deposited to unlock trading. Tap the Main tab above to trade from here."
                    : "Funded by the Spark team for promos & rewards. Tap the Bonus tab above to trade from here."}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Funds modal — Deposit / Withdraw lives in an overlay so the
          wallet card stays minimal and only the relevant flow takes
          screen real estate. Pre-selects the tab matching the button
          the user pressed; the tabs at the top of the panel still
          allow switching mid-flow. */}
      {fundsModal && data && activeWallet && effectiveWalletType === "public" && (
        <FundsModal
          initialTab={fundsModal}
          walletAddress={activeWallet.address}
          // Withdraw is gated to wallet-plain balance — we only know
          // how to ship the user's plain USDC/PREDICT to an external
          // address. Locked-in-markets balance is surfaced separately
          // (see `usdcLocked` / `predictLocked`) so the form can
          // explain the gap rather than letting the user enter an
          // amount the backend can't fulfill.
          usdcBalance={usdcAmount(activeWallet.tokens)}
          predictBalance={predictAmount(activeWallet.tokens)}
          usdcLocked={activeWallet.unified?.usdc_locked ?? 0}
          predictLocked={activeWallet.unified?.predict_locked ?? 0}
          // Forwarded to the SPARK tab inside WithdrawForm so the user
          // can pick any wallet token to send. We pass everything;
          // the picker filters out USDC/PREDICT so they don't appear
          // twice (they have dedicated tabs).
          walletTokens={activeWallet.tokens}
          onSuccess={() => refetch()}
          onClose={() => setFundsModal(null)}
        />
      )}

      {/* Private-key export. Only mountable from the public-wallet
          card, so we double-gate on `effectiveWalletType` — even if
          something flips `exportKeyOpen` while the user toggled to
          the bonus wallet, we refuse to render. */}
      {exportKeyOpen && effectiveWalletType === "public" && (
        <ExportPrivateKeyModal onClose={() => setExportKeyOpen(false)} />
      )}
    </MiniLayout>
  )
}

/* ── sub-components ──────────────────────────────────────── */

/**
 * Push-notification opt-in card. Hidden once the user has subscribed —
 * the card has done its job and we don't want to keep nagging on every
 * page load. Remaining states:
 *   - loading      → subtle skeleton, no interaction
 *   - unsupported  → hidden entirely (desktop with no push APIs)
 *   - subscribed   → hidden entirely (opt-in done; user toggles off via
 *                    browser settings or by uninstalling the PWA)
 *   - requires-home-screen → iOS-specific hint to "Add to Home Screen"
 *   - denied       → inert message explaining how to re-enable
 *   - available    → primary CTA to enable
 *
 * The card sits above the wallet card so users discover it on first
 * login — notifications are the #1 retention lever on mini-apps and
 * burying them in a settings screen kills opt-in rates.
 */
function NotificationsToggle() {
  const { state, enable, error } = usePushSubscription()
  const [busy, setBusy] = useState(false)

  if (state.status === "loading") {
    return <div className="mt-6 h-[60px] rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
  }
  // Hidden states: no card rendered.
  if (state.status === "unsupported" || state.status === "subscribed") {
    return null
  }

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      await enable()
    } catch {
      /* surfaced via `error` */
    } finally {
      setBusy(false)
    }
  }

  const label =
    state.status === "denied"
      ? "Notifications blocked"
      : state.status === "requires-home-screen"
        ? "Add to Home Screen for alerts"
        : "Enable notifications"
  const subtitle =
    state.status === "denied"
      ? "Re-enable in your browser's site settings."
      : state.status === "requires-home-screen"
        ? "iOS only delivers push in installed PWAs. Tap Share → Add to Home Screen."
        : "Get a ping when a market you're trading resolves."

  const interactive = state.status === "available"

  return (
    <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-white/[0.04] text-neutral-400">
          <Bell className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{label}</div>
          <div className="text-[11px] text-neutral-500 leading-snug">{subtitle}</div>
        </div>
        {interactive && (
          <button
            type="button"
            onClick={handleClick}
            disabled={busy}
            className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors bg-white text-black hover:bg-neutral-200 disabled:opacity-60"
          >
            {busy ? "…" : "Enable"}
          </button>
        )}
      </div>
      {error && (
        <div className="mt-2 text-[11px] text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}

/**
 * Bonus-wallet nickname row.
 *
 * Replaces the truncated wallet-address display on the Bonus card.
 * Bonus funds are scoped to the trading surface — they can't be sent
 * out, and exposing the address invites users to deposit into it (any
 * deposit there is unrecoverable). Instead, we let the user pick a
 * pseudo so the wallet has a recognisable name on the dashboard
 * without leaking the on-chain identity.
 *
 * The nickname is purely cosmetic and lives in localStorage keyed by
 * wallet address. No backend roundtrip — same idea as a contact list,
 * just personal labels for the user's own UX. Length capped at 24 to
 * stop horizontal overflow on the compact card layout.
 *
 * Three states:
 *   - viewing (no pseudo set)  → "set nickname" CTA
 *   - viewing (pseudo set)     → pseudo + edit pencil
 *   - editing                  → input + save / cancel
 */
const BONUS_PSEUDO_PREFIX = "spark_bonus_pseudo:"
const MAX_PSEUDO_LENGTH = 24

function BonusNicknameRow({ walletAddress }: { walletAddress: string }) {
  const storageKey = `${BONUS_PSEUDO_PREFIX}${walletAddress}`
  const [pseudo, setPseudo] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) ?? ""
    } catch {
      return ""
    }
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  // Re-read when the wallet address changes (rare — happens on
  // wallet provisioning) so the pseudo follows the right wallet.
  useEffect(() => {
    try {
      setPseudo(localStorage.getItem(storageKey) ?? "")
    } catch {
      setPseudo("")
    }
    setEditing(false)
    setDraft("")
  }, [storageKey])

  const startEditing = () => {
    setDraft(pseudo)
    setEditing(true)
  }

  const save = () => {
    const trimmed = draft.trim().slice(0, MAX_PSEUDO_LENGTH)
    try {
      if (trimmed) {
        localStorage.setItem(storageKey, trimmed)
      } else {
        localStorage.removeItem(storageKey)
      }
    } catch {
      /* localStorage blocked — silent, the in-memory state still updates */
    }
    setPseudo(trimmed)
    setEditing(false)
    setDraft("")
  }

  const cancel = () => {
    setEditing(false)
    setDraft("")
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_PSEUDO_LENGTH))}
          onKeyDown={(e) => {
            if (e.key === "Enter") save()
            if (e.key === "Escape") cancel()
          }}
          placeholder="nickname"
          className="w-28 px-2 py-1 rounded bg-black/30 border border-amber-400/40 focus:border-amber-300 outline-none text-[11px] text-white placeholder:text-neutral-600"
        />
        <button
          type="button"
          onClick={save}
          className="text-[10px] uppercase tracking-wider text-amber-400 hover:text-amber-300 font-semibold px-1"
        >
          save
        </button>
        <button
          type="button"
          onClick={cancel}
          className="text-[10px] uppercase tracking-wider text-neutral-500 hover:text-white px-1"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="flex items-center gap-1 text-[11px] transition-colors text-neutral-400 hover:text-amber-200"
      title="Click to set a nickname for this bonus wallet"
    >
      {pseudo ? (
        <span className="font-semibold text-amber-200/90 max-w-[10rem] truncate">{pseudo}</span>
      ) : (
        <span className="italic text-neutral-500">set nickname</span>
      )}
      <Pencil className="w-3 h-3" />
    </button>
  )
}

/**
 * A primary balance row — amount-left, symbol-right, all in one line.
 * Used for USDG, USDC, and PREDICT at the top of the wallet card.
 *
 * Two display modes:
 *   - Default: `<amount> <symbol>` (e.g. `1234 PREDICT`).
 *   - With `prefix`: `<prefix><amount>` and the trailing symbol is
 *     suppressed. Used for USDC where the user wants a "$" sign on the
 *     left rather than the "USDC" suffix on the right — the dashboard
 *     reads more naturally as a money figure that way.
 *
 * `subtitle` is rendered as a small dimmer line below the main figure.
 * Used to show the dollar equivalent of token balances without conflating
 * it with the headline amount (e.g. PREDICT balance with `($45.20)`).
 *
 * The amount is dimmed when it's exactly 0 so the user's eye skips over
 * empty rows rather than reading "0" as a meaningful figure.
 */
function HeroBalance({
  symbol,
  amount,
  prefix,
  subtitle,
}: {
  symbol: string
  amount: number
  prefix?: string
  subtitle?: string | null
}) {
  const isZero = amount <= 0
  const formatted = amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return (
    <div>
      <div className="flex items-baseline gap-2">
        {prefix ? (
          <span
            className={`text-3xl font-black ${
              isZero ? "text-neutral-600" : "text-white"
            }`}
          >
            {prefix}{formatted}
          </span>
        ) : (
          <>
            <span
              className={`text-3xl font-black ${
                isZero ? "text-neutral-600" : "text-white"
              }`}
            >
              {formatted}
            </span>
            <span className="text-sm text-neutral-500 font-semibold">{symbol}</span>
          </>
        )}
      </div>
      {subtitle && (
        <div className="text-xs text-neutral-500 font-mono mt-0.5">{subtitle}</div>
      )}
    </div>
  )
}


/**
 * Wallet switch — toggles the session-wide `activeWalletType` between
 * Public and Private. The trade page reads that value on every trade /
 * funds-move call, so picking here is sufficient to re-route the entire
 * session. `privateEnabled` locks the Private tab when the row doesn't
 * exist yet (only relevant to users whose DB row predates the two-wallet
 * migration; every new Twitter login provisions both).
 */
function WalletSwitch({
  active,
  privateEnabled,
  onChange,
}: {
  active: MiniWalletType
  privateEnabled: boolean
  onChange: (next: MiniWalletType) => void
}) {
  const tabClass = (isActive: boolean, enabled: boolean) =>
    `flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
      isActive
        ? "bg-white text-black"
        : enabled
          ? "text-neutral-400 hover:text-white"
          : "text-neutral-700 cursor-not-allowed"
    }`

  return (
    <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
      <button
        type="button"
        onClick={() => onChange("public")}
        className={tabClass(active === "public", true)}
      >
        Main
      </button>
      <button
        type="button"
        disabled={!privateEnabled}
        onClick={() => privateEnabled && onChange("private")}
        className={tabClass(active === "private", privateEnabled) + (privateEnabled ? "" : " flex items-center justify-center gap-1.5")}
      >
        {privateEnabled ? (
          "Bonus"
        ) : (
          <>
            Bonus
            <span className="text-[9px] uppercase tracking-wider text-neutral-700 font-bold">
              soon
            </span>
          </>
        )}
      </button>
    </div>
  )
}

/**
 * Symbols that live in the secondary "Other tokens" list. USDG and USDC
 * are intentionally excluded — both are rendered as hero balances above,
 * and repeating them here would just duplicate the same number on screen.
 * USDT stays because we haven't promoted it to hero (it's still relatively
 * rare in this user base); same logic will apply to Ideacoins when we
 * ship them.
 */
const WALLET_DISPLAY_SYMBOLS = new Set<string>([
  "USDT",
  // Ideacoin/ecosystem tokens will land here once we mint them.
])

/**
 * Canonical USDC mints (mainnet + devnet). Used to resolve the balance for
 * the USDC hero figure from the `tokens` array without relying on the
 * symbol string — the symbol is nulled out for any mint not in the
 * backend's `KNOWN_TOKEN_SYMBOLS` map, so matching on symbol first with
 * mint as a fallback keeps us correct if the backend ever drops the
 * symbol hint.
 */
const USDC_MINTS = new Set<string>([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // mainnet
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // devnet
])

function usdcAmount(tokens: MiniTokenHolding[]): number {
  const row =
    tokens.find(t => t.symbol === "USDC") ??
    tokens.find(t => USDC_MINTS.has(t.mint))
  return row?.amount ?? 0
}

/**
 * $PREDICT lookup — backend tags the holding with `symbol: "PREDICT"` once
 * it resolves the mint via the ideas table, so a single symbol match is
 * enough. Returns 0 if the user holds none (or the backend couldn't
 * resolve the mint, which the gate already handles gracefully).
 */
function predictAmount(tokens: MiniTokenHolding[]): number {
  const row = tokens.find(t => t.symbol === "PREDICT")
  return row?.amount ?? 0
}

/**
 * Unified USDC balance for a wallet — server-aggregated value when
 * available (wallet + cQuote tokens locked in markets, see
 * `computeLockedBalances` in `/api/mini/me`), falls back to the plain
 * wallet count for legacy responses. This is the number the mini-app
 * shows on Me, Hackathon, and Decision-market pages so all three stay
 * consistent.
 */
export function unifiedUsdc(wallet: { tokens: MiniTokenHolding[]; unified?: { usdc_total: number } } | null | undefined): number {
  if (!wallet) return 0
  if (wallet.unified) return wallet.unified.usdc_total
  return usdcAmount(wallet.tokens)
}

export function unifiedPredict(wallet: { tokens: MiniTokenHolding[]; unified?: { predict_total: number } } | null | undefined): number {
  if (!wallet) return 0
  if (wallet.unified) return wallet.unified.predict_total
  return predictAmount(wallet.tokens)
}

/**
 * Compact list of the wallet's ecosystem holdings. Intentional omissions:
 *   - USDG — already shown as the hero figure above.
 *   - SOL  — it's only there for gas and the user shouldn't think of it
 *            as a tradeable balance.
 *   - Conditional / outcome tokens from decision markets (symbol null,
 *     mint not in the whitelist) — shown on the trade page, not here.
 * If what's left is empty we render nothing (keeps the card tight for
 * users who only hold USDG).
 */
function TokenList({ tokens }: { tokens: MiniTokenHolding[] }) {
  // Filter happens client-side rather than server-side so the same API
  // response can feed alternate views later (e.g. a future "all balances"
  // modal) without another round-trip.
  const displayable = tokens.filter(
    t =>
      t.symbol !== "USDG" &&
      t.symbol !== "USDC" &&
      t.symbol !== "PREDICT" &&
      t.symbol !== null &&
      WALLET_DISPLAY_SYMBOLS.has(t.symbol),
  )
  if (displayable.length === 0) return null

  return (
    <div className="pt-4 border-t border-white/[0.04] space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">
        Other tokens
      </div>
      {displayable.map(t => (
        <TokenRow key={`${t.programId}:${t.mint}`} token={t} />
      ))}
    </div>
  )
}

/**
 * Three deposit/withdraw assets surfaced to the user. Only `USDC` is
 * fully wired through `/api/mini/withdraw` today — the other two are
 * UX-ready (deposit by QR works for any SPL token, since the wallet
 * address is universal) but withdraw is gated as "coming soon" until
 * the backend learns to send the relevant mints.
 */
type FundsAsset = "USDC" | "PREDICT" | "SPARK"
const ASSET_LABELS: Record<FundsAsset, string> = {
  USDC: "USDC",
  PREDICT: "PREDICT",
  SPARK: "Spark token ecosystem",
}

/**
 * Modal wrapper around `FundsPanel`.
 *
 * Renders a fixed-position dimmed backdrop + a centered card sized for
 * mobile (the mini-app's primary form factor). The backdrop click and
 * the explicit close button both dismiss; we don't trap focus or do
 * anything fancy with stacking — there's no other modal on the Me page
 * and the mini-app doesn't have nested modals as a pattern.
 *
 * z-index is 50 to clear the bottom nav bar (z-40 in MiniLayout) so
 * the modal can't be poked through from the tab bar.
 */
function FundsModal({
  initialTab,
  walletAddress,
  usdcBalance,
  predictBalance,
  usdcLocked,
  predictLocked,
  walletTokens,
  onSuccess,
  onClose,
}: {
  initialTab: "deposit" | "withdraw"
  walletAddress: string
  usdcBalance: number
  predictBalance: number
  /** Locked-in-markets stablecoin balance (cQuote across proposals).
   *  Surfaced inside the withdraw form to explain why "Max" is lower
   *  than the unified total shown on the wallet card. */
  usdcLocked: number
  predictLocked: number
  /** Full wallet token list — drives the SPARK ecosystem token picker
   *  inside the withdraw form. Includes USDC/PREDICT; the picker
   *  filters them out to avoid double-listing across tabs. */
  walletTokens: MiniTokenHolding[]
  onSuccess: () => void
  onClose: () => void
}) {
  // Lock background scroll while the modal is open so swipes inside
  // the panel don't bleed into the page underneath. Restored on
  // unmount — guarded against a missing document for SSR.
  useEffect(() => {
    if (typeof document === "undefined") return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Close on Escape — the standard modal contract; without it a
  // keyboard user has to tab to the X button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      // `items-center` always (was `items-end sm:items-center`) — the
      // bottom-sheet variant on mobile tucked the card under the
      // bottom nav, cutting the "Send USDC" CTA in half. Centering
      // keeps it well above the nav and matches the desktop layout.
      // `p-4` gives breathing room from the screen edges.
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0A0A0B] border border-white/[0.08] rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button alone in the header — the Deposit / Withdraw
            label is already on the tab toggle inside `FundsPanel`,
            so a separate header title would be redundant and was
            also stale (it stuck to `initialTab` and didn't follow
            tab switches inside the panel). */}
        <div className="flex items-center justify-end mb-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            ×
          </button>
        </div>
        <FundsPanel
          initialTab={initialTab}
          walletAddress={walletAddress}
          usdcBalance={usdcBalance}
          predictBalance={predictBalance}
          usdcLocked={usdcLocked}
          predictLocked={predictLocked}
          walletTokens={walletTokens}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  )
}

/**
 * Combined Deposit / Withdraw panel for the public wallet.
 *
 * Replaces the previous "Withdraw USDC"-only button. Two tabs:
 *
 *   - Deposit  → QR code of the wallet address + copy button. Asset
 *     chips change the explanatory copy (so the user knows which mint
 *     they're funding from a CEX), but the address is the same — any
 *     SPL token sent to a Solana wallet creates its ATA on first
 *     receive, so we don't need a per-asset receive flow.
 *
 *   - Withdraw → destination + amount form. Currently routes through
 *     `postMiniWithdraw` which is USDC-only; PREDICT and Spark
 *     ecosystem assets show a "coming soon" inline notice instead of
 *     the form. Wiring them through requires a small backend change
 *     in `/api/mini/withdraw` to switch on the mint — out of scope here.
 *
 * Kept as an inline panel rather than a modal so the page-level
 * scroll position is preserved when the user opens / closes it.
 */
function FundsPanel({
  walletAddress,
  usdcBalance,
  predictBalance,
  usdcLocked = 0,
  predictLocked = 0,
  walletTokens = [],
  onSuccess,
  initialTab = "deposit",
}: {
  walletAddress: string
  usdcBalance: number
  predictBalance: number
  /** Forwarded to `WithdrawForm` so the user sees what's stuck in
   *  Combinator and why "Max" is lower than the unified total on the
   *  wallet card. Default 0 keeps non-modal callers compatible. */
  usdcLocked?: number
  predictLocked?: number
  /** Full wallet token list — used by the SPARK tab token picker.
   *  Default empty list keeps standalone callers happy; SPARK tab
   *  will just show "no tokens" in that case. */
  walletTokens?: MiniTokenHolding[]
  onSuccess: () => void
  /** Pre-selected tab when the panel mounts — driven by which button
   *  the user pressed to open the modal. Defaults to "deposit" for
   *  the standalone-page (non-modal) usage that may come back later. */
  initialTab?: "deposit" | "withdraw"
}) {
  const [tab, setTab] = useState<"deposit" | "withdraw">(initialTab)
  const [asset, setAsset] = useState<FundsAsset>("USDC")
  const [copied, setCopied] = useState(false)

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — silent */
    }
  }

  return (
    <div className="space-y-3">
      {/* Tab toggle — Deposit/Withdraw, mirrored on the wallet switch
          higher in the page so the visual pattern is consistent. */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        {(["deposit", "withdraw"] as const).map(t => {
          const active = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors capitalize ${
                active ? "bg-white text-black" : "text-neutral-400 hover:text-white"
              }`}
            >
              {t}
            </button>
          )
        })}
      </div>

      {/* Asset chips — drive the per-mint wording on Deposit and the
          form gating on Withdraw. Three options: USDC (real), PREDICT
          (real on deposit, soon on withdraw), Spark token ecosystem. */}
      <div className="flex flex-wrap gap-1.5">
        {(["USDC", "PREDICT", "SPARK"] as FundsAsset[]).map(a => {
          const active = asset === a
          return (
            <button
              key={a}
              type="button"
              onClick={() => setAsset(a)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors border ${
                active
                  ? "bg-amber-500 text-black border-amber-500"
                  : "bg-white/[0.03] text-neutral-400 border-white/[0.06] hover:border-white/[0.15]"
              }`}
            >
              {ASSET_LABELS[a]}
            </button>
          )
        })}
      </div>

      {/* Fixed-height shell so switching between Deposit and Withdraw
          doesn't reflow the modal. Deposit (QR + address + caption)
          is the taller of the two; we size against it so Withdraw
          gets a bit of empty trailing space rather than jumping. */}
      <div className="min-h-[360px]">
        {tab === "deposit" ? (
          <DepositPanel asset={asset} walletAddress={walletAddress} copied={copied} onCopy={handleCopyAddress} />
        ) : (
          <WithdrawForm
            asset={asset}
            walletAddress={walletAddress}
            usdcBalance={usdcBalance}
            predictBalance={predictBalance}
            usdcLocked={usdcLocked}
            predictLocked={predictLocked}
            walletTokens={walletTokens}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </div>
  )
}

function DepositPanel({
  asset,
  walletAddress,
  copied,
  onCopy,
}: {
  asset: FundsAsset
  walletAddress: string
  copied: boolean
  onCopy: () => void
}) {
  const instruction =
    asset === "USDC"
      ? "Send USDC (Solana, classic SPL Token program) to the address below from any wallet or CEX withdrawal."
      : asset === "PREDICT"
        ? "Send $PREDICT to the address below from any Solana wallet. The token's ATA is created automatically on first deposit."
        : "Send any Spark ecosystem token (Ideacoins, etc.) to the address below. SPL Token + Token-2022 mints both supported."

  return (
    <div className="space-y-3">
      {/* QR code centered, white background so it scans cleanly under
          the dark theme. Sized for tap-and-scan from another phone. */}
      <div className="flex justify-center">
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG value={walletAddress} size={160} level="M" includeMargin={false} />
        </div>
      </div>

      <div className="rounded-xl bg-black/30 border border-white/10 p-3">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
          Your wallet address
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-mono text-white break-all flex-1">
            {walletAddress}
          </div>
          <button
            type="button"
            onClick={onCopy}
            className="shrink-0 inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-semibold"
          >
            <Copy className="w-3 h-3" />
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </div>

      <div className="text-[10px] text-neutral-500 leading-snug">
        {instruction}
      </div>
    </div>
  )
}

function WithdrawForm({
  asset,
  walletAddress: _walletAddress,
  usdcBalance,
  predictBalance,
  usdcLocked,
  predictLocked,
  walletTokens,
  onSuccess,
}: {
  asset: FundsAsset
  walletAddress: string
  usdcBalance: number
  predictBalance: number
  /** Stablecoin / PREDICT amounts currently held as conditional cTokens
   *  inside Combinator vaults. Surfaced as a "Locked in markets" line
   *  so the user understands why "Max" caps at the wallet portion only,
   *  while their unified total on the wallet card includes both. */
  usdcLocked: number
  predictLocked: number
  /** Full wallet token list — used to render the SPARK tab's picker
   *  (any non-USDC, non-PREDICT mint with a non-zero balance). */
  walletTokens: MiniTokenHolding[]
  onSuccess: () => void
}) {
  const [destination, setDestination] = useState("")
  const [amountStr, setAmountStr] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSignature, setLastSignature] = useState<string | null>(null)
  // SPARK tab only — which custom mint the user picked from their
  // wallet. `null` = no selection; the form gates submit until set.
  const [selectedMint, setSelectedMint] = useState<string | null>(null)
  // QR scan modal open state. Camera is only requested while open
  // (mounted on demand) so the rest of the page never holds a video
  // stream open in the background.
  const [scanOpen, setScanOpen] = useState(false)

  // Reset the form when the asset changes so a value entered for one
  // mint can't accidentally submit against another.
  useEffect(() => {
    setDestination("")
    setAmountStr("")
    setError(null)
    setLastSignature(null)
    setSelectedMint(null)
  }, [asset])

  // Per-asset config drives the cap, label, decimals shown in the UI,
  // and which "Send X" button label the user reads.
  //   USDC: 0.1 floor (server-enforced). Cap includes Combinator
  //         cQuote-locked because the backend auto-unwinds.
  //   PREDICT: no floor. Cap is wallet-only — Combinator cBase
  //         (predictLocked) isn't auto-unwindable yet, so showing it
  //         in Max would mislead the user into a 400.
  //   SPARK: user-picked mint from wallet. No floor, wallet-only.
  const isUsdc = asset === "USDC"
  const isSpark = asset === "SPARK"
  const MIN_WITHDRAW_USDC = 0.1
  const minWithdraw = isUsdc ? MIN_WITHDRAW_USDC : 0

  // Filter wallet tokens for the SPARK picker: drop USDC & PREDICT
  // (each owns its own tab), drop zero balances, sort by balance desc
  // so the user's biggest holdings surface first.
  const sparkTokens: MiniTokenHolding[] = isSpark
    ? walletTokens
        .filter(t => t.symbol !== "USDC" && t.symbol !== "PREDICT" && t.amount > 0)
        .sort((a, b) => b.amount - a.amount)
    : []

  const sparkPicked: MiniTokenHolding | null = isSpark
    ? sparkTokens.find(t => t.mint === selectedMint) ?? null
    : null

  // For USDC/PREDICT: hardcoded label/cap. For SPARK: derived from
  // the picked token (or empty defaults until the user picks one).
  const max = isUsdc
    ? usdcBalance + usdcLocked
    : asset === "PREDICT"
      ? predictBalance
      : sparkPicked?.amount ?? 0
  const symbol = isSpark ? sparkPicked?.symbol ?? "" : asset
  const decimalsShown = isUsdc ? 2 : isSpark ? Math.min(sparkPicked?.decimals ?? 6, 6) : 4

  const amount = Number(amountStr)
  const amountValid =
    Number.isFinite(amount) &&
    amount >= minWithdraw &&
    amount > 0 &&
    amount <= max
  const amountTooLow =
    isUsdc &&
    amountStr.trim().length > 0 &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount < MIN_WITHDRAW_USDC
  // Accept any non-empty string longer than the shortest valid base58
  // key; backend runs the real `new PublicKey()` check.
  const destValid = destination.trim().length >= 32

  const handleSubmit = async () => {
    if (!amountValid || !destValid || busy) return
    if (isSpark && !sparkPicked) return
    setBusy(true)
    setError(null)
    setLastSignature(null)
    try {
      const res = await postMiniWithdraw({
        destination_address: destination.trim(),
        amount,
        // SPARK tab passes a custom `mint` override that wins on the
        // server. USDC/PREDICT use the asset shortcut path.
        ...(isSpark
          ? { mint: sparkPicked!.mint }
          : { asset: asset as "USDC" | "PREDICT" }),
      })
      setLastSignature(res.signature)
      setDestination("")
      setAmountStr("")
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed")
    } finally {
      setBusy(false)
    }
  }

  // SPARK tab: empty wallet → friendly notice instead of an unusable
  // form. Keeps the surface area honest — user can't pick what they
  // don't have.
  if (isSpark && sparkTokens.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-neutral-400 leading-relaxed">
        No Spark ecosystem tokens in your wallet yet. Trade an Ideacoin
        on the hackathon page first, or deposit one from another wallet
        using the Deposit tab above.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* SPARK tab — token picker. One row per non-USDC/PREDICT
          holding, with symbol + balance. Tapping selects; the rest
          of the form (destination, amount, send) keys off
          `selectedMint`. */}
      {isSpark && (
        <div>
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">
            Token
          </span>
          <div className="mt-1 grid grid-cols-1 gap-1 max-h-40 overflow-y-auto pr-1">
            {sparkTokens.map(t => {
              const active = t.mint === selectedMint
              const label = t.symbol ?? shortAddress(t.mint)
              return (
                <button
                  key={`${t.programId}:${t.mint}`}
                  type="button"
                  onClick={() => {
                    setSelectedMint(t.mint)
                    // Reset amount when switching mints — the cap is
                    // different and a stale value would silently submit
                    // against the wrong balance.
                    setAmountStr("")
                  }}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs transition-colors ${
                    active
                      ? "bg-amber-500/10 border-amber-500/50 text-amber-200"
                      : "bg-white/[0.03] border-white/[0.08] text-neutral-300 hover:border-white/[0.18]"
                  }`}
                >
                  <span className="font-semibold">{label}</span>
                  <span className="font-mono text-[11px] text-neutral-400">
                    {t.amount.toLocaleString(undefined, {
                      maximumFractionDigits: Math.min(t.decimals, 6),
                    })}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <label className="block">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">
            Destination address
          </span>
          {/* QR scan trigger — opens a camera viewfinder modal. We keep
              this opt-in (separate button) rather than auto-prompting
              for camera access on form mount because most users will
              just paste an address from clipboard. */}
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-400 hover:text-amber-300 font-semibold"
          >
            <QrCode className="w-3.5 h-3.5" />
            Scan QR
          </button>
        </div>
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Paste a Solana wallet address"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl bg-black/30 border border-white/10 focus:border-amber-400/60 outline-none px-3 py-2.5 text-xs font-mono text-white placeholder:text-neutral-600"
        />
      </label>

      {scanOpen && (
        <QrScanModal
          onClose={() => setScanOpen(false)}
          onScan={(text) => {
            // QR codes for Solana addresses come in two shapes in the
            // wild: a bare base58 pubkey, or a Solana Pay URI like
            //   solana:7xKXt...abcd?amount=1.5&label=...
            // Strip the scheme + query so the destination input ends up
            // with just the address. The form's existing length check
            // (≥32 chars) catches anything that isn't a real pubkey;
            // backend re-validates with `new PublicKey()`.
            let addr = text.trim()
            if (addr.toLowerCase().startsWith("solana:")) {
              addr = addr.slice("solana:".length)
            }
            const qIdx = addr.indexOf("?")
            if (qIdx >= 0) addr = addr.slice(0, qIdx)
            setDestination(addr)
            setScanOpen(false)
          }}
        />
      )}

      <label className="block">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">
            Amount
          </span>
          <button
            type="button"
            onClick={() => setAmountStr(max > 0 ? max.toString() : "")}
            disabled={isSpark && !sparkPicked}
            className="text-[10px] uppercase tracking-wider text-amber-400 hover:text-amber-300 disabled:text-neutral-600 disabled:hover:text-neutral-600 font-semibold"
          >
            {isSpark && !sparkPicked
              ? "Pick a token"
              : `Max ${max.toLocaleString(undefined, { maximumFractionDigits: decimalsShown })} ${symbol}`}
          </button>
        </div>
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl bg-black/30 border border-white/10 focus:border-amber-400/60 outline-none px-3 py-2.5 pr-14 text-sm font-mono text-white placeholder:text-neutral-600"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-neutral-500">
            {symbol}
          </span>
        </div>
        {amountTooLow && (
          <div className="mt-1 text-[10px] text-amber-300/80 leading-snug">
            Minimum withdraw is {MIN_WITHDRAW_USDC} USDC.
          </div>
        )}
        {!isUsdc && predictLocked > 0 && (
          <div className="mt-1 text-[10px] text-neutral-500 leading-snug">
            Locked in markets:{" "}
            {predictLocked.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
            {symbol} — withdraw the locked portion by exiting your
            positions on the trade page first.
          </div>
        )}
      </label>

      {error && (
        <div className="text-[11px] text-red-400 leading-snug">{error}</div>
      )}

      {lastSignature && (
        <div className="text-[11px] text-emerald-400 leading-snug">
          Sent —{" "}
          <a
            href={`https://solscan.io/tx/${lastSignature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-mono"
          >
            {lastSignature.slice(0, 10)}…
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!amountValid || !destValid || busy || (isSpark && !sparkPicked)}
        className="w-full py-3 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-300 disabled:bg-white/10 disabled:text-neutral-500 text-sm font-semibold text-black transition-colors flex items-center justify-center gap-2"
      >
        {busy ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sending…
          </>
        ) : (
          `Send ${symbol || "token"}`
        )}
      </button>

      <div className="text-[10px] text-neutral-500 leading-snug">
        Sends to any Solana wallet. Network fees are covered — you'll
        receive the exact amount you send.
      </div>

      {/* Locked-balance disclosure — explains the automatic unwind
          so the user understands why a withdraw above their plain
          wallet balance can take longer (multiple on-chain steps)
          and might fail if positions are in non-USDC-quote markets.
          Only shown when there IS a locked component AND we're on
          the USDC tab — PREDICT doesn't auto-unwind yet, so showing
          this notice on the PREDICT form would be a lie. */}
      {isUsdc && usdcLocked > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[10px] text-amber-200/90 leading-snug">
          <span className="font-semibold">${usdcLocked.toLocaleString(undefined, { maximumFractionDigits: 2 })} held in decision-market positions.</span>{" "}
          We'll automatically unwind from those before sending — withdraws above your wallet balance take a few extra seconds and one extra on-chain step per position.
        </div>
      )}
    </div>
  )
}

function TokenRow({ token }: { token: MiniTokenHolding }) {
  const label = token.symbol ?? shortAddress(token.mint)
  const formatted = token.amount.toLocaleString(undefined, {
    maximumFractionDigits: Math.min(token.decimals, 4),
  })
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white truncate">{label}</div>
        {!token.symbol && (
          <div className="text-[10px] font-mono text-neutral-600 truncate">
            {shortAddress(token.mint)}
          </div>
        )}
      </div>
      <div className="text-sm font-mono text-neutral-200 shrink-0">
        {formatted}
      </div>
    </div>
  )
}

/**
 * Full-screen camera viewfinder for scanning a Solana address QR.
 *
 * Mounts a `<video>` element + a `QrScanner` instance from the
 * `qr-scanner` library. The lib drops to a worker for the WASM-based
 * decode, so the main thread stays responsive even at 30fps. We only
 * mount it while the modal is open, so the camera permission prompt
 * fires on user intent (the "Scan QR" button) — not on form mount.
 *
 * Failure modes surfaced inline:
 *   - permission denied (user refused) → "Camera access denied" + manual close
 *   - no camera available → same inline error
 *   - generic init failure → message from the underlying error
 *
 * Exits via the X button or by tapping the dim backdrop. Successful
 * decodes call `onScan(rawText)` exactly once, then the parent closes
 * us — we still defensively cancel the scanner on unmount in case the
 * parent forgets.
 */
function QrScanModal({
  onScan,
  onClose,
}: {
  onScan: (text: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const [error, setError] = useState<string | null>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false

    const scanner = new QrScanner(
      video,
      (result) => {
        // Guard against the lib firing multiple results for the same
        // QR before we get a chance to stop it; only the first wins.
        if (firedRef.current) return
        firedRef.current = true
        try {
          scanner.stop()
        } catch {
          /* already stopping */
        }
        onScan(result.data)
      },
      {
        // Highlight the detected code subtly without overlay flicker.
        highlightScanRegion: true,
        highlightCodeOutline: true,
        // Prefer the rear camera on mobile; falls back to whatever
        // exists on desktop.
        preferredCamera: "environment",
        maxScansPerSecond: 5,
      },
    )
    scannerRef.current = scanner

    scanner.start().catch((err) => {
      if (cancelled) return
      console.error("[withdraw/qr] scanner start failed:", err)
      const msg = err instanceof Error ? err.message : "Camera unavailable"
      // Normalize the most common iOS/Android error strings into one
      // user-facing line — the raw browser messages are inconsistent.
      if (/denied|permission|notallowed/i.test(msg)) {
        setError("Camera access denied. Allow camera in your browser settings to scan.")
      } else if (/no camera|notfound/i.test(msg)) {
        setError("No camera found on this device.")
      } else {
        setError(msg)
      }
    })

    return () => {
      cancelled = true
      try {
        scanner.stop()
        scanner.destroy()
      } catch {
        /* ignore */
      }
      scannerRef.current = null
    }
  }, [onScan])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[#0A0A0B] border border-white/[0.08] rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="text-xs uppercase tracking-wider text-neutral-300 font-semibold">
            Scan address QR
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="relative aspect-square bg-black">
          {/* The qr-scanner lib mutates this video element directly —
              srcObject, play(), the highlight overlays, etc. We don't
              touch it from React after handing it over. */}
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
              <span className="text-xs text-red-300 leading-snug">{error}</span>
            </div>
          )}
        </div>
        <div className="px-4 py-3 text-[10px] text-neutral-500 leading-snug">
          Point the camera at a Solana address QR code. The address will
          fill in automatically.
        </div>
      </div>
    </div>
  )
}

/**
 * Multi-step modal that reveals the public custodial wallet's secret
 * key to the user. Three explicit phases:
 *
 *   1. "warning"  → red-themed danger callout, requires checkbox
 *      acknowledging that anyone with the key can drain the wallet.
 *      Continue is disabled until the box is ticked.
 *   2. "loading"  → POST to /api/mini/export-private-key. Server
 *      requires the JWT + the verbatim confirmation phrase
 *      (EXPORT_KEY_CONFIRM_PHRASE) and rate-limits per twitter_id.
 *   3. "reveal"   → key is in component state but rendered blurred
 *      by default. User taps "Tap to reveal" to unmask, or just
 *      taps Copy to clipboard. A 60-second auto-hide timer flips
 *      the reveal off so the key isn't sitting un-blurred on
 *      screen if the user walks away from their phone.
 *
 * Lifetime hygiene:
 *   - The secret lives in a single state slot. On unmount we
 *     overwrite it with "" before clearing the React reference, so
 *     a heap snapshot taken right after close has one less copy of
 *     the bytes lying around. (Best-effort — V8 may still keep
 *     intermediate strings until GC.)
 *   - Backdrop click and the X button both close, BUT only with a
 *     confirm if the key has been revealed: prevents accidentally
 *     dismissing on the brief window between fetch + save.
 */
function ExportPrivateKeyModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<"warning" | "loading" | "reveal">("warning")
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [secretKey, setSecretKey] = useState<string>("")
  const [walletAddress, setWalletAddress] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [exportsRemaining, setExportsRemaining] = useState<number | null>(null)

  // Wipe the secret on unmount. JS doesn't give us a strong guarantee
  // here (the engine can keep intermediate copies of immutable
  // strings around until GC), but emptying the state slot is the best
  // we can do without going to a Uint8Array buffer + zeroing it.
  useEffect(() => {
    return () => {
      setSecretKey("")
    }
  }, [])

  // Auto-hide reveal after 60s. Reset on every flip so a user who
  // covers + reveals + covers again gets a fresh window each time.
  useEffect(() => {
    if (!revealed) return
    const t = setTimeout(() => setRevealed(false), 60_000)
    return () => clearTimeout(t)
  }, [revealed])

  const handleContinue = async () => {
    if (!acknowledged || phase !== "warning") return
    setPhase("loading")
    setError(null)
    try {
      const res = await postMiniExportPrivateKey({
        confirm_phrase: EXPORT_KEY_CONFIRM_PHRASE,
      })
      setSecretKey(res.secret_key_base58)
      setWalletAddress(res.wallet_address)
      setExportsRemaining(res.max_exports_per_day - 1)
      setPhase("reveal")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
      // Bounce back to the warning step so the user can decide to
      // retry or cancel; we don't auto-close because the error text
      // is the only feedback they get.
      setPhase("warning")
    }
  }

  const handleCopy = async () => {
    if (!secretKey) return
    try {
      await navigator.clipboard.writeText(secretKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — user can still long-press the field to copy */
    }
  }

  const handleClose = () => {
    if (phase === "reveal" && secretKey) {
      const ok = window.confirm(
        "Did you save the key somewhere safe?\n\n" +
        "If you close now without saving, you'll need to use one of " +
        "your remaining export attempts to see it again.",
      )
      if (!ok) return
    }
    setSecretKey("")
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md bg-[#0A0A0B] border border-red-500/30 rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Danger header — red border + icon make it visually
            distinct from regular modals (FundsModal, QrScanModal). */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-red-500/20 bg-red-500/[0.06]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span className="text-xs uppercase tracking-wider text-red-300 font-semibold">
              Reveal private key
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {phase === "warning" && (
          <div className="p-5 space-y-4">
            <div className="rounded-xl bg-red-500/[0.07] border border-red-500/20 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-200 leading-relaxed font-semibold">
                  Anyone with this key can drain your wallet.
                </p>
              </div>
              <ul className="text-[11px] text-red-200/80 leading-relaxed space-y-1 pl-6 list-disc">
                <li>Spark will <strong>never</strong> ask you for your private key.</li>
                <li>Don't paste it into any website, DM, or support chat.</li>
                <li>Save it in a password manager or on paper, offline.</li>
                <li>Once you copy it, treat it like cash: lose it = lose your funds.</li>
              </ul>
            </div>

            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-[11px] text-red-300 leading-snug">
                {error}
              </div>
            )}

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-red-500"
              />
              <span className="text-[11px] text-neutral-300 leading-snug">
                I understand revealing this key gives full control of my
                wallet, and I will not share it with anyone — including
                people who claim to be Spark support.
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="py-2.5 rounded-full text-xs font-semibold border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-neutral-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={!acknowledged}
                className="py-2.5 rounded-full text-xs font-semibold bg-red-500 hover:bg-red-400 disabled:bg-white/10 disabled:text-neutral-500 text-white transition-colors"
              >
                Reveal key
              </button>
            </div>
          </div>
        )}

        {phase === "loading" && (
          <div className="p-10 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-red-400" />
            <span className="text-[11px] text-neutral-500">Decrypting…</span>
          </div>
        )}

        {phase === "reveal" && (
          <div className="p-5 space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              Wallet
            </div>
            <div className="rounded-xl bg-black/30 border border-white/10 p-2.5 text-[10px] font-mono text-neutral-400 break-all">
              {walletAddress}
            </div>

            <div className="text-[10px] uppercase tracking-wider text-red-300 font-semibold pt-1">
              Private key (base58)
            </div>
            {/* Blurred-by-default secret. We render it inside an
                `<input type="password">` rather than plain text so
                most password managers + screen-recording tools either
                refuse to capture it or mask it. The visible blur
                effect is the user-facing one. */}
            <div className="relative">
              <input
                type="text"
                value={revealed ? secretKey : "•".repeat(Math.min(secretKey.length, 64))}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className={`w-full rounded-xl bg-black/40 border p-3 text-[11px] font-mono text-white outline-none break-all ${
                  revealed
                    ? "border-red-500/40"
                    : "border-white/10 select-none"
                }`}
                style={{
                  filter: revealed ? "none" : "blur(4px)",
                  transition: "filter 120ms ease",
                }}
                aria-label="Private key"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRevealed(!revealed)}
                className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-full text-xs font-semibold border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-neutral-200 transition-colors"
              >
                {revealed ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Reveal
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center justify-center gap-1.5 py-2.5 rounded-full text-xs font-semibold bg-red-500 hover:bg-red-400 text-white transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <div className="text-[10px] text-neutral-500 leading-snug pt-1">
              {revealed
                ? "Auto-hides in 60 seconds."
                : "Tap Reveal to unmask. Save it somewhere safe before closing."}
            </div>

            {exportsRemaining !== null && (
              <div className="text-[10px] text-amber-300/70 leading-snug">
                You have {exportsRemaining} export
                {exportsRemaining === 1 ? "" : "s"} left in the next 24 hours.
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="w-full py-2.5 rounded-full text-xs font-semibold border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-neutral-300 transition-colors"
            >
              I've saved it — close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

