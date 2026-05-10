import { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import {
  Comment,
  UserCommentVotes,
  saveUserCommentVotes,
  getUserId,
  mapBackendComment,
} from "@/components/Ideas";
import type { UseIdeasAuthReturn } from "./useIdeasAuth";
import type { UseIdeasDataReturn } from "./useIdeasData";

export interface UseIdeaCommentsReturn {
  comments: Comment[];
  isLoadingComments: boolean;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  commentSortBy: "votes" | "newest" | "oldest" | "invested";
  setCommentSortBy: (sort: "votes" | "newest" | "oldest" | "invested") => void;
  fetchComments: (ideaId: string) => Promise<void>;
  handleCommentVote: (commentId: string, voteType: 'up' | 'down') => Promise<void>;
  handleSubmitComment: (content: string, parentCommentId?: string) => Promise<void>;
}

export function useIdeaComments(auth: UseIdeasAuthReturn, data: UseIdeasDataReturn): UseIdeaCommentsReturn {
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [commentSortBy, setCommentSortBy] = useState<"votes" | "newest" | "oldest" | "invested">("votes");

  // Use comments from data hook (set by loadIdeaBySlug)
  const comments = data.comments;
  const setComments = data.setComments;

  // Fetch comments
  const fetchComments = useCallback(async (ideaId: string) => {
    setIsLoadingComments(true);
    try {
      const response = await backendSparkApi.getIdeaComments(ideaId);
      const mappedComments = response.comments.map(c => mapBackendComment(c, data.userCommentVotes));
      const tree = data.buildCommentTree(mappedComments);
      setComments(data.sortComments(tree, commentSortBy));
    } catch (error) {
      console.error("Failed to fetch comments:", error);
    } finally {
      setIsLoadingComments(false);
    }
  }, [data.userCommentVotes, data.buildCommentTree, data.sortComments, commentSortBy, setComments]);

  // Re-sort comments when sort option changes
  useEffect(() => {
    if (comments.length > 0) {
      setComments(prev => data.sortComments([...prev], commentSortBy));
    }
  }, [commentSortBy]);

  // Handle comment vote
  const handleCommentVote = async (commentId: string, voteType: 'up' | 'down') => {
    if (!auth.userProfile.xConnected) {
      toast.warning("Please connect your X account to vote");
      return;
    }

    try {
      const userId = getUserId();

      const newVotes = { ...data.userCommentVotes };
      const previousVote = newVotes[commentId];

      if (previousVote === voteType) {
        delete newVotes[commentId];
      } else {
        newVotes[commentId] = voteType;
      }

      saveUserCommentVotes(newVotes);

      // Update comments locally immediately
      const updateCommentVotes = (commentList: Comment[]): Comment[] => {
        return commentList.map(comment => {
          if (comment.id === commentId) {
            const currentUpvotes = comment.upvotes;
            const currentDownvotes = comment.downvotes;
            let newUpvotes = currentUpvotes;
            let newDownvotes = currentDownvotes;
            let newUserVote: 'up' | 'down' | null = voteType;

            if (previousVote === 'up' && voteType === 'up') {
              newUpvotes = Math.max(0, currentUpvotes - 1);
              newUserVote = null;
            } else if (previousVote === 'down' && voteType === 'down') {
              newDownvotes = Math.max(0, currentDownvotes - 1);
              newUserVote = null;
            } else if (previousVote === 'up' && voteType === 'down') {
              newUpvotes = Math.max(0, currentUpvotes - 1);
              newDownvotes = currentDownvotes + 1;
            } else if (previousVote === 'down' && voteType === 'up') {
              newDownvotes = Math.max(0, currentDownvotes - 1);
              newUpvotes = currentUpvotes + 1;
            } else if (!previousVote && voteType === 'up') {
              newUpvotes = currentUpvotes + 1;
            } else if (!previousVote && voteType === 'down') {
              newDownvotes = currentDownvotes + 1;
            }

            return {
              ...comment,
              upvotes: newUpvotes,
              downvotes: newDownvotes,
              userVote: newUserVote,
            };
          }

          if (comment.replies && comment.replies.length > 0) {
            return {
              ...comment,
              replies: updateCommentVotes(comment.replies),
            };
          }

          return comment;
        });
      };

      setComments(prevComments => {
        const updated = updateCommentVotes(prevComments);
        return data.sortComments(updated, commentSortBy);
      });

      // Send vote to backend
      await fetch('/api/idea-comments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: commentId,
          action: voteType === 'up' ? 'upvote' : 'downvote',
          userId,
          voteType,
          voterTwitterId: auth.userProfile.xId,
          voterUsername: auth.userProfile.xUsername
        })
      });
    } catch (error) {
      console.error("Failed to vote on comment:", error);
      if (data.selectedIdea) {
        fetchComments(data.selectedIdea.id);
      }
    }
  };

  // Handle submit comment
  const handleSubmitComment = async (content: string, parentCommentId?: string) => {
    if (!data.selectedIdea || !auth.userProfile.xConnected) return;

    try {
      await backendSparkApi.submitIdeaComment({
        ideaId: data.selectedIdea.id,
        content,
        authorUsername: auth.userProfile.xUsername || "anonymous",
        authorAvatar: auth.userProfile.xAvatar,
        authorTwitterId: auth.userProfile.xId,
        parentCommentId,
        walletAddress: auth.userProfile.walletAddress,
      });
      fetchComments(data.selectedIdea.id);
    } catch (error) {
      console.error("Failed to submit comment:", error);
    }
  };

  return {
    comments,
    isLoadingComments,
    replyingTo,
    setReplyingTo,
    commentSortBy,
    setCommentSortBy,
    fetchComments,
    handleCommentVote,
    handleSubmitComment,
  };
}
