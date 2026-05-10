-- Web Push broadcast infrastructure (mini-app PWA).
--
-- `push_subscriptions` — one row per (browser, user) pair. The `endpoint`
-- is the opaque URL assigned by the push service (FCM, Apple, Mozilla);
-- it's globally unique so we UPSERT on it — a user re-enabling from the
-- same device overwrites their row rather than creating duplicates.
-- `twitter_id` is nullable: anonymous subs (user enabled notifs before
-- logging in) are accepted and get attached later when the mini-app
-- re-POSTs with an auth header.
--
-- `push_broadcasts` — audit trail of admin broadcasts. Stores the payload
-- and the send counts so the back-office can show "sent to 384 devices,
-- 12 stale" after the fact without re-running the send.
--
-- Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  twitter_id TEXT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_success_at TEXT,
  last_failure_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_push_subs_twitter ON push_subscriptions(twitter_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_created ON push_subscriptions(created_at);

CREATE TABLE IF NOT EXISTS push_broadcasts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_by TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  removed_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_push_broadcasts_sent_at ON push_broadcasts(sent_at DESC);
