-- Mini-app (v1) — 2 custodial wallets per Twitter user (public + private).
--
-- Adds a `wallet_type` column to `custodial_wallets`, drops the old
-- UNIQUE(twitter_id) constraint, and replaces it with a composite
-- UNIQUE(twitter_id, wallet_type) so each user can own exactly one wallet
-- per type.
--
-- SQLite/D1 can't drop a UNIQUE column constraint in place, so we rebuild
-- the table. All existing rows are migrated with wallet_type = 'public'.
--
-- Safe to run against an empty DB or one with the old schema.

PRAGMA foreign_keys = OFF;

-- 1. New table with the composite unique + default 'public' wallet_type.
CREATE TABLE IF NOT EXISTS custodial_wallets_new (
  id TEXT PRIMARY KEY,
  twitter_id TEXT NOT NULL,
  twitter_username TEXT,
  wallet_address TEXT NOT NULL,
  encrypted_secret_key TEXT NOT NULL,
  proposal_pda TEXT,
  wallet_type TEXT NOT NULL DEFAULT 'public'
    CHECK (wallet_type IN ('public', 'private')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (twitter_id, wallet_type)
);

-- 2. Copy existing rows — all become 'public' wallets.
INSERT INTO custodial_wallets_new (
  id, twitter_id, twitter_username, wallet_address,
  encrypted_secret_key, proposal_pda, wallet_type, created_at
)
SELECT
  id, twitter_id, twitter_username, wallet_address,
  encrypted_secret_key, proposal_pda, 'public', created_at
FROM custodial_wallets;

-- 3. Swap tables.
DROP TABLE custodial_wallets;
ALTER TABLE custodial_wallets_new RENAME TO custodial_wallets;

-- 4. Recreate the indexes (the UNIQUE constraint already creates an index
-- on (twitter_id, wallet_type), so we only add the lookup helpers).
CREATE INDEX IF NOT EXISTS idx_custodial_twitter ON custodial_wallets(twitter_id);
CREATE INDEX IF NOT EXISTS idx_custodial_proposal ON custodial_wallets(proposal_pda);
CREATE INDEX IF NOT EXISTS idx_custodial_wallet_type ON custodial_wallets(wallet_type);

PRAGMA foreign_keys = ON;
