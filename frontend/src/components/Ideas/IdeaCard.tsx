import { Link } from "react-router-dom";
import { MessageSquare, ThumbsUp, ThumbsDown } from "lucide-react";
import { Idea } from "./types";
import { formatTimeAgo } from "./utils";
import React from "react";

interface IdeaCardProps {
  idea: Idea;
  onUpvote: (id: string) => void;
  onDownvote: (id: string) => void;
  onClick: () => void;
}

export function IdeaCard({ idea, onUpvote, onDownvote, onClick }: IdeaCardProps) {
  const voteScore = idea.upvotes - idea.downvotes;
  const isRefunded = idea.status === "refunded";
  const isFunded = !!(idea.tokenAddress && idea.status !== "refunded");

  return (
    <div
      className={`group relative rounded-2xl transition-all duration-500 cursor-pointer select-none overflow-hidden ${
        isRefunded
          ? "opacity-40 grayscale border border-white/[0.04] bg-white/[0.01]"
          : isFunded
          ? "border border-amber-500/20 bg-amber-500/[0.02] hover:border-amber-500/40"
          : "border border-white/[0.06] bg-white/[0.02] hover:border-orange-500/20 hover:bg-white/[0.04]"
      }`}
      onClick={onClick}
    >
      {/* Top accent line */}
      {!isRefunded && !isFunded && (
        <div className="h-[1px] bg-gradient-to-r from-orange-500/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      )}
      {isFunded && (
        <div className="h-[1px] bg-gradient-to-r from-amber-500/40 via-emerald-500/20 to-transparent" />
      )}

      <div className="p-5 flex gap-4">
        {/* Vote Buttons */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpvote(idea.id);
            }}
            className={`group/vote flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300 ${
              idea.userVote === 'up'
                ? "text-emerald-400 bg-emerald-500/10"
                : "text-neutral-600 hover:text-emerald-400 hover:bg-emerald-500/5"
            }`}
            title="Upvote"
          >
            <ThumbsUp className={`w-3.5 h-3.5 transition-transform ${idea.userVote !== 'up' ? "group-hover/vote:-translate-y-0.5" : ""}`} />
          </button>
          <div className={`w-9 h-7 flex items-center justify-center text-xs font-black font-satoshi ${
            voteScore > 0 ? "text-emerald-400" : voteScore < 0 ? "text-orange-400" : "text-neutral-500"
          }`}>
            {voteScore}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownvote(idea.id);
            }}
            className={`group/vote flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300 ${
              idea.userVote === 'down'
                ? "text-orange-400 bg-orange-500/10"
                : "text-neutral-600 hover:text-orange-400 hover:bg-orange-500/5"
            }`}
            title="Downvote"
          >
            <ThumbsDown className={`w-3.5 h-3.5 transition-transform ${idea.userVote !== 'down' ? "group-hover/vote:translate-y-0.5" : ""}`} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h3 className="text-sm font-bold text-white tracking-tight group-hover:text-orange-100 transition-colors font-satoshi">
              {idea.title}
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-semibold bg-white/[0.04] text-neutral-500 border border-white/[0.04] font-satoshi">
              {idea.category}
            </span>
            {isFunded && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-satoshi">
                Complete
              </span>
            )}
            {isRefunded && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 font-satoshi">
                Refunded
              </span>
            )}
            {isFunded ? (
              idea.raisedAmount && idea.raisedAmount > 0 && (
                <span className="hidden sm:inline-flex items-center text-[10px] font-bold text-amber-400 font-satoshi">
                  ${idea.raisedAmount.toLocaleString()}
                </span>
              )
            ) : (
              idea.estimatedPrice && idea.estimatedPrice > 0 && (
                <span className="hidden sm:inline-flex items-center text-[10px] font-semibold text-neutral-600 font-satoshi">
                  ${idea.estimatedPrice.toLocaleString()}
                </span>
              )
            )}
          </div>
          <div className="text-xs text-neutral-400 leading-relaxed mb-3 line-clamp-2 font-geist">
            <SimpleMarkdownRenderer text={idea.description} />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-neutral-600 font-medium">
            <Link
              to={`/profile/${idea.authorUsername}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 text-neutral-500 hover:text-orange-400 transition-colors font-satoshi"
            >
              <img src={idea.authorAvatar} alt={idea.authorUsername} className="w-4 h-4 rounded-full bg-neutral-800 ring-1 ring-white/[0.06]" />
              <span>@{idea.authorUsername}</span>
            </Link>
            <span className="text-neutral-700">·</span>
            <span className="font-geist">{formatTimeAgo(idea.createdAt)}</span>
            {idea.commentsCount > 0 && (
              <>
                <span className="text-neutral-700">·</span>
                <div className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer">
                  <MessageSquare className="w-3 h-3" /> {idea.commentsCount}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Generated Image */}
        {idea.generatedImageUrl && (
          <div className="hidden sm:block shrink-0 w-28 h-28 rounded-xl overflow-hidden border border-white/[0.04]">
            <img
              src={idea.generatedImageUrl}
              alt={idea.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              onError={(e) => {
                console.error("Image failed to load:", {
                  url: idea.generatedImageUrl,
                  ideaId: idea.id,
                });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Simple markdown renderer for card descriptions (handles bold, italic, and basic formatting)
function SimpleMarkdownRenderer({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let keyCounter = 0;

  // Process bold (**text** or __text__)
  const boldRegex = /\*\*([^*]+)\*\*|__([^_]+)__/g;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before bold
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      if (beforeText) {
        parts.push(beforeText);
      }
    }
    // Add bold text
    parts.push(
      <strong key={`bold-${keyCounter++}`} className="font-semibold text-neutral-300">
        {match[1] || match[2]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return <>{parts.length > 0 ? parts : text}</>;
}

export default IdeaCard;
