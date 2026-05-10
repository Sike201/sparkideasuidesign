-- Stores chat messages for a combinator decision market (per proposal PDA).
-- Anyone can write and read. Pseudonym is the truncated wallet address.

CREATE TABLE IF NOT EXISTS combinator_chat_messages (
  id TEXT PRIMARY KEY,
  proposal_pda TEXT NOT NULL,
  wallet TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_combinator_chat_proposal_time
  ON combinator_chat_messages(proposal_pda, created_at);
