-- Mini-app — track when a user completes their initial funding deposit.
--
-- New users are gated behind /m/deposit until they've funded their public
-- custodial wallet with >= 1 USDC. Once the deposit is detected (USDC
-- balance polled from chain), we stamp `deposit_completed_at` on the
-- user's PUBLIC-type custodial wallet row and unlock the rest of the app.
--
-- Storing the timestamp (vs. just a boolean) gives us:
--   - a clear audit trail ("when did Alice onboard?")
--   - idempotent behaviour: once set, we never clear it even if the
--     user later withdraws back below $1
--   - a cheap NOT NULL check as the gate (no separate boolean column)
--
-- Only the 'public' wallet row carries this column in practice —
-- 'private' rows leave it NULL. That's by design: the public wallet is
-- the deposit destination, the private wallet is admin-funded separately
-- and has no equivalent onboarding step.
--
-- Not idempotent: SQLite has no `ADD COLUMN IF NOT EXISTS`, so re-running
-- this file against a DB that already has the column errors with
-- "duplicate column name" — just skip it on second runs.

ALTER TABLE custodial_wallets
  ADD COLUMN deposit_completed_at TEXT;
