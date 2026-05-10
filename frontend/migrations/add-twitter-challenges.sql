-- Tweet-based sign-in challenges. The user declares a Twitter @username,
-- the server stores a fresh random code here, and the user proves
-- ownership of the account by posting a tweet that contains the code.
--
-- Single-use: a successful verification sets `used_at` and the row is
-- ignored on subsequent calls. Expired rows (past `expires_at`) are also
-- ignored — a periodic cleanup job (or `DELETE WHERE expires_at < NOW`)
-- can prune them safely.
CREATE TABLE IF NOT EXISTS twitter_challenges (
  id                 TEXT PRIMARY KEY,
  -- Random base64url 8-char token shown to the user inside the tweet.
  -- Unique because verification looks up by code; collisions would let
  -- the wrong session's challenge get consumed.
  code               TEXT NOT NULL UNIQUE,
  -- Lowercased Twitter @username the user claims. Compared against
  -- `tweet.user.screen_name.toLowerCase()` at verify time.
  claimed_username   TEXT NOT NULL,
  -- IP (best-effort) used to rate-limit challenge creation per source.
  -- Null when CF doesn't surface a client IP (extremely rare).
  requester_ip       TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Hard TTL — verification rejects past this. 10 minutes is plenty for
  -- "open Twitter, post, come back, paste URL" without leaving the
  -- replay window wide open.
  expires_at         TEXT NOT NULL,
  -- Set on first successful verify. The same row can't be reused.
  used_at            TEXT
);

-- Lookups during verify are by code; rate-limit checks are by ip + recency.
CREATE INDEX IF NOT EXISTS idx_twitter_challenges_code
  ON twitter_challenges (code);
CREATE INDEX IF NOT EXISTS idx_twitter_challenges_ip_created
  ON twitter_challenges (requester_ip, created_at);
