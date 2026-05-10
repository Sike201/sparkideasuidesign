-- Per-user upvotes on a hackathon proposal. Acts as a soft signal of
-- community sentiment, separate from the on-chain decision-market odds.
--
-- Uniqueness on (proposal_id, twitter_id) means each authenticated user
-- can upvote a given proposal at most once. Toggling is a DELETE; the
-- table only ever contains active upvotes.
CREATE TABLE IF NOT EXISTS proposal_upvotes (
  id          TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  twitter_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(proposal_id, twitter_id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_upvotes_proposal
  ON proposal_upvotes (proposal_id);

CREATE INDEX IF NOT EXISTS idx_proposal_upvotes_user
  ON proposal_upvotes (twitter_id);
