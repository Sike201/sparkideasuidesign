// Ideas Feature Utilities

import { Idea, Comment, UserProfile, UserVotes, UserCommentVotes, DailyVoteTracker } from './types';
import { IdeaModel, IdeaCommentModel } from "@/data/api/backendSparkApi";

// ============================================
// User Profile Functions
// ============================================

export const loadUserProfile = (): UserProfile => {
  const stored = localStorage.getItem("spark_user_profile");
  if (stored) {
    return JSON.parse(stored);
  }
  return { xConnected: false, walletConnected: false };
};

export const saveUserProfile = (profile: UserProfile) => {
  localStorage.setItem("spark_user_profile", JSON.stringify(profile));
};

// ============================================
// PKCE OAuth Functions
// ============================================

export const generateCodeVerifier = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

export const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  return btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

export const generateState = (): string => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// ============================================
// Vote Storage Functions
// ============================================

export const loadUserVotes = (): UserVotes => {
  const stored = localStorage.getItem("spark_user_votes");
  return stored ? JSON.parse(stored) : {};
};

export const saveUserVotes = (votes: UserVotes) => {
  localStorage.setItem("spark_user_votes", JSON.stringify(votes));
};

export const loadUserCommentVotes = (): UserCommentVotes => {
  const stored = localStorage.getItem("spark_user_comment_votes");
  return stored ? JSON.parse(stored) : {};
};

export const saveUserCommentVotes = (votes: UserCommentVotes) => {
  localStorage.setItem("spark_user_comment_votes", JSON.stringify(votes));
};

// ============================================
// Daily Vote Limit Functions
// ============================================

export const DAILY_VOTE_LIMIT = 5;

export const loadDailyVotes = (): DailyVoteTracker => {
  const stored = localStorage.getItem("spark_daily_votes");
  if (!stored) return { date: new Date().toDateString(), count: 0 };
  
  const data = JSON.parse(stored) as DailyVoteTracker;
  const today = new Date().toDateString();
  
  if (data.date !== today) {
    return { date: today, count: 0 };
  }
  return data;
};

export const saveDailyVotes = (tracker: DailyVoteTracker) => {
  localStorage.setItem("spark_daily_votes", JSON.stringify(tracker));
};

export const canVoteToday = (): boolean => {
  const tracker = loadDailyVotes();
  return tracker.count < DAILY_VOTE_LIMIT;
};

export const getRemainingVotes = (): number => {
  const tracker = loadDailyVotes();
  return Math.max(0, DAILY_VOTE_LIMIT - tracker.count);
};

export const incrementDailyVoteCount = () => {
  const tracker = loadDailyVotes();
  tracker.count += 1;
  saveDailyVotes(tracker);
};

// ============================================
// Time Formatting
// ============================================

export const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

// ============================================
// User ID Generation
// ============================================

export const getUserId = (): string => {
  let id = localStorage.getItem("spark_user_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("spark_user_id", id);
  }
  return id;
};

// ============================================
// Backend Model Mappers
// ============================================

export const mapBackendIdea = (idea: IdeaModel, userVotes: UserVotes = {}): Idea => ({
  id: idea.id,
  title: idea.title,
  slug: idea.slug,
  description: idea.description,
  category: idea.category,
  upvotes: idea.upvotes || 0,
  downvotes: idea.downvotes || 0,
  userVote: userVotes[idea.id] || null,
  authorUsername: idea.author_username,
  authorAvatar: idea.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${idea.author_username}`,
  authorTwitterId: idea.author_twitter_id,
  source: idea.source as "user" | "twitter" | "ai_conversation",
  tweetUrl: idea.tweet_url,
  tweetContent: idea.tweet_content,
  sparkedByUsername: idea.sparked_by_username,
  estimatedPrice: idea.estimated_price || 0,
  raisedAmount: idea.raised_amount || 0,
  capReachedAt: idea.cap_reached_at || undefined,
  commentsCount: idea.comments_count || 0,
  createdAt: idea.created_at,
  status: idea.status as "pending" | "in_progress" | "completed" | "planned" | "refunded",
  generatedImageUrl: idea.generated_image_url,
  marketAnalysis: idea.market_analysis,
  colosseumAnalysis: idea.colosseum_analysis,
  colosseumScore: idea.colosseum_score,
  tokenAddress: idea.token_address,
  timelinePhase: idea.timeline_phase,
  legendsUrl: idea.legends_url,
  superteamUrl: idea.superteam_url,
  coinName: idea.coin_name,
  ticker: idea.ticker,
  initialTokenPrice: idea.initial_token_price,
  totalFeesCollected: idea.total_fees_collected || 0,
  treasuryWallet: idea.treasury_wallet,
  liquidityPercent: idea.liquidity_percent ?? undefined,
  hasLandingPage: !!(idea as any).landing_page,
});

export const mapBackendComment = (comment: IdeaCommentModel, userCommentVotes: UserCommentVotes = {}): Comment => ({
  id: comment.id,
  ideaId: comment.idea_id,
  parentCommentId: comment.parent_comment_id,
  authorUsername: comment.author_username,
  authorAvatar: comment.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.author_username}`,
  authorTwitterId: comment.author_twitter_id,
  content: comment.content,
  isTeam: comment.is_team,
  createdAt: comment.created_at,
  upvotes: comment.upvotes || 0,
  downvotes: comment.downvotes || 0,
  userVote: userCommentVotes[comment.id] || null,
  authorInvestment: comment.author_investment || 0,
});
