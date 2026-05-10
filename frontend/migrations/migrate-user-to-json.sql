-- Migration: Refactor `user` table to address + data (JSON blob)
-- For schema WITHOUT `json` column (address + username only)
-- If your table HAS a `json` column, use migrate-user-to-json-full.sql instead.

-- 1. Create new table
CREATE TABLE IF NOT EXISTS user_new (
  address TEXT PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}'
);

-- 2. Migrate: username → JSON blob
INSERT INTO user_new (address, data)
SELECT
  address,
  CASE
    WHEN username IS NOT NULL AND username != '' THEN
      json_object('username', username)
    ELSE '{}'
  END
FROM user;

-- 3. Swap tables
DROP TABLE user;
ALTER TABLE user_new RENAME TO user;
