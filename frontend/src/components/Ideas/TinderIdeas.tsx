import { useState, useCallback } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { ThumbsUp, ThumbsDown, X, SkipForward, Sparkles } from "lucide-react";
import { Idea } from "./types";
import { categoryColors } from "./constants";
import { formatTimeAgo } from "./utils";

interface TinderIdeasProps {
  ideas: Idea[];
  onVote: (ideaId: string, voteType: "up" | "down") => void;
  onClose: () => void;
  onIdeaClick?: (idea: Idea) => void;
}

export default function TinderIdeas({ ideas, onVote, onClose, onIdeaClick }: TinderIdeasProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);

  const currentIdea = ideas[currentIndex];
  const isFinished = currentIndex >= ideas.length;

  const goNext = useCallback(() => {
    setExitDirection(null);
    setCurrentIndex((prev) => prev + 1);
  }, []);

  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      if (!currentIdea) return;
      setExitDirection(direction);
      onVote(currentIdea.id, direction === "right" ? "up" : "down");
      setTimeout(goNext, 300);
    },
    [currentIdea, onVote, goNext]
  );

  const handleSkip = useCallback(() => {
    if (!currentIdea) return;
    setExitDirection("right");
    setTimeout(goNext, 300);
  }, [currentIdea, goNext]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-white">Tinder Mode</span>
          {!isFinished && (
            <span className="text-xs text-neutral-500 ml-2">
              {currentIndex + 1} / {ideas.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      {!isFinished && (
        <div className="absolute top-12 sm:top-14 left-4 right-4 sm:left-6 sm:right-6">
          <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500/60 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex) / ideas.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Card area */}
      <div className="relative w-full max-w-sm mx-auto px-4 flex-1 flex items-center justify-center">
        <AnimatePresence mode="popLayout">
          {isFinished ? (
            <motion.div
              key="finished"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-orange-500/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">All done!</h3>
              <p className="text-sm text-neutral-400">
                You've reviewed all {ideas.length} ideas.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 text-sm font-medium hover:bg-orange-500/20 transition-colors"
              >
                Back to Ideas
              </button>
            </motion.div>
          ) : currentIdea ? (
            <SwipeCard
              key={currentIdea.id}
              idea={currentIdea}
              exitDirection={exitDirection}
              onSwipe={handleSwipe}
              onIdeaClick={onIdeaClick}
            />
          ) : null}
        </AnimatePresence>
      </div>

      {/* Action buttons */}
      {!isFinished && (
        <div className="absolute bottom-0 left-0 right-0 pb-6 sm:pb-10 flex items-center justify-center gap-4">
          <button
            onClick={() => handleSwipe("left")}
            className="w-14 h-14 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 hover:bg-orange-500/20 hover:scale-110 active:scale-95 transition-all"
          >
            <ThumbsDown className="w-5 h-5" />
          </button>
          <button
            onClick={handleSkip}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-400 hover:bg-white/10 hover:scale-110 active:scale-95 transition-all"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleSwipe("right")}
            className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 hover:scale-110 active:scale-95 transition-all"
          >
            <ThumbsUp className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function SwipeCard({
  idea,
  exitDirection,
  onSwipe,
  onIdeaClick,
}: {
  idea: Idea;
  exitDirection: "left" | "right" | null;
  onSwipe: (direction: "left" | "right") => void;
  onIdeaClick?: (idea: Idea) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const upvoteOpacity = useTransform(x, [0, 100], [0, 1]);
  const downvoteOpacity = useTransform(x, [-100, 0], [1, 0]);

  const voteScore = idea.upvotes - idea.downvotes;
  const colors = categoryColors[idea.category] || categoryColors["AI x Crypto"];

  return (
    <motion.div
      className="absolute w-full cursor-grab active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragEnd={(_, info) => {
        if (info.offset.x > 100) {
          onSwipe("right");
        } else if (info.offset.x < -100) {
          onSwipe("left");
        }
      }}
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={
        exitDirection
          ? {
              x: exitDirection === "right" ? 400 : -400,
              opacity: 0,
              rotate: exitDirection === "right" ? 20 : -20,
              transition: { duration: 0.3 },
            }
          : { opacity: 1, scale: 1, y: 0 }
      }
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      {/* Swipe indicators */}
      <motion.div
        className="absolute -top-1 -left-1 -right-1 -bottom-1 rounded-2xl border-2 border-emerald-500 z-10 pointer-events-none"
        style={{ opacity: upvoteOpacity }}
      >
        <div className="absolute top-4 left-4 px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40">
          <span className="text-emerald-400 font-bold text-sm flex items-center gap-1">
            <ThumbsUp className="w-3.5 h-3.5" /> UPVOTE
          </span>
        </div>
      </motion.div>
      <motion.div
        className="absolute -top-1 -left-1 -right-1 -bottom-1 rounded-2xl border-2 border-orange-500 z-10 pointer-events-none"
        style={{ opacity: downvoteOpacity }}
      >
        <div className="absolute top-4 right-4 px-3 py-1 rounded-lg bg-orange-500/20 border border-orange-500/40">
          <span className="text-orange-400 font-bold text-sm flex items-center gap-1">
            DOWNVOTE <ThumbsDown className="w-3.5 h-3.5" />
          </span>
        </div>
      </motion.div>

      {/* Card */}
      <div className="rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 shadow-2xl">
        {/* Image */}
        <div className="h-56 sm:h-64 bg-neutral-800/50 relative">
          {idea.generatedImageUrl ? (
            <img
              src={idea.generatedImageUrl}
              alt={idea.title}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Sparkles className="w-12 h-12 text-neutral-700" />
            </div>
          )}
          {/* Vote score badge */}
          <div className="absolute top-3 right-3">
            <div
              className={`px-2.5 py-1 rounded-lg backdrop-blur-md text-xs font-bold ${
                voteScore > 0
                  ? "bg-emerald-500/20 text-emerald-400"
                  : voteScore < 0
                  ? "bg-orange-500/20 text-orange-400"
                  : "bg-white/10 text-neutral-400"
              }`}
            >
              {voteScore > 0 ? "+" : ""}
              {voteScore}
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          className="p-5 space-y-3"
          onClick={() => onIdeaClick?.(idea)}
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-white leading-tight line-clamp-2">
              {idea.title}
            </h3>
            <span
              className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium ${colors.bg} ${colors.text} ${colors.border} border`}
            >
              {idea.category}
            </span>
          </div>

          <p className="text-sm text-neutral-400 leading-relaxed line-clamp-3">
            {idea.description.replace(/\*\*([^*]+)\*\*/g, "$1")}
          </p>

          {/* Author */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <img
                src={idea.authorAvatar}
                alt={idea.authorUsername}
                className="w-4 h-4 rounded-full bg-neutral-800"
                draggable={false}
              />
              <span>@{idea.authorUsername}</span>
              <span>·</span>
              <span>{formatTimeAgo(idea.createdAt)}</span>
            </div>
            {idea.estimatedPrice && idea.estimatedPrice > 0 && (
              <span className="text-xs text-neutral-500 font-medium">
                ${idea.estimatedPrice.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
