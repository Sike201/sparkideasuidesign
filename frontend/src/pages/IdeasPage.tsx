import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams, Link, useOutletContext } from "react-router-dom";
import { Search, Loader2, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { IdeaCard, ideaCategories, Idea } from "@/components/Ideas";
import { toggleIdeaVote } from "@/components/Ideas/feedVoteUtils";
import { compareDemosByFundingCloseness, DEMO_FEED_IDEAS, fundingGoalRatio, isDemoIdeaId } from "@/data/demoFeedIdeas";
import { SEO } from "@/components/SEO";
import { ROUTES } from "@/utils/routes";
import type { IdeasSectionOutletContext } from "@/pages/IdeasSectionLayout";

function matchesFilters(idea: Idea, searchQuery: string, selectedCategories: Set<string>) {
  const q = searchQuery.toLowerCase();
  const matchesSearch =
    idea.title.toLowerCase().includes(q) || idea.description.toLowerCase().includes(q);
  const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(idea.category);
  return matchesSearch && matchesCategory;
}

function statusSort(a: Idea, b: Idea) {
  const aFunded = !!(a.tokenAddress && a.status !== "refunded");
  const bFunded = !!(b.tokenAddress && b.status !== "refunded");
  const aRefunded = a.status === "refunded";
  const bRefunded = b.status === "refunded";
  if (aRefunded && !bRefunded) return 1;
  if (!aRefunded && bRefunded) return -1;
  if (aFunded && !bFunded) return 1;
  if (!aFunded && bFunded) return -1;
  return 0;
}

/** Still seeking capital toward a goal (not launched / not refunded). */
function isClosestToFundingCandidate(idea: Idea): boolean {
  if (idea.status === "refunded") return false;
  const isFunded = !!(idea.tokenAddress && idea.status !== "refunded");
  if (isFunded) return false;
  return (idea.estimatedPrice ?? 0) > 0;
}

const FEATURE_FALLBACK_IMAGE = "/portfolio/credit-spiral.png";
const easeOut = [0.22, 1, 0.36, 1] as const;
const CLOSEST_SPOTLIGHT_COUNT = 3;

export default function IdeasPage() {
  const { auth, ideasData } = useOutletContext<IdeasSectionOutletContext>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const closestScrollerRef = useRef<HTMLDivElement>(null);

  const { setIsSubmitModalOpen } = auth;

  useEffect(() => {
    if (searchParams.get("submit") !== "1") return;
    setIsSubmitModalOpen(true);
    navigate({ pathname: "/ideas", search: "" }, { replace: true });
  }, [searchParams, setIsSubmitModalOpen, navigate]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [demoIdeas, setDemoIdeas] = useState<Idea[]>(() => [...DEMO_FEED_IDEAS]);

  const filteredDemos = useMemo(
    () =>
      demoIdeas
        .filter((i) => matchesFilters(i, searchQuery, selectedCategories))
        .sort(compareDemosByFundingCloseness),
    [demoIdeas, searchQuery, selectedCategories],
  );

  const filteredLive = useMemo(() => {
    const list = ideasData.ideas.filter((i) => matchesFilters(i, searchQuery, selectedCategories));
    return [...list].sort(statusSort);
  }, [ideasData.ideas, searchQuery, selectedCategories]);

  const closestIdeas = useMemo(() => {
    const pool = [...filteredDemos, ...filteredLive].filter(isClosestToFundingCandidate);
    return [...pool]
      .sort((a, b) => fundingGoalRatio(b) - fundingGoalRatio(a))
      .slice(0, CLOSEST_SPOTLIGHT_COUNT);
  }, [filteredDemos, filteredLive]);

  const showLiveDivider = filteredDemos.length > 0 && filteredLive.length > 0;

  const handleIdeaClick = (idea: Idea) => {
    if (isDemoIdeaId(idea.id)) {
      navigate(`/ideas/${idea.slug}`);
      return;
    }
    ideasData.setSelectedIdea(idea);
    navigate(`/ideas/${idea.slug}`);
  };

  const scrollClosest = (dir: -1 | 1) => {
    closestScrollerRef.current?.scrollBy({ left: dir * Math.min(340, window.innerWidth * 0.85), behavior: "smooth" });
  };

  const handleUpvote = useCallback(
    (id: string) => {
      if (isDemoIdeaId(id)) {
        setDemoIdeas((prev) => prev.map((i) => (i.id === id ? toggleIdeaVote(i, "up") : i)));
        return;
      }
      void ideasData.handleVote(id, "up");
    },
    [ideasData],
  );

  const handleDownvote = useCallback(
    (id: string) => {
      if (isDemoIdeaId(id)) {
        setDemoIdeas((prev) => prev.map((i) => (i.id === id ? toggleIdeaVote(i, "down") : i)));
        return;
      }
      void ideasData.handleVote(id, "down");
    },
    [ideasData],
  );

  return (
    <>
      <SEO
        title="Ideas"
        description="Browse and vote on community ideas. Submit your own idea and let the community decide what gets built next."
        path="/ideas"
      />

      <div className="animate-ideas-content-in">
        <header className="mb-8 md:mb-10">
          <p className="font-geist-mono text-[11px] uppercase tracking-[0.3em] text-orange-400/90">Feed</p>
          <h1 className="mt-3 font-satoshi text-[28px] font-semibold tracking-tight text-white sm:text-[32px] md:text-[34px]">Ideas</h1>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-neutral-500 font-geist sm:text-[14px]">
            Closest-to-goal spotlight above; the same ideas stay in the feed so nothing feels hidden. Demo ideas open as full detail pages.
          </p>
        </header>

        {closestIdeas.length > 0 && !ideasData.isLoadingIdeas && !(filteredDemos.length === 0 && filteredLive.length === 0) && (
          <section className="mb-8 md:mb-10" aria-labelledby="closest-goal-heading">
            <div className="mb-4 flex items-start justify-between gap-3 sm:gap-4">
              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-emerald-500/25 bg-emerald-500/[0.08] sm:h-10 sm:w-10">
                  <TrendingUp className="h-4 w-4 text-emerald-400 sm:h-[18px] sm:w-[18px]" strokeWidth={2} />
                </div>
                <div className="min-w-0 pt-0.5">
                  <h2 id="closest-goal-heading" className="font-satoshi text-[17px] font-semibold tracking-tight text-white sm:text-[19px]">
                    Closest to funding goal
                  </h2>
                  <p className="mt-1 text-[12px] leading-relaxed text-neutral-500 font-geist sm:text-[13px]">
                    Almost there — back these ideas now.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1 md:hidden">
                <button
                  type="button"
                  aria-label="Scroll spotlight left"
                  onClick={() => scrollClosest(-1)}
                  className="flex h-9 w-9 items-center justify-center rounded-none border border-white/[0.08] text-neutral-400 transition-colors hover:border-orange-500/30 hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Scroll spotlight right"
                  onClick={() => scrollClosest(1)}
                  className="flex h-9 w-9 items-center justify-center rounded-none border border-white/[0.08] text-neutral-400 transition-colors hover:border-orange-500/30 hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              ref={closestScrollerRef}
              className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden"
            >
              {closestIdeas.map((spotIdea, idx) => {
                const goal = spotIdea.estimatedPrice ?? 0;
                const raised = spotIdea.raisedAmount ?? 0;
                const pct = goal > 0 ? Math.min(100, Math.round(fundingGoalRatio(spotIdea) * 100)) : 0;
                return (
                  <motion.article
                    key={spotIdea.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.06, ease: easeOut }}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleIdeaClick(spotIdea)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleIdeaClick(spotIdea);
                      }
                    }}
                    className="group flex w-[min(100%,340px)] shrink-0 cursor-pointer snap-start flex-col overflow-hidden rounded-none bg-black text-left shadow-none transition-opacity duration-200 hover:opacity-95 md:w-auto"
                  >
                    <div className="relative aspect-[16/11] min-h-[140px] overflow-hidden bg-black sm:aspect-[16/10]">
                      <img
                        src={spotIdea.generatedImageUrl || FEATURE_FALLBACK_IMAGE}
                        alt=""
                        className="block h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
                      />
                      <div
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/90 to-transparent"
                        aria-hidden
                      />
                      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3 sm:p-4">
                        <h3 className="line-clamp-2 max-w-[90%] font-satoshi text-[15px] font-semibold leading-snug tracking-tight text-white drop-shadow-sm sm:text-[16px]">
                          {spotIdea.title}
                        </h3>
                        <span className="shrink-0 rounded-none border border-violet-500/35 bg-violet-500/15 px-1.5 py-0.5 font-geist text-[9px] font-medium uppercase tracking-wider text-violet-200/95">
                          {spotIdea.category}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-white/[0.06] bg-black px-3 py-3 sm:px-4 sm:py-3.5">
                      <div className="h-1 overflow-hidden rounded-none bg-white/[0.08]">
                        <motion.div
                          className="h-full rounded-none bg-gradient-to-r from-emerald-600 to-emerald-400"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.75, delay: 0.06 + idx * 0.05, ease: easeOut }}
                        />
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2 font-geist-mono text-[10px] tabular-nums text-neutral-500 sm:text-[11px]">
                        <span className="text-emerald-400/95">{pct}%</span>
                        <span>
                          $ {raised.toLocaleString("en-US")} / {goal.toLocaleString("en-US")}
                        </span>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </section>
        )}

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end md:mb-8">
          <label className="relative block min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Search ideas</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600" />
            <input
              type="search"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full border border-white/[0.06] bg-white/[0.03] pl-9 pr-3 text-[12px] text-white placeholder:text-neutral-600 outline-none transition-colors focus:border-orange-500/25 focus:bg-white/[0.05] font-geist"
            />
          </label>

          <div className="flex flex-wrap items-center gap-0.5">
            {(
              [
                { value: "votes" as const, label: "Score" },
                { value: "newest" as const, label: "New" },
                { value: "oldest" as const, label: "Old" },
                { value: "raised" as const, label: "Raised" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => ideasData.setSortBy(opt.value)}
                className={`rounded-none px-2.5 py-1.5 text-[11px] font-medium font-geist transition-colors ${
                  ideasData.sortBy === opt.value ? "text-orange-400" : "text-neutral-500 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Category"
            value={selectedCategories.size === 1 ? [...selectedCategories][0] : ""}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedCategories(val ? new Set([val]) : new Set());
            }}
            className="h-9 border border-white/[0.06] bg-white/[0.03] px-2.5 text-[11px] text-white outline-none transition-colors focus:border-orange-500/25 sm:ml-auto font-geist"
          >
            <option value="">All categories</option>
            {ideaCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {ideasData.isLoadingIdeas ? (
          <div className="flex flex-col items-center justify-center gap-3 py-28">
            <Loader2 className="h-7 w-7 animate-spin text-orange-500" />
            <span className="text-[12px] text-neutral-500 font-geist">Loading</span>
          </div>
        ) : filteredDemos.length === 0 && filteredLive.length === 0 ? (
          <p className="py-20 text-center text-[12px] text-neutral-500 font-geist sm:text-[13px]">
            No ideas match your filters.{" "}
            <Link to={ROUTES.IDEAS} className="text-orange-400 hover:underline" onClick={() => { setSearchQuery(""); setSelectedCategories(new Set()); }}>
              Clear search
            </Link>
          </p>
        ) : (
          <div className="mx-auto w-full">
            <div className="grid grid-cols-1">
              {filteredDemos.map((idea) => (
                <div key={idea.id} className="bg-transparent hover:bg-white/[0.02]">
                  <IdeaCard
                    idea={idea}
                    density="condensed"
                    onUpvote={handleUpvote}
                    onDownvote={handleDownvote}
                    onClick={() => handleIdeaClick(idea)}
                  />
                </div>
              ))}
              {showLiveDivider && (
                <div className="bg-transparent px-3 py-3 text-center sm:px-4">
                  <p className="font-geist-mono text-[10px] uppercase tracking-[0.32em] text-neutral-600">
                    Live from the network
                  </p>
                </div>
              )}
              {filteredLive.map((idea) => (
                <div key={idea.id} className="bg-transparent hover:bg-white/[0.02]">
                  <IdeaCard
                    idea={idea}
                    density="condensed"
                    onUpvote={handleUpvote}
                    onDownvote={handleDownvote}
                    onClick={() => handleIdeaClick(idea)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
