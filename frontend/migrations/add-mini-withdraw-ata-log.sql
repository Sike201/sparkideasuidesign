-- Tracks ATAs that the mini-app withdraw endpoint has paid to create on
-- behalf of a recipient wallet. Used to block the rent-farming exploit:
-- a user can close their newly-created ATA to reclaim the ~0.002 SOL of
-- rent, which would otherwise be free SOL from our treasury on every
-- repeat withdraw. With this log we refuse to create the same
-- (destination, mint) ATA twice from treasury funds — the user has to
-- fund a re-creation themselves the second time around.
--
-- Index by (twitter_id, destination_wallet, mint) so the existence check
-- on every withdraw is O(1).
CREATE TABLE IF NOT EXISTS mini_withdraw_ata_creations (
  id                  TEXT PRIMARY KEY,
  twitter_id          TEXT NOT NULL,
  destination_wallet  TEXT NOT NULL,
  mint                TEXT NOT NULL,
  signature           TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(twitter_id, destination_wallet, mint)
);

CREATE INDEX IF NOT EXISTS idx_mini_withdraw_ata_lookup
  ON mini_withdraw_ata_creations (twitter_id, destination_wallet, mint);
