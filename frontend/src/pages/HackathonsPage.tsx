import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import HackathonLayout from "@/components/Hackathon/HackathonLayout";
import { StatusBadge } from "@/components/Hackathon/AsciiBox";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import type { HackathonStatus } from "@/components/Hackathon/types";
import { withSwrCache } from "@/utils/miniCache";

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
  { label: "ALL", value: "all" },
  { label: "LIVE", value: "live" },
  { label: "UPCOMING", value: "upcoming" },
  { label: "PAST", value: "past" },
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

  const hackathons = (apiData?.hackathons || []).map((h) => ({
    ...h,
    status: computeStatus(h as any),
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
        <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-24 pb-16 font-mono">
          {/* ── header ─────────────────────────────────── */}
          <div className="flex items-baseline justify-between mb-8">
            <h1 className="text-2xl uppercase tracking-wider font-bold">
              <span className="text-[#F25C05]">&gt;</span>{" "}
              <span className="text-[#F5F5F6]">HACKATHONS</span>
            </h1>
            {buildersCount > 0 && (
              <span className="text-xs text-[#A0A3A9]">{buildersCount.toLocaleString()} builders</span>
            )}
          </div>

          {/* ── filter bar ─────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            {/* tabs */}
            <div className="flex gap-2">
              {TABS.map((tab) => {
                const active = filter === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setFilter(tab.value)}
                    className={`text-xs font-mono px-3 py-1.5 border rounded-none transition-colors ${
                      active
                        ? "text-[#F5F5F6] border-[#F25C05] bg-[#F25C05]/10"
                        : "text-[#A0A3A9] border-[#444B57] hover:border-[#F25C05]/30"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* search */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#A0A3A9]">search:</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent border-b border-[#444B57] text-xs text-[#F5F5F6] px-1 py-1 w-full sm:w-48 focus:border-[#F25C05] outline-none font-mono rounded-none"
                spellCheck={false}
              />
            </div>
          </div>

          {/* ── loading ────────────────────────────────── */}
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[#F25C05] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* ── cards list ─────────────────────────────── */}
          {!isLoading && <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.03 } },
            }}
            className="space-y-4"
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
                  <div className="border border-dashed border-[#2A3040] hover:border-[#F25C05]/40 transition-all duration-300 cursor-pointer rounded-none">
                    <div className="flex items-stretch">
                      {/* image strip */}
                      {h.idea_image_url && (
                        <div className="w-16 sm:w-20 shrink-0 border-r border-dashed border-[#2A3040]">
                          <img
                            src={h.idea_image_url}
                            alt=""
                            className="w-full h-full object-cover opacity-70"
                          />
                        </div>
                      )}

                      {/* main content */}
                      <div className="flex-1 px-3 sm:px-5 py-3 min-w-0">
                        {/* mobile: stacked layout */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-bold text-[#F5F5F6] block truncate">
                              {h.idea_title}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="text-xs text-[#A0A3A9]">
                                {(h as any).proposals_count ?? h.proposals?.length ?? 0} builder{((h as any).proposals_count ?? h.proposals?.length ?? 0) !== 1 ? "s" : ""}
                              </span>
                              {(h as any).category && (
                                <span className="text-[10px] text-[#F25C05] border border-[#F25C05]/30 bg-[#F25C05]/5 px-1.5 py-0.5">
                                  {(h as any).category}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0">
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
                        <div className="mt-2">
                          <span className="text-sm sm:text-base font-bold text-[#F25C05]">
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
              <div className="text-center text-xs text-[#A0A3A9] py-12">
                no hackathons found_
              </div>
            )}
          </motion.div>}
        </div>
      </motion.div>
    </HackathonLayout>
  );
}

export default HackathonsPage;
