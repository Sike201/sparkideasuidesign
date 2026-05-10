import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Twitter, ThumbsUp, ThumbsDown, Lightbulb, ExternalLink, Loader2, DollarSign, Coins, Rocket, Users, Wallet, LogOut, ArrowLeft } from "lucide-react";
import { backendSparkApi, IdeaModel, IdeaVoteModel, UserInvestmentModel } from "@/data/api/backendSparkApi";
import { SEO } from "@/components/SEO";
import { signMessageWithPhantom } from "@/services/phantomService";
import { useIdeasAuth } from "@/hooks/useIdeasAuth";
import { useIdeasData } from "@/hooks/useIdeasData";
import { toast } from "react-toastify";
import IdeasLayout from "@/components/Ideas/IdeasLayout";

// Category colors - same as in Ideas.tsx
const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  "AI x Crypto": { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  "Consumer Apps": { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  "DAO Tooling & Governance": { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  "DeFi": { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  "Gaming": { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/20" },
  "Identity & Reputation": { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
  "Infrastructure": { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/20" },
  "Payments & Fintech": { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/20" },
  "Robotic": { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
  "RWA": { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
  "WEB2": { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20" },
};

interface PublicIdea {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  status: string;
  upvotes: number;
  downvotes: number;
  commentsCount: number;
  createdAt: string;
  ideatorWallet?: string;
  raisedAmount?: number;
  estimatedPrice?: number;
  feesAvailable?: number;
  feesClaimed?: number;
  totalFeesCollected?: number;
  coinName?: string;
  ticker?: string;
}

interface PublicVote {
  ideaId: string;
  ideaTitle: string;
  ideaSlug: string;
  ideaCategory: string;
  voteType: 'up' | 'down';
  createdAt: string;
}

interface PublicInvestment {
  ideaId: string;
  ideaTitle: string;
  ideaSlug: string;
  amountUsdc: number;
  createdAt: string;
}

interface ReferralEntry {
  id: string;
  referee_wallet: string;
  referee_twitter_username: string | null;
  created_at: string;
  total_invested_after_referral: number;
}

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const auth = useIdeasAuth();
  const ideasData = useIdeasData(auth);
  const initialTab = (['ideas', 'launched', 'votes', 'investments', 'referrals'] as const).includes(searchParams.get('tab') as 'ideas' | 'launched' | 'votes' | 'investments' | 'referrals')
    ? (searchParams.get('tab') as 'ideas' | 'launched' | 'votes' | 'investments' | 'referrals')
    : 'ideas';
  const [activeTab, setActiveTab] = useState<'ideas' | 'launched' | 'votes' | 'investments' | 'referrals'>(initialTab);
  const [ideas, setIdeas] = useState<PublicIdea[]>([]);
  const [votes, setVotes] = useState<PublicVote[]>([]);
  const [investments, setInvestments] = useState<PublicInvestment[]>([]);
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [userProfile, setUserProfile] = useState<{ name?: string; avatar?: string; walletAddress?: string } | null>(null);
  const [isLoadingIdeas, setIsLoadingIdeas] = useState(true);
  const [isLoadingVotes, setIsLoadingVotes] = useState(true);
  const [isLoadingInvestments, setIsLoadingInvestments] = useState(false);
  const [isLoadingReferrals, setIsLoadingReferrals] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [claimingIdeaId, setClaimingIdeaId] = useState<string | null>(null);
  const [userPointsData, setUserPointsData] = useState<{ points: number; rank: number } | null>(null);

  // Get connected wallet from Spark user profile
  const connectedWallet = (() => {
    try {
      const stored = localStorage.getItem("spark_user_profile");
      if (stored) {
        const profile = JSON.parse(stored);
        return profile.walletConnected ? profile.walletAddress : null;
      }
    } catch {}
    return null;
  })();

  // Ideas where the connected user is the ideator and has fees to claim
  const claimableIdeas = ideas.filter(
    (idea) => idea.ideatorWallet && connectedWallet && idea.ideatorWallet === connectedWallet && (idea.feesAvailable || 0) - (idea.feesClaimed || 0) > 0
  );

  const handleClaim = async (ideaId: string) => {
    if (!connectedWallet) return;
    setClaimingIdeaId(ideaId);
    try {
      const message = `Claim ideator fees for idea ${ideaId}`;
      const signatureBytes = await signMessageWithPhantom(message);
      const response = await fetch("/api/ideator-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideaId,
          address: connectedWallet,
          message,
          signature: Array.from(signatureBytes),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error((data as { error?: string }).error || "Claim failed");
      } else {
        const result = data as { claimed?: number };
        toast.success(`Claimed $${result.claimed?.toFixed(2)} USDG!`);
        if (username) fetchUserIdeas(username);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaimingIdeaId(null);
    }
  };

  // If user navigated to /profile/connect without X connected, redirect once they connect
  const isConnectPage = username === "connect";
  const isReferralsPage = username === "referrals";

  useEffect(() => {
    if (isConnectPage && auth.userProfile.xUsername) {
      navigate(`/profile/${auth.userProfile.xUsername}`, { replace: true });
      return;
    }
    if (isReferralsPage && auth.userProfile.xUsername) {
      navigate(`/profile/${auth.userProfile.xUsername}?tab=referrals`, { replace: true });
      return;
    }
    if (username && !isConnectPage && !isReferralsPage) {
      fetchUserProfile(username);
      fetchUserIdeas(username);
      fetchUserVotes(username);
    }
  }, [username, isConnectPage, auth.userProfile.xUsername]);

  const fetchUserProfile = async (username: string) => {
    setIsLoadingProfile(true);
    try {
      const response = await fetch(`/api/twitter-users?username=${username}`);
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          const walletAddress = data.user.wallet_address;
          setUserProfile({
            name: data.user.name,
            avatar: data.user.profile_image_url || `https://unavatar.io/twitter/${username}`,
            walletAddress,
          });
          if (walletAddress) {
            backendSparkApi.getUserPoints(walletAddress)
              .then(pts => setUserPointsData({ points: pts.points, rank: pts.rank }))
              .catch(() => {});
          }
          fetchUserInvestments(username);
        } else {
          setUserProfile({
            avatar: `https://unavatar.io/twitter/${username}`
          });
          fetchUserInvestments(username);
        }
      } else {
        setUserProfile({
          avatar: `https://unavatar.io/twitter/${username}`
        });
        fetchUserInvestments(username);
      }
    } catch (error) {
      console.error("Failed to fetch user profile:", error);
      setUserProfile({
        avatar: `https://unavatar.io/twitter/${username}`
      });
      fetchUserInvestments(username);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const fetchUserInvestments = async (username: string) => {
    setIsLoadingInvestments(true);
    try {
      const response = await backendSparkApi.getUserInvestments(username, true);
      const mapped: PublicInvestment[] = (response.investments || []).map((inv: UserInvestmentModel) => ({
        ideaId: inv.idea_id,
        ideaTitle: inv.idea_title || "Unknown Idea",
        ideaSlug: inv.idea_slug || "",
        amountUsdc: inv.amount_usdc,
        createdAt: inv.created_at,
      }));
      setInvestments(mapped);
    } catch (error) {
      console.error("Failed to fetch user investments:", error);
    } finally {
      setIsLoadingInvestments(false);
    }
  };

  const fetchUserIdeas = async (authorUsername: string) => {
    setIsLoadingIdeas(true);
    try {
      const response = await backendSparkApi.getIdeas({ authorUsername });
      const mappedIdeas: PublicIdea[] = response.ideas.map((idea: IdeaModel) => ({
        id: idea.id,
        title: idea.title,
        slug: idea.slug,
        description: idea.description,
        category: idea.category,
        status: idea.status,
        upvotes: idea.upvotes || 0,
        downvotes: idea.downvotes || 0,
        commentsCount: idea.comments_count || 0,
        createdAt: idea.created_at,
        ideatorWallet: idea.ideator_wallet,
        raisedAmount: idea.raised_amount || 0,
        estimatedPrice: idea.estimated_price || 0,
        feesAvailable: idea.ideator_fees_available || 0,
        feesClaimed: idea.ideator_fees_claimed || 0,
        totalFeesCollected: idea.total_fees_collected || 0,
        coinName: idea.coin_name,
        ticker: idea.ticker,
      }));
      setIdeas(mappedIdeas);
    } catch (error) {
      console.error("Failed to fetch user ideas:", error);
    } finally {
      setIsLoadingIdeas(false);
    }
  };

  const fetchUserVotes = async (voterUsername: string) => {
    setIsLoadingVotes(true);
    try {
      const response = await backendSparkApi.getUserVotes(voterUsername);
      const mappedVotes: PublicVote[] = response.votes.map((vote: IdeaVoteModel) => ({
        ideaId: vote.idea_id,
        ideaTitle: vote.idea_title || "Unknown Idea",
        ideaSlug: vote.idea_slug || "",
        ideaCategory: vote.idea_category || "Unknown",
        voteType: vote.vote_type,
        createdAt: vote.created_at,
      }));
      setVotes(mappedVotes);
    } catch (error) {
      console.error("Failed to fetch user votes:", error);
    } finally {
      setIsLoadingVotes(false);
    }
  };

  const fetchReferrals = async (wallet: string) => {
    setIsLoadingReferrals(true);
    try {
      const response = await fetch(`/api/referrals?wallet=${wallet}&action=referrals-with-investments`);
      if (response.ok) {
        const data = await response.json();
        setReferrals((data as { referrals: ReferralEntry[] }).referrals || []);
      }
    } catch (error) {
      console.error("Failed to fetch referrals:", error);
    } finally {
      setIsLoadingReferrals(false);
    }
  };

  // Load referrals when switching to the tab (or on referrals page) and wallet is connected
  useEffect(() => {
    if ((activeTab === 'referrals' || isReferralsPage) && connectedWallet) {
      fetchReferrals(connectedWallet);
    }
  }, [activeTab, connectedWallet, isReferralsPage]);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return "just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const launchedIdeas = ideas.filter(i => i.status === 'completed');
  const upvotesCount = votes.filter(v => v.voteType === 'up').length;
  const downvotesCount = votes.filter(v => v.voteType === 'down').length;
  const totalInvested = investments.reduce((sum, inv) => sum + inv.amountUsdc, 0);
  const totalFeesClaimed = launchedIdeas.reduce((sum, i) => sum + (i.feesClaimed || 0), 0);
  const totalFeesAvailable = launchedIdeas.reduce((sum, i) => sum + Math.max(0, (i.feesAvailable || 0) - (i.feesClaimed || 0)), 0);

  // Referrals-only page: for users with wallet but no X account
  if (isReferralsPage && !auth.userProfile.xUsername) {
    return (
      <IdeasLayout auth={auth} ideasData={ideasData}>
        <SEO title="My Referrals" path="/profile/referrals" />
        <div className="max-w-3xl mx-auto">
          <Link
            to="/ideas"
            className="inline-flex items-center gap-2 text-xs font-medium text-neutral-500 hover:text-white transition-colors mb-8 font-satoshi"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to all ideas
          </Link>

          <h1 className="text-2xl font-bold text-white font-satoshi mb-8">My Referrals</h1>

          {/* Wallet connection header */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] mb-6">
            {connectedWallet ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500 font-satoshi uppercase tracking-wider mb-0.5">Referrals of</p>
                    <span className="text-sm font-geist text-white">
                      {connectedWallet.slice(0, 4)}...{connectedWallet.slice(-4)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={auth.disconnectWallet}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors font-satoshi"
                >
                  <LogOut className="w-3 h-3" />
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-neutral-800/50 border border-white/[0.06] flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-neutral-500" />
                  </div>
                  <span className="text-sm text-neutral-400 font-satoshi">Connect your wallet to view your referrals</span>
                </div>
                <button
                  onClick={auth.connectWallet}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl text-xs font-semibold text-white hover:opacity-90 transition-opacity font-satoshi"
                >
                  <Wallet className="w-3 h-3" />
                  Connect Wallet
                </button>
              </div>
            )}
          </div>

          {/* Referrals list */}
          {!connectedWallet ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-neutral-600" />
              </div>
              <p className="text-neutral-400 font-satoshi">Connect your wallet to see your referrals</p>
            </div>
          ) : isLoadingReferrals ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
              <span className="ml-2 text-neutral-400 font-satoshi">Loading referrals...</span>
            </div>
          ) : referrals.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-neutral-600" />
              </div>
              <p className="text-neutral-400 font-satoshi">No referrals yet</p>
              <p className="text-xs text-neutral-600 mt-2 font-satoshi">Share your referral link to start earning rewards</p>
            </div>
          ) : (
            <div className="space-y-2">
              {referrals.map((ref) => {
                const reward = ref.total_invested_after_referral * 0.005;
                return (
                  <div
                    key={ref.id}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.03] transition-all"
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-500/10 border border-purple-500/20 shrink-0">
                      <Users className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-geist text-white">
                        {ref.referee_wallet.slice(0, 4)}...{ref.referee_wallet.slice(-4)}
                      </span>
                      <div className="flex items-center gap-3 text-[10px] text-neutral-500 mt-0.5 font-satoshi">
                        <span>Referred {formatTimeAgo(ref.created_at)}</span>
                        {ref.total_invested_after_referral > 0 && (
                          <span className="text-emerald-400/80">
                            Invested ${ref.total_invested_after_referral.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 font-satoshi ${
                      reward > 0
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                        : "bg-white/[0.03] border border-white/[0.06] text-neutral-500"
                    }`}>
                      <Coins className="w-3 h-3" />
                      {reward > 0 ? `$${reward.toFixed(2)} in tokens` : "No reward yet"}
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-neutral-600 text-center mt-4 font-satoshi">
                Rewards are automatically airdropped as tokens when the idea launches
              </p>
            </div>
          )}
        </div>
      </IdeasLayout>
    );
  }

  // Connect page: show connect X prompt
  if (isConnectPage && !auth.userProfile.xUsername) {
    return (
      <IdeasLayout auth={auth} ideasData={ideasData}>
        <SEO title="Connect to view profile" path="/profile/connect" />
        <div className="max-w-md mx-auto text-center py-24">
          <div className="w-20 h-20 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-8">
            <Twitter className="w-9 h-9 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white font-satoshi mb-3">Connect X to view your profile</h1>
          <p className="text-sm text-neutral-400 mb-10 font-satoshi">
            Link your X account to see your ideas, votes, and investments.
          </p>
          <button
            onClick={auth.connectX}
            disabled={auth.isConnectingX}
            className="inline-flex items-center gap-2 px-7 py-3 bg-gradient-to-r from-blue-500 to-blue-400 hover:opacity-90 text-white text-sm font-semibold rounded-xl transition-opacity disabled:opacity-50 font-satoshi"
          >
            {auth.isConnectingX ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Twitter className="w-4 h-4" />
            )}
            Connect X
          </button>
          <Link
            to="/ideas"
            className="block mt-6 text-xs text-neutral-500 hover:text-white transition-colors font-satoshi"
          >
            ← Back to ideas
          </Link>
        </div>
      </IdeasLayout>
    );
  }

  return (
    <IdeasLayout auth={auth} ideasData={ideasData}>
      <SEO
        title={username ? `@${username}` : "Profile"}
        description={username ? `View @${username}'s ideas, votes, and investments on JustSpark.` : "User profile on JustSpark."}
        path={`/profile/${username}`}
      />

      <div className="max-w-4xl mx-auto">
        <Link
          to="/ideas"
          className="inline-flex items-center gap-2 text-xs font-medium text-neutral-500 hover:text-white transition-colors mb-8 font-satoshi"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to all ideas
        </Link>

        {/* Profile Header Card */}
        <div className="mb-8 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-start gap-5 mb-6">
            {/* Avatar */}
            {isLoadingProfile ? (
              <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse shrink-0" />
            ) : (
              <div className="relative shrink-0">
                <img
                  src={userProfile?.avatar || `https://unavatar.io/twitter/${username}`}
                  alt={username}
                  className="w-20 h-20 rounded-2xl object-cover border border-white/[0.08]"
                />
                <div className="absolute inset-0 rounded-2xl ring-1 ring-orange-500/20" />
              </div>
            )}

            {/* Name + links */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white font-satoshi leading-tight mb-1">
                {userProfile?.name || `@${username}`}
              </h1>
              <p className="text-sm text-neutral-500 font-satoshi mb-3">@{username}</p>
              <a
                href={`https://x.com/${username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-xl text-xs text-neutral-300 hover:text-white hover:border-white/[0.12] transition-all font-satoshi"
              >
                <Twitter className="w-3.5 h-3.5 text-blue-400" />
                View on X
                <ExternalLink className="w-3 h-3 text-neutral-500" />
              </a>
            </div>
          </div>

          {/* Stats grid — single row on desktop, 2 cols on mobile, each card stretches equally */}
          <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] sm:flex-1 sm:min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Lightbulb className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-satoshi">Ideas</span>
              </div>
              <p className="text-xl font-bold text-white font-satoshi">{ideas.length}</p>
            </div>
            {launchedIdeas.length > 0 && (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] sm:flex-1 sm:min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Rocket className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-satoshi">Launched</span>
                </div>
                <p className="text-xl font-bold text-white font-satoshi">{launchedIdeas.length}</p>
              </div>
            )}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] sm:flex-1 sm:min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <ThumbsUp className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-satoshi">Upvotes</span>
              </div>
              <p className="text-xl font-bold text-white font-satoshi">{upvotesCount}</p>
            </div>
            {totalInvested > 0 && (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] sm:flex-1 sm:min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-satoshi">Invested</span>
                </div>
                <p className="text-xl font-bold text-white font-satoshi">
                  ${totalInvested.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
            {totalFeesClaimed > 0 && (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] sm:flex-1 sm:min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Coins className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-satoshi">Earned</span>
                </div>
                <p className="text-xl font-bold text-white font-satoshi">${totalFeesClaimed.toFixed(2)}</p>
              </div>
            )}
            <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500/[0.06] to-amber-500/[0.04] border border-orange-500/20 sm:flex-1 sm:min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">🔥</span>
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-satoshi">Points</span>
              </div>
              <p className="text-xl font-bold text-orange-400 font-satoshi">{(userPointsData?.points ?? 0).toLocaleString()}</p>
              {userPointsData && userPointsData.points > 0 && (
                <p className="text-[10px] text-neutral-500 font-satoshi">Rank #{userPointsData.rank}</p>
              )}
            </div>
          </div>
        </div>

        {/* Claimable Fees Banner */}
        {claimableIdeas.length > 0 && (
          <div className="mb-8 p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Coins className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-emerald-400 font-satoshi">Ideator Fees to Claim</h3>
            </div>
            <div className="space-y-2">
              {claimableIdeas.map((idea) => {
                const claimable = (idea.feesAvailable || 0) - (idea.feesClaimed || 0);
                return (
                  <div
                    key={idea.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-emerald-500/10"
                  >
                    <div className="flex-1 min-w-0">
                      <Link to={`/ideas/${idea.slug}`} className="text-xs font-medium text-white hover:text-emerald-400 transition-colors truncate block font-satoshi">
                        {idea.title}
                      </Link>
                      <span className="text-[10px] text-neutral-500 font-satoshi">
                        ${claimable.toFixed(2)} available · ${(idea.feesClaimed || 0).toFixed(2)} claimed
                      </span>
                    </div>
                    <button
                      onClick={() => handleClaim(idea.id)}
                      disabled={claimingIdeaId !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 font-satoshi ml-3"
                    >
                      {claimingIdeaId === idea.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Coins className="w-3 h-3" />
                      )}
                      Claim ${claimable.toFixed(2)}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Premium Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-x-auto scrollbar-hide">
          {[
            { key: 'ideas' as const, label: 'All Ideas', count: ideas.length },
            { key: 'launched' as const, label: 'Launched', count: launchedIdeas.length },
            { key: 'votes' as const, label: 'Votes', count: votes.length },
            { key: 'investments' as const, label: 'Investments', count: investments.length },
            { key: 'referrals' as const, label: 'Referrals', count: referrals.length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-4 py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap font-satoshi ${
                activeTab === tab.key
                  ? 'bg-white/[0.08] text-white border border-white/[0.10]'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 text-[10px] ${activeTab === tab.key ? 'text-orange-400' : 'text-neutral-600'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Ideas Tab */}
        {activeTab === 'ideas' && (
          <div className="space-y-3">
            {isLoadingIdeas ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                <span className="ml-2 text-neutral-400 font-satoshi">Loading ideas...</span>
              </div>
            ) : ideas.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <Lightbulb className="w-7 h-7 text-neutral-600" />
                </div>
                <p className="text-neutral-400 font-satoshi">No ideas submitted yet</p>
              </div>
            ) : (
              ideas.map((idea) => {
                const category = categoryColors[idea.category] || categoryColors["AI x Crypto"];
                const voteScore = idea.upvotes - idea.downvotes;
                const claimable = connectedWallet && idea.ideatorWallet === connectedWallet
                  ? (idea.feesAvailable || 0) - (idea.feesClaimed || 0)
                  : 0;
                const isIdeator = connectedWallet && idea.ideatorWallet === connectedWallet;
                return (
                  <div
                    key={idea.id}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.03] transition-all"
                  >
                    <Link to={`/ideas/${idea.slug}`} className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold shrink-0 font-satoshi ${
                        voteScore > 0 ? 'bg-green-500/10 text-green-400 border border-green-500/20' : voteScore < 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-white/[0.03] text-neutral-400 border border-white/[0.06]'
                      }`}>
                        {voteScore > 0 ? '+' : ''}{voteScore}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-white mb-1 font-satoshi">{idea.title}</h3>
                        <p className="text-xs text-neutral-500 line-clamp-2 mb-2 font-satoshi">{idea.description}</p>
                        <div className="flex items-center gap-3 text-[10px] text-neutral-600 font-satoshi">
                          <span className={`px-1.5 py-0.5 rounded-lg ${category.bg} ${category.text} ${category.border} border`}>
                            {idea.category}
                          </span>
                          <span>{formatTimeAgo(idea.createdAt)}</span>
                          <span>{idea.commentsCount} comments</span>
                        </div>
                      </div>
                    </Link>
                    {isIdeator && (
                      <button
                        onClick={() => handleClaim(idea.id)}
                        disabled={claimable <= 0 || claimingIdeaId !== null}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors font-satoshi ${
                          claimable > 0
                            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-white/[0.03] border border-white/[0.06] text-neutral-500 cursor-not-allowed"
                        }`}
                      >
                        {claimingIdeaId === idea.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Coins className="w-3 h-3" />
                        )}
                        {claimable > 0 ? `Claim $${claimable.toFixed(2)}` : "No fees"}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Launched Tab */}
        {activeTab === 'launched' && (
          <div className="space-y-3">
            {isLoadingIdeas ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                <span className="ml-2 text-neutral-400 font-satoshi">Loading...</span>
              </div>
            ) : launchedIdeas.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <Rocket className="w-7 h-7 text-neutral-600" />
                </div>
                <p className="text-neutral-400 font-satoshi">No launched ideas yet</p>
              </div>
            ) : (
              <>
                {/* Summary card */}
                {(totalFeesClaimed > 0 || totalFeesAvailable > 0) && (
                  <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 mb-2">
                    <div className="flex items-center gap-8 text-sm">
                      <div>
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-satoshi block mb-0.5">Total Claimed</span>
                        <p className="text-emerald-400 font-bold font-satoshi">${totalFeesClaimed.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-satoshi block mb-0.5">Available to Claim</span>
                        <p className="text-orange-400 font-bold font-satoshi">${totalFeesAvailable.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {launchedIdeas.map((idea) => {
                  const category = categoryColors[idea.category] || categoryColors["AI x Crypto"];
                  const claimable = connectedWallet && idea.ideatorWallet === connectedWallet
                    ? Math.max(0, (idea.feesAvailable || 0) - (idea.feesClaimed || 0))
                    : 0;
                  const isIdeator = connectedWallet && idea.ideatorWallet === connectedWallet;

                  return (
                    <div
                      key={idea.id}
                      className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.10] transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <Link to={`/ideas/${idea.slug}`} className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-white font-satoshi">{idea.title}</h3>
                            {idea.ticker && (
                              <span className="text-[10px] font-geist text-neutral-500 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded-lg">
                                ${idea.ticker}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-500 line-clamp-1 mb-2 font-satoshi">{idea.description}</p>
                          <div className="flex items-center gap-3 text-[10px] text-neutral-600 font-satoshi">
                            <span className={`px-1.5 py-0.5 rounded-lg ${category.bg} ${category.text} ${category.border} border`}>
                              {idea.category}
                            </span>
                            <span className="text-emerald-400/80">
                              Raised ${(idea.raisedAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                            {(idea.feesClaimed || 0) > 0 && (
                              <span className="text-emerald-400">
                                Claimed ${(idea.feesClaimed || 0).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </Link>

                        {isIdeator && (
                          <button
                            onClick={() => handleClaim(idea.id)}
                            disabled={claimable <= 0 || claimingIdeaId !== null}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors font-satoshi ${
                              claimable > 0
                                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                                : "bg-white/[0.03] border border-white/[0.06] text-neutral-500 cursor-not-allowed"
                            }`}
                          >
                            {claimingIdeaId === idea.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Coins className="w-3 h-3" />
                            )}
                            {claimable > 0 ? `Claim $${claimable.toFixed(2)}` : "Claimed"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Votes Tab */}
        {activeTab === 'votes' && (
          <div className="space-y-2">
            {isLoadingVotes ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                <span className="ml-2 text-neutral-400 font-satoshi">Loading votes...</span>
              </div>
            ) : votes.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <ThumbsUp className="w-7 h-7 text-neutral-600" />
                </div>
                <p className="text-neutral-400 font-satoshi">No votes yet</p>
              </div>
            ) : (
              votes.map((vote, index) => {
                const category = categoryColors[vote.ideaCategory] || categoryColors["AI x Crypto"];
                return (
                  <Link
                    key={`${vote.ideaId}-${index}`}
                    to={`/ideas/${vote.ideaSlug}`}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.03] transition-all"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      vote.voteType === 'up' ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'
                    }`}>
                      {vote.voteType === 'up' ? (
                        <ThumbsUp className="w-4 h-4 text-green-400" />
                      ) : (
                        <ThumbsDown className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate font-satoshi">{vote.ideaTitle}</p>
                      <div className="flex items-center gap-2 text-[10px] text-neutral-600 mt-0.5 font-satoshi">
                        <span className={`px-1.5 py-0.5 rounded-lg ${category.bg} ${category.text}`}>
                          {vote.ideaCategory}
                        </span>
                        <span>{formatTimeAgo(vote.createdAt)}</span>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold shrink-0 font-satoshi ${
                      vote.voteType === 'up' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {vote.voteType === 'up' ? 'Upvoted' : 'Downvoted'}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        )}

        {/* Investments Tab */}
        {activeTab === 'investments' && (
          <div className="space-y-2">
            {isLoadingInvestments ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                <span className="ml-2 text-neutral-400 font-satoshi">Loading investments...</span>
              </div>
            ) : investments.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <DollarSign className="w-7 h-7 text-neutral-600" />
                </div>
                <p className="text-neutral-400 font-satoshi">No investments yet</p>
              </div>
            ) : (
              investments.map((inv, index) => (
                <Link
                  key={`${inv.ideaId}-${index}`}
                  to={`/ideas/${inv.ideaSlug}`}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.03] transition-all"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate font-satoshi">{inv.ideaTitle}</p>
                    <span className="text-[10px] text-neutral-500 font-satoshi">{formatTimeAgo(inv.createdAt)}</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-400 font-satoshi shrink-0">
                    ${inv.amountUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </Link>
              ))
            )}
          </div>
        )}

        {/* Referrals Tab */}
        {activeTab === 'referrals' && (
          <div className="space-y-4">
            {/* Wallet connection header */}
            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              {connectedWallet ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                      <Wallet className="w-4 h-4 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-500 font-satoshi uppercase tracking-wider mb-0.5">Referrals of</p>
                      <span className="text-sm font-geist text-white">
                        {connectedWallet.slice(0, 4)}...{connectedWallet.slice(-4)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={auth.disconnectWallet}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors font-satoshi"
                  >
                    <LogOut className="w-3 h-3" />
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-neutral-800/50 border border-white/[0.06] flex items-center justify-center">
                      <Wallet className="w-4 h-4 text-neutral-500" />
                    </div>
                    <span className="text-sm text-neutral-400 font-satoshi">Connect your wallet to view your referrals</span>
                  </div>
                  <button
                    onClick={auth.connectWallet}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl text-xs font-semibold text-white hover:opacity-90 transition-opacity font-satoshi"
                  >
                    <Wallet className="w-3 h-3" />
                    Connect Wallet
                  </button>
                </div>
              )}
            </div>

            {/* Referrals list */}
            {!connectedWallet ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <Users className="w-7 h-7 text-neutral-600" />
                </div>
                <p className="text-neutral-400 font-satoshi">Connect your wallet to see your referrals</p>
              </div>
            ) : isLoadingReferrals ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                <span className="ml-2 text-neutral-400 font-satoshi">Loading referrals...</span>
              </div>
            ) : referrals.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <Users className="w-7 h-7 text-neutral-600" />
                </div>
                <p className="text-neutral-400 font-satoshi">No referrals yet</p>
                <p className="text-xs text-neutral-600 mt-2 font-satoshi">Share your referral link to start earning rewards</p>
              </div>
            ) : (
              <div className="space-y-2">
                {referrals.map((ref) => {
                  const reward = ref.total_invested_after_referral * 0.005;
                  return (
                    <div
                      key={ref.id}
                      className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.03] transition-all"
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-500/10 border border-purple-500/20 shrink-0">
                        <Users className="w-4 h-4 text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-geist text-white">
                          {ref.referee_wallet.slice(0, 4)}...{ref.referee_wallet.slice(-4)}
                        </span>
                        <div className="flex items-center gap-3 text-[10px] text-neutral-500 mt-0.5 font-satoshi">
                          <span>Referred {formatTimeAgo(ref.created_at)}</span>
                          {ref.total_invested_after_referral > 0 && (
                            <span className="text-emerald-400/80">
                              Invested ${ref.total_invested_after_referral.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 font-satoshi ${
                        reward > 0
                          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                          : "bg-white/[0.03] border border-white/[0.06] text-neutral-500"
                      }`}>
                        <Coins className="w-3 h-3" />
                        {reward > 0 ? `$${reward.toFixed(2)} in tokens` : "No reward yet"}
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-neutral-600 text-center mt-4 font-satoshi">
                  Rewards are automatically airdropped as tokens when the idea launches
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </IdeasLayout>
  );
}
