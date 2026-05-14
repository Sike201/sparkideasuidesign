import type { Idea } from "./types";

/** Apply one vote click to an idea snapshot (mirrors server-side tally rules). */
export function toggleIdeaVote(idea: Idea, voteType: "up" | "down"): Idea {
  const currentVote = idea.userVote;
  const next: Idea = { ...idea };
  let up = next.upvotes;
  let down = next.downvotes;

  if (currentVote === voteType) {
    next.userVote = null;
    if (voteType === "up") up = Math.max(0, up - 1);
    else down = Math.max(0, down - 1);
  } else if (currentVote) {
    next.userVote = voteType;
    if (currentVote === "up" && voteType === "down") {
      up = Math.max(0, up - 1);
      down = down + 1;
    } else if (currentVote === "down" && voteType === "up") {
      down = Math.max(0, down - 1);
      up = up + 1;
    }
  } else {
    next.userVote = voteType;
    if (voteType === "up") up = up + 1;
    else down = down + 1;
  }

  next.upvotes = up;
  next.downvotes = down;
  return next;
}
