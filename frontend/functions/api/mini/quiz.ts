/**
 * Mini-app daily quiz endpoint.
 *
 * GET  /api/mini/quiz   → next question for the authenticated user, or
 *                         { question: null } if they've already
 *                         answered today / there's no question left.
 * POST /api/mini/quiz   → record an answer, return correctness.
 *
 * Daily cap (one new question per UTC day) is enforced server-side so
 * the client can't request a second question by clearing localStorage:
 *   - Count rows in `quiz_responses` for the user → N answered.
 *   - If the latest row's UTC date == today, no new question.
 *   - Else serve `QUIZ_QUESTIONS[N]` (or null if N >= total).
 *
 * Correctness is graded server-side from `findQuestion(id).correct` —
 * we never trust a `correct: true` from the body. The client is told
 * whether they were right + which option was correct, so the modal
 * can render the right "✅ correct / ❌ correct answer was X" frame.
 */

import { jsonResponse } from "../cfPagesFunctionsUtils"
import { verifyMiniAuth } from "./_auth"
import {
  QUIZ_QUESTIONS,
  findQuestion,
  themeForDate,
  type QuizOptionKey,
} from "../../../shared/quizQuestions"

type ENV = {
  DB: D1Database
  JWT_SECRET?: string
}

type AnsweredRow = {
  question_id: string
  answer: string
  is_correct: number
  answered_at: string
}

async function loadAnswered(db: D1Database, twitterId: string): Promise<AnsweredRow[]> {
  const r = await db
    .prepare(
      `SELECT question_id, answer, is_correct, answered_at
       FROM quiz_responses
       WHERE twitter_id = ?
       ORDER BY answered_at ASC`,
    )
    .bind(twitterId)
    .all<AnsweredRow>()
  return r.results || []
}

/**
 * Resolve the next question to serve to a user.
 *
 *   - Pick the next-unanswered question from TODAY'S theme (see
 *     `themeForDate` — April 30 = spark, May 1 = decision_markets,
 *     May 2 = predict, then rotates). The client chains them: after
 *     answering Q, it re-fetches and gets Q+1 in the same theme, all
 *     within a single session.
 *   - When today's theme is exhausted for this user, return state
 *     "theme_done" → no modal today, but the user will get a fresh
 *     question on the next day whose theme still has unanswered Q's.
 *   - When EVERY question across EVERY theme is answered, return
 *     state "completed" — the modal stops forever.
 *
 * Question ORDER within a theme follows the QUIZ_QUESTIONS list order.
 * No daily cap — the user can churn through all of today's theme in
 * one sitting; that's the point.
 */
function pickNext(answered: AnsweredRow[]) {
  const theme = themeForDate()
  const answeredIds = new Set(answered.map(a => a.question_id))

  // Global completion check first — once every question is done, the
  // quiz is permanently over and we want to stop the daily fetches
  // from triggering modal mounts.
  if (answeredIds.size >= QUIZ_QUESTIONS.length) {
    return { kind: "completed" as const }
  }

  const themeQuestions = QUIZ_QUESTIONS.filter(q => q.theme === theme)
  const next = themeQuestions.find(q => !answeredIds.has(q.id))

  if (!next) {
    // Today's theme is exhausted for this user but other themes still
    // have open Q's. Distinct state from "completed" so the client
    // knows it's not permanent.
    return { kind: "theme_done" as const }
  }

  // We ship two indices to the client:
  //   - `index` / `total`   = position in the OVERALL question list
  //   - `themeIndex` / `themeTotal` = position WITHIN today's theme
  // The progress bar uses the per-theme pair so its width tracks
  // "today's quiz" (e.g. 4 dots for Spark, 3 for DM) rather than the
  // global 10.
  const idx = QUIZ_QUESTIONS.findIndex(q => q.id === next.id)
  const themeIdx = themeQuestions.findIndex(q => q.id === next.id)
  return {
    kind: "ready" as const,
    question: next,
    index: idx,
    themeIndex: themeIdx,
    themeTotal: themeQuestions.length,
  }
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const auth = await verifyMiniAuth(ctx.request, ctx.env.JWT_SECRET, ctx.env)
  if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status)

  const answered = await loadAnswered(ctx.env.DB, auth.twitter_id)
  const next = pickNext(answered)

  // Build a minimal payload — never ship `correct` to the client (a
  // dev-tools peek would spoil the answer).
  if (next.kind === "ready") {
    const { id, theme, question, options } = next.question
    return jsonResponse({
      question: {
        id,
        theme,
        question,
        options,
        index: next.index,
        total: QUIZ_QUESTIONS.length,
        theme_index: next.themeIndex,
        theme_total: next.themeTotal,
      },
      answeredCount: answered.length,
    })
  }
  return jsonResponse({
    question: null,
    state: next.kind, // "theme_done" | "completed"
    answeredCount: answered.length,
    total: QUIZ_QUESTIONS.length,
  })
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const auth = await verifyMiniAuth(ctx.request, ctx.env.JWT_SECRET, ctx.env)
  if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status)

  let body: { question_id?: string; answer?: string }
  try {
    body = await ctx.request.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400)
  }

  const questionId = (body.question_id || "").trim()
  const answer = (body.answer || "").trim().toUpperCase() as QuizOptionKey
  if (!questionId || !["A", "B", "C", "D"].includes(answer)) {
    return jsonResponse({ error: "question_id and answer (A|B|C|D) required" }, 400)
  }

  const question = findQuestion(questionId)
  if (!question) {
    return jsonResponse({ error: "Unknown question_id" }, 400)
  }

  const answered = await loadAnswered(ctx.env.DB, auth.twitter_id)

  // The submitted question must match what `pickNext` would serve
  // RIGHT NOW for this user — guards against the client cherry-picking
  // a question from a future / different-theme day, or replaying a
  // captured POST from a previous day.
  const expected = pickNext(answered)
  if (expected.kind !== "ready" || expected.question.id !== questionId) {
    return jsonResponse({ error: "Question not available today" }, 400)
  }

  const isCorrect = question.correct === answer ? 1 : 0
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  // INSERT OR IGNORE on the (twitter_id, question_id) unique pair —
  // a race that double-fires the POST will only persist one row.
  await ctx.env.DB
    .prepare(
      `INSERT OR IGNORE INTO quiz_responses
         (id, twitter_id, question_id, answer, is_correct, answered_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, auth.twitter_id, questionId, answer, isCorrect, now)
    .run()

  return jsonResponse({
    correct: isCorrect === 1,
    correctAnswer: question.correct,
    answeredCount: answered.length + 1,
    total: QUIZ_QUESTIONS.length,
  })
}
