import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import HackathonLayout from "@/components/Hackathon/HackathonLayout";
import { StatusBadge } from "@/components/Hackathon/AsciiBox";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import type { HackathonModel } from "@/data/api/backendSparkApi";
import type { HackathonStatus } from "@/components/Hackathon/types";
import { withSwrCache } from "@/utils/miniCache";
import { MOCK_HACKATHONS_FOR_LIST } from "@/data/mockHackathonsFeed";

/* ── compute effective status from dates ───────────────── */

function computeStatus(h: { status: HackathonStatus; start_date?: string; end_date?: string }): HackathonStatus {
  if (h.status === "completed") return "completed";
  const now = Date.now();
  const start = h.start_date ? new Date(h.start_date).getTime() : null;
  const end = h.end_date ? new Date(h.end_date).getTime() : null;
  if (start && end) {
    if (now < start) return "upcoming";
    if (now >= start && now < end) return "open";
    if (now >= end) return "voting";
  }
  return h.status;
}

/* ── countdown hook ────────────────────────────────────── */

function useCountdown(target: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, new Date(target).getTime() - now);
  if (diff === 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d)}d:${pad(h)}h:${pad(m)}m:${pad(s)}s`;
}

/* ── countdown display per card ────────────────────────── */

function CountdownDisplay({
  status,
  countdown_target,
  start_date,
  end_date,
}: {
  status: HackathonStatus;
  countdown_target: string;
  start_date?: string;
  end_date?: string;
}) {
  const effectiveStatus = computeStatus({ status, start_date, end_date });
  const startsIn = useCountdown(start_date || "");
  const endsIn = useCountdown(end_date || countdown_target);

  if (effectiveStatus === "completed") {
    return <span className="text-xs text-[#A0A3A9]">ended</span>;
  }

  if (effectiveStatus === "upcoming" && startsIn) {
    return <span className="text-xs text-[#F5F5F6] flicker">starts in {startsIn}</span>;
  }

  if (effectiveStatus === "upcoming") {
    const dateStr = start_date || countdown_target;
    const date = new Date(dateStr);
    const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return <span className="text-xs text-[#B0B3B8]">starts {formatted}</span>;
  }

  // open or voting — live countdown to end
  if (!endsIn) return null;
  return (
    <span className="text-xs text-[#F5F5F6] flicker">
      ends in {endsIn}
    </span>
  );
}

/* ── filter types ──────────────────────────────────────── */

type FilterTab = "all" | "live" | "upcoming" | "past";

const TABS: { label: string; value: FilterTab }[] = [
  { label: "All", value: "all" },
  { label: "Live", value: "live" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Past", value: "past" },
];

/* ── page component ────────────────────────────────────── */

function HackathonsPage() {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["hackathons"],
    ...withSwrCache(
      () => backendSparkApi.getHackathons(),
      "desktop_cache_hackathons",
      30 * 60_000, // 30 min — list is essentially static between sessions
    ),
    refetchOnWindowFocus: false,
  });

  const { data: buildersData } = useQuery({
    queryKey: ["builders-count"],
    ...withSwrCache(
      () => backendSparkApi.getBuilders(),
      "desktop_cache_builders",
      30 * 60_000,
    ),
    refetchOnWindowFocus: false,
  });

  const buildersCount = buildersData?.builders?.length ?? 0;

  const apiRows: HackathonModel[] = (apiData?.hackathons || []).map((h) => ({
    ...h,
    proposals: h.proposals || [],
    milestones: h.milestones || [],
  }));

  const seenIds = new Set(apiRows.map((h) => h.id));
  const mockRows = MOCK_HACKATHONS_FOR_LIST.filter((m) => !seenIds.has(m.id)).map((h) => ({
    ...h,
    proposals: h.proposals || [],
    milestones: h.milestones || [],
  }));

  const hackathons = [...mockRows, ...apiRows].map((h) => ({
    ...h,
    status: computeStatus(h as { status: HackathonStatus; start_date?: string; end_date?: string }),
    proposals: h.proposals || [],
    milestones: h.milestones || [],
  }));

  // Sort priority: open/voting (live) → upcoming → completed → anything else
  const statusRank = (s: HackathonStatus): number => {
    if (s === "open" || s === "voting") return 0;
    if (s === "upcoming") return 1;
    if (s === "completed") return 2;
    return 3;
  };

  const filtered = hackathons
    .filter((h) => {
      // status filter (using computed status)
      if (filter === "live" && h.status !== "open" && h.status !== "voting") return false;
      if (filter === "upcoming" && h.status !== "upcoming") return false;
      if (filter === "past" && h.status !== "completed") return false;

      // search filter
      if (search && !h.idea_title.toLowerCase().includes(search.toLowerCase())) return false;

      return true;
    })
    .sort((a, b) => {
      // Primary: status group (live/voting → upcoming → completed → other).
      const r = statusRank(a.status) - statusRank(b.status);
      if (r !== 0) return r;
      // Tie-breaker for the completed group: most-recently-ended
      // first. Without this, completed hackathons came out in DB
      // insertion order (oldest at the top of the section), which
      // buried the freshest results behind months-old wrap-ups.
      if (a.status === "completed" && b.status === "completed") {
        const aEnd = a.end_date ? new Date(a.end_date).getTime() : 0;
        const bEnd = b.end_date ? new Date(b.end_date).getTime() : 0;
        return bEnd - aEnd;
      }
      return 0;
    });

  const formatPrize = (amount: number) =>
    `Up to $${amount.toLocaleString("en-US")} USDG`;

  return (
    <HackathonLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mx-auto max-w-3xl px-6 pb-16 pt-20 font-geist text-neutral-400 antialiased md:px-10 md:pt-24">
          {/* ── header ─────────────────────────────────── */}
          <div className="mb-10 md:mb-12">
            <p className="font-geist-mono text-[11px] uppercase tracking-[0.3em] text-orange-400/90">Events</p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <h1 className="font-satoshi text-[26px] font-semibold tracking-tight text-white sm:text-[28px]">Hackathons</h1>
              {buildersCount > 0 && (
                <span className="text-[11px] text-neutral-500 md:text-[12px]">
                  {buildersCount.toLocaleString()} builders
                </span>
              )}
            </div>
          </div>

          {/* ── filter bar ─────────────────────────────── */}
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            {/* tabs */}
            <div className="flex flex-wrap gap-1">
              {TABS.map((tab) => {
                const active = filter === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setFilter(tab.value)}
                    className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors md:text-[12px] ${
                      active
                        ? "text-orange-400"
                        : "text-neutral-500 hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* search */}
            <label className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xs">
              <span className="sr-only">Search hackathons</span>
              <span className="shrink-0 font-geist-mono text-[10px] uppercase tracking-wider text-neutral-600">Search</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 min-w-0 flex-1 border-b border-white/[0.08] bg-transparent text-[12px] text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-orange-500/40"
                placeholder="Title"
                spellCheck={false}
              />
            </label>
          </div>

          {/* ── loading ────────────────────────────────── */}
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#F25C05] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* ── cards list ─────────────────────────────── */}
          {!isLoading && (
            <motion.div
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.03 } },
              }}
              className="space-y-5"
            >
              {filtered.map((h) => (
                <motion.div
                  key={h.id}
                  variants={{
                    hidden: { opacity: 0 },
                    show: { opacity: 1 },
                  }}
                >
                  <Link to={`/hackathons/${h.id}`}>
                    <div className="border border-white/[0.06] bg-white/[0.02] transition-colors duration-300 hover:border-orange-500/20 hover:bg-white/[0.04]">
                      <div className="flex items-stretch">
                        {/* image strip */}
                        {h.idea_image_url && (
                          <div className="w-16 shrink-0 border-r border-white/[0.06] sm:w-20">
                            <img
                              src={h.idea_image_url}
                              alt=""
                              className="h-full w-full object-cover opacity-80"
                            />
                          </div>
                        )}

                        {/* main content */}
                        <div className="min-w-0 flex-1 px-3 py-4 sm:px-5">
                          {/* mobile: stacked layout */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="block truncate font-satoshi text-[15px] font-semibold tracking-tight text-white sm:text-[16px]">
                                {h.idea_title}
                              </span>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span className="text-[11px] text-neutral-500">
                                  {(h as any).proposals_count ?? h.proposals?.length ?? 0} builder
                                  {((h as any).proposals_count ?? h.proposals?.length ?? 0) !== 1 ? "s" : ""}
                                </span>
                                {(h as any).category && (
                                  <span className="border border-orange-500/25 bg-orange-500/5 px-1.5 py-0.5 font-geist-mono text-[10px] uppercase tracking-wider text-orange-400/90">
                                    {(h as any).category}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end">
                              <StatusBadge status={h.status} />
                              <div className="mt-1">
                                <CountdownDisplay
                                  status={h.status}
                                  countdown_target={h.countdown_target}
                                  start_date={(h as any).start_date}
                                  end_date={(h as any).end_date}
                                />
                              </div>
                            </div>
                          </div>
                          {/* prize row */}
                          <div className="mt-3">
                            <span className="text-[13px] font-semibold text-orange-400/95 sm:text-[14px]">
                              {formatPrize(h.usdg_amount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}

              {filtered.length === 0 && (
                <div className="py-14 text-center text-[12px] text-neutral-600">No hackathons match.</div>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
    </HackathonLayout>
  );
}

export default HackathonsPage;
