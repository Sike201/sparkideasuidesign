import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import {
  Idea,
  Comment,
  UserVotes,
  UserCommentVotes,
  SortOption,
  NewIdeaForm,
  loadUserVotes,
  saveUserVotes,
  loadUserCommentVotes,
  canVoteToday,
  getRemainingVotes,
  incrementDailyVoteCount,
  getUserId,
  DAILY_VOTE_LIMIT,
  mapBackendIdea,
  mapBackendComment,
} from "@/components/Ideas";
import type { UseIdeasAuthReturn } from "./useIdeasAuth";

export interface UseIdeasDataReturn {
  ideas: Idea[];
  isLoadingIdeas: boolean;
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  now: Date;
  selectedIdea: Idea | null;
  setSelectedIdea: (idea: Idea | null) => void;
  userVotes: UserVotes;
  userCommentVotes: UserCommentVotes;
  fetchIdeas: () => Promise<void>;
  handleVote: (ideaId: string, voteType: 'up' | 'down') => Promise<void>;
  handleSubmitIdea: (newIdea: NewIdeaForm) => Promise<{ slug: string; title: string } | undefined>;
  loadIdeaBySlug: (slug: string) => Promise<void>;
  comments: Comment[];
  setComments: React.Dispatch<React.SetStateAction<Comment[]>>;
  buildCommentTree: (flatComments: Comment[]) => Comment[];
  sortComments: (commentsToSort: Comment[], sortType: "votes" | "newest" | "oldest" | "invested") => Comment[];
}

export function useIdeasData(auth: UseIdeasAuthReturn): UseIdeasDataReturn {
  const navigate = useNavigate();

  // Ideas state
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isLoadingIdeas, setIsLoadingIdeas] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("votes");
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);

  // Countdown timer for cap-reached ideas
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const hasCountdown = ideas.some(i => {
      if (!i.capReachedAt) return false;
      const deadline = new Date(new Date(i.capReachedAt).getTime() + 24 * 60 * 60 * 1000);
      return new Date() < deadline;
    });
    if (!hasCountdown) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [ideas]);

  // Vote tracking
  const [userVotes, setUserVotes] = useState<UserVotes>(loadUserVotes);
  const [userCommentVotes, setUserCommentVotes] = useState<UserCommentVotes>(loadUserCommentVotes);

  // Comments state (kept here for loadIdeaBySlug which sets comments)
  const [comments, setComments] = useState<Comment[]>([]);

  // Track which ideas are currently generating images
  const [generatingImages, setGeneratingImages] = useState<Set<string>>(new Set());

  // Sort comments
  const sortComments = useCallback((commentsToSort: Comment[], sortType: "votes" | "newest" | "oldest" | "invested"): Comment[] => {
    const sorted = [...commentsToSort];
    switch (sortType) {
      case "votes":
        sorted.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
        break;
      case "newest":
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "oldest":
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "invested":
        // Surface comments from the biggest backers first. Users
        // without an investment row come back as `undefined` from the
        // server — coerce to 0 so they fall to the bottom rather than
        // shuffling unpredictably. Tie-break on createdAt desc so two
        // commenters with identical investment (e.g. both 0) remain
        // in a stable, intuitive order.
        sorted.sort((a, b) => {
          const ai = a.authorInvestment ?? 0;
          const bi = b.authorInvestment ?? 0;
          if (bi !== ai) return bi - ai;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        break;
    }
    sorted.forEach(comment => {
      if (comment.replies?.length) {
        comment.replies = sortComments(comment.replies, sortType);
      }
    });
    return sorted;
  }, []);

  // Build comment tree
  const buildCommentTree = useCallback((flatComments: Comment[]): Comment[] => {
    const commentMap = new Map<string, Comment>();
    flatComments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    const rootComments: Comment[] = [];
    flatComments.forEach(comment => {
      const mappedComment = commentMap.get(comment.id)!;
      if (comment.parentCommentId) {
        const parent = commentMap.get(comment.parentCommentId);
        if (parent) {
          parent.replies = parent.replies || [];
          parent.replies.push(mappedComment);
        } else {
          rootComments.push(mappedComment);
        }
      } else {
        rootComments.push(mappedComment);
      }
    });

    return rootComments;
  }, []);

  // Fetch ideas from backend
  const fetchIdeas = useCallback(async () => {
    setIsLoadingIdeas(true);
    try {
      const response = await backendSparkApi.getIdeas({ sortBy });
      const mappedIdeas = response.ideas.map((idea) => mapBackendIdea(idea, userVotes));
      setIdeas(mappedIdeas);
    } catch (error) {
      console.error("Failed to fetch ideas:", error);
    } finally {
      setIsLoadingIdeas(false);
    }
  }, [sortBy, userVotes]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  // Load idea by slug
  const loadIdeaBySlug = useCallback(async (ideaSlug: string) => {
    setIsLoadingIdeas(true);
    try {
      const response = await backendSparkApi.getIdeaBySlug(ideaSlug);
      if (response.idea) {
        const mappedIdea = mapBackendIdea(response.idea, userVotes);
        setSelectedIdea(mappedIdea);

        // Generate image and analysis if missing
        if (mappedIdea.id && !mappedIdea.generatedImageUrl && !generatingImages.has(mappedIdea.id)) {
          setGeneratingImages(prev => new Set(prev).add(mappedIdea.id));

          const problemMatch = mappedIdea.description?.match(/\*\*Problem:\*\*\s*\n?([^*]+?)(?=\*\*|$)/i);
          const solutionMatch = mappedIdea.description?.match(/\*\*Solution:\*\*\s*\n?([^*]+?)(?=\*\*|$)/i);

          fetch('/api/generate-idea-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ideaId: mappedIdea.id,
              title: mappedIdea.title,
              description: mappedIdea.description,
              category: mappedIdea.category,
              problem: problemMatch?.[1]?.trim(),
              solution: solutionMatch?.[1]?.trim(),
            }),
          })
          .then(async (res) => {
            const data = await res.json();
            if (data.success && data.imageUrl && !data.inProgress && data.cached) {
              setGeneratingImages(prev => {
                const next = new Set(prev);
                next.delete(mappedIdea.id);
                return next;
              });
              loadIdeaBySlug(ideaSlug);
            } else if (data.inProgress) {
              setTimeout(() => {
                setGeneratingImages(prev => {
                  const next = new Set(prev);
                  next.delete(mappedIdea.id);
                  return next;
                });
              }, 60000);
            } else {
              setGeneratingImages(prev => {
                const next = new Set(prev);
                next.delete(mappedIdea.id);
                return next;
              });
            }
          })
          .catch(err => {
            console.error('Failed to generate image:', err);
            setGeneratingImages(prev => {
              const next = new Set(prev);
              next.delete(mappedIdea.id);
              return next;
            });
          });
        }

        if (mappedIdea.id && !mappedIdea.marketAnalysis) {
          fetch('/api/analyze-market-opportunity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ideaId: mappedIdea.id,
              title: mappedIdea.title,
              description: mappedIdea.description,
              category: mappedIdea.category,
            }),
          }).catch(err => console.error('Failed to analyze market:', err));
        }

        if (mappedIdea.id && !mappedIdea.colosseumAnalysis) {
          fetch('/api/analyze-colosseum', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ideaId: mappedIdea.id,
              title: mappedIdea.title,
              description: mappedIdea.description,
              category: mappedIdea.category,
            }),
          }).catch(err => console.error('Failed to analyze with Colosseum:', err));
        }

        if (response.comments) {
          const mappedComments = response.comments.map(c => mapBackendComment(c, userCommentVotes));
          const tree = buildCommentTree(mappedComments);
          setComments(sortComments(tree, "votes"));
        }
      }
    } catch (error) {
      console.error("Failed to load idea:", error);
      navigate('/ideas');
    } finally {
      setIsLoadingIdeas(false);
    }
  }, [userVotes, userCommentVotes, navigate, buildCommentTree, sortComments, generatingImages]);

  // Handle vote
  const handleVote = async (ideaId: string, voteType: 'up' | 'down') => {
    if (!auth.userProfile.xConnected) {
      auth.connectX();
      return;
    }

    const currentVote = userVotes[ideaId];
    const isNewVote = !currentVote;

    if (isNewVote && !canVoteToday()) {
      toast.warning(`You've reached your daily limit of ${DAILY_VOTE_LIMIT} votes. Come back tomorrow!`);
      return;
    }

    try {
      const userId = getUserId();
      await backendSparkApi.voteIdea({
        id: ideaId,
        action: voteType === 'up' ? 'upvote' : 'downvote',
        userId,
        voteType,
        voterTwitterId: auth.userProfile.xId,
        voterUsername: auth.userProfile.xUsername,
        walletAddress: auth.userProfile.walletAddress,
      });

      // Update local vote state
      const newVotes = { ...userVotes };
      if (currentVote === voteType) {
        delete newVotes[ideaId];
      } else {
        newVotes[ideaId] = voteType;
        if (isNewVote) {
          incrementDailyVoteCount();
          auth.setRemainingVotes(getRemainingVotes());
        }
      }
      setUserVotes(newVotes);
      saveUserVotes(newVotes);

      // Update ideas list immediately with new vote state
      setIdeas(prevIdeas => prevIdeas.map(idea => {
        if (idea.id === ideaId) {
          const updatedIdea = { ...idea };
          const currentUpvotes = updatedIdea.upvotes;
          const currentDownvotes = updatedIdea.downvotes;

          if (currentVote === voteType) {
            updatedIdea.userVote = null;
            if (voteType === 'up') {
              updatedIdea.upvotes = Math.max(0, currentUpvotes - 1);
            } else {
              updatedIdea.downvotes = Math.max(0, currentDownvotes - 1);
            }
          } else if (currentVote) {
            updatedIdea.userVote = voteType;
            if (currentVote === 'up' && voteType === 'down') {
              updatedIdea.upvotes = Math.max(0, currentUpvotes - 1);
              updatedIdea.downvotes = currentDownvotes + 1;
            } else if (currentVote === 'down' && voteType === 'up') {
              updatedIdea.downvotes = Math.max(0, currentDownvotes - 1);
              updatedIdea.upvotes = currentUpvotes + 1;
            }
          } else {
            updatedIdea.userVote = voteType;
            if (voteType === 'up') {
              updatedIdea.upvotes = currentUpvotes + 1;
            } else {
              updatedIdea.downvotes = currentDownvotes + 1;
            }
          }

          return updatedIdea;
        }
        return idea;
      }));

      // Update selected idea immediately if it's the one being voted on
      if (selectedIdea?.id === ideaId) {
        setSelectedIdea(prev => {
          if (!prev) return prev;
          const updatedIdea = { ...prev };
          const currentUpvotes = updatedIdea.upvotes;
          const currentDownvotes = updatedIdea.downvotes;

          if (currentVote === voteType) {
            updatedIdea.userVote = null;
            if (voteType === 'up') {
              updatedIdea.upvotes = Math.max(0, currentUpvotes - 1);
            } else {
              updatedIdea.downvotes = Math.max(0, currentDownvotes - 1);
            }
          } else if (currentVote) {
            updatedIdea.userVote = voteType;
            if (currentVote === 'up' && voteType === 'down') {
              updatedIdea.upvotes = Math.max(0, currentUpvotes - 1);
              updatedIdea.downvotes = currentDownvotes + 1;
            } else if (currentVote === 'down' && voteType === 'up') {
              updatedIdea.downvotes = Math.max(0, currentDownvotes - 1);
              updatedIdea.upvotes = currentUpvotes + 1;
            }
          } else {
            updatedIdea.userVote = voteType;
            if (voteType === 'up') {
              updatedIdea.upvotes = currentUpvotes + 1;
            } else {
              updatedIdea.downvotes = currentDownvotes + 1;
            }
          }

          return updatedIdea;
        });
      }
    } catch (error) {
      console.error("Failed to vote:", error);
    }
  };

  // Handle submit idea
  const handleSubmitIdea = async (newIdea: NewIdeaForm) => {
    if (!auth.userProfile.xConnected) return;

    let description = newIdea.description || "";
    if (newIdea.why) {
      description += `\n\n**Why (the deeper problem/thesis):**\n${newIdea.why}`;
    }
    if (newIdea.marketSize) {
      description += `\n\n**Market Size:**\n${newIdea.marketSize}`;
    }
    if (newIdea.competitors) {
      description += `\n\n**Competitors:**\n${newIdea.competitors}`;
    }

    const estimatedPrice = newIdea.estimatedPrice;

    try {
      const result = await backendSparkApi.submitIdea({
        title: newIdea.idea,
        description: description.trim() || newIdea.idea,
        category: newIdea.category,
        authorUsername: auth.userProfile.xUsername || "anonymous",
        authorAvatar: auth.userProfile.xAvatar,
        authorTwitterId: auth.userProfile.xId,
        estimatedPrice: estimatedPrice,
        coinName: newIdea.coinName,
        ticker: newIdea.ticker,
        ideatorWallet: auth.userProfile.walletAddress,
      });

      if (result.id) {
        fetch('/api/generate-idea-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ideaId: result.id,
            title: newIdea.idea,
            description: description.trim() || newIdea.idea,
            category: newIdea.category,
          }),
        }).catch(err => console.error('Failed to generate image for new idea:', err));

        fetch('/api/analyze-market-opportunity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ideaId: result.id,
            title: newIdea.idea,
            description: description.trim() || newIdea.idea,
            category: newIdea.category,
            marketSize: newIdea.marketSize,
            competitors: newIdea.competitors,
          }),
        }).catch(err => console.error('Failed to analyze market:', err));
      }

      fetchIdeas();
      return { slug: result.slug, title: newIdea.idea };
    } catch (error) {
      console.error("Failed to submit idea:", error);
      throw error;
    }
  };

  return {
    ideas,
    isLoadingIdeas,
    sortBy,
    setSortBy,
    now,
    selectedIdea,
    setSelectedIdea,
    userVotes,
    userCommentVotes,
    fetchIdeas,
    handleVote,
    handleSubmitIdea,
    loadIdeaBySlug,
    comments,
    setComments,
    buildCommentTree,
    sortComments,
  };
}
