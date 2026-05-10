/**
 * Daily quiz modal — shown when the mini-app boots and the user has
 * a question waiting. Theme rotates per day (April 30 = Spark,
 * May 1 = Decision Markets, May 2 = $PREDICT, then loops); within a
 * day the user gets EVERY question of that theme in sequence.
 *
 * The modal stays MOUNTED across questions: only the inner content
 * (question + options, then result frame, then next question) swaps
 * via framer-motion's AnimatePresence. The outer overlay/card never
 * unmounts between questions — this avoids the flash-of-empty-screen
 * we'd get from a `key` reset on every advance.
 *
 * Three render modes:
 *   - "question" — the prompt + 4 options
 *   - "result"   — same layout, but the picked option is framed in
 *                  green/red and a result line appears at the bottom.
 *                  Auto-advances after ~2.5s.
 *   - "summary"  — final card for the day: total score and a recap of
 *                  every question with the user's answer + the right
 *                  answer. Closed manually by the user.
 *
 * The parent (`MiniDailyQuiz`) decides which mode by passing either a
 * `question` (modes 1-2) or a `summary` (mode 3). Internal state
 * (picked, submitting, result frame) is reset every time `question.id`
 * changes — no remount needed.
 */

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, X, Sparkles, Trophy } from "lucide-react"
import { THEME_RECAP, type QuizOptionKey } from "shared/quizQuestions"

const OPTION_KEYS: QuizOptionKey[] = ["A", "B", "C", "D"]

const THEME_LABEL: Record<string, string> = {
  spark: "Spark",
  decision_markets: "Decision Markets",
  predict: "$PREDICT",
}

export type QuizModalQuestion = {
  id: string
  theme: string
  question: string
  options: Record<QuizOptionKey, string>
  /** Position in the overall question list — unused by the modal but
   *  kept so the prop shape mirrors the API. */
  index: number
  /** Total questions in the overall list — same. */
  total: number
  /** 0-based position within today's theme. */
  theme_index: number
  /** Number of questions in today's theme — drives progress dots. */
  theme_total: number
}

export type QuizSessionAnswer = {
  questionId: string
  questionText: string
  picked: QuizOptionKey
  correct: boolean
  correctAnswer: QuizOptionKey
  options: Record<QuizOptionKey, string>
  theme: string
}

export type QuizSummary = {
  theme: string
  answers: QuizSessionAnswer[]
}

type Props =
  | {
      mode: "question"
      question: QuizModalQuestion
      onAnswer: (answer: QuizOptionKey) => Promise<{ correct: boolean; correctAnswer: QuizOptionKey } | null>
      onAdvance: () => void
      onClose: () => void
    }
  | {
      mode: "summary"
      summary: QuizSummary
      onClose: () => void
    }

export default function QuizModal(props: Props) {
  // Lock background scroll while open. One-shot effect tied to the
  // modal's lifetime, not its phase, so it stays applied across
  // question -> result -> next-question -> summary transitions.
  useEffect(() => {
    if (typeof document === "undefined") return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Note: Esc + overlay-click handling lives in the phase components
  // (QuestionPhase / SummaryPhase) — they own the state that decides
  // when a manual close is safe (e.g. the question phase blocks
  // dismissal mid-result-frame so the user sees the right answer
  // before the chain advances).

  return (
    <AnimatePresence>
      <motion.div
        key="quiz-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3"
      >
        <motion.div
          key="quiz-card"
          initial={{ y: 12, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 12, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl bg-neutral-950 border border-white/10 p-5 shadow-xl"
        >
          {/* `key` on the inner phase ensures the QuestionPhase resets
              its internal state (picked option, submitting flag, result
              frame) when a fresh question slots in — without disturbing
              the outer overlay/card, which stays mounted for the full
              session. */}
          {props.mode === "question" ? (
            <QuestionPhase
              key={props.question.id}
              question={props.question}
              onAnswer={props.onAnswer}
              onAdvance={props.onAdvance}
              onClose={props.onClose}
            />
          ) : (
            <SummaryPhase summary={props.summary} onClose={props.onClose} />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Inner question/result content. `key={question.id}` on this
 * component (set by the parent) ensures internal state (picked,
 * submitting, result) resets cleanly when a new question slots in,
 * WITHOUT touching the outer modal frame — so the overlay+card
 * stay put and the user perceives a smooth content swap.
 */
function QuestionPhase({
  question,
  onAnswer,
  onAdvance,
  onClose,
}: {
  question: QuizModalQuestion
  onAnswer: (answer: QuizOptionKey) => Promise<{ correct: boolean; correctAnswer: QuizOptionKey } | null>
  onAdvance: () => void
  onClose: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [picked, setPicked] = useState<QuizOptionKey | null>(null)
  const [result, setResult] = useState<{ correct: boolean; correctAnswer: QuizOptionKey } | null>(null)

  // After the result is rendered, advance after a short hold so the
  // user reads it. 2.5s is enough to absorb the right answer; the
  // parent then either chains the next question (mounts a fresh
  // QuestionPhase via the outer key) or transitions the modal into
  // summary mode.
  useEffect(() => {
    if (!result) return
    const t = setTimeout(onAdvance, 2500)
    return () => clearTimeout(t)
  }, [result, onAdvance])

  // Esc closes — but ONLY before the user has answered. Mid-submit
  // and mid-result-frame are deliberately uninterruptible so the
  // user sees the right answer before the chain advances.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (submitting || result) return
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, submitting, result])

  const handlePick = async (opt: QuizOptionKey) => {
    if (submitting || result) return
    setPicked(opt)
    setSubmitting(true)
    try {
      const r = await onAnswer(opt)
      if (r) setResult(r)
      else onClose()
    } catch {
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const themeLabel = THEME_LABEL[question.theme] ?? question.theme

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header — theme tag + close (only enabled before answer) */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
            Daily quiz · {themeLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting || !!result}
          className="text-neutral-500 hover:text-white disabled:opacity-30"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress dots — counted within TODAY'S theme. The currently
          visible question (theme_index) is amber; everything before
          it is emerald (already answered earlier in the session);
          anything after is dim white. */}
      <div className="flex items-center gap-1 mb-4">
        {Array.from({ length: question.theme_total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${
              i < question.theme_index
                ? "bg-emerald-500/60"
                : i === question.theme_index
                  ? "bg-amber-400"
                  : "bg-white/10"
            }`}
          />
        ))}
      </div>

      <h3 className="text-base font-semibold text-white mb-4 leading-snug">
        {question.question}
      </h3>

      <div className="space-y-2">
        {OPTION_KEYS.map((key) => {
          const text = question.options[key]
          if (!text) return null
          const isPicked = picked === key
          const isCorrectAnswer = result?.correctAnswer === key
          const showRightFrame = !!result && isCorrectAnswer
          const showWrongFrame = !!result && isPicked && !result.correct
          const baseFrame = showRightFrame
            ? "border-emerald-500/60 bg-emerald-500/10"
            : showWrongFrame
              ? "border-red-500/60 bg-red-500/10"
              : isPicked
                ? "border-amber-400/60 bg-amber-400/5"
                : "border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.04]"
          return (
            <button
              key={key}
              type="button"
              disabled={submitting || !!result}
              onClick={() => handlePick(key)}
              className={`w-full text-left rounded-xl border px-3 py-2.5 text-sm transition-colors flex items-start gap-3 ${baseFrame} disabled:cursor-not-allowed`}
            >
              <span className="text-[10px] uppercase font-mono font-bold text-neutral-500 mt-0.5">
                {key}
              </span>
              <span className="flex-1 text-neutral-100">{text}</span>
              {showRightFrame && <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
              {showWrongFrame && <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
            </button>
          )
        })}
      </div>

      {result && (
        <div
          className={`mt-4 text-center text-sm font-semibold ${
            result.correct ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {result.correct
            ? "✓ Correct!"
            : `✗ The right answer was ${result.correctAnswer}.`}
        </div>
      )}
    </motion.div>
  )
}

/**
 * End-of-day summary. Listed every question the user answered
 * during today's session with their pick, the right pick, and a
 * ✓/✗ marker. Score header up top. Single "Done" button to close.
 *
 * No auto-advance — the summary stays until the user dismisses,
 * unlike the result frame.
 */
function SummaryPhase({
  summary,
  onClose,
}: {
  summary: QuizSummary
  onClose: () => void
}) {
  // Esc closes — always safe in summary mode (no in-flight state to
  // protect, the user has already answered everything).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const correctCount = summary.answers.filter(a => a.correct).length
  const total = summary.answers.length
  const themeLabel = THEME_LABEL[summary.theme] ?? summary.theme
  const allRight = correctCount === total

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-1.5">
          <Trophy className={`w-3.5 h-3.5 ${allRight ? "text-amber-400" : "text-neutral-400"}`} />
          <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
            Daily quiz · {themeLabel} · recap
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-500 hover:text-white"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Score line — big, friendly, color-coded by perfection. */}
      <div className="text-center mb-4">
        <div className={`text-3xl font-bold ${allRight ? "text-emerald-400" : "text-white"}`}>
          {correctCount}<span className="text-white/40">/{total}</span>
        </div>
        <div className="text-[11px] text-neutral-500 uppercase tracking-wider mt-1">
          {allRight ? "Perfect run · come back tomorrow" : "Come back tomorrow for the next theme"}
        </div>
      </div>

      {/* Three-sentence didactic recap of today's theme. Replaces the
          previous per-question replay — the goal is to leave the
          user with the underlying concept the questions tested, not
          to surface their answer-by-answer score (which is already
          summarized as the X/Y line above). Falls back to nothing
          if a future theme is added without matching recap copy. */}
      {THEME_RECAP[summary.theme as keyof typeof THEME_RECAP] && (
        <div className="space-y-2.5 mb-4">
          {THEME_RECAP[summary.theme as keyof typeof THEME_RECAP].map((sentence, i) => (
            <p
              key={i}
              className="text-[13px] leading-relaxed text-neutral-200"
            >
              <span className="text-amber-400/80 font-semibold mr-1.5">·</span>
              {sentence}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="w-full mt-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-sm font-semibold text-white transition-colors"
      >
        Done
      </button>
    </motion.div>
  )
}
