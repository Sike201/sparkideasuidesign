/**
 * Self-gating mount for the daily quiz modal.
 *
 * Mounted once at the layout level (`MiniLayout`). Internally:
 *   1. Skip if not authenticated (no JWT → no /quiz call).
 *   2. Otherwise GET /api/mini/quiz; if a question comes back AND it
 *      hasn't been dismissed locally today, render the modal in
 *      "question" mode.
 *   3. After each answer we record it to a session-local list, then
 *      re-fetch /api/mini/quiz:
 *        - if the server returns the next question of today's theme,
 *          swap it in (the modal stays mounted, only the inner
 *          QuestionPhase remounts via its `key`)
 *        - if the server returns `state: "theme_done"` AND we have
 *          recorded answers in this session, transition the modal
 *          into "summary" mode — the outer card stays put, only the
 *          inner content swaps to the recap screen.
 *        - if the server returns `state: "completed"` (every theme,
 *          every question answered, ever), close.
 *   4. User can also dismiss without answering. We set
 *      `quiz_dismissed_<id>_<utc_date>` so the same question doesn't
 *      re-prompt today.
 *
 * The "answered all questions across all themes → stop forever"
 * behavior is enforced server-side: `pickNext` returns
 * `state: "completed"` once `answeredCount >= total`, and the GET
 * payload's `question` is null. This component renders nothing in
 * that case.
 */

import { useCallback, useEffect, useState } from "react"
import { useMiniAuth } from "@/hooks/useMiniAuth"
import { getMiniQuiz, postMiniQuizAnswer } from "@/data/api/miniApi"
import type { QuizOptionKey } from "shared/quizQuestions"
import QuizModal, {
  type QuizModalQuestion,
  type QuizSessionAnswer,
  type QuizSummary,
} from "./QuizModal"

const DISMISS_KEY_PREFIX = "spark_mini_quiz_dismissed_"

function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function dismissKey(questionId: string): string {
  return `${DISMISS_KEY_PREFIX}${questionId}_${utcDateKey()}`
}

function isDismissedToday(questionId: string): boolean {
  if (typeof localStorage === "undefined") return false
  try {
    return localStorage.getItem(dismissKey(questionId)) === "1"
  } catch {
    return false
  }
}

function markDismissedToday(questionId: string) {
  try {
    localStorage.setItem(dismissKey(questionId), "1")
  } catch {
    /* ignore quota issues */
  }
}

export default function MiniDailyQuiz() {
  const { isAuthenticated } = useMiniAuth()
  const [question, setQuestion] = useState<QuizModalQuestion | null>(null)
  const [summary, setSummary] = useState<QuizSummary | null>(null)
  /** Answers recorded during THIS session — drives the summary
   *  recap. Cleared on close so a fresh open doesn't show stale
   *  data; the server's response history is the source of truth
   *  for "have I already answered this today". */
  const [sessionAnswers, setSessionAnswers] = useState<QuizSessionAnswer[]>([])

  /** Fetch the next question and either set it (modal stays open via
   *  question prop change + inner key reset) or transition to summary
   *  / unmount as appropriate. */
  const fetchAndShow = useCallback(async (sessionAnswersSnapshot: QuizSessionAnswer[]) => {
    try {
      const r = await getMiniQuiz()
      if (r.question && !isDismissedToday(r.question.id)) {
        setQuestion(r.question)
        setSummary(null)
        return
      }
      // No question coming. If we answered something this session,
      // show the summary so the user sees a clean "you got X/Y" frame
      // before the modal closes. If they had no session answers (cold
      // open with nothing left for today), just keep the modal closed.
      if (sessionAnswersSnapshot.length > 0) {
        setQuestion(null)
        setSummary({
          theme: sessionAnswersSnapshot[0].theme,
          answers: sessionAnswersSnapshot,
        })
      } else {
        setQuestion(null)
        setSummary(null)
      }
    } catch {
      // Quiz is non-blocking — if /quiz errors, just don't show anything.
      setQuestion(null)
      setSummary(null)
    }
  }, [])

  // Initial fetch when the user becomes authenticated. We pass an
  // empty session-answers snapshot because nothing has been answered
  // in this session yet — server's "no question" response on cold
  // open just means "nothing to do today", NOT "show summary".
  useEffect(() => {
    if (!isAuthenticated) {
      setQuestion(null)
      setSummary(null)
      setSessionAnswers([])
      return
    }
    void fetchAndShow([])
  }, [isAuthenticated, fetchAndShow])

  // Render nothing when there's neither a question nor a summary —
  // the modal as a whole is unmounted.
  if (!question && !summary) return null

  if (summary) {
    const handleSummaryClose = () => {
      setSummary(null)
      setSessionAnswers([])
    }
    return <QuizModal mode="summary" summary={summary} onClose={handleSummaryClose} />
  }

  // question is non-null here.
  const q = question!

  const handleAnswer = async (answer: QuizOptionKey) => {
    try {
      const r = await postMiniQuizAnswer({ question_id: q.id, answer })
      // Persist the dismissal flag on a successful answer too —
      // covers the brief window between the result frame and the
      // auto-advance where another page might re-mount the layout
      // and re-fetch.
      markDismissedToday(q.id)
      // Capture this answer for the eventual summary screen. We
      // record EVERYTHING the modal needs to render the recap so
      // the summary doesn't have to re-derive option text or
      // correctness from a network round-trip.
      const sessionEntry: QuizSessionAnswer = {
        questionId: q.id,
        questionText: q.question,
        picked: answer,
        correct: r.correct,
        correctAnswer: r.correctAnswer,
        options: q.options,
        theme: q.theme,
      }
      setSessionAnswers(prev => [...prev, sessionEntry])
      return { correct: r.correct, correctAnswer: r.correctAnswer }
    } catch {
      return null
    }
  }

  /** Called after the modal's post-answer result frame finishes.
   *  Re-fetch — server's `pickNext` either gives us the next question
   *  in today's theme (chain) or returns null (theme_done / completed),
   *  in which case `fetchAndShow` flips to summary or closes. */
  const handleAdvance = () => {
    // We pass the latest sessionAnswers snapshot rather than reading
    // state inside fetchAndShow — React batches setSessionAnswers,
    // and a microtask race can mean the summary fires with the
    // pre-answer list. Capturing here is reliable.
    setSessionAnswers(current => {
      void fetchAndShow(current)
      return current
    })
  }

  /** User dismissed without answering. Persist the flag so we don't
   *  re-prompt the same question this UTC day. If they had previous
   *  answers in this session, drop into summary mode so they still
   *  see the recap; otherwise unmount. */
  const handleDismiss = () => {
    markDismissedToday(q.id)
    if (sessionAnswers.length > 0) {
      setQuestion(null)
      setSummary({ theme: sessionAnswers[0].theme, answers: sessionAnswers })
    } else {
      setQuestion(null)
    }
  }

  return (
    <QuizModal
      mode="question"
      question={q}
      onAnswer={handleAnswer}
      onAdvance={handleAdvance}
      onClose={handleDismiss}
    />
  )
}
