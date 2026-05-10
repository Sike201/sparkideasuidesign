-- Custodial wallets: admin assigns pre-funded wallets to Twitter accounts.
-- Backend signs transactions on behalf of the user.

CREATE TABLE IF NOT EXISTS custodial_wallets (
  id TEXT PRIMARY KEY,
  twitter_id TEXT NOT NULL UNIQUE,
  twitter_username TEXT,
  wallet_address TEXT NOT NULL,
  encrypted_secret_key TEXT NOT NULL,
  proposal_pda TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_custodial_twitter ON custodial_wallets(twitter_id);
CREATE INDEX IF NOT EXISTS idx_custodial_proposal ON custodial_wallets(proposal_pda);
