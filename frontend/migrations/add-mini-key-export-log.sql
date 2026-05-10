-- Audit + rate-limit log for mini-app private key exports.
--
-- Every successful call to /api/mini/export-private-key writes one row.
-- Doubles as the rate limiter: the endpoint refuses if more than
-- MAX_EXPORTS_PER_DAY rows exist for this twitter_id within 24h.
--
-- We INTENTIONALLY don't store anything that could help reconstruct
-- the secret — only that an export happened, when, and what wallet
-- was revealed. This row staying alive after a compromise is itself
-- valuable: a victim can see "my key was exported at 02:14 from this
-- IP" and rotate.
--
-- Indexes:
--   - by twitter_id + ts for the rate-limit window query
--   - by wallet_address for forensic lookups ("which user exported
--     this wallet's key, when?")
CREATE TABLE IF NOT EXISTS mini_key_exports (
  id                  TEXT PRIMARY KEY,
  twitter_id          TEXT NOT NULL,
  twitter_username    TEXT,
  wallet_address      TEXT NOT NULL,
  ip                  TEXT,
  user_agent          TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mini_key_exports_user_ts
  ON mini_key_exports (twitter_id, created_at);

CREATE INDEX IF NOT EXISTS idx_mini_key_exports_wallet
  ON mini_key_exports (wallet_address);
