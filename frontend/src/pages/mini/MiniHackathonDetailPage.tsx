/**
 * MiniHackathonDetailPage — `/m/hackathons/:id`
 *
 * Read-only overview of one hackathon: idea recap, countdown, the list of
 * builders competing, and a single "Trade" CTA that deep-links into the
 * decision-market trade UI.
 *
 * Intentionally skinnier than the desktop HackathonDetailPage — no chat,
 * no milestones, no governance. Those live on the desktop surface; the
 * mini-app is a trading-only experience.
 */

import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, ArrowLeft, Timer, Users, Wallet, Github, ExternalLink, ArrowBigUp, ChevronDown, ChevronUp } from "lucide-react"
import { backendSparkApi } from "@/data/api/backendSparkApi"
import type { HackathonModel, HackathonProposalModel } from "@/data/api/backendSparkApi"
import { useMiniAuth } from "@/hooks/useMiniAuth"
import MiniLayout from "@/components/Mini/MiniLayout"
import MiniMarkdown from "@/components/Mini/MiniMarkdown"
import TokenMarketCard from "@/components/Mini/TokenMarketCard"
import { unifiedUsdc, unifiedPredict } from "@/pages/mini/MiniMePage"
import { toast } from "react-toastify"
import { ROUTES } from "@/utils/routes"
import {
  getMiniMe,
  postMiniUpvoteProposal,
  postMiniJupiterSwap,
  type MiniMeResponse,
  type MiniTokenHolding,
} from "@/data/api/miniApi"
import { getProposalMarketStatus, type MarketStatus } from "@/services/combinatorService"

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

/** Canonical USDC mints (mainnet + devnet). We match on the mint rather
 *  than the symbol string because the backend's `KNOWN_TOKEN_SYMBOLS`
 *  map is authoritative only for whitelisted mints — mint-match is the
 *  safe path if that map ever drops a hint. */
const USDC_MINTS = new Set<string>([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // mainnet
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // devnet
])

function usdcAmount(tokens: MiniTokenHolding[] | undefined): number {
  if (!tokens) return 0
  const row =
    tokens.find(t => t.symbol === "USDC") ??
    tokens.find(t => USDC_MINTS.has(t.mint))
  return row?.amount ?? 0
}

/** Sum the balance of a specific SPL mint across a wallet's `tokens` list.
 *  Used to pull the user's holdings of THIS hackathon's project token
 *  (base-mint of the decision market) rather than a blanket "every
 *  non-stablecoin" bucket — the old behavior would leak balances from
 *  other markets the user had traded. Returns 0 for an unknown mint or
 *  empty wallet, which renders as "0" in the UI. */
function sumTokenByMint(tokens: MiniTokenHolding[] | undefined, mint: string | undefined): number {
  if (!tokens || !mint) return 0
  return tokens
    .filter(t => t.mint === mint)
    .reduce((acc, t) => acc + t.amount, 0)
}

export default function MiniHackathonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useMiniAuth()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(ROUTES.MINI, { replace: true })
    }
  }, [isAuthenticated, navigate])

  const { data, isLoading, error } = useQuery({
    queryKey: ["mini", "hackathon", id],
    queryFn: () => backendSparkApi.getHackathon(id!),
    enabled: isAuthenticated && !!id,
  })

  const h: HackathonModel | undefined = data?.hackathon
  const countdown = useCountdown(h?.end_date || h?.countdown_target)

  /**
   * Buy/Sell modal state for the token-market card. `null` = closed,
   * `"buy"` / `"sell"` = open with the matching action pre-selected.
   * Phase 1 just announces the custodial-Jupiter swap is coming;
   * Phase 2 will replace the modal body with a real form that hits a
   * new `/api/mini/jupiter-swap` endpoint signing with the user's
   * custodial keypair.
   */
  const [swapAction, setSwapAction] = useState<"buy" | "sell" | null>(null)

  /**
   * Decision-proposal section toggle. Default expanded so a first-time
   * visitor sees the full content (trade CTA + builders) immediately;
   * the toggle is for users who want to focus on the project metadata
   * + their balances without the long roster taking screen real estate.
   * Persisting in localStorage isn't worth it — the section is small
   * enough that re-expanding on each visit is friction-free.
   */
  const [proposalsExpanded, setProposalsExpanded] = useState<boolean>(true)

  // Mini-app builder list — restricted to shortlisted proposals only,
  // sorted by upvote count descending so the community's pick is at
  // the top. The desktop surface keeps the full roster + market-odds
  // sort; the mini-app is a curated, mobile-first view where the
  // shortlist is what tradeable options on the decision market are
  // built from. Falls back to the full list if no proposal has been
  // shortlisted yet (early hackathon state) so the page isn't empty.
  const sortedProposals = useMemo<HackathonProposalModel[]>(() => {
    if (!h?.proposals) return []
    const shortlisted = h.proposals.filter(p => p.shortlisted)
    const pool = shortlisted.length > 0 ? shortlisted : h.proposals
    return [...pool].sort(
      (a, b) => (b.upvote_count ?? 0) - (a.upvote_count ?? 0),
    )
  }, [h?.proposals])

  // My balances (both wallets). Background-refetched every 20s so the
  // card stays fresh while the user watches trades resolve. `staleTime`
  // is a bit lower so React Query re-uses the cache across remounts.
  const { data: meData } = useQuery<MiniMeResponse>({
    queryKey: ["mini", "me"],
    queryFn: getMiniMe,
    enabled: isAuthenticated,
    refetchInterval: 20_000,
    staleTime: 10_000,
  })

  // Market metadata — we only need the base mint + symbol to filter the
  // user's holdings to THIS project's token. Fetched separately from the
  // trade page's own market query (same key, so React Query shares the
  // cache across pages) and runs only when the hackathon has a deployed
  // proposal PDA. When it doesn't (e.g. brand-new hackathon still in
  // warmup), we just don't render the project-token row.
  const { data: market } = useQuery<MarketStatus>({
    queryKey: ["mini", "market", h?.combinator_proposal_pda],
    queryFn: () => getProposalMarketStatus(h!.combinator_proposal_pda!),
    enabled: isAuthenticated && !!h?.combinator_proposal_pda,
    // Market metadata (mint/symbol) barely changes; a minute is fine.
    staleTime: 60_000,
  })
  // Resolve a human-friendly label for the project token row. The market
  // metadata's `baseSymbol` falls back to a truncated mint string (shape:
  // `XXXX...XXXX`) when the mint isn't in the on-chain SDK's known-mints
  // map — that's what showed up as "ARDF...QSPK" in the UI. Prefer, in
  // order:
  //   1. The hackathon's `ticker` from the linked Idea row (joined
  //      server-side in /api/hackathons). This is the authoritative
  //      project-token symbol authored by the ideator.
  //   2. The hackathon's `coin_name` (also from the linked Idea) — used
  //      when the ideator filled in the long-form name but no ticker.
  //   3. The symbol resolved by the backend from the user's wallet
  //      tokens (KNOWN_TOKEN_SYMBOLS map in /api/mini/me).
  //   4. The market metadata's baseSymbol IF it doesn't look like a
  //      truncated address.
  //   5. Literal "Project token" as a last resort — never the raw mint.
  const TRUNCATED_MINT_RE = /^.{4}\.{3}.{4}$/
  const walletSymbol = (() => {
    const all = [
      ...(meData?.wallets.public?.tokens ?? []),
      ...(meData?.wallets.private?.tokens ?? []),
    ]
    const row = all.find(t => t.mint === market?.baseMint && !!t.symbol)
    return row?.symbol?.trim() || null
  })()
  const baseSymbol = market?.baseSymbol?.trim() ?? ""
  const baseSymbolIsClean = baseSymbol.length > 0 && !TRUNCATED_MINT_RE.test(baseSymbol)
  const projectTokenSymbol =
    h?.ticker?.trim() ||
    h?.coin_name?.trim() ||
    walletSymbol ||
    (baseSymbolIsClean ? baseSymbol : null) ||
    "Project token"
  // Project-token balance per wallet — kept separate so the new "Main"
  // / "Bonus" sub-cards can show the user's per-wallet exposure rather
  // than an aggregate. The previous version summed both, which collapsed
  // the deposit/admin-funding distinction users want to see.
  const projectTokenMain = sumTokenByMint(meData?.wallets.public?.tokens, market?.baseMint)
  const projectTokenBonus = sumTokenByMint(meData?.wallets.private?.tokens, market?.baseMint)

  return (
    <MiniLayout>
      <div className="pt-4 pb-6">
        {/* Back link */}
        <Link
          to={ROUTES.MINI_HACKATHONS}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white mb-5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Ideas
        </Link>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-300">
            Couldn't load this hackathon.
          </div>
        )}

        {h && (
          <>
            {/* Hero — image + title + prize */}
            <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02] mb-6">
              {h.idea_image_url && (
                <div className="relative h-48 bg-neutral-900/40">
                  <img
                    src={h.idea_image_url}
                    alt={h.idea_title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#030303] to-transparent" />
                </div>
              )}
              <div className="p-5 -mt-10 relative z-10">
                <h1 className="text-xl font-bold mb-3">{h.idea_title}</h1>
                {/* Prize-pool chip intentionally removed — the mini-app
                    positions hackathons as "markets to trade", not
                    "contests with a prize". Users coming through the
                    trading funnel don't need the pool headline; they
                    need the countdown + the CTA. The amount is still
                    on the desktop surface for builders. */}
                {countdown && (
                  <div className="flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-xs text-yellow-300 font-mono font-semibold">
                      {countdown}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Token-market card — ticker, current price, FDV, treasury
                balance + Buy/Sell entry points. Rendered above "My
                balances" because the user usually scans the project
                metrics first, then their own position. Only shows when
                the linked Idea has a `token_address` (early-stage ideas
                without a deployed token render nothing). */}
            <TokenMarketCard
              ticker={h.ticker}
              coinName={h.coin_name}
              tokenAddress={h.token_address}
              treasuryWallet={h.treasury_wallet}
              onBuy={() => setSwapAction("buy")}
              onSell={() => setSwapAction("sell")}
            />

            {/* My balances — grouped by wallet so the Main / Bonus
                distinction is the primary axis instead of by-asset.
                Each wallet shows its USDC + project-token rows. The
                project-token row is only rendered once the base mint
                resolves so we never sum unrelated balances from other
                markets. */}
            {meData && (
              <div className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Wallet className="w-4 h-4 text-neutral-400" />
                  <div className="text-sm font-semibold">My balances</div>
                </div>

                {/* Main wallet — the user's personal funded balance. */}
                <div className="space-y-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
                    Main Wallet
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500">
                      USDC
                    </div>
                    <div className="text-sm font-mono font-semibold">
                      ${unifiedUsdc(meData.wallets.public).toFixed(2)}
                    </div>
                  </div>
                  {market?.baseMint && (
                    <div className="flex items-baseline justify-between">
                      <div className="text-[11px] uppercase tracking-wider text-neutral-500 truncate">
                        {projectTokenSymbol}
                      </div>
                      <div className="text-sm font-mono font-semibold">
                        {(projectTokenSymbol === "PREDICT"
                          ? unifiedPredict(meData.wallets.public)
                          : projectTokenMain
                        ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Visual divider keeps the two wallets distinct; the
                    Bonus block uses amber accents to signal it's the
                    Spark-funded promo balance. */}
                <div className="h-px bg-white/[0.06] my-4" />

                <div className="space-y-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-amber-400/90 font-semibold">
                    Bonus Wallet
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500">
                      USDC
                    </div>
                    <div className="text-sm font-mono font-semibold text-amber-300">
                      ${unifiedUsdc(meData.wallets.private).toFixed(2)}
                    </div>
                  </div>
                  {market?.baseMint && (
                    <div className="flex items-baseline justify-between">
                      <div className="text-[11px] uppercase tracking-wider text-neutral-500 truncate">
                        {projectTokenSymbol}
                      </div>
                      <div className="text-sm font-mono font-semibold text-amber-300">
                        {(projectTokenSymbol === "PREDICT"
                          ? unifiedPredict(meData.wallets.private)
                          : projectTokenBonus
                        ).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Decision Proposal section — collapsible. Header is
                the editable `decision_proposal_title` from BackOffice
                (falls back to "Select the builder of $TICKER" if not
                set). Body contains the Trade CTA + builders list,
                grouped under "Proposal 1" so the page can later carry
                multiple decision proposals (Proposal 2 = treasury
                allocation question, etc.) without re-architecting.
                Defaulted to expanded so a first-time visitor sees the
                full content; the toggle is mostly for users who want
                to focus on the project metadata + their balances
                without the long roster. */}
            {(() => {
              const proposalTitle =
                h.decision_proposal_title?.trim() ||
                `Select the builder of $${h.ticker || "TOKEN"}`
              return (
                <div className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setProposalsExpanded(v => !v)}
                    aria-expanded={proposalsExpanded}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-amber-400/90 font-semibold">
                        Proposal 1
                      </div>
                      <div className="text-sm font-semibold mt-0.5 truncate">
                        {proposalTitle}
                      </div>
                    </div>
                    {proposalsExpanded ? (
                      <ChevronUp className="w-4 h-4 text-neutral-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                    )}
                  </button>

                  {proposalsExpanded && (
                    <div className="px-4 pb-4 border-t border-white/[0.04] pt-4 space-y-4">
                      {/* Trade CTA — kept above the builders list so
                          the primary action is always reachable
                          without scrolling through the roster. */}
                      {h.combinator_proposal_pda ? (
                        <Link
                          to={`${ROUTES.MINI_TRADE}/${h.combinator_proposal_pda}`}
                          className="block w-full py-3.5 rounded-full bg-amber-500 hover:bg-amber-400 active:bg-amber-300 text-center text-sm font-semibold text-black transition-colors"
                        >
                          Trade the market
                        </Link>
                      ) : (
                        <div className="text-center text-xs text-neutral-500 py-3">
                          Decision market not deployed yet.
                        </div>
                      )}

                      {/* Builders list */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Users className="w-4 h-4 text-neutral-400" />
                          <h2 className="text-sm font-semibold">
                            {sortedProposals.length} builders competing
                          </h2>
                        </div>
                        <div className="space-y-2">
                          {sortedProposals.map(p => (
                            <ProposalCard
                              key={p.id}
                              proposal={p}
                              hackathonId={h.id}
                              initiallyUpvoted={(meData?.my_proposal_upvotes || []).includes(p.id)}
                            />
                          ))}
                          {sortedProposals.length === 0 && (
                            <div className="text-xs text-neutral-500 text-center py-6">
                              No proposals submitted yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </>
        )}
      </div>

      {/* Buy/Sell modal — real custodial Jupiter swap. Signs server-
          side with the user's custodial keypair via the new
          `/api/mini/jupiter-swap` endpoint. Same overlay pattern as
          the funds modal on the Me page (centered, p-4, scroll lock). */}
      {swapAction && h && (
        <JupiterSwapModal
          action={swapAction}
          ticker={h.ticker}
          tokenAddress={h.token_address}
          onClose={() => setSwapAction(null)}
        />
      )}
    </MiniLayout>
  )
}

/**
 * One proposal — builder identity, the total they're asking for, a one-liner
 * summary of the deliverable, and direct links to GitHub / demo. The mini-app
 * keeps it terse: this card is a glance, not the full pitch. Users who want
 * the deep dive use the desktop hackathon page.
 *
 *   - Total amount: derived from milestones (the `team_members` JSON object,
 *     where the desktop form stores them — typed loosely on purpose, since
 *     the wire shape mixes legacy `string[]` arrays with the newer
 *     `{ members, milestones }` object form).
 *   - One-liner: first non-empty line of `description_md`, stripped of
 *     markdown chars, capped to keep the card height predictable on small
 *     viewports.
 *   - Links: github_url + demo_url. We render whichever subset exists; if
 *     neither is set the row collapses (no empty links bar).
 */
function ProposalCard({
  proposal: p,
  hackathonId,
  initiallyUpvoted,
}: {
  proposal: HackathonProposalModel
  hackathonId: string
  initiallyUpvoted: boolean
}) {
  const queryClient = useQueryClient()
  // Local state for the optimistic toggle. The server returns the
  // authoritative `upvote_count` + `upvoted` flag in the response, so we
  // overwrite local state with that on success — no risk of drifting
  // from reality after concurrent upvotes from other users.
  const [upvoted, setUpvoted] = useState<boolean>(initiallyUpvoted)
  const [count, setCount] = useState<number>(p.upvote_count ?? 0)
  // Collapsed by default — the list view shows ~6 proposals on screen
  // and a 2-line summary is plenty to triage. Expanding reveals the
  // full proposal markdown + milestones inline so the user can read
  // without leaving the page.
  const [expanded, setExpanded] = useState<boolean>(false)

  // Keep local state in sync if the parent re-renders with fresh data
  // (e.g. background refetch of /api/hackathons or /api/mini/me).
  useEffect(() => {
    setUpvoted(initiallyUpvoted)
  }, [initiallyUpvoted])
  useEffect(() => {
    setCount(p.upvote_count ?? 0)
  }, [p.upvote_count])

  const upvoteMutation = useMutation({
    mutationFn: () => postMiniUpvoteProposal(p.id),
    // Optimistic flip — flips back if the request fails so the UI
    // never lies about its state for more than a network round-trip.
    onMutate: () => {
      const prevUpvoted = upvoted
      const prevCount = count
      setUpvoted(!prevUpvoted)
      setCount(prevCount + (prevUpvoted ? -1 : 1))
      return { prevUpvoted, prevCount }
    },
    onError: (_err, _vars, context) => {
      if (context) {
        setUpvoted(context.prevUpvoted)
        setCount(context.prevCount)
      }
    },
    onSuccess: data => {
      setUpvoted(data.upvoted)
      setCount(data.upvote_count)
      // Refresh /api/mini/me so `my_proposal_upvotes` matches the server
      // — keeps `initiallyUpvoted` correct on the next mount.
      queryClient.invalidateQueries({ queryKey: ["mini", "me"] })
      // And the hackathon detail so any other consumer sees the new count.
      queryClient.invalidateQueries({ queryKey: ["mini", "hackathon", hackathonId] })
    },
  })
  // Milestones live alongside team members in a JSON blob to avoid an extra
  // table; sum them on render rather than denormalising. `team_members` is
  // declared as `string[]` in the model but the form actually persists an
  // object — cast to any so we don't fight TypeScript over a known wire
  // discrepancy. Returns 0 when the legacy array shape is encountered.
  const tm = p.team_members as unknown as
    | string[]
    | { members?: string[]; milestones?: { title: string; amount?: string }[] }
    | null
  const milestones = Array.isArray(tm) ? [] : (tm?.milestones ?? [])
  const totalAmount = milestones.reduce((sum, m) => {
    const n = parseFloat(String(m.amount ?? "").replace(/[^0-9.]/g, ""))
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)

  // Strip the most common block-level markdown chars from the first non-empty
  // line so the summary reads as a clean one-liner. We don't try to fully
  // render markdown here — the card has no room and bold/italic mid-summary
  // is just visual noise on a 320px-wide screen.
  const oneLiner = (() => {
    const raw = p.description_md ?? ""
    const firstLine = raw
      .split("\n")
      .map(l => l.trim())
      .find(l => l.length > 0) ?? ""
    return firstLine
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*]\s+/, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
      .trim()
  })()

  return (
    <div className="p-3 rounded-xl border border-white/[0.04] bg-white/[0.02]">
      <div className="flex items-center gap-3">
        {p.builder?.avatar_url ? (
          <img
            src={p.builder.avatar_url}
            alt=""
            className="w-8 h-8 rounded-full border border-white/10"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-neutral-800" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {p.builder?.display_name || p.builder?.username || "Builder"}
          </div>
          {totalAmount > 0 && (
            <div className="text-[10px] font-mono text-amber-300">
              ${totalAmount.toLocaleString()} requested
            </div>
          )}
        </div>
        {/* Right-side metric — aggregate upvote count, displayed as
            arrow + number (no "upvotes" label). The mini-app sorts
            proposals by upvotes so this number is the value that
            drives the row order. The button further down still
            toggles the user's own upvote independently. */}
        <div className="shrink-0 flex items-center gap-1 text-amber-400">
          <ArrowBigUp className="w-4 h-4" strokeWidth={2.5} />
          <span className="text-sm font-mono font-bold">{count}</span>
        </div>
      </div>

      {/* Proposal title — surfaced between the builder header and the
          description so the user reads "what they're proposing" before
          the body. Hidden when empty so legacy proposals submitted
          without a title don't render an empty bold line. */}
      {p.title?.trim() && (
        <div className="mt-2 text-sm font-semibold text-white leading-tight">
          {p.title.trim()}
        </div>
      )}

      {oneLiner && (
        <p
          className={`mt-2 text-[11px] text-neutral-300 leading-snug ${expanded ? "" : "line-clamp-2"}`}
        >
          {oneLiner}
        </p>
      )}

      {/* Expanded view — full proposal description rendered as markdown
          (headings, bold/italic, inline code, links, bullet/numbered
          lists, paragraphs) via the lightweight `MiniMarkdown` helper.
          Plus milestones list when they exist. */}
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-white/[0.04] pt-3">
          {p.description_md && (
            <MiniMarkdown
              source={p.description_md}
              className="text-[11px] text-neutral-300 break-words"
            />
          )}
          {milestones.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                Milestones
              </div>
              {milestones.map((m, i) => (
                <div key={i} className="flex items-baseline justify-between gap-2 text-[11px]">
                  <div className="text-neutral-300 truncate">{m.title}</div>
                  {m.amount && (
                    <div className="font-mono text-amber-300 shrink-0">{m.amount}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 text-[11px]">
        {/* Expand toggle — pinned to the leading edge so it lives next
            to the proposal text it controls. Hidden when there's no
            content to expand into (no description AND no milestones)
            so the user isn't teased with a button that opens an empty
            block. */}
        {(p.description_md || milestones.length > 0) && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 text-neutral-400 hover:text-white transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Less
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                More
              </>
            )}
          </button>
        )}
        {p.github_url && (
          <a
            href={p.github_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-neutral-400 hover:text-white transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            GitHub
          </a>
        )}
        {p.demo_url && (
          <a
            href={p.demo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-neutral-400 hover:text-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Demo
          </a>
        )}
        {/* Upvote — pinned right so the action is always at the same
            location regardless of whether the proposal has links. The
            count sits next to the icon (not on a separate row) to keep
            the card tight on small screens. */}
        <button
          type="button"
          onClick={() => upvoteMutation.mutate()}
          disabled={upvoteMutation.isPending}
          aria-pressed={upvoted}
          aria-label={upvoted ? "Remove upvote" : "Upvote builder"}
          className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
            upvoted
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              : "bg-white/[0.04] text-neutral-300 border border-white/10 hover:bg-white/[0.08] hover:text-white"
          }`}
        >
          <ArrowBigUp
            className={`w-3.5 h-3.5 ${upvoted ? "fill-amber-300" : ""}`}
            strokeWidth={2.5}
          />
          {count}
        </button>
      </div>

    </div>
  )
}

/**
 * Jupiter custodial swap modal — direct Buy/Sell of the project token
 * from the user's PUBLIC custodial wallet, signed server-side via the
 * `/api/mini/jupiter-swap` endpoint.
 *
 * Resolves input/output mints from the swap action:
 *   - "buy"  → input = USDC, output = project token
 *   - "sell" → input = project token, output = USDC
 *
 * The decimals of the input mint are needed to convert the human
 * amount into raw units. We pull them from the user's wallet token
 * list (`/api/mini/me`), which has already cached them — that's the
 * cheapest path. Fallback to 6 (USDC) for buy.
 *
 * Slippage is fixed at 0.5% for v1. A future iteration can surface a
 * picker (0.1% / 0.5% / 1% / 2%) — keeping it hidden now keeps the
 * surface tight.
 *
 * Body-scroll lock + Esc-to-close + click-outside follow the same
 * pattern as `FundsModal` on the Me page.
 */
function JupiterSwapModal({
  action,
  ticker,
  tokenAddress,
  onClose,
}: {
  action: "buy" | "sell"
  ticker?: string
  tokenAddress?: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data: meData } = useQuery<MiniMeResponse>({
    queryKey: ["mini", "me"],
    queryFn: getMiniMe,
    staleTime: 10_000,
  })

  // Lock background scroll while open + close on Escape.
  useEffect(() => {
    if (typeof document === "undefined") return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Resolve USDC mint client-side. The me response surfaces a
  // canonical USDC token tagged `symbol === "USDC"` for any wallet
  // holding any USDC; we use that mint when present. The fallback
  // for a brand-new wallet that hasn't held USDC yet uses the
  // mainnet USDC mint — devnet users will need a wallet-with-USDC
  // session before a buy, which is an acceptable v1 trade-off.
  const usdcToken = meData?.wallets.public?.tokens.find(t => t.symbol === "USDC")
  const usdcMint = usdcToken?.mint || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  const usdcDecimals = usdcToken?.decimals ?? 6

  // Per-action resolution of mints + decimals. The input decimals
  // are critical: the backend converts `amount × 10^decimals` to
  // raw units, so a wrong decimals → wrong amount sent (often by
  // 10^3+ which shows up as "no route" or "insufficient funds").
  const inputMint = action === "buy" ? usdcMint : tokenAddress
  const outputMint = action === "buy" ? tokenAddress : usdcMint
  const projectTokenInfo = meData?.wallets.public?.tokens.find(
    t => t.mint === tokenAddress,
  )
  const inputDecimals = action === "buy"
    ? usdcDecimals
    : projectTokenInfo?.decimals ?? 6
  const inputSymbol = action === "buy" ? "USDC" : (ticker || "TOKEN")
  const outputSymbol = action === "buy" ? (ticker || "TOKEN") : "USDC"

  // Available balance for the input side — drives the "Max" button
  // and prevents submitting an amount the user can't cover. For buy
  // it's the wallet USDC; for sell it's the wallet project-token.
  const availableInput = action === "buy"
    ? usdcToken?.amount ?? 0
    : projectTokenInfo?.amount ?? 0

  const [amountStr, setAmountStr] = useState("")
  const [slippageBps, setSlippageBps] = useState<number>(100) // default 1%
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSig, setLastSig] = useState<string | null>(null)
  /**
   * Debounced quote preview. Hits Jupiter's public `/v6/quote` directly
   * from the browser (CORS-enabled, no auth) so the user sees the
   * expected output BEFORE submitting. The actual swap goes server-side
   * for signing — the client preview is informational, the source of
   * truth is the quote re-fetched by the swap-build endpoint.
   *
   * Shape: `{ outAmountRaw, priceImpactPct, loading?, error? }` |
   * `{ loading: true }` | `null` (no input).
   */
  type Preview =
    | { kind: "loading" }
    | { kind: "ok"; outAmountRaw: string; priceImpactPct: number }
    | { kind: "error"; message: string }
  const [preview, setPreview] = useState<Preview | null>(null)

  const amount = Number(amountStr)
  const amountValid =
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= availableInput &&
    !!inputMint &&
    !!outputMint

  // Output decimals — needed to format the preview / success amount in
  // human terms. Computed once per modal open, not per render of the
  // submit handler, to keep the toast and preview consistent.
  const outputDecimals = action === "buy"
    ? projectTokenInfo?.decimals ?? 6
    : usdcDecimals

  // Debounced Jupiter quote on every input change. 500ms keeps the
  // request volume low for fast typers; the same cadence as the
  // trade page's `sdkQuote` debounce. Aborted via `cancelled` on
  // dependency changes so a stale response can't overwrite a newer
  // one.
  useEffect(() => {
    if (!amountValid || !inputMint || !outputMint) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreview({ kind: "loading" })
    const timeout = setTimeout(async () => {
      try {
        const rawAmount = BigInt(Math.floor(amount * 10 ** inputDecimals))
        // Same-origin proxy `/api/mini/jupiter-quote` — keeps the
        // optional Jupiter API key on the server instead of bundling
        // it into the browser, and avoids any CORS / DNS quirks
        // of hitting Jupiter directly from the client. The proxy
        // forwards the response shape verbatim, so the same parser
        // below (outAmount + priceImpactPct) works unchanged.
        const url = new URL("/api/mini/jupiter-quote", window.location.origin)
        url.searchParams.set("inputMint", inputMint)
        url.searchParams.set("outputMint", outputMint)
        url.searchParams.set("amount", rawAmount.toString())
        url.searchParams.set("slippageBps", String(slippageBps))
        const r = await fetch(url.toString())
        if (cancelled) return
        if (!r.ok) {
          const text = await r.text().catch(() => "")
          setPreview({
            kind: "error",
            message: text.slice(0, 120) || `quote ${r.status}`,
          })
          return
        }
        const data = (await r.json()) as {
          outAmount?: string
          priceImpactPct?: string
        }
        if (cancelled) return
        if (!data.outAmount) {
          setPreview({ kind: "error", message: "No route" })
          return
        }
        setPreview({
          kind: "ok",
          outAmountRaw: data.outAmount,
          priceImpactPct: Number(data.priceImpactPct) || 0,
        })
      } catch (err) {
        if (cancelled) return
        setPreview({
          kind: "error",
          message: err instanceof Error ? err.message : "preview failed",
        })
      }
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [amountValid, amount, inputMint, outputMint, inputDecimals, slippageBps])

  const handleSubmit = async () => {
    if (!amountValid || busy || !inputMint || !outputMint) return
    setBusy(true)
    setError(null)
    setLastSig(null)
    try {
      const res = await postMiniJupiterSwap({
        input_mint: inputMint,
        output_mint: outputMint,
        amount,
        input_decimals: inputDecimals,
        slippage_bps: slippageBps,
      })
      setLastSig(res.signature)
      setAmountStr("")
      // Refresh balances so the user sees the new token amount
      // without manually pulling on the Me tab.
      queryClient.invalidateQueries({ queryKey: ["mini", "me"] })
      const outFormatted = (Number(res.out_amount) / 10 ** outputDecimals).toLocaleString(undefined, { maximumFractionDigits: 4 })
      toast.success(`Got ~${outFormatted} ${outputSymbol}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Swap failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0A0A0B] border border-white/[0.08] rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold capitalize">
            {action} ${ticker || "Token"}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            ×
          </button>
        </div>

        {/* Disabled-state guard — show a friendly message if we
            don't yet have a token address (e.g. early-stage idea
            without a deploy). The card hosting the buttons would
            normally hide them in that case, but if the user got
            here somehow we don't want a silent failure. */}
        {!tokenAddress && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-xs text-amber-200">
            This idea&apos;s token isn&apos;t deployed yet — Buy / Sell
            will open once it&apos;s live.
          </div>
        )}

        {tokenAddress && (
          <>
            <label className="block">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Amount ({inputSymbol})
                </span>
                <button
                  type="button"
                  onClick={() => setAmountStr(availableInput > 0 ? availableInput.toString() : "")}
                  className="text-[10px] uppercase tracking-wider text-amber-400 hover:text-amber-300 font-semibold"
                >
                  Max {availableInput.toLocaleString(undefined, { maximumFractionDigits: 4 })}
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
                  className="w-full rounded-xl bg-black/30 border border-white/10 focus:border-amber-400/60 outline-none px-3 py-2.5 pr-16 text-sm font-mono text-white placeholder:text-neutral-600"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-neutral-500">
                  {inputSymbol}
                </span>
              </div>
            </label>

            {/* Slippage picker — chips for 0.5% / 1% / 2% / 5%. Default
                1% (was 0.5%) since low-liquidity project tokens
                regularly need wider tolerance to land. The chosen
                value is passed verbatim to the backend swap call AND
                used in the live quote preview, so the "You receive"
                line tracks the slippage the user picked. */}
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
                Slippage tolerance
              </div>
              <div className="flex gap-1.5">
                {[50, 100, 200, 500].map(bps => {
                  const active = slippageBps === bps
                  return (
                    <button
                      key={bps}
                      type="button"
                      onClick={() => setSlippageBps(bps)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-mono font-semibold border transition-colors ${
                        active
                          ? "bg-amber-500 text-black border-amber-500"
                          : "bg-white/[0.03] text-neutral-400 border-white/[0.06] hover:border-white/[0.15]"
                      }`}
                    >
                      {(bps / 100).toFixed(bps < 100 ? 1 : 0)}%
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Live quote preview — fetched from Jupiter directly while
                the user types. Three states: loading (skeleton), ok
                (output amount + price impact), error (no route /
                amount too small). Hidden when no input has been
                entered. */}
            {preview && (
              <div className="mt-3 rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
                  You receive
                </div>
                {preview.kind === "loading" && (
                  <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Fetching quote…
                  </div>
                )}
                {preview.kind === "ok" && (
                  <>
                    <div className="text-base font-mono font-bold text-white">
                      ≈ {(Number(preview.outAmountRaw) / 10 ** outputDecimals).toLocaleString(undefined, { maximumFractionDigits: 6 })} {outputSymbol}
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5 flex items-center gap-1.5">
                      <span>Price impact</span>
                      <span
                        className={`font-mono ${
                          preview.priceImpactPct > 5
                            ? "text-red-400"
                            : preview.priceImpactPct > 1
                              ? "text-amber-300"
                              : "text-neutral-400"
                        }`}
                      >
                        {preview.priceImpactPct.toFixed(2)}%
                      </span>
                    </div>
                  </>
                )}
                {preview.kind === "error" && (
                  <div className="text-[11px] text-red-400">{preview.message}</div>
                )}
              </div>
            )}

            {error && (
              <div className="mt-3 text-[11px] text-red-400 leading-snug">{error}</div>
            )}
            {lastSig && (
              <div className="mt-3 text-[11px] text-emerald-400 leading-snug">
                Done —{" "}
                <a
                  href={`https://solscan.io/tx/${lastSig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-mono"
                >
                  {lastSig.slice(0, 10)}…
                </a>
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!amountValid || busy}
              className={`mt-4 w-full py-3 rounded-full text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                action === "buy"
                  ? "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-300 text-black"
                  : "bg-red-500 hover:bg-red-400 active:bg-red-300 text-black"
              } disabled:bg-white/10 disabled:text-neutral-500`}
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Swapping…
                </>
              ) : (
                `${action === "buy" ? "Buy" : "Sell"} ${outputSymbol}`
              )}
            </button>

            <div className="mt-3 text-[10px] text-neutral-500 leading-snug">
              Routed through Jupiter. Slippage {(slippageBps / 100).toFixed(slippageBps < 100 ? 1 : 0)}%. Network fees are covered — you receive the swap output minus any market price impact.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
