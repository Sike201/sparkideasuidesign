import { Link } from "react-router-dom";
import { MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import { Idea } from "./types";
import { formatTimeAgo } from "./utils";
import React from "react";
import { fundingGoalRatio, isDemoIdeaId } from "@/data/demoFeedIdeas";

export type IdeaCardDensity = "default" | "condensed";

interface IdeaCardProps {
  idea: Idea;
  onUpvote: (id: string) => void;
  onDownvote: (id: string) => void;
  onClick: () => void;
  /** `condensed` = short rows for grid / feed density (Twitter-like). */
  density?: IdeaCardDensity;
}

export function IdeaCard({ idea, onUpvote, onDownvote, onClick, density = "default" }: IdeaCardProps) {
  const score = idea.upvotes - idea.downvotes;
  const isRefunded = idea.status === "refunded";
  const isFunded = !!(idea.tokenAddress && idea.status !== "refunded");
  const preview = isDemoIdeaId(idea.id);
  const goal = idea.estimatedPrice ?? 0;
  const raised = idea.raisedAmount ?? 0;
  const progressPct = !isFunded && goal > 0 ? Math.min(100, Math.round(fundingGoalRatio(idea) * 100)) : null;

  if (density === "condensed") {
    return (
      <CondensedIdeaCard
        idea={idea}
        score={score}
        isRefunded={isRefunded}
        isFunded={isFunded}
        preview={preview}
        goal={goal}
        raised={raised}
        progressPct={progressPct}
        onUpvote={onUpvote}
        onDownvote={onDownvote}
        onClick={onClick}
      />
    );
  }

  return (
    <DefaultIdeaCard
      idea={idea}
      score={score}
      isRefunded={isRefunded}
      isFunded={isFunded}
      preview={preview}
      goal={goal}
      raised={raised}
      progressPct={progressPct}
      onUpvote={onUpvote}
      onDownvote={onDownvote}
      onClick={onClick}
    />
  );
}

function CondensedIdeaCard({
  idea,
  score,
  isRefunded,
  isFunded,
  preview,
  goal,
  raised,
  progressPct,
  onUpvote,
  onDownvote,
  onClick,
}: {
  idea: Idea;
  score: number;
  isRefunded: boolean;
  isFunded: boolean;
  preview: boolean;
  goal: number;
  raised: number;
  progressPct: number | null;
  onUpvote: (id: string) => void;
  onDownvote: (id: string) => void;
  onClick: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group cursor-pointer px-3 py-2.5 text-left transition-colors sm:px-3.5 sm:py-3 ${
        isRefunded ? "opacity-50" : "hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[10px] text-neutral-500 font-geist">
            <Link
              to={`/profile/${idea.authorUsername}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-neutral-200 hover:text-orange-400"
            >
              @{idea.authorUsername}
            </Link>
            <span className="text-neutral-700">·</span>
            <time dateTime={idea.createdAt}>{formatTimeAgo(idea.createdAt)}</time>
            {preview && (
              <>
                <span className="text-neutral-700">·</span>
                <span className="font-geist-mono uppercase tracking-wider text-orange-400/85">Preview</span>
              </>
            )}
            <span className="text-neutral-700">·</span>
            <span className="truncate text-neutral-600">{idea.category}</span>
          </div>

          <h3 className="mt-0.5 font-satoshi text-[13px] font-semibold leading-snug tracking-tight text-white line-clamp-2 group-hover:text-orange-50">
            {idea.title}
          </h3>

          <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-neutral-500 font-geist">
            <SimpleMarkdownRenderer text={idea.description} />
          </div>

          {(progressPct != null && !isFunded) || (isFunded && idea.raisedAmount != null && idea.raisedAmount > 0) ? (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
              {progressPct != null && !isFunded && (
                <>
                  <div className="h-1 min-w-[2.5rem] max-w-[min(140px,45%)] flex-1 overflow-hidden rounded-none bg-white/[0.08]">
                    <div
                      className="h-full rounded-none bg-orange-500/90"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="font-geist-mono text-[10px] tabular-nums text-neutral-500">
                    {progressPct}% · ${raised.toLocaleString()} / ${goal.toLocaleString()}
                  </span>
                </>
              )}
              {isFunded && idea.raisedAmount != null && idea.raisedAmount > 0 && (
                <span className="text-[10px] text-orange-300/90">Raised ${idea.raisedAmount.toLocaleString()}</span>
              )}
            </div>
          ) : null}

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-[10px] text-neutral-600 font-geist">
              {idea.commentsCount > 0 && (
                <span className="inline-flex shrink-0 items-center gap-0.5">
                  <MessageSquare className="h-3 w-3 opacity-60" strokeWidth={1.5} />
                  {idea.commentsCount}
                </span>
              )}
              {isFunded && (
                <span className="font-geist-mono uppercase tracking-wider text-orange-300/75">Funded</span>
              )}
              {isRefunded && (
                <span className="font-geist-mono uppercase tracking-wider text-red-400/80">Refunded</span>
              )}
            </div>

            <div
              className="inline-flex shrink-0 items-center gap-0.5 rounded-none border border-white/[0.06] bg-black/40 p-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => onUpvote(idea.id)}
                className={`group/vote flex h-7 w-7 items-center justify-center rounded-none ${
                  idea.userVote === "up"
                    ? "text-emerald-400"
                    : "text-neutral-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                }`}
                title="Upvote"
              >
                <ThumbsUp
                  className={`h-3.5 w-3.5 ${idea.userVote !== "up" ? "transition-transform group-hover/vote:-translate-y-px" : ""}`}
                  strokeWidth={1.75}
                />
              </button>
              <span
                className={`min-w-[1.5rem] px-0.5 text-center font-geist-mono text-[10px] font-medium tabular-nums ${
                  score > 0 ? "text-emerald-400/90" : score < 0 ? "text-orange-400/90" : "text-neutral-600"
                }`}
              >
                {score}
              </span>
              <button
                type="button"
                onClick={() => onDownvote(idea.id)}
                className={`group/vote flex h-7 w-7 items-center justify-center rounded-none ${
                  idea.userVote === "down"
                    ? "text-orange-400"
                    : "text-neutral-500 hover:bg-orange-500/10 hover:text-orange-400"
                }`}
                title="Downvote"
              >
                <ThumbsDown
                  className={`h-3.5 w-3.5 ${idea.userVote !== "down" ? "transition-transform group-hover/vote:translate-y-px" : ""}`}
                  strokeWidth={1.75}
                />
              </button>
            </div>
          </div>
        </div>

        {idea.generatedImageUrl ? (
          <div className="hidden h-12 w-12 shrink-0 overflow-hidden rounded-none sm:block">
            <img src={idea.generatedImageUrl} alt="" className="h-full w-full object-cover opacity-90" />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DefaultIdeaCard({
  idea,
  score,
  isRefunded,
  isFunded,
  preview,
  goal,
  raised,
  progressPct,
  onUpvote,
  onDownvote,
  onClick,
}: {
  idea: Idea;
  score: number;
  isRefunded: boolean;
  isFunded: boolean;
  preview: boolean;
  goal: number;
  raised: number;
  progressPct: number | null;
  onUpvote: (id: string) => void;
  onDownvote: (id: string) => void;
  onClick: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group cursor-pointer py-9 text-left transition-colors hover:bg-white/[0.02] md:py-10 ${
        isRefunded ? "opacity-50" : ""
      }`}
    >
      <div className="flex gap-4 sm:gap-5">
        <Link
          to={`/profile/${idea.authorUsername}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
        >
          <img
            src={idea.authorAvatar}
            alt=""
            className="h-9 w-9 bg-neutral-900 object-cover sm:h-10 sm:w-10"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500 font-geist">
            <Link
              to={`/profile/${idea.authorUsername}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-neutral-300 hover:text-orange-400"
            >
              @{idea.authorUsername}
            </Link>
            <span className="text-neutral-700">·</span>
            <time dateTime={idea.createdAt}>{formatTimeAgo(idea.createdAt)}</time>
            {preview && (
              <>
                <span className="text-neutral-700">·</span>
                <span className="font-geist-mono text-[10px] uppercase tracking-wider text-orange-400/90">
                  Preview
                </span>
              </>
            )}
          </div>

          <h3 className="mt-2 font-satoshi text-[15px] font-semibold leading-snug tracking-tight text-white group-hover:text-orange-100 sm:text-[16px]">
            {idea.title}
          </h3>

          <div className="mt-2.5 line-clamp-3 text-[12px] leading-relaxed text-neutral-500 font-geist sm:line-clamp-4">
            <SimpleMarkdownRenderer text={idea.description} />
          </div>

          {progressPct != null && (
            <div className="mt-4 max-w-sm">
              <div className="mb-1.5 flex items-baseline justify-between gap-3 font-geist-mono text-[10px] uppercase tracking-wider text-neutral-600">
                <span>Funding</span>
                <span className="tabular-nums text-neutral-500">
                  {progressPct}% · ${raised.toLocaleString()} / ${goal.toLocaleString()}
                </span>
              </div>
              <div className="h-0.5 overflow-hidden rounded-none bg-white/[0.06]">
                <div
                  className="h-full rounded-none bg-gradient-to-r from-orange-600/90 to-orange-400/80"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 font-geist">
            <span>{idea.category}</span>
            {!isFunded && idea.estimatedPrice != null && idea.estimatedPrice > 0 && progressPct == null && (
              <>
                <span className="text-neutral-800">·</span>
                <span>Goal ${idea.estimatedPrice.toLocaleString()}</span>
              </>
            )}
            {isFunded && idea.raisedAmount != null && idea.raisedAmount > 0 && (
              <>
                <span className="text-neutral-800">·</span>
                <span className="text-orange-300/90">Raised ${idea.raisedAmount.toLocaleString()}</span>
              </>
            )}
            {idea.commentsCount > 0 && (
              <>
                <span className="text-neutral-800">·</span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5 opacity-70" strokeWidth={1.5} />
                  {idea.commentsCount}
                </span>
              </>
            )}
            {isFunded && (
              <span className="font-geist-mono text-[10px] uppercase tracking-wider text-orange-300/80">
                Funded
              </span>
            )}
            {isRefunded && (
              <span className="font-geist-mono text-[10px] uppercase tracking-wider text-red-400/90">
                Refunded
              </span>
            )}
          </div>

          <div
            className="mt-5 inline-flex items-center gap-0.5 rounded-none border border-white/[0.06] bg-white/[0.02] p-0.5 text-neutral-500"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onUpvote(idea.id)}
              className={`group/vote flex h-9 w-9 items-center justify-center rounded-none transition-all duration-300 ${
                idea.userVote === "up"
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-neutral-500 hover:bg-emerald-500/5 hover:text-emerald-400"
              }`}
              title="Upvote"
            >
              <ThumbsUp
                className={`h-4 w-4 ${idea.userVote !== "up" ? "transition-transform group-hover/vote:-translate-y-0.5" : ""}`}
                strokeWidth={1.75}
              />
            </button>
            <span
              className={`min-w-[2.25rem] px-1 text-center font-geist-mono text-[12px] font-medium tabular-nums ${
                score > 0 ? "text-emerald-400/90" : score < 0 ? "text-orange-400/90" : "text-neutral-600"
              }`}
            >
              {score}
            </span>
            <button
              type="button"
              onClick={() => onDownvote(idea.id)}
              className={`group/vote flex h-9 w-9 items-center justify-center rounded-none transition-all duration-300 ${
                idea.userVote === "down"
                  ? "text-orange-400 bg-orange-500/10"
                  : "text-neutral-500 hover:bg-orange-500/5 hover:text-orange-400"
              }`}
              title="Downvote"
            >
              <ThumbsDown
                className={`h-4 w-4 ${idea.userVote !== "down" ? "transition-transform group-hover/vote:translate-y-0.5" : ""}`}
                strokeWidth={1.75}
              />
            </button>
          </div>
        </div>

        {idea.generatedImageUrl ? (
          <div className="hidden h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-none sm:block sm:h-20 sm:w-20">
            <img src={idea.generatedImageUrl} alt="" className="h-full w-full object-cover opacity-90" />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function SimpleMarkdownRenderer({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let keyCounter = 0;
  const boldRegex = /\*\*([^*]+)\*\*|__([^_]+)__/g;
  let match;
  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(
      <strong key={`bold-${keyCounter++}`} className="font-medium text-neutral-400">
        {match[1] || match[2]}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return <>{parts.length > 0 ? parts : text}</>;
}

export default IdeaCard;
