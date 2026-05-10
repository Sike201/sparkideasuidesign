-- Migration: Refactor `user` table to address + data (JSON blob)
-- For schema WITH `json` column (address + username + json)
-- Merges username and json content into a single `data` column.
-- emailData.email → top-level `email`, termsOfUse preserved as-is.

-- 1. Create new table
CREATE TABLE IF NOT EXISTS user_new (
  address TEXT PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}'
);

-- 2. Migrate: merge username + json → data blob
INSERT INTO user_new (address, data)
SELECT
  address,
  CASE
    WHEN json IS NOT NULL AND json != '' AND json != '{}' AND username IS NOT NULL AND username != '' THEN
      json_set(
        json_set(json, '$.username', username),
        '$.email',
        json_extract(json, '$.emailData.email')
      )
    WHEN json IS NOT NULL AND json != '' AND json != '{}' THEN
      json_set(json, '$.email', json_extract(json, '$.emailData.email'))
    WHEN username IS NOT NULL AND username != '' THEN
      json_object('username', username)
    ELSE '{}'
  END
FROM user;

-- 3. Swap tables
DROP TABLE user;
ALTER TABLE user_new RENAME TO user;
