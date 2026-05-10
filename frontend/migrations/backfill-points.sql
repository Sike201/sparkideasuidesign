-- BACKFILL: Calculate and award historical points to existing users.
-- Run this ONCE after deploying the points_daily_limits table.
--
-- NOTE: Historical votes CANNOT be backfilled because idea_votes.user_id
-- is a random localStorage UUID, not a wallet address.

-- 1. Investment points (logarithmic: floor(100 * log10(net_amount + 1)))
-- D1/SQLite doesn't have log10, so we use: log10(x) = ln(x) / ln(10)
-- Net = total active investments - total withdrawals (per wallet)

UPDATE user
SET data = json_set(data, '$.points',
  COALESCE(json_extract(data, '$.points'), 0) + COALESCE((
    SELECT CAST(100 * (ln(MAX(0, COALESCE(inv.total, 0) - COALESCE(wtd.total, 0)) + 1) / ln(10)) AS INTEGER)
    FROM (
      SELECT investor_wallet, SUM(amount_usdc) as total
      FROM idea_investments WHERE status = 'active'
      GROUP BY investor_wallet
    ) inv
    LEFT JOIN (
      SELECT investor_wallet, SUM(amount_usdc) as total
      FROM idea_withdrawals
      GROUP BY investor_wallet
    ) wtd ON wtd.investor_wallet = inv.investor_wallet
    WHERE inv.investor_wallet = user.address
  ), 0)
)
WHERE address IN (
  SELECT DISTINCT investor_wallet FROM idea_investments WHERE status = 'active'
);

-- 2. Comment points (15 pts each, matched via twitter username → wallet)
UPDATE user
SET data = json_set(data, '$.points',
  COALESCE(json_extract(data, '$.points'), 0) + COALESCE((
    SELECT COUNT(*) * 15
    FROM idea_comments c
    JOIN twitter_users t ON t.username = c.author_username
    WHERE t.wallet_address = user.address
  ), 0)
)
WHERE address IN (
  SELECT DISTINCT t.wallet_address
  FROM idea_comments c
  JOIN twitter_users t ON t.username = c.author_username
  WHERE t.wallet_address IS NOT NULL
);

-- 3. Referral signup points (50 pts per referral)
UPDATE user
SET data = json_set(data, '$.points',
  COALESCE(json_extract(data, '$.points'), 0) + COALESCE((
    SELECT COUNT(*) * 50
    FROM referrals r
    WHERE r.referrer_wallet = user.address
  ), 0)
)
WHERE address IN (
  SELECT DISTINCT referrer_wallet FROM referrals
);

-- 4. Referral invest bonus (10% of referee's NET invest points → referrer)
UPDATE user
SET data = json_set(data, '$.points',
  COALESCE(json_extract(data, '$.points'), 0) + COALESCE((
    SELECT CAST(SUM(
      CAST(100 * (ln(MAX(0, COALESCE(inv_sum.total, 0) - COALESCE(wtd_sum.total, 0)) + 1) / ln(10)) AS INTEGER) * 0.1
    ) AS INTEGER)
    FROM referrals r
    JOIN (
      SELECT investor_wallet, SUM(amount_usdc) AS total
      FROM idea_investments WHERE status = 'active'
      GROUP BY investor_wallet
    ) inv_sum ON inv_sum.investor_wallet = r.referee_wallet
    LEFT JOIN (
      SELECT investor_wallet, SUM(amount_usdc) AS total
      FROM idea_withdrawals
      GROUP BY investor_wallet
    ) wtd_sum ON wtd_sum.investor_wallet = r.referee_wallet
    WHERE r.referrer_wallet = user.address
  ), 0)
)
WHERE address IN (
  SELECT DISTINCT r.referrer_wallet
  FROM referrals r
  JOIN idea_investments i ON i.investor_wallet = r.referee_wallet AND i.status = 'active'
);

-- 5. Create user rows for wallets that invested (net > 0) but have no user row yet
INSERT OR IGNORE INTO user (address, data)
SELECT inv.investor_wallet, json_object('points',
  CAST(100 * (ln(MAX(0, COALESCE(inv.total, 0) - COALESCE(wtd.total, 0)) + 1) / ln(10)) AS INTEGER)
)
FROM (
  SELECT investor_wallet, SUM(amount_usdc) AS total
  FROM idea_investments WHERE status = 'active'
  GROUP BY investor_wallet
) inv
LEFT JOIN (
  SELECT investor_wallet, SUM(amount_usdc) AS total
  FROM idea_withdrawals
  GROUP BY investor_wallet
) wtd ON wtd.investor_wallet = inv.investor_wallet
WHERE inv.investor_wallet NOT IN (SELECT address FROM user)
AND (COALESCE(inv.total, 0) - COALESCE(wtd.total, 0)) > 0;
