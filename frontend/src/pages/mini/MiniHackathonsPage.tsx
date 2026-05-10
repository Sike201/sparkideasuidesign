/**
 * MiniHackathonsPage — `/m/hackathons`
 *
 * Mobile-first list of hackathons with an active decision market. We show
 * LIVE (open/voting) first, then upcoming, then completed — same priority
 * ordering as the desktop HackathonsPage but without tabs/search because
 * we expect at most a handful of live hackathons at a time.
 *
 * Each card deep-links to `/m/hackathons/:id`. Hackathons without a
 * `combinator_proposal_pda` are hidden — they have nothing to trade yet,
 * so exposing them in the mini-app would just confuse users.
 */

import { useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Trophy, ChevronRight } from "lucide-react"
import { backendSparkApi, type GetHackathonsResponse } from "@/data/api/backendSparkApi"
import {
  readCache,
  writeCache,
  MINI_CACHE_KEYS,
  HACKATHONS_CACHE_MAX_MS,
} from "@/utils/miniCache"
import type { HackathonModel } from "@/data/api/backendSparkApi"
import { useMiniAuth } from "@/hooks/useMiniAuth"
import MiniLayout from "@/components/Mini/MiniLayout"
import { ROUTES } from "@/utils/routes"

type EffectiveStatus = "open" | "voting" | "upcoming" | "completed"

// Same date-aware status computation as the desktop page — the stored
// status drifts from reality if nobody runs a cron to update it, so we
// derive it from start_date/end_date on every render.
function effectiveStatus(h: HackathonModel): EffectiveStatus {
  if (h.status === "completed") return "completed"
  const now = Date.now()
  const start = h.start_date ? new Date(h.start_date).getTime() : null
  const end = h.end_date ? new Date(h.end_date).getTime() : null
  if (start && end) {
    if (now < start) return "upcoming"
    if (now >= start && now < end) return "open"
    if (now >= end) return "voting"
  }
  return h.status
}

function statusRank(s: EffectiveStatus): number {
  if (s === "open" || s === "voting") return 0
  if (s === "upcoming") return 1
  return 2
}

function statusLabel(s: EffectiveStatus): { text: string; color: string } {
  switch (s) {
    case "open":
      return { text: "LIVE", color: "text-green-400" }
    case "voting":
      return { text: "VOTING", color: "text-amber-400" }
    case "upcoming":
      return { text: "SOON", color: "text-blue-400" }
    case "completed":
      return { text: "ENDED", color: "text-neutral-500" }
  }
}

export default function MiniHackathonsPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useMiniAuth()

  // Any authenticated-gate check stays on /m/me — but every other /m route
  // redirects to the landing if the user isn't signed in, so deep links
  // (shared URLs, home-screen icons) always land somewhere meaningful.
  useEffect(() => {
    if (!isAuthenticated) {
      navigate(ROUTES.MINI, { replace: true })
    }
  }, [isAuthenticated, navigate])

  const { data, isLoading, error } = useQuery<GetHackathonsResponse>({
    queryKey: ["mini", "hackathons"],
    queryFn: async () => {
      const r = await backendSparkApi.getHackathons()
      writeCache(MINI_CACHE_KEYS.HACKATHONS, r)
      return r
    },
    enabled: isAuthenticated,
    // Show cached list instantly while we fetch fresh — titles,
    // tickers, statuses don't change between sessions for the same
    // hackathon, so a 30-min stale window is invisible to the user.
    placeholderData: () =>
      readCache<GetHackathonsResponse>(
        MINI_CACHE_KEYS.HACKATHONS,
        HACKATHONS_CACHE_MAX_MS,
      ) ?? undefined,
  })

  const hackathons = (data?.hackathons || [])
    // Hide hackathons that don't have a decision market deployed yet.
    // Without a proposal PDA there's nothing to trade and the user would
    // hit a dead-end on the detail page.
    .filter(h => !!h.combinator_proposal_pda)
    .map(h => ({ ...h, _status: effectiveStatus(h) }))
    .sort((a, b) => {
      // Primary: status group (live/voting → upcoming → completed).
      const r = statusRank(a._status) - statusRank(b._status)
      if (r !== 0) return r
      // Tie-breaker for the completed group: most-recently-ended
      // first. Without this, completed hackathons came out in DB
      // insertion order (oldest at the top of the section), which
      // buried the freshest results behind months-old wrap-ups.
      if (a._status === "completed" && b._status === "completed") {
        const aEnd = a.end_date ? new Date(a.end_date).getTime() : 0
        const bEnd = b.end_date ? new Date(b.end_date).getTime() : 0
        return bEnd - aEnd
      }
      return 0
    })

  return (
    <MiniLayout>
      <div className="pt-8 pb-6">
        <h1 className="text-xl font-bold mb-1">Ideas</h1>
        <p className="text-xs text-neutral-500 mb-6">
          Trade the decision market. Winner ships.
        </p>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-300">
            Couldn't load hackathons.
          </div>
        )}

        {data && hackathons.length === 0 && (
          <div className="text-center py-16 text-neutral-500">
            <Trophy className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-xs">No live hackathons right now.</p>
          </div>
        )}

        <div className="space-y-3">
          {hackathons.map(h => {
            const label = statusLabel(h._status)
            // Top builders — sorted by current odds — surfaced as an
            // avatar strip directly on the idea card so users can see who
            // is competing without drilling in. The strip is also the
            // jump-off point to "see all builders" (the card itself).
            // We cap at the first 4 to keep the strip predictable on
            // narrow phones; the count chip tells users how many more
            // are hidden.
            const proposals = h.proposals ?? []
            const topBuilders = [...proposals]
              .sort((a, b) => (b.market_odds ?? 0) - (a.market_odds ?? 0))
              .slice(0, 4)
            const totalBuilders = h.proposals_count ?? proposals.length
            const extraBuilders = Math.max(0, totalBuilders - topBuilders.length)
            return (
              <div
                key={h.id}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
              >
                {/* Top section: idea identity — clicking anywhere here
                    drills into the detail page where users can read each
                    builder's full proposal. Kept as a Link so the whole
                    block is a single tap target. */}
                <Link
                  to={`/mini-app/hackathons/${h.id}`}
                  className="block hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-stretch">
                    {h.idea_image_url && (
                      <div className="w-20 shrink-0 bg-neutral-900/40">
                        <img
                          src={h.idea_image_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 p-4 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-bold tracking-wider ${label.color}`}>
                            {label.text}
                          </span>
                          <span className="text-[9px] text-neutral-600">·</span>
                          <span className="text-[10px] text-neutral-500">
                            {totalBuilders} builders
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-white truncate">
                          {h.idea_title}
                        </div>
                        <div className="text-[11px] font-bold text-amber-400 mt-1">
                          Up to ${h.usdg_amount.toLocaleString()} USDC
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
                    </div>
                  </div>
                </Link>

                {/* Builders strip — avatars are the clickable entry per
                    builder. Tapping a face takes you straight to that
                    builder's profile page so the user can vet them
                    before placing a position. We render a strip even
                    when the list is empty so the card height is stable
                    across hackathons (with a placeholder hint instead
                    of avatars). */}
                {topBuilders.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-white/[0.04] flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {topBuilders.map(p => (
                        <Link
                          key={p.id}
                          to={p.builder ? `/builders/${p.builder.username}` : `/mini-app/hackathons/${h.id}`}
                          aria-label={p.builder?.display_name || p.builder?.username || "Builder"}
                          className="block rounded-full ring-2 ring-[#030303] hover:z-10 transition-transform hover:-translate-y-0.5"
                        >
                          {p.builder?.avatar_url ? (
                            <img
                              src={p.builder.avatar_url}
                              alt=""
                              className="w-7 h-7 rounded-full bg-neutral-800 object-cover"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-400">
                              {(p.builder?.username || "?").slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </Link>
                      ))}
                      {extraBuilders > 0 && (
                        <Link
                          to={`/mini-app/hackathons/${h.id}`}
                          className="w-7 h-7 rounded-full ring-2 ring-[#030303] bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-300 hover:bg-neutral-700"
                        >
                          +{extraBuilders}
                        </Link>
                      )}
                    </div>
                    <div className="text-[10px] text-neutral-500 ml-1 truncate">
                      Tap a builder to see their proposal
                    </div>
                  </div>
                )}

                {/* CTA — primary action for live/upcoming markets is
                    "Trade the market" (amber). Once the market is
                    settled there's nothing to trade, so we degrade the
                    button into a neutral "See the market" link that
                    still drops users into the trade page (read-only
                    final state with chart + winner). The colour change
                    matches the visual hierarchy: amber == take an
                    action, neutral == look at history. */}
                {h.combinator_proposal_pda && h._status !== "completed" && (
                  <Link
                    to={`/mini-app/trade/${h.combinator_proposal_pda}`}
                    className="block w-full py-3 text-center text-[13px] font-semibold text-black bg-amber-500 hover:bg-amber-400 active:bg-amber-300 transition-colors"
                  >
                    Trade the market
                  </Link>
                )}
                {h.combinator_proposal_pda && h._status === "completed" && (
                  <Link
                    to={`/mini-app/trade/${h.combinator_proposal_pda}`}
                    className="block w-full py-3 text-center text-[13px] font-semibold text-neutral-300 bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors"
                  >
                    See the market
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </MiniLayout>
  )
}
