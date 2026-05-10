-- Daily in-app quiz responses.
--
-- One row per (user, question). The UNIQUE constraint guarantees a
-- user can't double-answer the same question — the API uses INSERT
-- OR IGNORE so a re-submit silently no-ops rather than 5xx-ing.
--
-- Question IDs are stable strings defined in `shared/quizQuestions.ts`
-- (e.g. `spark_q1`, `dm_q3`, `predict_q2`). Never reuse an ID — if
-- a question is reworded, give it a new ID so old responses don't
-- silently misalign with the new wording / new correct answer.

CREATE TABLE IF NOT EXISTS quiz_responses (
  id TEXT PRIMARY KEY,
  twitter_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,           -- 'A' | 'B' | 'C' | 'D'
  is_correct INTEGER NOT NULL,    -- 0 | 1
  answered_at TEXT NOT NULL,      -- ISO8601 UTC
  UNIQUE(twitter_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_responses_twitter
  ON quiz_responses(twitter_id);

CREATE INDEX IF NOT EXISTS idx_quiz_responses_question
  ON quiz_responses(question_id);
