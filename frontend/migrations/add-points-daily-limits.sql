-- Points system: daily limits tracking table
CREATE TABLE IF NOT EXISTS points_daily_limits (
  wallet_address TEXT NOT NULL,
  action_date TEXT NOT NULL,
  vote_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  referral_points INTEGER DEFAULT 0,
  PRIMARY KEY (wallet_address, action_date)
);

CREATE INDEX IF NOT EXISTS idx_points_daily_wallet ON points_daily_limits(wallet_address);
