// Ideas Feature Types

export interface UserProfile {
  xId?: string;
  xUsername?: string;
  xName?: string;
  xAvatar?: string;
  xConnected: boolean;
  walletAddress?: string;
  walletConnected: boolean;
}

export interface Idea {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  upvotes: number;
  downvotes: number;
  userVote: 'up' | 'down' | null;
  authorUsername: string;
  authorAvatar: string;
  authorTwitterId?: string;
  source: "user" | "twitter" | "ai_conversation";
  tweetUrl?: string;
  tweetContent?: string;
  sparkedByUsername?: string;
  estimatedPrice?: number;
  raisedAmount?: number;
  capReachedAt?: string;
  commentsCount: number;
  createdAt: string;
  status: "pending" | "in_progress" | "completed" | "planned" | "refunded";
  generatedImageUrl?: string;
  marketAnalysis?: string;
  colosseumAnalysis?: string;
  colosseumScore?: number;
  tokenAddress?: string;
  timelinePhase?: number;
  legendsUrl?: string;
  superteamUrl?: string;
  coinName?: string;
  ticker?: string;
  initialTokenPrice?: number;
  totalFeesCollected?: number;
  treasuryWallet?: string;
  liquidityPercent?: number;
  hasLandingPage?: boolean;
}

export interface Comment {
  id: string;
  ideaId: string;
  parentCommentId?: string;
  authorUsername: string;
  authorAvatar: string;
  authorTwitterId?: string;
  content: string;
  isTeam: boolean;
  createdAt: string;
  upvotes: number;
  downvotes: number;
  userVote: 'up' | 'down' | null;
  authorInvestment?: number; // Total USDC invested by this user in the idea
  replies?: Comment[];
}

export interface BuilderTeam {
  id: string;
  name: string;
  description: string;
  logo?: string;
  twitter?: string;
  website?: string;
  buildersCount: number;
  totalEarned: string;
  focus: string[];
  availability: "Available" | "Busy" | "Not Available";
  experience: string[];
}

export interface Investment {
  id: string;
  ideaId: string;
  investorWallet: string;
  amountUsdc: number;
  status: 'active' | 'claimed' | 'refunded';
  transactionSignature?: string;
  createdAt: string;
}

export type UserVotes = Record<string, 'up' | 'down'>;
export type UserCommentVotes = Record<string, 'up' | 'down'>;
export type ViewType = "ideas" | "idea-detail" | "agents" | "teams" | "explanation" | "roadmap" | "profile" | "funded";
export type SortOption = "votes" | "newest" | "oldest" | "raised";

export interface DailyVoteTracker {
  date: string;
  count: number;
}

export interface NewIdeaForm {
  idea: string;
  coinName: string;
  ticker: string;
  category: string;
  description: string;
  estimatedPrice: number;
  why?: string;
  marketSize?: string;
  competitors?: string;
}
