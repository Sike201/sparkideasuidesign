import { useState, useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ThumbsUp, ThumbsDown, MessageSquare, Share2, ExternalLink, Reply, Loader2, Twitter, ChevronDown, ChevronUp, Lightbulb, DollarSign, Target, Rocket, Trophy, Users as UsersIcon, Sparkles, Pencil, Check, X as XIcon } from "lucide-react";
import { Idea, Comment, UserProfile } from "./types";
import { categoryColors } from "./constants";
import { formatTimeAgo } from "./utils";
// Use on-chain vault by default (set VITE_USE_ONCHAIN_VAULT=false to use legacy treasury system)
const USE_ONCHAIN_VAULT = import.meta.env.VITE_USE_ONCHAIN_VAULT !== "false";
import InvestmentSectionLegacy from "./InvestmentSection";
import InvestmentSectionVault from "./InvestmentSectionVault";
const InvestmentSection = USE_ONCHAIN_VAULT ? InvestmentSectionVault : InvestmentSectionLegacy;
import RedemptionSection from "./RedemptionSection";
import DescriptionRenderer from "./DescriptionRenderer";
import { VotersSection } from "./VotersSection";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { useQuery } from "@tanstack/react-query";
import { backendSparkApi } from "@/data/api/backendSparkApi";

interface IdeaDetailViewProps {
  idea: Idea;
  comments: Comment[];
  isLoadingComments: boolean;
  onBack: () => void;
  backLabel?: string;
  onUpvote: (id: string) => void;
  onDownvote: (id: string) => void;
  onCommentVote: (commentId: string, voteType: 'up' | 'down') => void;
  onSubmitComment: (content: string, parentCommentId?: string) => void;
  onShare: () => void;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  userProfile: UserProfile;
  commentSortBy: "votes" | "newest" | "oldest" | "invested";
  setCommentSortBy: (sort: "votes" | "newest" | "oldest" | "invested") => void;
  onConnectWallet: () => void;
  isConnectingWallet: boolean;
  onConnectX: () => void;
  isConnectingX: boolean;
  onCommentPosted?: () => void;
  isOwner?: boolean;
  onSaveEdit?: (fields: EditIdeaFields) => Promise<void>;
}

export interface EditIdeaFields {
  title?: string;
  description?: string;
  category?: string;
  coin_name?: string;
  ticker?: string;
  estimated_price?: number;
}

// Extract score from analysis markdown (e.g. "Final Score: 72/100" or "Score: 65/100")
function extractScore(analysis: string): number | undefined {
  const match = analysis.match(/(?:Final\s+)?Score:\s*(\d+)\s*\/\s*100/i);
  return match ? parseInt(match[1], 10) : undefined;
}

// Score badge component
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70
    ? "bg-green-500/20 text-green-400"
    : score >= 50
      ? "bg-yellow-500/20 text-yellow-400"
      : "bg-red-500/20 text-red-400";
  return (
    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      {score}/100
    </span>
  );
}

// Colosseum Copilot Analysis Section
function ColosseumAnalysisSection({ analysis, score }: { analysis: string; score?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayScore = score ?? extractScore(analysis);

  return (
    <div className="mb-4 rounded-2xl bg-white/[0.02] border border-orange-500/20 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <a
            href="https://colosseum.com/copilot"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 hover:opacity-80 transition-opacity"
          >
            <img src="/colosseum.png" alt="Colosseum" className="w-5 h-5 rounded-full" />
          </a>
          <h3 className="text-sm font-satoshi font-bold text-white">Market Analysis by Colosseum</h3>
          {displayScore !== undefined && <ScoreBadge score={displayScore} />}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        )}
      </button>
      {isExpanded && (
        <div className="px-5 pb-5">
          <MarkdownRenderer content={analysis} />
        </div>
      )}
    </div>
  );
}

// Gemini Analysis Section with Toggle
function MarketAnalysisSection({ analysis }: { analysis: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const score = extractScore(analysis);

  return (
    <div className="mb-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <img src="/gemini.png" alt="Gemini" className="w-5 h-5 rounded-full shrink-0" />
          <h3 className="text-sm font-satoshi font-bold text-white">Market Analysis by Gemini</h3>
          {score !== undefined && <ScoreBadge score={score} />}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        )}
      </button>
      {isExpanded && (
        <div className="px-5 pb-5">
          <MarkdownRenderer content={analysis} />
        </div>
      )}
    </div>
  );
}

// Collapsible section for mobile layout
function CollapsibleMobileSection({ title, icon, children, defaultOpen = false, count }: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-satoshi font-bold text-white">{title}</span>
          {count !== undefined && <span className="text-xs text-neutral-500">({count})</span>}
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </button>
      {isOpen && <div className="mt-3">{children}</div>}
    </div>
  );
}

// Ecosystem tokens for the tier system
const ECOSYSTEM_TOKENS = [
  { name: "SPARK", address: "SPaRKoVUfuj8FSnmbZmwAD1xP1jPEB4Vik8sgVxnJPq", logo: "/spark.png" },
  { name: "OMFG", address: "omfgRBnxHsNJh6YeGbGAmWenNkenzsXyBXm3WDhmeta", logo: "/omnipair.png" },
  { name: "BORG", address: "3dQTr7ror2QPKQ3GbBCokJUmjErGg8kTJzdnYjNfvi3Z", logo: "/borg.png" },
  { name: "ZC", address: "GVvPZpC6ymCoiHzYJ7CWZ8LhVn9tL2AUpRjSAsLh6jZC", logo: "/zc.png" },
  { name: "META", address: "METAwkXcqyXKy1AtsSgJ8JiUHwGCafnZL38n3vYmeta", logo: "/meta.png" },
] as const;



function HowRaisesWorkSection() {
  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
      <h4 className="text-[10px] font-satoshi font-bold text-neutral-500 uppercase tracking-wider mb-3">How Raises Work</h4>

      <p className="text-[11px] text-neutral-400 leading-relaxed mb-3">
        We take maximum <span className="text-white font-medium">2x</span> of the minimum cap. If oversubscribed, excess is refunded and the hard cap is split:
      </p>

      {/* Allocation Split */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
          <span className="text-[10px] text-neutral-300"><span className="text-white font-medium">10%</span> Ideator Slot at least</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
          <span className="text-[10px] text-neutral-300"><span className="text-white font-medium">40%</span> Pro Rata</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
          <span className="text-[10px] text-neutral-300"><span className="text-white font-medium">50%</span> Tier-Weighted</span>
        </div>
      </div>

      {/* Ecosystem Tokens */}
      <h5 className="text-[10px] font-satoshi font-bold text-neutral-500 uppercase tracking-wider mb-2">Eligible Tokens</h5>
      <div className="space-y-0.5 mb-4">
        {ECOSYSTEM_TOKENS.map((token) => (
          <a
            key={token.name}
            href={`https://jup.ag/tokens/${token.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/[0.04] transition-colors group"
          >
            <img
              src={token.logo}
              alt={token.name}
              className="w-4 h-4 rounded-full bg-white/[0.04]"
            />
            <span className="text-[10px] font-satoshi font-medium text-neutral-300 group-hover:text-white">{token.name}</span>
            <ExternalLink className="w-2.5 h-2.5 text-neutral-600 group-hover:text-neutral-400 ml-auto" />
          </a>
        ))}
      </div>

      {/* Full Details Link */}
      <a
        href="https://justspark.notion.site/7-How-Raises-Work-Investor-Selection-32541bf35b77812db6e1df1a2a5a05ca"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-[10px] text-blue-400 hover:text-blue-300 transition-colors mt-3"
      >
        <ExternalLink className="w-3 h-3" />
        Read full details
      </a>
    </div>
  );
}

export function IdeaDetailView({
  idea,
  comments,
  isLoadingComments,
  onBack,
  backLabel = "Back to all ideas",
  onUpvote,
  onDownvote,
  onCommentVote,
  onSubmitComment,
  onShare,
  replyingTo,
  setReplyingTo,
  userProfile,
  commentSortBy,
  setCommentSortBy,
  onConnectWallet,
  isConnectingWallet,
  onConnectX,
  isConnectingX,
  onCommentPosted,
  isOwner = false,
  onSaveEdit,
}: IdeaDetailViewProps) {
  const [commentText, setCommentText] = useState("");

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    title: idea.title,
    description: idea.description,
    category: idea.category,
    coin_name: idea.coinName || "",
    ticker: idea.ticker || "",
    estimated_price: idea.estimatedPrice || 0,
  });

  const handleStartEdit = () => {
    setEditForm({
      title: idea.title,
      description: idea.description,
      category: idea.category,
      coin_name: idea.coinName || "",
      ticker: idea.ticker || "",
      estimated_price: idea.estimatedPrice || 0,
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => setIsEditing(false);

  const handleSaveEdit = async () => {
    if (!onSaveEdit) return;
    setIsSaving(true);
    try {
      await onSaveEdit(editForm);
      setIsEditing(false);
    } catch {
      // error handled by parent
    } finally {
      setIsSaving(false);
    }
  };
  const [replyText, setReplyText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actualRaised, setActualRaised] = useState<number | null>(null);
  const [totalEverRaised, setTotalEverRaised] = useState<number | null>(null);
  const [jupiterPrice, setJupiterPrice] = useState<number | null>(null);
  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null);
  const [hasLandingPage, setHasLandingPage] = useState(idea.hasLandingPage ?? false);

  // Check if a hackathon exists for this idea
  const { data: hackathonsData } = useQuery({
    queryFn: () => backendSparkApi.getHackathons(),
    queryKey: ["hackathons-for-idea"],
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const linkedHackathon = hackathonsData?.hackathons?.find(
    (h) => h.idea_slug === idea.slug
  );

  // Trigger landing page generation if not yet available
  useEffect(() => {
    if (hasLandingPage || !idea.id) return;
    fetch('/api/trigger-landing-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideaId: idea.id }),
    })
      .then((res) => res.json())
      .then((data: { status?: string }) => {
        if (data.status === 'already_exists') {
          setHasLandingPage(true);
          return;
        }
        if (data.status === 'generating') {
          // Poll until ready
          let attempts = 0;
          const poll = setInterval(() => {
            attempts++;
            if (attempts > 10) { clearInterval(poll); return; }
            fetch(`/api/ideas?slug=${encodeURIComponent(idea.slug)}`)
              .then((r) => r.json())
              .then((d: { idea?: { landing_page?: unknown } }) => {
                if (d.idea?.landing_page) {
                  clearInterval(poll);
                  setHasLandingPage(true);
                }
              })
              .catch(() => {});
          }, 3000);
        }
      })
      .catch(() => {});
  }, [idea.id]);

  // Fetch investments to get raised amounts
  useEffect(() => {
    if (!idea.id) return;
    fetch(`/api/idea-investments?ideaId=${idea.id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.net_by_wallet) {
          const total = Object.values(data.net_by_wallet as Record<string, number>).reduce((sum: number, v: number) => sum + v, 0);
          setActualRaised(total);
        }
        // Sum ALL non-refunded investments (active + claimed) for historical total
        if (data?.investments) {
          const allInvestments = data.investments as Array<{ amount_usdc: number; status: string }>;
          const total = allInvestments
            .filter((inv: { status: string }) => inv.status !== 'refunded')
            .reduce((sum: number, inv: { amount_usdc: number }) => sum + inv.amount_usdc, 0);
          setTotalEverRaised(total);
        }
      })
      .catch(() => {});
  }, [idea.id]);

  // Fetch Jupiter price for the token (via backend proxy)
  useEffect(() => {
    if (!idea.tokenAddress) return;
    fetch(`/api/token-price?mint=${idea.tokenAddress}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.price != null) setJupiterPrice(data.price);
      })
      .catch(() => {});
  }, [idea.tokenAddress]);

  // Fetch treasury wallet balance (USDC + USDG)
  useEffect(() => {
    if (!idea.treasuryWallet) return;
    const network = (import.meta.env.VITE_SOLANA_NETWORK as string) || "devnet";
    const usdcMint = network === "devnet"
      ? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
      : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const usdgMint = network === "devnet"
      ? "4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7"
      : "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH";

    const fetchBalance = (mint: string) =>
      fetch(`/api/gettokenbalance?userAddress=${idea.treasuryWallet}&tokenMint=${mint}&cluster=${network}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => data?.balance ?? 0)
        .catch(() => 0);

    Promise.all([fetchBalance(usdcMint), fetchBalance(usdgMint)])
      .then(([usdcBalance, usdgBalance]) => {
        setTreasuryBalance(usdcBalance + usdgBalance);
      });
  }, [idea.treasuryWallet]);

  const category = categoryColors[idea.category] || categoryColors["AI x Crypto"];
  const voteScore = idea.upvotes - idea.downvotes;

  const handlePostComment = async () => {
    if (!commentText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    await onSubmitComment(commentText);
    setCommentText("");
    setIsSubmitting(false);
  };

  const handlePostReply = async (parentCommentId: string) => {
    if (!replyText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    await onSubmitComment(replyText, parentCommentId);
    setReplyText("");
    setReplyingTo(null);
    setIsSubmitting(false);
  };

  // Render comment with voting (only on parent comments, not replies)
  const renderComment = (c: Comment, isReply = false, depth = 0): JSX.Element => {
    const commentVoteScore = c.upvotes - c.downvotes;
    return (
      <div key={c.id} className="flex gap-3">
        {/* Vote buttons for parent comments only */}
        {!isReply && (
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <button
              onClick={() => onCommentVote(c.id, 'up')}
              disabled={!userProfile.xConnected}
              className={`group/vote flex items-center justify-center w-6 h-6 transition-colors ${c.userVote === 'up'
                ? "text-green-400"
                : "text-neutral-500 hover:text-green-400"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={userProfile.xConnected ? "Upvote" : "Connect X to vote"}
            >
              <ThumbsUp className="w-2.5 h-2.5" />
            </button>
            <div className={`w-6 h-5 flex items-center justify-center text-[9px] font-bold ${commentVoteScore > 0 ? "text-green-400" : commentVoteScore < 0 ? "text-orange-400" : "text-neutral-500"
              }`}>
              {commentVoteScore}
            </div>
            <button
              onClick={() => onCommentVote(c.id, 'down')}
              disabled={!userProfile.xConnected}
              className={`group/vote flex items-center justify-center w-6 h-6 transition-colors ${c.userVote === 'down'
                ? "text-orange-400"
                : "text-neutral-500 hover:text-orange-400"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={userProfile.xConnected ? "Downvote" : "Connect X to vote"}
            >
              <ThumbsDown className="w-2.5 h-2.5" />
            </button>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Link to={`/profile/${c.authorUsername}`} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
              <img src={c.authorAvatar} alt={c.authorUsername} className="w-5 h-5 rounded-full bg-white/[0.04]" />
              <span className="text-xs font-satoshi font-medium text-blue-400">@{c.authorUsername}</span>
            </Link>
            <span className="text-[10px] font-medium text-emerald-400">
              ${(c.authorInvestment ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} invested
            </span>
            <span className="text-[10px] text-neutral-500">{formatTimeAgo(c.createdAt)}</span>
          </div>
          <p className="text-xs font-geist text-neutral-300 leading-relaxed mb-2">{c.content}</p>
          <button
            onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
            disabled={!userProfile.xConnected}
            className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Reply className="w-3 h-3" />
            Reply
          </button>

          {/* Reply Input */}
          {replyingTo === c.id && userProfile.xConnected && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to @${c.authorUsername}...`}
                className="flex-1 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500/30"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handlePostReply(c.id);
                  }
                }}
              />
              <button
                onClick={() => handlePostReply(c.id)}
                disabled={!replyText.trim() || isSubmitting}
                className="px-3 py-2 bg-white text-black text-[10px] font-satoshi font-bold rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "..." : "Reply"}
              </button>
            </div>
          )}

          {/* Nested Replies */}
          {c.replies && c.replies.length > 0 && (
            <div className="mt-3 space-y-3 border-l-2 border-white/[0.06] pl-4" style={{ marginLeft: `${(depth + 1) * 1}rem` }}>
              {c.replies.map((reply) => renderComment(reply, true, depth + 1))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors mb-6 group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        {backLabel}
      </button>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Main Content */}
        <div className="col-span-1 md:col-span-8 lg:col-span-8">
          {/* Header */}
          <div className="flex items-start gap-4 mb-4">
            <div className="flex flex-col items-center gap-0.5 shrink-0 pt-1">
              <button
                onClick={() => onUpvote(idea.id)}
                className={`group/vote flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 ${idea.userVote === 'up'
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-neutral-500 hover:text-emerald-400 hover:bg-emerald-500/5"
                  }`}
              >
                <ThumbsUp className={`w-4 h-4 transition-transform ${idea.userVote !== 'up' ? "group-hover/vote:-translate-y-0.5" : ""}`} />
              </button>
              <div className={`w-10 h-8 flex items-center justify-center text-sm font-bold ${voteScore > 0 ? "text-emerald-400" : voteScore < 0 ? "text-orange-400" : "text-neutral-400"
                }`}>
                {voteScore}
              </div>
              <button
                onClick={() => onDownvote(idea.id)}
                className={`group/vote flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 ${idea.userVote === 'down'
                  ? "text-orange-400 bg-orange-500/10"
                  : "text-neutral-500 hover:text-orange-400 hover:bg-orange-500/5"
                  }`}
              >
                <ThumbsDown className={`w-4 h-4 transition-transform ${idea.userVote !== 'down' ? "group-hover/vote:translate-y-0.5" : ""}`} />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <>
                  <div className="mb-3">
                    <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Title</label>
                    <input
                      value={editForm.title}
                      onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full text-xl font-satoshi font-bold text-white bg-transparent border border-white/10 focus:border-orange-500/50 rounded-lg px-3 py-1.5 outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Category</label>
                      <select
                        value={editForm.category}
                        onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))}
                        className="text-[10px] bg-neutral-800 text-neutral-300 border border-white/10 focus:border-orange-500/50 rounded px-2 py-1 outline-none"
                      >
                        {Object.keys(categoryColors).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Ticker</label>
                      <input
                        value={editForm.ticker}
                        onChange={(e) => setEditForm(f => ({ ...f, ticker: e.target.value }))}
                        placeholder="e.g. SPARK"
                        className="w-24 text-[10px] bg-transparent text-neutral-300 border border-white/10 focus:border-orange-500/50 rounded px-2 py-1 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Coin Name</label>
                      <input
                        value={editForm.coin_name}
                        onChange={(e) => setEditForm(f => ({ ...f, coin_name: e.target.value }))}
                        placeholder="e.g. Spark Token"
                        className="w-28 text-[10px] bg-transparent text-neutral-300 border border-white/10 focus:border-orange-500/50 rounded px-2 py-1 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Goal ($)</label>
                      <input
                        type="number"
                        value={editForm.estimated_price || ""}
                        onChange={(e) => setEditForm(f => ({ ...f, estimated_price: parseFloat(e.target.value) || 0 }))}
                        placeholder="10000"
                        className="w-24 text-[10px] bg-transparent text-neutral-300 border border-white/10 focus:border-orange-500/50 rounded px-2 py-1 outline-none"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/10 transition-colors disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" />
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex items-center gap-1 px-3 py-1 text-xs text-neutral-400 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <XIcon className="w-3 h-3" />
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl font-satoshi font-bold text-white">{idea.title}</h1>
                    {isOwner && onSaveEdit && (
                      <button
                        onClick={handleStartEdit}
                        className="text-neutral-500 hover:text-orange-400 transition-colors"
                        title="Edit idea"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-400 flex-wrap">
                    <Link to={`/profile/${idea.authorUsername}`} className="flex items-center gap-1.5 hover:text-blue-400 transition-colors">
                      <img src={idea.authorAvatar} alt={idea.authorUsername} className="w-5 h-5 rounded-full bg-white/[0.04]" />
                      <span>@{idea.authorUsername}</span>
                    </Link>
                    <span>•</span>
                    <span>{formatTimeAgo(idea.createdAt)}</span>
                    {idea.tweetUrl && (
                      <>
                        <span>•</span>
                        <a href={idea.tweetUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors">
                          <Twitter className="w-3 h-3" />
                          View Tweet
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </>
                    )}
                    {idea.sparkedByUsername && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-orange-400" />
                          Sparked thanks to{' '}
                          <Link
                            to={`/profile/${idea.sparkedByUsername}`}
                            className="text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            @{idea.sparkedByUsername}
                          </Link>
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-medium ${category.bg} ${category.text} ${category.border} border`}>
                      {idea.category}
                    </span>
                    {idea.ticker && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-[10px] font-semibold bg-white/[0.06] text-neutral-300 border border-white/[0.06]">
                        ${idea.ticker}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
            {/* Generated Image */}
            {idea.generatedImageUrl && (
              <div className="hidden sm:block shrink-0 w-40 h-40 rounded-xl overflow-hidden border border-white/[0.06]">
                <img
                  src={idea.generatedImageUrl}
                  alt={idea.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          {/* Mobile: Sidebar content moved here */}
          <div className="md:hidden space-y-4 mb-6">
            {/* External Links */}
            {(idea.legendsUrl || idea.superteamUrl) && (
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <h4 className="text-[10px] font-satoshi font-bold text-neutral-500 uppercase tracking-wider mb-3">Hackathon is Live</h4>
                <div className="space-y-2">
                  {idea.superteamUrl && (
                    <a
                      href={idea.superteamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-xs font-satoshi font-bold text-blue-400 hover:text-blue-300 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 hover:border-blue-500/20 rounded-xl transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Apply here
                    </a>
                  )}
                  {idea.legendsUrl && (
                    <a
                      href={idea.legendsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-xs font-satoshi font-bold text-orange-400 hover:text-orange-300 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/10 hover:border-orange-500/20 rounded-xl transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Upvote the project on Legends.fun
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Share */}
            <button
              onClick={onShare}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-satoshi font-bold text-neutral-400 hover:text-white hover:bg-white/[0.05] rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Share2 className="w-3.5 h-3.5" />
                Share idea
              </div>
            </button>

            {/* Hackathon Link */}
            {linkedHackathon && (
              <Link
                to={`/hackathons/${linkedHackathon.id}`}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-satoshi font-bold text-[#F25C05] hover:text-orange-300 hover:bg-orange-500/5 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5" />
                  View Hackathon
                </div>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}

            {/* Landing Page Link */}
            {hasLandingPage && (
              <Link
                to={`/ideas/${idea.slug}/landing`}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-satoshi font-bold text-purple-400 hover:text-purple-300 hover:bg-purple-500/5 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  View Landing Page
                </div>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}

            {/* Redemption (only rendered if a vault exists for this idea) */}
            <RedemptionSection
              idea={idea}
              userProfile={userProfile}
              onConnectWallet={onConnectWallet}
              isConnectingWallet={isConnectingWallet}
            />

            {/* Investment */}
            {idea.estimatedPrice && idea.estimatedPrice > 0 && idea.status !== "refunded" && (
              <InvestmentSection
                idea={idea}
                userProfile={userProfile}
                onConnectWallet={onConnectWallet}
                isConnectingWallet={isConnectingWallet}
                onCommentPosted={onCommentPosted}
                jupiterPrice={jupiterPrice}
              />
            )}
          </div>

          {/* Description */}
          <div className="mb-8">
            {isEditing ? (
              <div>
                <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={10}
                  className="w-full bg-transparent text-sm text-neutral-200 border border-white/10 focus:border-orange-500/50 rounded-lg px-4 py-3 outline-none resize-y font-geist leading-relaxed"
                />
              </div>
            ) : (
              <DescriptionRenderer description={idea.description} />
            )}
          </div>

          {/* Colosseum Copilot Analysis */}
          {idea.colosseumAnalysis && (
            <ColosseumAnalysisSection analysis={idea.colosseumAnalysis} score={idea.colosseumScore} />
          )}

          {/* Market Analysis */}
          {idea.marketAnalysis && (
            <MarketAnalysisSection analysis={idea.marketAnalysis} />
          )}

          {/* Timeline */}
          {idea.estimatedPrice && idea.estimatedPrice > 0 && (() => {
            const raised = idea.raisedAmount || 0;
            const goal = idea.estimatedPrice || 0;
            const capReached = raised >= goal && goal > 0;
            const capReachedAt = idea.capReachedAt ? new Date(idea.capReachedAt) : null;
            const capDeadlinePassed = capReachedAt ? new Date() > new Date(capReachedAt.getTime() + 24 * 60 * 60 * 1000) : false;

            // Determine current step (0-indexed)
            // 0: Idea Created (always done)
            // 1: Start Funding (done if raised > 0)
            // 2: Funding Reached (done if cap reached)
            // 3: Token Launch (done if cap deadline passed)
            // 4: Hackathon Starts (future)
            // 5: Market Decides (future)
            let currentStep = 0;
            if (raised > 0) currentStep = 1;
            if (capReached) currentStep = 2;
            if (capDeadlinePassed) currentStep = 3;
            // Manual override via timeline_phase column
            if (idea.timelinePhase != null) currentStep = idea.timelinePhase;

            const steps = [
              { icon: Lightbulb, title: "Idea Created", description: "Submitted by the community", url: "https://justspark.notion.site/Ideas-32541bf35b7781e39cf4f28122d9b79f" },
              { icon: DollarSign, title: "Start Funding", description: "USDC deposits open", url: "https://justspark.notion.site/Start-Funding-VibeFund-32541bf35b77814891d1e8d1f862ef33" },
              { icon: Target, title: "Funding Reached", description: "Open for 24h more", url: "https://justspark.notion.site/Funding-Reached-32541bf35b7781d8857acb057a4759b3" },
              { icon: Rocket, title: "Token Launch", description: "≈24h after raise (Omnipair/Meteora) / Treasury in Squads", url: "https://justspark.notion.site/Token-Launch-32541bf35b7781faa106ea06bdb2a509" },
              { icon: Trophy, title: "Hackathon Starts", description: "Between 24h to 1 month after launch", url: "https://justspark.notion.site/Hackathon-32541bf35b77811d82bbd828e7749424" },
              { icon: UsersIcon, title: "Market Decides", description: "5-10 days — Futarchy decides who builds", url: "https://justspark.notion.site/Market-Decides-32541bf35b77810796aafced025312ff" },
            ];

            return (
              <div className="mb-8">
                <h3 className="hidden md:block text-sm font-satoshi font-bold text-white mb-4">Timeline</h3>
                {/* Desktop */}
                <div className="hidden md:block relative">
                  {/* Progress bar background */}
                  <div className="absolute left-0 right-0 h-1 bg-white/[0.04] rounded-full" style={{ top: '48px' }} />
                  {/* Progress bar filled */}
                  <div
                    className="absolute left-0 h-1 rounded-full bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 transition-all duration-700 overflow-hidden"
                    style={{ top: '48px', width: `${Math.min(100, ((currentStep + 0.5) / steps.length) * 100)}%` }}
                  >
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 60%, transparent 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 2s ease-in-out infinite',
                      }}
                    />
                  </div>
                  <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

                  <div className="relative flex justify-between">
                    {steps.map((step, i) => {
                      const done = i <= currentStep;
                      const active = i === currentStep;
                      const Icon = step.icon;
                      return (
                        <a key={i} href={step.url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center cursor-pointer group/step" style={{ width: `${100 / steps.length}%` }}>
                          {/* Icon circle */}
                          <div
                            className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all group-hover/step:scale-110 ${done
                              ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                              : "bg-white/[0.03] border-white/[0.06] text-neutral-600"
                              }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          {/* Label */}
                          <p className={`mt-4 text-[10px] font-semibold text-center leading-tight group-hover/step:text-orange-300 transition-colors ${done ? "text-white" : "text-neutral-600"}`}>
                            {step.title}
                          </p>
                          <p className={`mt-0.5 text-[9px] text-center leading-tight max-w-[110px] ${done ? "text-neutral-400" : "text-neutral-700"}`}>
                            {step.description}
                          </p>
                        </a>
                      );
                    })}
                  </div>
                </div>

                {/* Mobile - collapsible */}
                <CollapsibleMobileSection title="Timeline" icon={<Rocket className="w-4 h-4 text-orange-400" />}>
                  <div className="space-y-0">
                    {steps.map((step, i) => {
                      const done = i <= currentStep;
                      const active = i === currentStep;
                      const Icon = step.icon;
                      return (
                        <a key={i} href={step.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 group/step">
                          <div className="flex flex-col items-center">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-transform group-hover/step:scale-110 ${done
                                ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                                : "bg-white/[0.03] border-white/[0.06] text-neutral-600"
                                }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            {i < steps.length - 1 && (
                              <div className={`w-0.5 h-8 ${done ? "bg-orange-500/40" : "bg-white/[0.04]"}`} />
                            )}
                          </div>
                          <div className="pt-1">
                            <p className={`text-xs font-semibold group-hover/step:text-orange-300 transition-colors ${done ? "text-white" : "text-neutral-600"}`}>
                              {step.title}
                              {active && <span className="ml-2 text-[9px] font-normal text-orange-400">(current)</span>}
                            </p>
                            <p className={`text-[10px] ${done ? "text-neutral-400" : "text-neutral-700"}`}>
                              {step.description}
                            </p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </CollapsibleMobileSection>
              </div>
            );
          })()}

          {/* Initial Funding Allocation — always visible, uses goal until cap reached, then real raised capped at 200% */}
          {idea.estimatedPrice && idea.estimatedPrice > 0 && (() => {
            const goal = idea.estimatedPrice;
            // Use totalEverRaised (all non-refunded investments) for historical display,
            // since actualRaised (net active only) drops to 0 after investors claim tokens
            const HARDCODED_RAISED: Record<string, number> = {
              'e03ef91e-958d-41d6-bff9-1e1cc644f29e': 4079.32,
            };
            const raised = HARDCODED_RAISED[idea.id] ?? (totalEverRaised || actualRaised || idea.raisedAmount || 0);
            const capReached = raised >= goal;
            const displayAmount = capReached ? Math.min(raised, goal * 2) : goal;
            const liqPct = idea.liquidityPercent ?? 0.20;
            const treasuryPct = 1 - liqPct;
            const totalSupply = 10_000_000;
            const priceAtLaunch = Number(idea.initialTokenPrice ?? displayAmount / totalSupply) || 0;
            const treasury = displayAmount * treasuryPct;
            const liquidity = displayAmount * liqPct;
            return (
              <div className="mb-8">
                <h3 className="text-sm font-satoshi font-bold text-white mb-3">Initial Funding Allocation</h3>
                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[10px] text-white uppercase font-medium">Price at Launch</p>
                    <p className="text-sm font-bold text-orange-400 mt-1">${priceAtLaunch.toFixed(6)}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[10px] text-white uppercase font-medium">{Math.round(treasuryPct * 100)}% Treasury</p>
                    <p className="text-sm font-bold text-orange-400 mt-1">${treasury.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[10px] text-white uppercase font-medium">{Math.round(liqPct * 100)}% Liquidity</p>
                    <p className="text-sm font-bold text-orange-400 mt-1">${liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[10px] text-white uppercase font-medium">Team Allocation</p>
                    <p className="text-sm font-bold text-orange-400 mt-1">$0</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Current Allocation */}
          {idea.tokenAddress && idea.estimatedPrice && idea.estimatedPrice > 0 && (() => {
            const raised = actualRaised || idea.raisedAmount || 0;
            const airdropSupply = 10_000_000;
            const currentLiqPct = idea.liquidityPercent ?? 0.20;
            const dammv2_2Tokens = 900_000;
            const currentTotalSupply = airdropSupply + Math.round(airdropSupply * currentLiqPct) + dammv2_2Tokens;
            const cappedRaised = Math.min(raised, 2 * (idea.estimatedPrice || 0));
            const treasuryFees = idea.totalFeesCollected || 0;
            const currentNav = (cappedRaised + treasuryFees) / airdropSupply;
            const currentTreasury = treasuryBalance;
            const currentPrice = jupiterPrice;
            const currentFdv = currentPrice != null ? currentPrice * currentTotalSupply : null;
            return (
              <div className="mb-8">
                <h3 className="text-sm font-satoshi font-bold text-white mb-3">Current Allocation</h3>
                <div className="grid grid-cols-4 gap-2">
                  <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[10px] text-white uppercase font-medium">Current Price</p>
                    <p className="text-sm font-bold text-emerald-400 mt-1">
                      {currentPrice != null ? `$${(Number(currentPrice) || 0).toFixed(6)}` : "—"}
                    </p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[10px] text-white uppercase font-medium">Current NAV</p>
                    <p className="text-sm font-bold text-emerald-400 mt-1">${(Number(currentNav) || 0).toFixed(6)}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[10px] text-white uppercase font-medium">Revenue from Trading Fees</p>
                    <p className="text-sm font-bold text-emerald-400 mt-1">
                      {treasuryFees > 0 ? `$${(treasuryFees * 0.4).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                    </p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[10px] text-white uppercase font-medium">Current Treasury</p>
                    <p className="text-sm font-bold text-emerald-400 mt-1">
                      {currentTreasury != null ? `$${currentTreasury.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Mobile: How Raises Work */}
          <CollapsibleMobileSection title="How Raises Work" icon={<DollarSign className="w-4 h-4 text-emerald-400" />}>
            <HowRaisesWorkSection />
          </CollapsibleMobileSection>

          {/* Mobile: Voters & Investors */}
          <div className="md:hidden mb-6">
            <VotersSection ideaId={idea.id} />
          </div>

          {/* Comments Section - Desktop */}
          <div className="hidden md:block border-t border-white/[0.06] pt-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-neutral-500" />
                <h3 className="text-sm font-satoshi font-bold text-white">Discussion ({comments.length})</h3>
              </div>

              {/* Sort Options */}
              <div className="flex items-center gap-2">
                {(["votes", "invested", "newest", "oldest"] as const).map((sort) => (
                  <button
                    key={sort}
                    onClick={() => setCommentSortBy(sort)}
                    className={`text-[10px] font-medium transition-colors ${commentSortBy === sort
                      ? "text-white"
                      : "text-neutral-500 hover:text-white"
                      }`}
                  >
                    {sort === "votes"
                      ? "Top Voted"
                      : sort === "invested"
                        ? "Most Invested"
                        : sort.charAt(0).toUpperCase() + sort.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Add Comment */}
            <div className="mb-6">
              <div className="relative">
                {!userProfile.xConnected ? (
                  <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl text-center">
                    <button
                      onClick={onConnectX}
                      disabled={isConnectingX}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-xs font-satoshi font-bold rounded-xl hover:bg-blue-400 transition-colors disabled:opacity-50"
                    >
                      {isConnectingX ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Twitter className="w-3.5 h-3.5" />
                      )}
                      Connect X to comment
                    </button>
                  </div>
                ) : (
                  <>
                    <textarea
                      rows={3}
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      className="w-full p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500/30 transition-all resize-none block"
                    />
                    <div className="absolute bottom-2 right-2 flex items-center gap-2">
                      <button
                        onClick={handlePostComment}
                        disabled={!commentText.trim() || isSubmitting}
                        className="px-3 py-1 bg-white text-black text-[10px] font-satoshi font-bold rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? "Posting..." : "Post"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Loading Comments */}
            {isLoadingComments && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                <span className="ml-2 text-xs text-neutral-400">Loading comments...</span>
              </div>
            )}

            {/* Thread */}
            {!isLoadingComments && (
              <div className="space-y-6">
                {comments.length === 0 && (
                  <p className="text-xs text-neutral-500 text-center py-4">No comments yet. Be the first to share your thoughts!</p>
                )}

                {comments.map((comment) => (
                  <div key={comment.id} className="space-y-3">
                    {renderComment(comment, false, 0)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments Section - Mobile */}
          <CollapsibleMobileSection title="Discussion" count={comments.length} icon={<MessageSquare className="w-4 h-4 text-neutral-500" />}>
            {/* Sort Options */}
            <div className="flex items-center gap-2 mb-4">
              {(["votes", "invested", "newest", "oldest"] as const).map((sort) => (
                <button
                  key={sort}
                  onClick={() => setCommentSortBy(sort)}
                  className={`text-[10px] font-medium transition-colors ${commentSortBy === sort
                    ? "text-white"
                    : "text-neutral-500 hover:text-white"
                    }`}
                >
                  {sort === "votes"
                    ? "Top Voted"
                    : sort === "invested"
                      ? "Most Invested"
                      : sort.charAt(0).toUpperCase() + sort.slice(1)}
                </button>
              ))}
            </div>

            {/* Add Comment */}
            <div className="mb-6">
              <div className="relative">
                {!userProfile.xConnected ? (
                  <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl text-center">
                    <button
                      onClick={onConnectX}
                      disabled={isConnectingX}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-xs font-satoshi font-bold rounded-xl hover:bg-blue-400 transition-colors disabled:opacity-50"
                    >
                      {isConnectingX ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Twitter className="w-3.5 h-3.5" />
                      )}
                      Connect X to comment
                    </button>
                  </div>
                ) : (
                  <>
                    <textarea
                      rows={3}
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      className="w-full p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500/30 transition-all resize-none block"
                    />
                    <div className="absolute bottom-2 right-2 flex items-center gap-2">
                      <button
                        onClick={handlePostComment}
                        disabled={!commentText.trim() || isSubmitting}
                        className="px-3 py-1 bg-white text-black text-[10px] font-satoshi font-bold rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? "Posting..." : "Post"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Loading Comments */}
            {isLoadingComments && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
                <span className="ml-2 text-xs text-neutral-400">Loading comments...</span>
              </div>
            )}

            {/* Thread */}
            {!isLoadingComments && (
              <div className="space-y-6">
                {comments.length === 0 && (
                  <p className="text-xs text-neutral-500 text-center py-4">No comments yet. Be the first to share your thoughts!</p>
                )}

                {comments.map((comment) => (
                  <div key={comment.id} className="space-y-3">
                    {renderComment(comment, false, 0)}
                  </div>
                ))}
              </div>
            )}
          </CollapsibleMobileSection>
        </div>

        {/* Detail Sidebar */}
        <aside className="hidden md:block col-span-1 md:col-span-4 lg:col-span-4 space-y-6">
          {/* External Links */}
          {(idea.legendsUrl || idea.superteamUrl) && (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <h4 className="text-[10px] font-satoshi font-bold text-neutral-500 uppercase tracking-wider mb-3">Hackathon is Live</h4>
              <div className="space-y-2">
                {idea.superteamUrl && (
                  <a
                    href={idea.superteamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-xs font-satoshi font-bold text-blue-400 hover:text-blue-300 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 hover:border-blue-500/20 rounded-xl transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Apply here
                  </a>
                )}
                {idea.legendsUrl && (
                  <a
                    href={idea.legendsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-xs font-satoshi font-bold text-orange-400 hover:text-orange-300 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/10 hover:border-orange-500/20 rounded-xl transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Upvote the project on Legends.fun
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Share Idea */}
          <button
            onClick={onShare}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-satoshi font-bold text-neutral-400 hover:text-white hover:bg-white/[0.05] rounded-xl transition-colors group"
          >
            <div className="flex items-center gap-2">
              <Share2 className="w-3.5 h-3.5" />
              Share idea
            </div>
          </button>

          {/* Hackathon Link */}
          {linkedHackathon && (
            <Link
              to={`/hackathons/${linkedHackathon.id}`}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-satoshi font-bold text-[#F25C05] hover:text-orange-300 hover:bg-orange-500/5 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5" />
                View Hackathon
              </div>
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}

          {/* Landing Page Link */}
          {hasLandingPage && (
            <Link
              to={`/ideas/${idea.slug}/landing`}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-satoshi font-bold text-purple-400 hover:text-purple-300 hover:bg-purple-500/5 rounded-xl transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                View Landing Page
              </div>
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}

          {/* Redemption Section (only rendered if a vault exists for this idea) */}
          <RedemptionSection
            idea={idea}
            userProfile={userProfile}
            onConnectWallet={onConnectWallet}
            isConnectingWallet={isConnectingWallet}
          />

          {/* Investment Section */}
          {idea.estimatedPrice && idea.estimatedPrice > 0 && idea.status !== "refunded" && (
            <InvestmentSection
              idea={idea}
              userProfile={userProfile}
              onConnectWallet={onConnectWallet}
              isConnectingWallet={isConnectingWallet}
              onCommentPosted={onCommentPosted}
              jupiterPrice={jupiterPrice}
            />
          )}

          {/* How Raises Work */}
          <HowRaisesWorkSection />

          {/* Voters Section */}
          <VotersSection ideaId={idea.id} />
        </aside>
      </div>
    </div>
  );
}

export default IdeaDetailView;
