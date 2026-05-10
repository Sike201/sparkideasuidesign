import { useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { useIdeasAuth } from "@/hooks/useIdeasAuth";
import { useIdeasData } from "@/hooks/useIdeasData";
import { useIdeaComments } from "@/hooks/useIdeaComments";
import IdeasLayout from "@/components/Ideas/IdeasLayout";
import { IdeaDetailView } from "@/components/Ideas";
import { SEO } from "@/components/SEO";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import type { EditIdeaFields } from "@/components/Ideas/IdeaDetailView";

export default function IdeaDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useIdeasAuth();
  const ideasData = useIdeasData(auth);
  const commentsHook = useIdeaComments(auth, ideasData);

  // Load idea by slug
  useEffect(() => {
    if (slug) {
      ideasData.loadIdeaBySlug(slug);
    }
  }, [slug]);

  const handleBack = () => {
    const state = location.state as { from?: string } | null;
    if (state?.from) {
      navigate(state.from);
    } else {
      navigate('/ideas');
    }
  };

  const backLabel = (location.state as { from?: string } | null)?.from === "/funded"
    ? "Back to funded"
    : "Back to all ideas";

  const isOwner = !!(
    auth.userProfile.xId &&
    ideasData.selectedIdea?.authorTwitterId &&
    auth.userProfile.xId === ideasData.selectedIdea.authorTwitterId
  );

  const handleSaveEdit = useCallback(async (fields: EditIdeaFields) => {
    if (!ideasData.selectedIdea || !auth.userProfile.xId) return;
    try {
      await backendSparkApi.updateIdea({
        id: ideasData.selectedIdea.id,
        author_twitter_id: auth.userProfile.xId,
        ...fields,
      });
      toast.success("Idea updated!");
      // Reload idea to reflect changes
      if (slug) ideasData.loadIdeaBySlug(slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update idea");
      throw err;
    }
  }, [ideasData.selectedIdea, auth.userProfile.xId, slug]);

  return (
    <IdeasLayout auth={auth} ideasData={ideasData}>
      {ideasData.selectedIdea && (
        <SEO
          title={ideasData.selectedIdea.title}
          description={ideasData.selectedIdea.description.slice(0, 160)}
          path={`/ideas/${slug}`}
          image={ideasData.selectedIdea.generatedImageUrl}
        />
      )}
      {ideasData.isLoadingIdeas ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
          <span className="ml-3 text-sm text-neutral-400">Loading idea...</span>
        </div>
      ) : ideasData.selectedIdea ? (
        <IdeaDetailView
          idea={ideasData.selectedIdea}
          comments={commentsHook.comments}
          isLoadingComments={commentsHook.isLoadingComments}
          onBack={handleBack}
          backLabel={backLabel}
          onUpvote={(id) => ideasData.handleVote(id, 'up')}
          onDownvote={(id) => ideasData.handleVote(id, 'down')}
          onCommentVote={commentsHook.handleCommentVote}
          onSubmitComment={commentsHook.handleSubmitComment}
          onShare={() => auth.setIsShareModalOpen(true)}
          replyingTo={commentsHook.replyingTo}
          setReplyingTo={commentsHook.setReplyingTo}
          userProfile={auth.userProfile}
          commentSortBy={commentsHook.commentSortBy}
          setCommentSortBy={commentsHook.setCommentSortBy}
          onConnectWallet={auth.connectWallet}
          isConnectingWallet={auth.isConnectingWallet}
          onConnectX={auth.connectX}
          isConnectingX={auth.isConnectingX}
          onCommentPosted={() => ideasData.selectedIdea && commentsHook.fetchComments(ideasData.selectedIdea.id)}
          isOwner={isOwner}
          onSaveEdit={handleSaveEdit}
        />
      ) : null}
    </IdeasLayout>
  );
}
