import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, TrendingUp, DollarSign, Timer, Lock, Sparkles } from "lucide-react";
import { useIdeasAuth } from "@/hooks/useIdeasAuth";
import { useIdeasData } from "@/hooks/useIdeasData";
import IdeasLayout from "@/components/Ideas/IdeasLayout";
import { IdeaCard, ideaCategories, categoryColors, Idea } from "@/components/Ideas";
import TinderIdeas from "@/components/Ideas/TinderIdeas";
import { SEO } from "@/components/SEO";

export default function IdeasPage() {
  const auth = useIdeasAuth();
  const ideasData = useIdeasData(auth);
  const navigate = useNavigate();

  // Local filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [showTinder, setShowTinder] = useState(false);

  const filteredIdeas = ideasData.ideas.filter(idea => {
    const matchesSearch = idea.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      idea.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(idea.category);
    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    const aFunded = !!(a.tokenAddress && a.status !== "refunded");
    const bFunded = !!(b.tokenAddress && b.status !== "refunded");
    const aRefunded = a.status === "refunded";
    const bRefunded = b.status === "refunded";
    // Refunded always at the bottom
    if (aRefunded && !bRefunded) return 1;
    if (!aRefunded && bRefunded) return -1;
    // Funded just above refunded (below normal ideas)
    if (aFunded && !bFunded) return 1;
    if (!aFunded && bFunded) return -1;
    return 0;
  });

  const handleIdeaClick = (idea: Idea) => {
    ideasData.setSelectedIdea(idea);
    navigate(`/ideas/${idea.slug}`);
  };

  // Featured ideas - closest to goal
  const closestToGoal = ideasData.ideas
    .filter(i => i.status !== "refunded" && !i.tokenAddress && i.estimatedPrice && i.estimatedPrice > 0 && i.raisedAmount && i.raisedAmount > 0)
    .map(i => ({
      ...i,
      progress: ((i.raisedAmount || 0) / (i.estimatedPrice || 1)) * 100,
    }))
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);

  return (
    <IdeasLayout auth={auth} ideasData={ideasData}>
      <SEO
        title="Ideas"
        description="Browse and vote on community ideas. Submit your own idea and let the community decide what gets built next."
        path="/ideas"
      />
      <div className="animate-fade-in">
        {/* Featured Ideas - Closest to Goal */}
        {closestToGoal.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-satoshi">Closest to Funding Goal</h3>
                <p className="text-[11px] text-neutral-500 font-geist">Almost there — back these ideas now</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {closestToGoal.map((idea) => {
                const colors = categoryColors[idea.category] || categoryColors["AI x Crypto"];
                return (
                  <div
                    key={idea.id}
                    onClick={() => handleIdeaClick(idea)}
                    className="group relative rounded-2xl bg-white/[0.02] border border-emerald-500/15 hover:border-emerald-500/40 transition-all duration-500 cursor-pointer overflow-hidden"
                  >
                    {/* Top accent */}
                    <div className="h-[2px] bg-gradient-to-r from-emerald-500/50 via-emerald-400/50 to-transparent" />
                    <div className="h-56 bg-neutral-900/30 relative overflow-hidden">
                      {idea.generatedImageUrl ? (
                        <img src={idea.generatedImageUrl} alt={idea.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <TrendingUp className="w-10 h-10 text-emerald-500/10" />
                        </div>
                      )}
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#030303] via-transparent to-transparent" />
                    </div>
                    <div className="p-5 -mt-8 relative z-10">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <h4 className="text-sm font-bold text-white line-clamp-1 group-hover:text-emerald-100 transition-colors font-satoshi">
                          {idea.title}
                        </h4>
                        <span className={`shrink-0 px-2 py-0.5 rounded-md text-[9px] font-semibold ${colors.bg} ${colors.text} ${colors.border} border`}>
                          {idea.category}
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, idea.progress)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-emerald-400 font-bold font-satoshi">{idea.progress.toFixed(0)}%</span>
                        <span className="text-neutral-500 flex items-center gap-0.5 font-geist">
                          <DollarSign className="w-3 h-3" />
                          {(idea.raisedAmount || 0).toLocaleString()} / {(idea.estimatedPrice || 0).toLocaleString()}
                        </span>
                      </div>
                      {/* Countdown */}
                      {(() => {
                        if (!idea.capReachedAt) return null;
                        const capDeadline = new Date(new Date(idea.capReachedAt).getTime() + 24 * 60 * 60 * 1000);
                        const timeLeft = Math.max(0, capDeadline.getTime() - ideasData.now.getTime());
                        if (timeLeft === 0) {
                          return (
                            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-red-400 font-satoshi">
                              <Lock className="w-3 h-3" />
                              <span className="font-semibold">Investment Round Closed</span>
                            </div>
                          );
                        }
                        const d = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                        const h = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const m = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                        const s = Math.floor((timeLeft % (1000 * 60)) / 1000);
                        const pad = (n: number) => n.toString().padStart(2, "0");
                        return (
                          <div className="mt-3 flex items-center gap-2 text-[11px]">
                            <Timer className="w-3 h-3 text-yellow-400" />
                            <span className="text-yellow-400 font-semibold font-satoshi">Closes in</span>
                            <span className="text-yellow-300 font-mono font-bold tracking-wide">{pad(d)}:{pad(h)}:{pad(m)}:{pad(s)}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Separator */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mb-8" />

        {/* Filter Bar */}
        <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
            <input
              type="text"
              placeholder="Search ideas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500/30 focus:bg-white/[0.05] transition-all duration-300 font-geist"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/[0.06] rounded-xl p-1">
            {([
              { value: "votes", label: "Trending" },
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
              { value: "raised", label: "Most Raised" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => ideasData.setSortBy(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 font-satoshi ${
                  ideasData.sortBy === opt.value
                    ? "bg-orange-500/15 text-orange-400 shadow-sm"
                    : "text-neutral-500 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            value={selectedCategories.size === 1 ? [...selectedCategories][0] : ""}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedCategories(val ? new Set([val]) : new Set());
            }}
            className="h-10 px-4 bg-white/[0.03] border border-white/[0.06] rounded-xl text-xs text-white appearance-none cursor-pointer focus:outline-none focus:border-orange-500/30 transition-all duration-300 font-satoshi"
          >
            <option value="">All Categories</option>
            {ideaCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

          <button
            onClick={() => setShowTinder(true)}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-orange-500/10 to-pink-500/10 text-orange-400 border border-orange-500/15 hover:from-orange-500/20 hover:to-pink-500/20 hover:border-orange-500/30 transition-all duration-300 font-satoshi"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Tinder Mode
          </button>
        </div>

        {/* Ideas Grid */}
        {ideasData.isLoadingIdeas ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <span className="text-sm text-neutral-500 font-satoshi">Loading ideas...</span>
          </div>
        ) : filteredIdeas.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-neutral-500 font-satoshi">No ideas found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredIdeas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onUpvote={(id) => ideasData.handleVote(id, 'up')}
                onDownvote={(id) => ideasData.handleVote(id, 'down')}
                onClick={() => handleIdeaClick(idea)}
              />
            ))}
          </div>
        )}
      </div>

      {showTinder && (
        <TinderIdeas
          ideas={filteredIdeas.filter(i => i.status !== "refunded" && !i.tokenAddress)}
          onVote={(id, type) => ideasData.handleVote(id, type)}
          onClose={() => setShowTinder(false)}
          onIdeaClick={(idea) => {
            setShowTinder(false);
            handleIdeaClick(idea);
          }}
        />
      )}
    </IdeasLayout>
  );
}
