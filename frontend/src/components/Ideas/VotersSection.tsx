import { useState, useEffect } from "react";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

interface Voter {
  voter_username: string;
  voter_twitter_id?: string;
  voter_avatar?: string;
  voter_name?: string;
  vote_count?: number;
}

interface VotersSectionProps {
  ideaId: string;
  /** Skip API and show illustrative avatars (demo idea pages). */
  demoPreview?: boolean;
  demoUpvoteCount?: number;
  demoDownvoteCount?: number;
}

export function VotersSection({
  ideaId,
  demoPreview,
  demoUpvoteCount = 4,
  demoDownvoteCount = 0,
}: VotersSectionProps) {
  const [upvoters, setUpvoters] = useState<Voter[]>([]);
  const [downvoters, setDownvoters] = useState<Voter[]>([]);
  const [isLoading, setIsLoading] = useState(!demoPreview);

  useEffect(() => {
    if (demoPreview) {
      setIsLoading(false);
      return;
    }
    const fetchVoters = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/idea-voters?ideaId=${ideaId}`);
        if (response.ok) {
          const data = await response.json();
          setUpvoters(data.upvoters || []);
          setDownvoters(data.downvoters || []);
        }
      } catch (error) {
        console.error("Failed to fetch voters:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (ideaId && !demoPreview) {
      fetchVoters();
    }
  }, [ideaId, demoPreview]);

  if (demoPreview) {
    const upN = Math.max(0, demoUpvoteCount);
    const downN = Math.max(0, demoDownvoteCount);
    return (
      <div className="space-y-4">
        {upN > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <ThumbsUp className="h-3.5 w-3.5 text-green-400" />
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Upvoters</h4>
              <span className="text-[10px] text-neutral-600">({upN})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: Math.min(upN, 10) }).map((_, idx) => (
                <img
                  key={idx}
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=upvoter-${ideaId}-${idx}`}
                  alt=""
                  className="h-6 w-6 rounded-full border border-green-500/30"
                />
              ))}
            </div>
          </div>
        )}
        {downN > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <ThumbsDown className="h-3.5 w-3.5 text-orange-400" />
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Downvoters</h4>
              <span className="text-[10px] text-neutral-600">({downN})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: Math.min(downN, 10) }).map((_, idx) => (
                <img
                  key={idx}
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=downvoter-${ideaId}-${idx}`}
                  alt=""
                  className="h-6 w-6 rounded-full border border-orange-500/30"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upvoters */}
      {upvoters.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ThumbsUp className="w-3.5 h-3.5 text-green-400" />
            <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Upvoters</h4>
            <span className="text-[10px] text-neutral-600">({upvoters.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {upvoters.slice(0, 10).map((voter, idx) => (
              <Link
                key={idx}
                to={`/profile/${voter.voter_username}`}
                className="group relative"
              >
                <img
                  src={voter.voter_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${voter.voter_username}`}
                  alt={voter.voter_username}
                  className="w-6 h-6 rounded-full border border-green-500/30 hover:border-green-500/60 transition-colors"
                  title={`@${voter.voter_username}`}
                />
              </Link>
            ))}
            {upvoters.length > 10 && (
              <div className="w-6 h-6 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-[8px] text-green-400 font-medium">
                +{upvoters.length - 10}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Downvoters */}
      {downvoters.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ThumbsDown className="w-3.5 h-3.5 text-orange-400" />
            <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Downvoters</h4>
            <span className="text-[10px] text-neutral-600">({downvoters.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {downvoters.slice(0, 10).map((voter, idx) => (
              <Link
                key={idx}
                to={`/profile/${voter.voter_username}`}
                className="group relative"
              >
                <img
                  src={voter.voter_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${voter.voter_username}`}
                  alt={voter.voter_username}
                  className="w-6 h-6 rounded-full border border-orange-500/30 hover:border-orange-500/60 transition-colors"
                  title={`@${voter.voter_username}`}
                />
              </Link>
            ))}
            {downvoters.length > 10 && (
              <div className="w-6 h-6 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-[8px] text-orange-400 font-medium">
                +{downvoters.length - 10}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
