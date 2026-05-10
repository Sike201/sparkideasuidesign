/**
 * MiniTradePage — `/m/trade/:proposalPda` (and `/m/trade` index)
 *
 * Custom mobile-first trade UI for a Combinator decision market. Much
 * simpler than the desktop `CombinatorTrade` component:
 *   - No chat, no history, no redeem tab — just trade
 *   - Option cards instead of a dropdown
 *   - Single numeric input + BUY/SELL toggle + "Trade" CTA
 *   - Signs via `/api/custodial-trade` with the session-wide wallet_type
 *     picked on `/m/me` (localStorage via useMiniAuth)
 *
 * Without a :proposalPda in the URL we render an informational screen
 * pointing the user to `/m/hackathons` to pick a market.
 *
 * SECURITY NOTE: `/api/custodial-trade` currently doesn't verify the
 * mini-app JWT — it trusts `twitter_id` from the body. This is a known
 * pre-existing gap we'll close in a follow-up before shipping to prod.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "react-toastify"
import { Loader2, Trophy, TrendingUp, TrendingDown, Lock, Shield, Users, Timer, ChevronDown, ChevronUp } from "lucide-react"
import { useMiniAuth } from "@/hooks/useMiniAuth"
import { PublicKey } from "@solana/web3.js"
import { getProposalMarketStatus } from "@/services/combinatorService"
import type { MarketOption, MarketStatus } from "@/services/combinatorService"
import { sdkGetBalances, sdkQuote, type SdkBalances } from "@/services/combinatorSdk"
import { backendSparkApi } from "@/data/api/backendSparkApi"
import type { HackathonModel } from "@/data/api/backendSparkApi"
import { getMiniMe, MiniAuthError } from "@/data/api/miniApi"
import type { MiniMeResponse } from "@/data/api/miniApi"
import CombinatorChart from "@/components/Combinator/CombinatorChart"
import {
  readCache,
  writeCache,
  MINI_CACHE_KEYS,
  ME_CACHE_PLACEHOLDER_MAX_MS,
  HACKATHONS_CACHE_MAX_MS,
} from "@/utils/miniCache"
import MiniLayout from "@/components/Mini/MiniLayout"
import { ROUTES } from "@/utils/routes"

const LAST_TRADED_PROPOSAL_KEY = "spark_mini_last_proposal_pda"

/**
 * Pick the best hackathon to drop the user into when they tap "Trade" in
 * the bottom nav without a proposal PDA. Priority (revised):
 *   1. The last market they traded — IF it's still live. Preserves the
 *      session for active traders without ever stranding them on an old
 *      market that has since settled.
 *   2. Any other LIVE (open/voting) hackathon in the list.
 *   3. The last market they traded, even if completed (better than
 *      nothing if no live markets exist).
 *   4. Anything with a proposal PDA, as a last resort.
 *
 * Why we used to put `lastPda` first: assumed users always want to
 * resume their last session. In practice, users wanting to "trade the
 * current thing" tap the Trade tab and expect it to surface the LIVE
 * market — finding a stale settled market there is confusing and was
 * the bug a user reported.
 *
 * Returns the proposal PDA to redirect to, or `null` when nothing fits.
 */
function pickDefaultProposal(hackathons: HackathonModel[]): string | null {
  const withProposal = hackathons.filter(h => !!h.combinator_proposal_pda)
  if (withProposal.length === 0) return null

  let lastPda: string | null = null
  try {
    lastPda = localStorage.getItem(LAST_TRADED_PROPOSAL_KEY)
  } catch {
    /* private mode — fall through to the live-market pick */
  }

  const now = Date.now()
  const isLive = (h: HackathonModel) => {
    if (h.status === "completed") return false
    const start = h.start_date ? new Date(h.start_date).getTime() : null
    const end = h.end_date ? new Date(h.end_date).getTime() : null
    if (start && end) return now >= start && now < end
    return h.status === "open" || h.status === "voting"
  }

  // 1. Last market IF still live → resume the session cleanly.
  if (lastPda) {
    const lastHack = withProposal.find(h => h.combinator_proposal_pda === lastPda)
    if (lastHack && isLive(lastHack)) return lastPda
  }
  // 2. First live market we find.
  const live = withProposal.find(isLive)
  if (live?.combinator_proposal_pda) return live.combinator_proposal_pda
  // 3. Last traded if it still exists in the list (even if not live).
  if (lastPda && withProposal.some(h => h.combinator_proposal_pda === lastPda)) {
    return lastPda
  }
  // 4. Whatever's first in the list.
  return withProposal[0].combinator_proposal_pda ?? null
}

/**
 * Quick-pick amounts as percentages of the user's available balance. We
 * moved away from fixed dollar chips (1/5/10/25) because they're meaningless
 * once the user's wallet has more or less than that — a $50 stack never
 * used the $25 chip, and a $1000 stack never used any of them. Percentages
 * always map to a real action ("half my USDG on this", "all in"), which is
 * also the pattern the desktop CombinatorTrade already uses.
 */
const QUICK_PERCENTS = [25, 50, 75, 100] as const

/**
 * Derive human-readable option labels for a hackathon's decision market,
 * mirroring the priority order used by the desktop HackathonDetailPage:
 *   1. Explicit `combinator_option_labels` (stored as string[] or JSON)
 *   2. `["No", ...builder_usernames]` from shortlisted proposals
 *   3. `["No", ...builder_usernames]` from all proposals
 *   4. `undefined` — let the SDK fall back to "Option N"
 */
/**
 * Live countdown to a target ISO timestamp. Updates every second
 * while mounted, returns `null` when no target is set or the
 * deadline has passed (so the caller can hide the chip cleanly
 * rather than render "00d 00h 00m 00s" on a finished market).
 *
 * Mirror of the helper in `MiniHackathonDetailPage` — kept in two
 * places rather than promoted to a shared module because both pages
 * have the same trivial impl and a shared module would just be
 * extra boilerplate for ~15 lines.
 */
function useCountdown(target: string | undefined): string | null {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!target) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  if (!target) return null
  const diff = Math.max(0, new Date(target).getTime() - now)
  if (diff === 0) return null
  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff % 86_400_000) / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  const s = Math.floor((diff % 60_000) / 1000)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`
}

function deriveOptionLabels(h: HackathonModel | undefined): string[] | undefined {
  if (!h) return undefined

  if (h.combinator_option_labels) {
    try {
      const parsed =
        typeof h.combinator_option_labels === "string"
          ? JSON.parse(h.combinator_option_labels)
          : h.combinator_option_labels
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[]
    } catch {
      /* malformed JSON — fall through to proposal-based derivation */
    }
  }

  const proposals = h.proposals ?? []
  const shortlisted = proposals.filter(p => p.shortlisted)
  const pool = shortlisted.length > 0 ? shortlisted : proposals
  if (pool.length > 0) {
    return ["No", ...pool.map(p => p.builder?.username || p.title || "Builder")]
  }
  return undefined
}

/**
 * Tiny countdown hook — re-renders every second until `endTime` passes.
 * Returns a formatted "Xh Ym Zs" string, "ENDED", or `null` if no end time.
 */
function useEndCountdown(endTime: number | undefined): string | null {
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => {
    if (!endTime) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [endTime])
  if (!endTime) return null
  const diff = Math.max(0, endTime - nowMs)
  if (diff === 0) return "ENDED"
  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff % 86_400_000) / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  const s = Math.floor((diff % 60_000) / 1000)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}h ${pad(m)}m ${pad(s)}s`
}

/**
 * Win-probability heuristic mirrored from the desktop CombinatorMarket
 * stats bar. TWAP inertia: the closer we get to finalization with a
 * sustained lead, the harder it is for runners-up to catch up. Maps
 * `gap / timeLeft` through a sigmoid to a 50..99% range.
 */
function computeWinPct(market: MarketStatus): number | null {
  if (!market.leadingOption) return null
  if (market.isFinalized) return 100
  const twaps = market.options.map(o => o.twapPrice).sort((a, b) => b - a)
  const top = twaps[0] || 0
  const second = twaps[1] || 0
  const gap = top > 0 ? (top - second) / top : 0
  const totalDuration = (market.endTime - market.startTime) || 1
  const remaining = Math.max(0, market.endTime - Date.now())
  const timeLeft = remaining / totalDuration
  if (timeLeft <= 0) return 99
  const difficulty = gap / timeLeft
  return Math.min(99, Math.round(50 + 49 * (1 - Math.exp(-3 * difficulty))))
}

/**
 * Fire-and-forget haptic. iOS Safari doesn't implement Vibration API, so
 * feature-check and treat the absence as a silent no-op — anything else
 * would just be noise in the console for half our users.
 */
function haptic(pattern: number | number[]) {
  if (typeof navigator === "undefined") return
  if (typeof navigator.vibrate !== "function") return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* some WebViews throw instead of returning false — ignore */
  }
}

/**
 * Reduce a raw Solana / web3.js / SDK error to a single human line for
 * a toast. The native error frequently includes the full simulation
 * dump ("Program <programId> log: Instruction: ... Error: insufficient
 * funds ... consumed N of M compute units ...") which is useless on
 * mobile and just panics the user. We pattern-match the common cases
 * and fall back to a generic "Trade failed" so we never surface a
 * 500-line log to the screen.
 *
 * Hoisted to module scope so both `MiniTradePage` (trade flow) and the
 * sub-component that handles redeem can share the same mapping.
 */
function friendlyTradeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "")
  if (!raw) return "Trade failed"
  const lower = raw.toLowerCase()
  if (lower.includes("insufficient funds") || lower.includes("insufficient lamports")) {
    return "Insufficient funds"
  }
  if (lower.includes("slippage")) {
    return "Price moved — slippage exceeded, try again"
  }
  if (lower.includes("blockhash") && lower.includes("not found")) {
    return "Network blip — try again"
  }
  if (lower.includes("user rejected") || lower.includes("user declined")) {
    return "Trade cancelled"
  }
  if (lower.includes("simulation failed") || lower.includes("custom program error")) {
    // Last-resort generic when simulation blew up but we couldn't
    // identify a known cause — DON'T leak the program log to the UI.
    return "Trade failed — try again"
  }
  // Short messages (≤120 chars, no embedded program logs) are probably
  // sane to surface verbatim. Anything longer is almost certainly the
  // simulation dump and gets the generic fallback.
  if (raw.length <= 120 && !raw.includes("Program ")) return raw
  return "Trade failed"
}

export default function MiniTradePage() {
  const { proposalPda } = useParams<{ proposalPda?: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated, activeWalletType, token } = useMiniAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(ROUTES.MINI, { replace: true })
    }
  }, [isAuthenticated, navigate])

  // Remember the last market the user looked at — `pickDefaultProposal`
  // reads this key on the bottom-nav entry point so "Trade" lands them
  // back in the market they care about instead of a generic default.
  useEffect(() => {
    if (!proposalPda) return
    try {
      localStorage.setItem(LAST_TRADED_PROPOSAL_KEY, proposalPda)
    } catch {
      /* private mode — no-op */
    }
  }, [proposalPda])

  // ── Trade form state ────────────────────────────────────
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [side, setSide] = useState<"BUY" | "SELL">("BUY")
  const [amount, setAmount] = useState("")
  const [isExecuting, setIsExecuting] = useState(false)
  const [lastTxSig, setLastTxSig] = useState<string | null>(null)

  // ── Deposit / Withdraw sheet state ──────────────────────
  // `null` when the sheet is closed. The two buttons below the Trade CTA
  // open the sheet with the picked action; the *asset* (quote vs base)
  // is chosen inside the sheet via a toggle, so the primary screen stays
  // uncluttered and both assets are discoverable without doubling the
  // button count. The backend `/api/custodial-trade` accepts both via
  // `vault_type: "quote" | "base"` so only the payload differs.
  // Bumped after a successful trade to force CombinatorChart to re-fetch
  // its historical prices from `/api/combinator-prices`. This is the
  // "reliable" refresh path when the Solana WS subscription is muted by
  // a public-RPC rate limit — the user's own trade still lands visibly
  // within ~5-10s because we (a) re-poll the chain, (b) the new POST
  // hits the DB, (c) bumping this key re-GETs the DB into the chart.
  const [chartRefreshKey, setChartRefreshKey] = useState(0)

  /**
   * Trade-impact preview — dashed price line drawn on the chart at the
   * post-trade spot price for the currently-selected option, so the
   * user sees where their trade will move the market BEFORE confirming.
   *
   * Computed by `sdkQuote` (debounced 500ms after each amount/side/option
   * change to avoid one RPC round-trip per keystroke). The SDK returns
   * `spotPriceBefore` and `spotPriceAfter` in raw scaled units; we
   * convert to the human price by multiplying the current displayed
   * `spotPrice` by the ratio. Direction is normalized:
   *   - BUY  → ratio > 1 (price up)
   *   - SELL → ratio < 1 (price down)
   * web3.js's `Connection` would otherwise occasionally give us a flipped
   * ratio if the pool's A/B convention doesn't match our base/quote
   * mental model — the explicit normalization keeps the dashed line on
   * the correct side of the current price.
   *
   * Cleared to `null` on empty input, on submit, or on quote failure so
   * a stale preview never persists across an unrelated state change.
   */
  const [pricePreview, setPricePreview] = useState<{ optionIndex: number; price: number } | null>(null)

  // ── Hackathon lookup (for option labels) ────────────────
  // We only get a proposalPda from the URL, but the SDK falls back to
  // "Option 0/1" without human labels. Fetch the hackathons list and
  // find the one that owns this market so we can pass proper labels.
  const { data: allHackathonsData } = useQuery({
    queryKey: ["mini", "hackathons", "for-labels"],
    queryFn: async () => {
      const r = await backendSparkApi.getHackathons()
      writeCache(MINI_CACHE_KEYS.HACKATHONS, r)
      return r
    },
    enabled: !!proposalPda && isAuthenticated,
    // Labels barely change — no need to refetch on focus.
    staleTime: 60_000,
    // Show cached list immediately so the option labels resolve
    // ("No / TobiasBond / Mathis_Btc" instead of "Option 0/1/2") on
    // the first frame, not after a 1s round-trip.
    placeholderData: () =>
      readCache<Awaited<ReturnType<typeof backendSparkApi.getHackathons>>>(
        MINI_CACHE_KEYS.HACKATHONS,
        HACKATHONS_CACHE_MAX_MS,
      ) ?? undefined,
  })
  const hackathonForMarket = useMemo(() => {
    if (!proposalPda) return undefined
    const all = allHackathonsData?.hackathons || []
    return all.find(h => h.combinator_proposal_pda === proposalPda)
  }, [proposalPda, allHackathonsData])
  const optionLabels = useMemo(
    () => deriveOptionLabels(hackathonForMarket),
    [hackathonForMarket]
  )

  // ── Market data ─────────────────────────────────────────
  const { data: market, isLoading, error, refetch } = useQuery<MarketStatus>({
    // optionLabels are part of the key so the market re-fetches once the
    // hackathon list resolves and we upgrade from "Option N" to real names.
    queryKey: ["mini", "market", proposalPda, optionLabels],
    queryFn: () => getProposalMarketStatus(proposalPda!, optionLabels),
    enabled: !!proposalPda && isAuthenticated,
    // 5s polling is the "always works" fallback when the SDK's
    // `onAccountChange` WebSocket is silent — which is the default on
    // public mainnet-beta RPC (rate-limited subs). On a dedicated RPC
    // (Helius etc.) the WS fires instantly and this poll is redundant
    // but cheap. getMultipleAccountsInfo for the pools + 2 mints is a
    // single RPC call, so 5s is comfortable.
    refetchInterval: 5_000,
  })

  // ── Wallet balance ──────────────────────────────────────
  // Same query key as MiniMePage so React Query shares the cached response
  // across pages — the first visit to either page populates both. Drives
  // the "Balance X.XX" display + the percentage quick-picks below the
  // amount input. 30s refetch matches MiniMePage and is fine here since
  // balances only shift when the user trades (and that refetches via
  // invalidation after a successful trade, see handleTrade below).
  const { data: me } = useQuery<MiniMeResponse>({
    queryKey: ["mini", "me"],
    queryFn: async () => {
      const m = await getMiniMe()
      writeCache(MINI_CACHE_KEYS.ME, m)
      return m
    },
    enabled: isAuthenticated,
    refetchInterval: 30_000,
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
  const activeWallet = me?.wallets
    ? activeWalletType === "private"
      ? me.wallets.private
      : me.wallets.public
    : null

  /**
   * Wallet balance of an arbitrary SPL mint, by looking it up in
   * `activeWallet.tokens` (the array returned by `/api/mini/me`). Returns
   * 0 when the ATA doesn't exist or the wallet is still loading — callers
   * use this as the deposit cap.
   *
   * `activeWallet.usdg` is a convenience field that only resolves for the
   * canonical USDG mint; for non-USDG quote tokens (some markets use USDC)
   * or the base token, we MUST go through the tokens array here.
   *
   * Declared before the `!proposalPda` early-return below so the hook
   * ordering is stable across renders — React throws "rendered more
   * hooks than during the previous render" otherwise when the user
   * navigates between the index view and a trade route.
   */
  const walletBalanceOf = useCallback(
    (mint: string): number => {
      if (!activeWallet || !mint) return 0
      const row = activeWallet.tokens.find(t => t.mint === mint)
      return row?.amount ?? 0
    },
    [activeWallet],
  )

  /**
   * Per-option conditional balances from the futarchy vault.
   *
   * The market splits each token into 4 conditional variants:
   *   - `quote.condBalances[i]` → cUSDG redeemable if option `i` wins
   *     (i.e. cUSDG-YES, cUSDG-NO in a 2-option market)
   *   - `base.condBalances[i]`  → cToken redeemable if option `i` wins
   *     (i.e. cTOKEN-YES, cTOKEN-NO)
   *
   * Plain USDG in the wallet (`activeWallet.usdg`) is what the custodial
   * trade endpoint auto-deposits+splits at trade time. So the effective
   * "available to BUY option i" balance is
   *     plainUSDG + quote.condBalances[i]
   * and "available to SELL option i" is
   *     base.condBalances[i]
   * which matches the desktop CombinatorTrade MAX button logic.
   */
  const condQueryKey = useMemo(
    () => ["mini", "cond-balances", market?.vaultPda, activeWallet?.address] as const,
    [market?.vaultPda, activeWallet?.address],
  )
  const { data: condBalances } = useQuery<SdkBalances>({
    queryKey: condQueryKey,
    enabled: !!market?.vaultPda && !!activeWallet?.address,
    queryFn: async () => {
      // Read-only adapter — we never sign here, we just need the pubkey
      // so the SDK can derive the per-user token account PDAs. Signers
      // are no-ops to satisfy the WalletAdapter contract.
      const walletAdapter = {
        publicKey: new PublicKey(activeWallet!.address),
        signTransaction: async <T,>(tx: T) => tx,
        signAllTransactions: async <T,>(txs: T[]) => txs,
      }
      return sdkGetBalances(walletAdapter, market!.vaultPda)
    },
    refetchInterval: 30_000,
    // A user with no position on this market returns zero-balance accounts;
    // only retry transient network errors.
    retry: 1,
  })

  const options = market?.options ?? []
  const selectedOption: MarketOption | undefined = options[selectedIndex]

  /**
   * Called by `CombinatorChart` on every on-chain tick it observes.
   * We DON'T open our own `sdkSubscribeMarket` here — two parallel
   * subs to the same pools get throttled by public mainnet-beta RPC,
   * and the loser silently never fires (which used to leave this
   * cache stale while the chart kept moving visually, so the
   * `/api/combinator-prices` POST below would write pre-trade values
   * in a loop). Funneling both consumers through the chart's single
   * subscription keeps the cache byte-identical to what's painted.
   *
   * Mutating via `setQueryData` re-renders every cache consumer
   * (stats bar, option cards, win %, the price-history POST effect
   * below) on the next frame. The 5s polling in `useQuery` stays as a
   * cold-start + WS-drop reconciliation net.
   */
  /**
   * Per-option throttle for `/api/combinator-prices` POSTs. The on-chain
   * subscription emits a tick per pool whenever it mutates, so an active
   * market can fire many ticks per second across N options. We collapse
   * those into at most one POST per option per `PUSH_MIN_INTERVAL_MS` —
   * the chart only needs ~5s resolution and Helius rate-limits any
   * higher cadence anyway.
   *
   * Pushing per-option (instead of the whole array on every `market`
   * change) is what fixed the "I sold but the chart didn't move" bug:
   * the old effect would batch in stale snapshots of the OTHER pools
   * alongside the one that actually changed, so a fast follow-up tick
   * for option `i` could overwrite the just-written post-trade price
   * with a pre-trade value pulled from another option's update path.
   */
  const lastPostByIndexRef = useRef<Map<number, number>>(new Map())
  const PUSH_MIN_INTERVAL_MS = 5_000

  const handleChartPriceTick = useCallback(
    ({ index, spotPrice, twapPrice }: { index: number; spotPrice: number; twapPrice: number }) => {
      if (!proposalPda) return
      const queryKey = ["mini", "market", proposalPda, optionLabels] as const
      queryClient.setQueryData<MarketStatus>(queryKey, (prev) => {
        if (!prev) return prev
        const nextOptions = prev.options.map((o) =>
          o.index === index ? { ...o, spotPrice, twapPrice } : o
        )
        // Recompute `isLeading` flags whenever TWAPs shift, otherwise
        // the "leading" highlight on option cards goes stale.
        const maxTwap = Math.max(...nextOptions.map((o) => o.twapPrice))
        const withLeading = nextOptions.map((o) => ({
          ...o,
          isLeading: o.twapPrice > 0 && o.twapPrice === maxTwap,
        }))
        const leader = withLeading.find((o) => o.isLeading)
        return {
          ...prev,
          options: withLeading,
          leadingOption: leader ? leader.label : prev.leadingOption,
        }
      })

      // Push only THIS option's price — never bundle stale prices for the
      // other options. Skip null/zero ticks (decode failure or fresh pool
      // before any swap) so the chart history doesn't get $0 spikes.
      if (!(spotPrice > 0 || twapPrice > 0)) return
      const now = Date.now()
      const last = lastPostByIndexRef.current.get(index) ?? 0
      if (now - last < PUSH_MIN_INTERVAL_MS) {
        console.log("[combinator-debug] price-push throttled per-index", { index, sinceLastMs: now - last })
        return
      }
      lastPostByIndexRef.current.set(index, now)
      console.log("[combinator-debug] price-push fire (per-index)", { index, spot: spotPrice, twap: twapPrice })
      fetch("/api/combinator-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_pda: proposalPda,
          prices: [{ index, spot: spotPrice, twap: twapPrice }],
        }),
      }).catch((err) => {
        console.warn("[combinator-debug] price-push failed", err)
      })
    },
    [proposalPda, optionLabels, queryClient]
  )

  const canTrade = useMemo(() => {
    if (!market || !proposalPda || !selectedOption) return false
    if (!market.isActive || market.isFinalized) return false
    const n = Number(amount)
    return Number.isFinite(n) && n > 0 && !isExecuting
  }, [market, proposalPda, selectedOption, amount, isExecuting])

  /**
   * Balance available to spend on the CURRENTLY SELECTED option and side.
   *
   *   - BUY option i  → plain USDG (auto-deposited at trade time)
   *                     + cUSDG[i] already sitting in the vault from
   *                       prior trades. Both convert 1:1 into "bids on
   *                       option i" so they're fungible from the user's
   *                       point of view.
   *
   *   - SELL option i → cToken[i] in the vault (the outcome-token
   *                     position). Plain base-token in the wallet isn't
   *                     counted: selling back to USDG requires going
   *                     through the vault's cToken → cUSDG swap, so
   *                     only vault-held cTokens are sellable here.
   *
   * Returns 0 while data is loading so the % chips gray out instead of
   * autofilling the wrong amount.
   */
  const availableBalance = useMemo(() => {
    if (!activeWallet || !market) return 0
    // Option-specific balance — this is what the user can actually
    // trade RIGHT NOW on the selected option. Unlike the Me / Idea
    // pages (which show the unified across-all-markets total),
    // trading is per-pool: the cQuote / cBase tokens locked in
    // OTHER options' pools can't be spent here.
    //
    // Formula per side:
    //   BUY  option i → wallet USDC + cQuote_i  (deposit-then-swap topup
    //                   covers the wallet portion automatically)
    //   SELL option i → wallet token + cBase_i  (same topup mechanic)
    //
    // For the wallet portion we read the unified breakdown's
    // `*_wallet` field when available — it's the same number as
    // walking the wallet's `tokens` array but pre-computed by the
    // backend (matches USDC across both classic + Token-2022 mints).
    // Fallback to the legacy `usdg` field / direct token lookup so
    // older /me responses without `unified` still work.
    const i = selectedIndex
    if (side === "BUY") {
      // Prefer the server-aggregated wallet USDC figure (from the
      // unified breakdown) — covers both classic SPL + Token-2022
      // mints in one number. Fallback walks the wallet's tokens
      // array for any holding tagged "USDC" so older /me responses
      // without `unified` still produce a sane value.
      const walletUsdc =
        activeWallet.unified?.usdc_wallet ??
        activeWallet.tokens.find(t => t.symbol === "USDC")?.amount ??
        0
      const condUsdc = condBalances?.quote?.condBalances?.[i]
      const condUsdcNum = condUsdc
        ? Number(condUsdc.toString()) / Math.pow(10, market.quoteDecimals)
        : 0
      return walletUsdc + condUsdcNum
    }
    // SELL — wallet project-token (matched by mint, robust to symbol
    // resolution quirks) + cBase for THIS specific option.
    const walletToken =
      activeWallet.tokens.find(t => t.mint === market.baseMint)?.amount ?? 0
    const condToken = condBalances?.base?.condBalances?.[i]
    const condTokenNum = condToken
      ? Number(condToken.toString()) / Math.pow(10, market.baseDecimals)
      : 0
    return walletToken + condTokenNum
  }, [activeWallet, market, side, selectedIndex, condBalances])

  /**
   * Format a raw number for the amount input. We trim trailing zeros so
   * setting 50% of 10 USDG doesn't surface as "5.000000" — looks sloppy
   * on a mobile text field. `maxDecimals` follows the side: USDG carries
   * 6 decimals on-chain but 4 is plenty for display; outcome tokens can
   * have tiny dust from prior partial-fills so 6 is a safe cap.
   *
   * We **truncate** (floor) rather than rely on `toFixed`'s rounding.
   * With round-half-up, a balance like 1.234567895 would format as
   * "1.234568" — and when the backend multiplies that back to raw units
   * (`Math.floor(1.234568 * 10^9) = 1234568000`) it exceeds the actual
   * on-chain balance (1234567895) by 105 units, making the AMM's SPL
   * Transfer fail with "insufficient funds" on the 100% button. Flooring
   * guarantees the re-expanded raw amount is ≤ balance.
   */
  const formatAmount = useCallback((raw: number, maxDecimals: number): string => {
    if (!Number.isFinite(raw) || raw <= 0) return ""
    const factor = Math.pow(10, maxDecimals)
    const truncated = Math.floor(raw * factor) / factor
    // toFixed clamps to `maxDecimals` places; the regex strips trailing
    // zeros and the dangling dot that `toFixed` leaves on whole numbers.
    return truncated.toFixed(maxDecimals).replace(/\.?0+$/, "")
  }, [])

  const handlePercent = useCallback((pct: number) => {
    if (availableBalance <= 0) return
    haptic(8)
    const decimals = side === "BUY" ? 4 : 6
    // 100% is allowed to equal the full balance — the custodial-trade
    // backend leaves enough SOL rent for gas separately, so we don't
    // need to hold back USDG/outcome from the displayed max.
    setAmount(formatAmount((availableBalance * pct) / 100, decimals))
  }, [availableBalance, side, formatAmount])

  // Note: prices are pushed per-tick from `handleChartPriceTick` above.
  // The previous effect that pushed the entire `market.options` array on
  // every state change was removed — it bundled stale prices for the
  // other options alongside the freshly-changed one, which caused the
  // "I sold but the chart didn't move" symptom (a follow-up tick would
  // overwrite the post-trade price with a pre-trade snapshot from a
  // different option's update path).

  /**
   * Trade-impact preview pipeline. Mirrors the desktop `CombinatorTrade`
   * quote effect: every (amount × side × selectedIndex) change triggers a
   * 500ms-debounced `sdkQuote` against the selected pool, projects the
   * post-trade spot price by applying the SDK's `spotPriceAfter / Before`
   * ratio to the currently-displayed `option.spotPrice`, and feeds the
   * dashed-line preview into `<CombinatorChart pricePreview={...} />`.
   *
   * The 500ms debounce is critical: each quote is one `getAccountInfo`
   * upstream, and without debouncing every keystroke would fan out into
   * a Helius round-trip (the same shape that produced the 429 storms).
   * Combined with the 1.5s cache in `/api/rpc`, rapid edits collapse
   * into a single upstream call.
   *
   * Cleared to null when:
   *   - amount is empty / non-positive (nothing to preview)
   *   - the pool isn't deployed yet (zero PublicKey sentinel)
   *   - the quote throws (SDK fail, RPC down — fail-soft, no stale line)
   *   - the deps change before the timeout fires (the cleanup runs)
   */
  useEffect(() => {
    if (!market || !proposalPda) return
    const opt = market.options?.[selectedIndex]
    if (!opt?.poolAddress) {
      setPricePreview(null)
      return
    }
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setPricePreview(null)
      return
    }
    if (!(opt.spotPrice > 0)) {
      // No baseline price to scale from — chart line would be drawn at 0.
      setPricePreview(null)
      return
    }
    let cancelled = false
    const timeout = setTimeout(async () => {
      try {
        const quoteInputDecimals = side === "BUY" ? market.quoteDecimals : market.baseDecimals
        const q = await sdkQuote(opt.poolAddress, side === "BUY", numericAmount, quoteInputDecimals)
        if (cancelled) return
        if (q.spotPriceAfter > 0 && q.spotPriceBefore > 0) {
          let ratio = q.spotPriceAfter / q.spotPriceBefore
          // Direction guard — see comment on `pricePreview` state above.
          if (side === "BUY" && ratio < 1) ratio = 1 / ratio
          if (side === "SELL" && ratio > 1) ratio = 1 / ratio
          setPricePreview({ optionIndex: opt.index, price: opt.spotPrice * ratio })
        } else {
          setPricePreview(null)
        }
      } catch {
        if (!cancelled) setPricePreview(null)
      }
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [amount, selectedIndex, side, market, proposalPda])

  // ── Index view — no proposalPda ─────────────────────────
  // Home page for the Decision-market tab: lists every hackathon with
  // a deployed Combinator market, grouped Live first, then Ended.
  // Was previously an auto-redirect into "the most relevant market"
  // — that worked when there was a single live market, but as soon
  // as multiple were running it picked one arbitrarily and the user
  // had no way back to browse. Explicit list is more predictable
  // and lets the user revisit ended markets too.
  const {
    data: hackathonsData,
    isLoading: isLoadingHackathons,
  } = useQuery({
    queryKey: ["mini", "hackathons", "for-trade-index"],
    queryFn: async () => {
      const r = await backendSparkApi.getHackathons()
      writeCache(MINI_CACHE_KEYS.HACKATHONS, r)
      return r
    },
    enabled: !proposalPda && isAuthenticated,
    placeholderData: () =>
      readCache<Awaited<ReturnType<typeof backendSparkApi.getHackathons>>>(
        MINI_CACHE_KEYS.HACKATHONS,
        HACKATHONS_CACHE_MAX_MS,
      ) ?? undefined,
  })

  if (!proposalPda) {
    const all = hackathonsData?.hackathons || []
    // Tradeable = has a deployed Combinator proposal. We split by
    // hackathon status: "voting" → Live; everything else (notably
    // "completed") → Ended. "upcoming" / "open" markets without a
    // deployed proposal_pda are filtered out — they can't be traded
    // yet so listing them as "live" would mislead.
    const tradeable = all.filter(h => !!h.combinator_proposal_pda)
    const live = tradeable.filter(h => h.status === "voting")
    const ended = tradeable.filter(h => h.status !== "voting")

    return (
      <MiniLayout>
        <div className="pt-4 pb-6">
          <div className="mb-5">
            <h1 className="text-lg font-bold leading-tight">Decision markets</h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              Trade on which builder ships next.
            </p>
          </div>

          {isLoadingHackathons ? (
            <div className="flex items-center justify-center py-12 text-neutral-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : tradeable.length === 0 ? (
            // No deployed market anywhere — point the user back to the
            // hackathons tab where the relevant ones are listed.
            <div className="pt-8 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-amber-400" />
              </div>
              <div className="space-y-1.5">
                <div className="text-base font-bold">No markets yet</div>
                <p className="text-xs text-neutral-500 max-w-[260px] mx-auto leading-relaxed">
                  No hackathon has deployed a decision market yet. Check the
                  Ideas tab for what&apos;s coming.
                </p>
              </div>
              <Link
                to={ROUTES.MINI_HACKATHONS}
                className="inline-block px-5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold transition-colors"
              >
                Browse ideas
              </Link>
            </div>
          ) : (
            <>
              {/* Live markets — primary, larger headline. We render
                  the section header even when empty IF there are
                  ended markets, so the user understands "no live
                  markets right now, here's the history". */}
              <section className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <h2 className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">
                    Live
                  </h2>
                  <span className="text-[10px] text-neutral-600 font-mono">{live.length}</span>
                </div>
                {live.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4 text-xs text-neutral-500 text-center">
                    No live markets right now.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {live.map(h => (
                      <MarketRow key={h.id} hackathon={h} variant="live" />
                    ))}
                  </div>
                )}
              </section>

              {/* Ended markets — kept visible for the user to revisit
                  past markets, see how their positions resolved, etc. */}
              {ended.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                    <h2 className="text-[11px] uppercase tracking-wider text-neutral-400 font-semibold">
                      Ended
                    </h2>
                    <span className="text-[10px] text-neutral-600 font-mono">{ended.length}</span>
                  </div>
                  <div className="space-y-2">
                    {ended.map(h => (
                      <MarketRow key={h.id} hackathon={h} variant="ended" />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </MiniLayout>
    )
  }

  /**
   * Move assets between the user's wallet and the market vault. Same
   * endpoint as trading — the backend signs with the custodial keypair.
   *
   *   asset="quote"  → plain quote token (USDG/USDC) ↔ cUSDG-YES/NO
   *   asset="base"   → plain base token (Ideacoin)   ↔ cTOKEN-YES/NO
   *
   *   action="deposit"  splits the plain token into per-option conditional
   *                     balances held by the vault.
   *   action="withdraw" merges paired conditional balances back into the
   *                     plain token. The on-chain ix requires equal
   *                     amounts across all options; we don't pre-validate
   *                     and let the chain reject oversized requests.
   */
  const handleFundsAction = async (
    action: "deposit" | "withdraw",
    asset: "quote" | "base",
    depositAmount: number,
  ): Promise<{ signature: string } | null> => {
    if (!market?.vaultPda || !proposalPda || !user?.id) {
      toast.error("Market not ready — try again in a moment.")
      return null
    }
    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      toast.error("Enter a positive amount")
      return null
    }

    const decimals = asset === "base" ? market.baseDecimals : market.quoteDecimals

    const res = await fetch("/api/custodial-trade", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // JWT-gates the endpoint — the backend overrides body.twitter_id
        // with the JWT's twitter_id, so a compromised client can't
        // impersonate another user.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        twitter_id: user.id,
        wallet_type: activeWalletType,
        action,
        proposal_pda: proposalPda,
        vault_pda: market.vaultPda,
        vault_type: asset,
        amount: depositAmount,
        decimals,
      }),
    })
    const json = await res.json() as { signature?: string; error?: string }
    if (!res.ok) {
      if (res.status === 403 && typeof json.error === "string" && /custodial wallet/i.test(json.error)) {
        toast.error(`No ${activeWalletType} wallet yet — set one up on the Me tab.`)
        return null
      }
      throw new Error(json.error || `${action} failed`)
    }
    return { signature: json.signature || "" }
  }

  const handleTrade = async () => {
    if (!canTrade || !market || !selectedOption || !user?.id) return
    if (!market.vaultPda) {
      toast.error("Market is missing vault data — try again in a moment.")
      return
    }

    setIsExecuting(true)
    setLastTxSig(null)
    try {
      // STEP 1 — top up the conditional vault with the source token if
      // (and only if) the user doesn't already have enough cTokens for
      // the selected option. The AMM swap consumes cQuote/cBase tokens
      // for option `i`; if the user already has enough from a previous
      // trade we skip the deposit entirely to avoid wasting their wallet
      // balance and to avoid the simulation failing on
      // `Token::Transfer → insufficient funds` when the wallet doesn't
      // hold the source plain token.
      //
      // Mirrors the desktop CombinatorTrade non-custodial branch:
      //   - vaultBal[i] >= tradeAmount → swap directly
      //   - otherwise                  → deposit only (tradeAmount - vaultBal[i])
      //
      // BUY  → consumes cQuote of option `i` (so check quote.condBalances[i]).
      // SELL → consumes cBase  of option `i` (so check base.condBalances[i]).
      const tradeAmount = Number(amount)
      const depositVault: "quote" | "base" = side === "BUY" ? "quote" : "base"
      const depositDecimals =
        side === "BUY" ? market.quoteDecimals : market.baseDecimals
      const condRaw =
        side === "BUY"
          ? condBalances?.quote?.condBalances?.[selectedOption.index]
          : condBalances?.base?.condBalances?.[selectedOption.index]
      const condForOption = condRaw
        ? Number(condRaw.toString()) / Math.pow(10, depositDecimals)
        : 0

      if (condForOption < tradeAmount) {
        // Floor the topup at a sensible non-zero so we don't ship a
        // 0.0000001 deposit on rounding noise — same dust-prevention
        // logic as the trade endpoint expects.
        const topup = tradeAmount - condForOption
        const depositResult = await handleFundsAction(
          "deposit",
          depositVault,
          topup,
        )
        if (!depositResult) {
          // handleFundsAction already toasted the user-facing message;
          // just bail and let them retry.
          return
        }
        // Give the Solana network a moment to propagate the deposit's
        // state change before the trade's preflight simulation runs —
        // otherwise the RPC may still see stale cBase/cQuote balances
        // and reject the trade with "insufficient funds".
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      const res = await fetch("/api/custodial-trade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Same auth story as handleFundsAction — the backend trusts the
          // JWT's twitter_id over the body value when both are present.
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          twitter_id: user.id,
          wallet_type: activeWalletType,
          action: "trade",
          proposal_pda: proposalPda,
          vault_pda: market.vaultPda,
          pool_address: selectedOption.poolAddress,
          side,
          amount: Number(amount),
          // BUY spends the quote token (USDG); SELL unwinds the outcome
          // token back into quote. The endpoint uses `decimals` to convert
          // the human-readable amount to raw base units.
          decimals: side === "BUY" ? market.quoteDecimals : market.baseDecimals,
          option_index: selectedOption.index,
          option_label: selectedOption.label,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        // 403 "No <type> custodial wallet assigned" is a provisioning gap
        // the user can self-serve: their active wallet type doesn't have
        // a backing custodial wallet row yet. Point them at /m/me, where
        // the wallet-type switcher + provisioning UI lives.
        if (res.status === 403 && typeof json.error === "string" && /custodial wallet/i.test(json.error)) {
          toast.error(`No ${activeWalletType} wallet yet — set one up on the Me tab.`)
          return
        }
        throw new Error(json.error || "Trade failed")
      }

      setLastTxSig(json.signature)
      setAmount("")
      console.log("[combinator-debug] trade confirmed", {
        side,
        option_index: selectedOption.index,
        amount: Number(amount),
        signature: json.signature,
        preTradeSpot: selectedOption.spotPrice,
      })
      // Short double-tap buzz — the "confirmed" signal. Matches the
      // feel of e.g. Robinhood's order-filled haptic.
      haptic([12, 40, 12])
      toast.success("Trade confirmed")
      // Two-stage refresh, mirrored from desktop CombinatorMarket:
      //   +3s: refetch market from chain. The trade is confirmed on
      //        our side, but we give the RPC a beat to propagate so
      //        `getMultipleAccountsInfo` returns the *post-trade* pool
      //        state. Calling refetch() synchronously here would very
      //        often return stale prices.
      //   +6s: bump the chart's refreshKey so it re-GETs the DB price
      //        history. By then the 10s-throttled POST in this page's
      //        own effect has written the new snapshot, so the chart
      //        re-hydrates with a line that includes the user's trade.
      setTimeout(() => {
        console.log("[combinator-debug] trade +3s: refetching market")
        refetch()
        // Bust the `["mini", "me"]` cache so the plain-USDG balance line
        // refreshes, and the `["mini", "cond-balances", ...]` cache so
        // the per-option conditional balances (cUSDG-YES/NO, cTOKEN-YES/NO)
        // update — both drive the Balance line and % buttons, and both
        // shift on every trade.
        queryClient.invalidateQueries({ queryKey: ["mini", "me"] })
        queryClient.invalidateQueries({ queryKey: ["mini", "cond-balances"] })
        setTimeout(() => {
          console.log("[combinator-debug] trade +6s: bump chartRefreshKey (re-fetch DB history)")
          setChartRefreshKey(k => k + 1)
        }, 3000)
      }, 3000)
    } catch (err) {
      // Longer single buzz — something went wrong.
      haptic(80)
      toast.error(friendlyTradeError(err))
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <MiniLayout>
      <div className="pt-4 pb-6">
        {/* Top bar: page title on the left, active-wallet pill on the
            right. Navigation lives in the bottom tab bar, so a duplicate
            back affordance here would be noise. Keeping the title in this
            row (rather than below) puts it on the same optical baseline as
            the PUBLIC/PRIVATE pill — the alternative left a chunk of dead
            vertical space between the top-right pill and the heading. */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">Question Proposal</h1>
            {/* Token name parameterized so the same template works for
                every hackathon. Multiple markets ask the SAME question
                about the SAME token (e.g. PREDICT-treasury and the
                Marketing Agent hackathon both surface PREDICT), so we
                resolve the token from the hackathon row itself rather
                than hard-coding "$PREDICT". Resolution priority:
                  1. ticker from the linked Idea (authoritative)
                  2. coin_name from the linked Idea (long-form)
                  3. literal "PREDICT" so we don't render an empty $
                     before the hackathon list has loaded.
                The `$` prefix is added by the template, not pulled
                from the data — keeps the wording stable. */}
            <p className="text-xs text-neutral-500 mt-0.5">
              {(() => {
                const tokenName =
                  hackathonForMarket?.ticker?.trim() ||
                  hackathonForMarket?.coin_name?.trim() ||
                  "PREDICT"
                return `How should the $${tokenName} treasury be distributed and for what?`
              })()}
            </p>
          </div>
          <MarketPhasePill isWarmup={!!market?.isWarmup} />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-300">
            Couldn't load this market. Tap to{" "}
            <button onClick={() => refetch()} className="underline font-semibold">retry</button>.
          </div>
        )}

        {market && !market.isActive && !market.isFinalized && (
          <NoticeCard icon={Lock} text="Market is in warm-up — trading opens soon." />
        )}

        {market?.isFinalized && (
          <FinalizedWinnerCard
            market={market}
            proposalPda={proposalPda!}
            onRedeemed={() => {
              // After a redeem the user's plain-token wallet balances
              // change but the market state itself is already final, so
              // we only refresh the wallet-side queries.
              queryClient.invalidateQueries({ queryKey: ["mini", "me"] })
              queryClient.invalidateQueries({ queryKey: ["mini", "cond-balances"] })
            }}
          />
        )}

        {/* Stats + chart for ANY market with data — live AND finalized.
            We used to gate this on `isActive && !isFinalized`, which meant
            once the market resolved the page collapsed to a single notice
            card with the page background showing through 80% of the
            viewport. Splitting "stats + chart" (always shown when data
            exists) from "trade form" (only when active + not finalized)
            keeps the post-resolution view useful — users still see the
            final price action and how the winner pulled ahead. */}
        {market && (market.isActive || market.isFinalized) && (
          <>
            <MarketStatsBar market={market} />
            <div className="mt-4 mb-3">
              <CombinatorChart
                proposalPda={proposalPda}
                options={market.options}
                refreshKey={chartRefreshKey}
                onPriceTick={handleChartPriceTick}
                pricePreview={pricePreview}
              />
            </div>
          </>
        )}

        {market && market.isActive && !market.isFinalized && (
          <>
            {/* Stats bar + chart are rendered above (shared with the
                finalized-market view). Below this point: the trading
                form, only relevant while the market is still open. */}

            {/* The Deposit / Withdraw button row used to live here. Both
                actions are now implicit: deposits run automatically as
                the first step of every trade (see handleTrade), and the
                withdraw side maps to the redeem flow shown on a
                finalized market — no manual fund-shuffling needed in
                the mini-app's simplified surface. */}

            {/* Option cards — first decision point. We flipped the
                old order (side-toggle-first) because new users read
                BUY/SELL as a generic action and missed the conditional
                framing entirely. Picking the OUTCOME first, then
                expressing the trade as "if this outcome wins, I would
                like to…" mirrors MetaDAO's futarchy UI and makes the
                bet semantics explicit on first read.
                3-column grid so 6 builders fit on two rows on a
                phone — stacked rows ate the viewport before the user
                could scroll to the trade controls. */}
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {options.map((opt, i) => (
                <OptionCard
                  key={opt.index}
                  option={opt}
                  selected={selectedIndex === i}
                  onSelect={() => setSelectedIndex(i)}
                />
              ))}
            </div>

            {/* Conditional framing — explicit "If X wins, I would
                like to..." preface. The label below pulls the picked
                option's name so users always see what they're
                conditioning on without scrolling back up to the grid. */}
            <div className="text-[11px] text-neutral-400 mb-1.5 leading-snug">
              If <span className="font-semibold text-white">{selectedOption?.label || "this outcome"}</span>{" "}
              wins, I would like to…
            </div>

            {/* Side toggle — read as the verb of the conditional
                sentence above. Keeping plain "Buy" / "Sell" labels
                because the conditional context already lives in the
                preface; doubling it on the pill ("If X wins, I Buy")
                made the chips wrap on small phones. */}
            <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-6">
              <SideButton
                active={side === "BUY"}
                label="I Buy"
                color="green"
                onClick={() => { haptic(8); setSide("BUY") }}
              />
              <SideButton
                active={side === "SELL"}
                label="I Sell"
                color="red"
                onClick={() => { haptic(8); setSide("SELL") }}
              />
            </div>

            {/* Amount */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                  Amount
                </label>
                {/* Balance line replaces the old standalone symbol label.
                    Still carries the symbol (USDG on BUY, outcome token on
                    SELL) and adds the available balance so the % chips
                    below have a visible anchor. Clicking it fills the
                    input with 100% — same as the "100" chip, but easier
                    to hit on thumbs. */}
                <button
                  type="button"
                  onClick={() => handlePercent(100)}
                  disabled={availableBalance <= 0}
                  className="text-[10px] text-neutral-500 hover:text-neutral-300 disabled:hover:text-neutral-500 transition-colors"
                >
                  Balance{" "}
                  <span className="font-mono text-neutral-300">
                    {availableBalance.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}
                  </span>{" "}
                  {/* Label tracks the asset being spent: the quote
                      symbol (USDC) on BUY, the project token symbol
                      on SELL. The balance now combines wallet plain
                      + cToken for the selected option, so labelling
                      it with the OPTION name (e.g. "Cuddly tokens")
                      was misleading — half the balance is plain
                      project token in the wallet, not option-specific
                      conditional. The hackathon ticker is the
                      authoritative project-token symbol; falls back
                      to the SDK-resolved baseSymbol then a generic
                      "tokens" if neither is available. */}
                  {side === "BUY"
                    ? market.quoteSymbol
                    : (hackathonForMarket?.ticker || market.baseSymbol || "tokens")}
                </button>
              </div>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-3xl font-bold text-white placeholder-neutral-700 outline-none"
              />
              <div className="mt-3 flex gap-1.5">
                {QUICK_PERCENTS.map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handlePercent(pct)}
                    disabled={availableBalance <= 0}
                    className="flex-1 py-1.5 text-[11px] rounded-lg bg-white/[0.03] hover:bg-white/[0.06] disabled:hover:bg-white/[0.03] border border-white/[0.04] text-neutral-300 disabled:text-neutral-600 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleTrade}
              disabled={!canTrade}
              className={`w-full py-3.5 rounded-full text-sm font-semibold transition-colors ${
                canTrade
                  ? side === "BUY"
                    ? "bg-green-500 hover:bg-green-400 text-black"
                    : "bg-red-500 hover:bg-red-400 text-white"
                  : "bg-white/[0.04] text-neutral-600 cursor-not-allowed"
              }`}
            >
              {isExecuting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing…
                </span>
              ) : (
                // Full conditional sentence — same framing as the
                // preface above the side toggle. Keeps the bet
                // semantics explicit on the action button itself
                // ("If Mathis_Btc wins, I buy") rather than the
                // ambiguous "Buy Mathis_Btc".
                selectedOption?.label
                  ? `If ${selectedOption.label} wins, I ${side === "BUY" ? "buy" : "sell"}`
                  : `${side === "BUY" ? "Buy" : "Sell"}`
              )}
            </button>

            {lastTxSig && (
              <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/5 p-3 text-[11px] text-green-300 break-all">
                ✓ tx: <span className="font-mono">{lastTxSig.slice(0, 12)}…{lastTxSig.slice(-8)}</span>
              </div>
            )}
          </>
        )}

        {/* Chat / History panel — sticky at the bottom of the trade
            page, collapsed by default so it doesn't dominate the
            viewport. Two tabs: Chat (real-time message room scoped
            to this proposal) and History (recent trades on the same
            proposal). Both call existing endpoints — no backend
            change needed. Activity here is a useful social signal
            on a market that's otherwise a silent line chart. */}
        {market && (
          <ChatHistoryPanel
            proposalPda={proposalPda!}
            wallet={activeWallet?.address}
          />
        )}

      </div>
    </MiniLayout>
  )
}

/* ── sub-components ──────────────────────────────────────── */

/**
 * Top-right status pill — replaces the old wallet-type indicator.
 *
 * Two phases tracked here:
 *   - `isWarmup` true  → "WARM UP" (neutral chrome). Trading is open but
 *     the TWAP oracle hasn't started accumulating, so the resolution
 *     metric isn't running yet.
 *   - `isWarmup` false → "TWAP" (amber chrome). The TWAP oracle is now
 *     live; the highest-TWAP-at-end builder wins. Amber matches the
 *     "live phase" accent used elsewhere in the trade UI.
 *
 * Pill is non-interactive — it's purely informational, unlike the old
 * `WalletPill` which deep-linked to the Me tab. The wallet switch is
 * still reachable from the bottom nav.
 */
function MarketPhasePill({ isWarmup }: { isWarmup: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${
        isWarmup
          ? "border-neutral-600/60 bg-neutral-800/60 text-neutral-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
      }`}
    >
      <Shield className="w-3 h-3" />
      {isWarmup ? "Warm up" : "TWAP"}
    </span>
  )
}

function OptionCard({
  option,
  selected,
  onSelect,
}: {
  option: MarketOption
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex flex-col items-center justify-center gap-0.5 px-2 py-2.5 rounded-xl border transition-all text-center ${
        selected
          ? "border-amber-500/50 bg-amber-500/5"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.15]"
      }`}
    >
      <span
        className={`text-xs font-semibold w-full truncate ${
          selected ? "text-amber-200" : "text-white"
        }`}
        title={option.label}
      >
        {option.label}
      </span>
      {option.isLeading && (
        <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider leading-none">
          leading
        </span>
      )}
    </button>
  )
}

function SideButton({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean
  label: string
  color: "green" | "red"
  onClick: () => void
}) {
  const activeClass =
    color === "green"
      ? "bg-green-500 text-black"
      : "bg-red-500 text-white"
  const Icon = color === "green" ? TrendingUp : TrendingDown
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
        active ? activeClass : "text-neutral-400 hover:text-white"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

/**
 * Winner card rendered when the market is finalized.
 *
 * Resolves the winner label via `market.winningIndex` rather than the
 * `leadingOption` string the SDK derived earlier — this matters because
 * the SDK's first read can land BEFORE the hackathon list resolves and
 * provides real labels (`["No", builderA, builderB]`). When that happens
 * `leadingOption` gets cached as "Option 0" / "Option 1" and stays stale
 * even after labels arrive. Looking up by index against the CURRENT
 * `market.options` array — which IS keyed on the live `optionLabels` via
 * the React Query key — guarantees we render the freshest label.
 *
 * Also sized for prominence: the previous `NoticeCard` was a single
 * line of body text, which felt anticlimactic for "this market is over,
 * here's who won". The card here uses the same border/bg language as
 * the rest of the mini-app so it still reads as part of the market view,
 * not a banner pasted on top.
 */
function FinalizedWinnerCard({
  market,
  proposalPda,
  onRedeemed,
}: {
  market: MarketStatus
  proposalPda: string
  onRedeemed: () => void
}) {
  const { token, user, activeWalletType } = useMiniAuth()
  const [redeeming, setRedeeming] = useState(false)
  const [redeemed, setRedeemed] = useState(false)

  // 1. Prefer the option whose `index` matches `winningIndex` — the
  //    SDK populates this from the on-chain `proposal.winningOption`,
  //    which is set when the resolver instruction lands.
  // 2. Fall back to the SDK's pre-computed `leadingOption` string only
  //    if the index path didn't yield a match (defensive — shouldn't
  //    happen in practice).
  const winningOption = market.winningIndex != null
    ? market.options.find((o) => o.index === market.winningIndex)
    : undefined
  const winnerLabel = winningOption?.label ?? market.leadingOption ?? null

  const handleRedeem = async () => {
    if (!market.vaultPda || !user?.id) {
      toast.error("Market not ready — try again in a moment.")
      return
    }
    setRedeeming(true)
    try {
      // Redeem both vaults — base (Ideacoin cTokens) and quote (cUSDG)
      // — in sequence. Either side can have nothing to redeem (e.g. user
      // only ever bought one direction), in which case the on-chain
      // instruction throws and we just continue. Mirrors the desktop
      // CombinatorTrade.handleRedeem loop.
      const sigs: string[] = []
      let anyOk = false
      for (const vaultType of ["base", "quote"] as const) {
        try {
          const res = await fetch("/api/custodial-trade", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              twitter_id: user.id,
              wallet_type: activeWalletType,
              action: "redeem",
              proposal_pda: proposalPda,
              vault_pda: market.vaultPda,
              vault_type: vaultType,
            }),
          })
          const json = (await res.json().catch(() => ({}))) as {
            signature?: string
            error?: string
          }
          if (!res.ok) {
            console.error(`[redeem ${vaultType}] ${res.status}: ${json.error}`)
            continue
          }
          if (json.signature) sigs.push(json.signature)
          anyOk = true
        } catch (err) {
          // Per-side failure is non-fatal unless BOTH sides fail (handled
          // by `anyOk` below). Log but keep trying the other side.
          console.error(`[redeem ${vaultType}]`, err)
        }
      }
      if (!anyOk) {
        toast.error("Nothing to redeem on this market.")
        return
      }
      toast.success(
        sigs.length > 1 ? "Both vaults redeemed" : "Redeemed",
      )
      setRedeemed(true)
      onRedeemed()
    } catch (err) {
      toast.error(friendlyTradeError(err))
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-amber-400/80 font-semibold">
            Market finalized
          </div>
          {winnerLabel ? (
            <>
              <div className="text-base font-bold text-white mt-0.5 truncate">
                Winner: {winnerLabel}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1 leading-snug">
                Highest TWAP at end. Trading is closed — tap below to
                redeem your winning cTokens back to {market.quoteSymbol || "USDG"}.
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-300 mt-1">
              Winner announced soon.
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleRedeem}
        disabled={redeeming || redeemed}
        className="mt-4 w-full py-3 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold text-sm transition-colors inline-flex items-center justify-center gap-2"
      >
        {redeeming ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Redeeming…
          </>
        ) : redeemed ? (
          "Tokens Redeemed ✓"
        ) : (
          "Redeem winnings"
        )}
      </button>
    </div>
  )
}

function NoticeCard({
  icon: Icon,
  text,
}: {
  icon: typeof Lock
  text: string
}) {
  return (
    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex items-center gap-3">
      <Icon className="w-4 h-4 text-neutral-400 shrink-0" />
      <p className="text-xs text-neutral-300">{text}</p>
    </div>
  )
}

/**
 * Compact stats bar — mobile-adapted version of the desktop
 * `CombinatorMarket` header row. Each stat is a pill that wraps onto new
 * lines on narrow screens, so the layout stays readable from ~320px up.
 * The "LEADING" pill absorbs the win-probability heuristic so we don't
 * waste a whole row just for a percentage.
 */
function MarketStatsBar({ market }: { market: MarketStatus }) {
  const endsIn = useEndCountdown(market.endTime)
  const winPct = computeWinPct(market)

  const statusPill = market.isFinalized
    ? { label: "FINAL", dot: "bg-neutral-500", text: "text-neutral-400" }
    : market.isActive
      ? { label: "LIVE", dot: "bg-green-400 animate-pulse", text: "text-green-300" }
      : { label: "WARMUP", dot: "bg-blue-400", text: "text-blue-300" }

  const volumeLabel =
    market.volume >= 1000
      ? `$${(market.volume / 1000).toFixed(1)}k`
      : `$${market.volume.toFixed(0)}`

  // On a finalized market the LEAD pill and the countdown chip would just
  // duplicate (or contradict) the FinalizedWinnerCard rendered above the
  // chart, so we drop them here. Volume / trades / traders stay because
  // they're still meaningful as final totals.
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatChip>
        <span className={`w-1.5 h-1.5 rounded-full ${statusPill.dot}`} />
        <span className={`font-bold ${statusPill.text}`}>{statusPill.label}</span>
      </StatChip>
      <StatChip label="VOL" value={volumeLabel} />
      <StatChip label="TRADES" value={market.trades.toString()} />
      <StatChip label="TRADERS" value={market.traders.toString()} />
      {!market.isFinalized && endsIn && (
        <StatChip label="ENDS" value={endsIn} mono />
      )}
      {!market.isFinalized && market.leadingOption && (
        <StatChip
          label="LEAD"
          value={
            winPct != null ? `${market.leadingOption} · ${winPct}%` : market.leadingOption
          }
          accent
        />
      )}
    </div>
  )
}

function StatChip({
  children,
  label,
  value,
  mono,
  accent,
}: {
  children?: ReactNode
  label?: string
  value?: string
  mono?: boolean
  accent?: boolean
}) {
  const base =
    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px]"
  const palette = accent
    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
    : "border-white/[0.06] bg-white/[0.02] text-neutral-300"
  if (children) {
    return <div className={`${base} ${palette}`}>{children}</div>
  }
  return (
    <div className={`${base} ${palette}`}>
      <span className="uppercase tracking-wider text-neutral-500 font-semibold">
        {label}
      </span>
      <span className={`font-semibold ${mono ? "font-mono" : ""} ${accent ? "text-amber-300" : "text-white"} truncate max-w-[140px]`}>
        {value}
      </span>
    </div>
  )
}

/**
 * One row on the Decision-market home page. Click → trade page for
 * that hackathon's market. Two visual variants:
 *
 *   - `live`  → amber accents, optional countdown chip, "Trade" CTA
 *               feel via hover state
 *   - `ended` → muted, no countdown, "Ended" pill replaces the
 *               status indicator. Still clickable so the user can
 *               revisit a past market (read-only chart, redeem flow
 *               on the trade page).
 *
 * Builder count comes from the server-aggregated `proposals_count`
 * field on HackathonModel — same field MiniHackathonsPage already
 * uses for its similar list view.
 */
function MarketRow({
  hackathon: h,
  variant,
}: {
  hackathon: HackathonModel
  variant: "live" | "ended"
}) {
  const countdown = useCountdown(variant === "live" ? (h.end_date || h.countdown_target) : undefined)
  return (
    <Link
      to={`${ROUTES.MINI_TRADE}/${h.combinator_proposal_pda}`}
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
        variant === "live"
          ? "border-white/[0.06] bg-white/[0.02] hover:border-amber-500/30 hover:bg-amber-500/[0.03]"
          : "border-white/[0.04] bg-white/[0.01] hover:border-white/[0.1]"
      }`}
    >
      {/* Cover image — fallback to a tinted placeholder so empty rows
          don't break the visual rhythm. The placeholder uses the
          ticker initial when available so adjacent rows still look
          distinguishable at a glance. */}
      {h.idea_image_url ? (
        <img
          src={h.idea_image_url}
          alt=""
          className={`w-12 h-12 rounded-lg object-cover shrink-0 border border-white/10 ${
            variant === "ended" ? "opacity-60" : ""
          }`}
        />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-neutral-800 border border-white/10 flex items-center justify-center text-sm font-bold text-neutral-400 shrink-0">
          {h.ticker?.charAt(0)?.toUpperCase() || h.idea_title?.charAt(0)?.toUpperCase() || "?"}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {/* Status pill — pulsing dot for live, muted for ended.
              Inline with the title so it sits on the same baseline
              and the user catches the state instantly. */}
          {variant === "live" ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-green-500/15 text-green-400 border border-green-500/30">
              <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-neutral-800 text-neutral-500 border border-white/[0.06]">
              Ended
            </span>
          )}
          {h.ticker && (
            <span className="text-[10px] font-mono text-amber-300 truncate">${h.ticker}</span>
          )}
        </div>
        <div className={`text-sm font-semibold truncate ${variant === "ended" ? "text-neutral-300" : "text-white"}`}>
          {h.idea_title}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-neutral-500">
          <span className="inline-flex items-center gap-1 font-mono">
            <Users className="w-2.5 h-2.5" />
            {h.proposals_count ?? 0}
          </span>
          {countdown && variant === "live" && (
            <span className="inline-flex items-center gap-1 font-mono text-yellow-300">
              <Timer className="w-2.5 h-2.5" />
              {countdown}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

/**
 * Bottom-of-page Chat / History tabs for the trade view. Collapsed
 * by default — the trade form is the primary action; chat/history
 * are secondary. Toggling open expands the body in-place (no modal).
 *
 *   - Chat: pulls `/api/combinator-chat?proposal_pda=...` every 5s
 *     while open. Posts via the same endpoint with the user's
 *     custodial wallet as pseudonym. No auth — the backend
 *     accepts any wallet string and renders a truncated address.
 *   - History: pulls `/api/combinator-trades?proposal_pda=...` every
 *     10s. Read-only timeline of recent BUY/SELL on the proposal.
 *
 * Polling is gated on `isOpen` so a closed panel doesn't waste
 * RPC budget. Active tab also gates which endpoint is hit — the
 * other tab waits until the user clicks it.
 */
type ChatMessage = { id: string; wallet: string; content: string; created_at: string }
type TradeRow = {
  action: string
  wallet: string
  option_label: string | null
  side: string | null
  amount: number
  token: string | null
  tx_signature: string | null
  timestamp: string
  /**
   * Resolved server-side via JOIN on `custodial_wallets`. Null for
   * self-custody traders (external wallets we don't know the owner of).
   * `wallet_type` distinguishes a trade from the user's main ("public")
   * wallet vs their bonus ("private") wallet, so the history can
   * indicate which surface the user is trading from.
   */
  twitter_username?: string | null
  twitter_id?: string | null
  wallet_type?: "public" | "private" | null
}

function shortAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr || "—"
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function ChatHistoryPanel({
  proposalPda,
  wallet,
}: {
  proposalPda: string
  wallet: string | undefined
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [tab, setTab] = useState<"chat" | "history">("chat")

  return (
    <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Top bar — Chat / History toggle on the left, expand chevron
          on the right. The whole bar is clickable to expand/collapse;
          tabs themselves only switch the active tab when the panel
          is already open (prevents accidental tab-switch on first
          tap that the user actually meant as "open"). */}
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => {
            if (!isOpen) setIsOpen(true)
            setTab("chat")
          }}
          className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors text-left ${
            tab === "chat" && isOpen
              ? "bg-white/[0.04] text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isOpen) setIsOpen(true)
            setTab("history")
          }}
          className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors text-left ${
            tab === "history" && isOpen
              ? "bg-white/[0.04] text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          History
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(v => !v)}
          aria-label={isOpen ? "Collapse" : "Expand"}
          className="px-4 text-neutral-400 hover:text-white transition-colors"
        >
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-white/[0.04]">
          {tab === "chat" ? (
            <ChatBody proposalPda={proposalPda} wallet={wallet} />
          ) : (
            <HistoryBody proposalPda={proposalPda} />
          )}
        </div>
      )}
    </div>
  )
}

function ChatBody({
  proposalPda,
  wallet,
}: {
  proposalPda: string
  wallet: string | undefined
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [posting, setPosting] = useState(false)

  // Poll the chat every 5s while the body is mounted (i.e. tab open).
  useEffect(() => {
    let cancelled = false
    const fetchChat = async () => {
      try {
        const r = await fetch(`/api/combinator-chat?proposal_pda=${encodeURIComponent(proposalPda)}&limit=100`)
        if (!r.ok) return
        const j = (await r.json()) as { data?: ChatMessage[] }
        if (!cancelled && j.data) setMessages(j.data)
      } catch { /* silent — next poll retries */ }
    }
    void fetchChat()
    const id = setInterval(fetchChat, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [proposalPda])

  const send = async () => {
    if (!wallet || !draft.trim() || posting) return
    setPosting(true)
    try {
      const r = await fetch("/api/combinator-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_pda: proposalPda,
          wallet,
          content: draft.trim(),
        }),
      })
      if (r.ok) {
        const j = (await r.json()) as { message?: ChatMessage }
        if (j.message) setMessages(prev => [...prev, j.message!])
        setDraft("")
      }
    } catch { /* silent */ }
    finally {
      setPosting(false)
    }
  }

  return (
    <div className="p-3 space-y-3">
      {/* Message list — auto-scrolls down via flex-col-reverse trick:
          newest at the bottom visually, but rendered in reverse so
          adding one doesn't push the rest off-view. */}
      <div className="max-h-[260px] overflow-y-auto flex flex-col gap-2 pr-1">
        {messages.length === 0 && (
          <div className="text-center text-[11px] text-neutral-500 py-6">
            No messages yet — be the first.
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className="text-[11px] leading-relaxed">
            <span className="font-mono text-amber-300/80 mr-1.5">{shortAddress(m.wallet)}</span>
            <span className="text-neutral-200 break-words">{m.content}</span>
          </div>
        ))}
      </div>
      {/* Composer — only shown when the user has a wallet (i.e. is
          authenticated). Otherwise prompts to connect via the Me tab. */}
      {wallet ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void send() }}
            placeholder="Say something…"
            maxLength={500}
            className="flex-1 rounded-lg bg-black/30 border border-white/10 focus:border-amber-400/60 outline-none px-3 py-2 text-xs text-white placeholder:text-neutral-600"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim() || posting}
            className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-white/10 disabled:text-neutral-500 text-xs font-semibold text-black transition-colors"
          >
            Send
          </button>
        </div>
      ) : (
        <div className="text-[10px] text-neutral-500 text-center py-1">
          Sign in on the Me tab to post.
        </div>
      )}
    </div>
  )
}

function HistoryBody({ proposalPda }: { proposalPda: string }) {
  const [trades, setTrades] = useState<TradeRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchTrades = async () => {
      try {
        const r = await fetch(`/api/combinator-trades?proposal_pda=${encodeURIComponent(proposalPda)}&limit=50`)
        if (!r.ok) return
        const j = (await r.json()) as { data?: TradeRow[] }
        if (!cancelled && j.data) {
          setTrades(j.data)
          setLoading(false)
        }
      } catch { /* silent */ }
    }
    void fetchTrades()
    const id = setInterval(fetchTrades, 10_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [proposalPda])

  return (
    <div className="p-3">
      <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1">
        {loading && trades.length === 0 && (
          <div className="flex items-center justify-center py-6 text-neutral-500">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        )}
        {!loading && trades.length === 0 && (
          <div className="text-center text-[11px] text-neutral-500 py-6">
            No trades yet.
          </div>
        )}
        {trades.map((t, i) => {
          // Color the side: BUY green, SELL red, deposits / redeems
          // grey since they're meta-actions (no directional signal).
          const isTrade = t.action === "trade"
          const sideColor =
            isTrade && t.side === "BUY"
              ? "text-emerald-400"
              : isTrade && t.side === "SELL"
                ? "text-red-400"
                : "text-neutral-400"
          const ts = new Date(t.timestamp)
          const time = ts.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
          return (
            <div
              key={t.tx_signature || `${t.timestamp}-${i}`}
              className="flex items-baseline gap-2 text-[11px] font-mono"
            >
              <span className="text-neutral-600 shrink-0 w-12">{time}</span>
              <span className={`shrink-0 w-10 font-semibold ${sideColor}`}>
                {isTrade ? t.side ?? "—" : t.action.toUpperCase()}
              </span>
              <span className="text-amber-300/80 shrink-0 truncate max-w-[80px]">
                {t.option_label ?? "—"}
              </span>
              <span className="text-neutral-200 shrink-0">
                {t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className="text-neutral-500 shrink-0">{t.token ?? ""}</span>
              {/* Trader identity — Twitter handle when known (links out
                  to their X profile), short address as a fallback. We
                  intentionally DON'T surface the handle for trades from
                  a user's bonus (private) wallet: those wallets are an
                  internal admin-funded surface and attaching a public
                  Twitter to them would leak which accounts received
                  bonus credit. Bonus-wallet trades stay anonymous and
                  show only the truncated address. */}
              {t.twitter_username && t.wallet_type !== "private" ? (
                <a
                  href={`https://x.com/${t.twitter_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400/80 hover:text-sky-300 truncate ml-auto"
                  title={t.wallet}
                  onClick={(e) => e.stopPropagation()}
                >
                  @{t.twitter_username}
                </a>
              ) : (
                <span className="text-neutral-600 truncate ml-auto" title={t.wallet}>
                  {shortAddress(t.wallet)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
