-- MIGRATION: Reset all points and recalculate with new linear formula.
-- New rules:
--   - Only investments in LAUNCHED ideas (status='completed') earn points
--   - Linear: 1 USDC invested = 100 points (no log curve)
--   - Referrer bonus: 10% of referee's invest points
--   - No vote/comment/signup points
--
-- Run this ONCE after deploying the new points-helper.ts.

-- 1. Reset ALL user points to 0
UPDATE user
SET data = json_set(data, '$.points', 0)
WHERE json_extract(data, '$.points') > 0;

-- 2. Award investment points: 100 pts per USDC invested in launched ideas
-- Net per wallet per launched idea = active investments - withdrawals
UPDATE user
SET data = json_set(data, '$.points',
  COALESCE((
    SELECT CAST(SUM(net_usdc) * 100 AS INTEGER)
    FROM (
      SELECT i.investor_wallet,
        COALESCE(SUM(i.amount_usdc), 0) - COALESCE((
          SELECT SUM(w.amount_usdc)
          FROM idea_withdrawals w
          WHERE w.investor_wallet = i.investor_wallet AND w.idea_id = i.idea_id
        ), 0) as net_usdc
      FROM idea_investments i
      JOIN ideas ON ideas.id = i.idea_id
        AND json_extract(ideas.data, '$.status') = 'completed'
      WHERE i.investor_wallet = user.address
        AND i.status = 'active'
      GROUP BY i.investor_wallet, i.idea_id
      HAVING net_usdc > 0
    )
  ), 0)
)
WHERE address IN (
  SELECT DISTINCT i.investor_wallet
  FROM idea_investments i
  JOIN ideas ON ideas.id = i.idea_id
    AND json_extract(ideas.data, '$.status') = 'completed'
  WHERE i.status = 'active'
);

-- 3. Create user rows for wallets that invested in launched ideas but have no user row
INSERT OR IGNORE INTO user (address, data)
SELECT sub.investor_wallet, json_object('points', CAST(sub.total_net * 100 AS INTEGER))
FROM (
  SELECT i.investor_wallet,
    SUM(
      COALESCE(i.amount_usdc, 0) - COALESCE((
        SELECT SUM(w.amount_usdc)
        FROM idea_withdrawals w
        WHERE w.investor_wallet = i.investor_wallet AND w.idea_id = i.idea_id
      ), 0)
    ) as total_net
  FROM idea_investments i
  JOIN ideas ON ideas.id = i.idea_id
    AND json_extract(ideas.data, '$.status') = 'completed'
  WHERE i.status = 'active'
  GROUP BY i.investor_wallet
  HAVING total_net > 0
) sub
WHERE sub.investor_wallet NOT IN (SELECT address FROM user);

-- 4. Referral invest bonus: referrer gets 10% of each referee's invest points
-- Only for investments in launched ideas
UPDATE user
SET data = json_set(data, '$.points',
  COALESCE(json_extract(data, '$.points'), 0) + COALESCE((
    SELECT CAST(SUM(referee_net * 100 * 0.1) AS INTEGER)
    FROM (
      SELECT r.referrer_wallet,
        SUM(
          COALESCE(i.amount_usdc, 0) - COALESCE((
            SELECT SUM(w.amount_usdc)
            FROM idea_withdrawals w
            WHERE w.investor_wallet = i.investor_wallet AND w.idea_id = i.idea_id
          ), 0)
        ) as referee_net
      FROM referrals r
      JOIN idea_investments i ON i.investor_wallet = r.referee_wallet AND i.status = 'active'
      JOIN ideas ON ideas.id = i.idea_id
        AND json_extract(ideas.data, '$.status') = 'completed'
      WHERE r.referrer_wallet = user.address
      GROUP BY r.referrer_wallet, r.referee_wallet
      HAVING referee_net > 0
    )
  ), 0)
)
WHERE address IN (
  SELECT DISTINCT r.referrer_wallet
  FROM referrals r
  JOIN idea_investments i ON i.investor_wallet = r.referee_wallet AND i.status = 'active'
  JOIN ideas ON ideas.id = i.idea_id
    AND json_extract(ideas.data, '$.status') = 'completed'
);
