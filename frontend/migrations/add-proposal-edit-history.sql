-- Stores edit history for hackathon proposals.

CREATE TABLE IF NOT EXISTS proposal_edit_history (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  hackathon_id TEXT,
  builder_wallet TEXT NOT NULL,
  changes TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edit_history_proposal ON proposal_edit_history(proposal_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_edit_history_hackathon ON proposal_edit_history(hackathon_id, timestamp);
