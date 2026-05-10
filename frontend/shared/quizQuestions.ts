/**
 * Daily in-app quiz — questions, options, correct answers.
 *
 * Imported by:
 *   - the mini-app modal (`QuizModal.tsx`) to render the question
 *   - the mini-app endpoint (`/api/mini/quiz`) to score the answer
 *     server-side (we never trust the client's correctness flag)
 *   - the back-office (`BonusWalletsManager`) to label responses
 *
 * The list order IS the daily delivery order — we serve questions
 * to each user in this exact sequence, one per UTC day. So if you
 * add a new question, append it to the end; users who've already
 * answered the existing N will get it on day N+1.
 *
 * Question IDs are stable. NEVER reuse or repurpose an ID — if a
 * question is reworded or a different option is correct, give it a
 * new ID so historical `quiz_responses` rows still mean what they
 * meant when they were written.
 */

export type QuizOptionKey = "A" | "B" | "C" | "D"

export type QuizQuestion = {
  id: string
  theme: "spark" | "decision_markets" | "predict"
  question: string
  options: Record<QuizOptionKey, string>
  correct: QuizOptionKey
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // ── Theme 1: Spark ──────────────────────────────────────────
  {
    id: "spark_q1",
    theme: "spark",
    question: "What is Spark?",
    options: {
      A: "A DeFi lending protocol",
      B: "A Launchpad for ideas",
      C: "A memecoin launchpad",
      D: "A web3 social app",
    },
    correct: "B",
  },
  {
    id: "spark_q2",
    theme: "spark",
    question: "Who can deposit / fund ideas on Spark?",
    options: {
      A: "Only KYC'd accredited investors",
      B: "Only $SPARK holders",
      C: "Only whitelisted US users",
      D: "Anyone with a Solana wallet — 100% permissionless",
    },
    correct: "D",
  },
  {
    id: "spark_q3",
    theme: "spark",
    question: "If no one ships during the hackathon, what do Spark investors get?",
    options: {
      A: "Nothing — capital is forfeit",
      B: "$SPARK tokens as compensation",
      C: "Their capital back (+ trading fees)",
      D: "A 5% APY consolation yield",
    },
    correct: "C",
  },
  {
    id: "spark_q4",
    theme: "spark",
    question: "What is Spark's iteration strategy?",
    options: {
      A: "Slow — everything must be perfect, audited 3 times by independent experts",
      B: "Fast — break, iterate",
      C: "No iteration — ship once and freeze",
      D: "Quarterly releases, gated by governance vote",
    },
    correct: "B",
  },

  // ── Theme 2: Decision Markets ───────────────────────────────
  {
    id: "dm_q1",
    theme: "decision_markets",
    question: "What is a Decision Market?",
    options: {
      A: "A government bond auction",
      B: "A prediction market used to make decisions, the market price is the verdict",
      C: "A weighted survey",
      D: "A commodity futures market",
    },
    correct: "B",
  },
  {
    id: "dm_q2",
    theme: "decision_markets",
    question: "How are outcomes priced?",
    options: {
      A: "Set manually by the team",
      B: "Assigned by an off-chain oracle",
      C: "By real trading — buy/sell pressure reveals collective probability",
      D: "Fixed at launch, updates at close only",
    },
    correct: "C",
  },
  {
    id: "dm_q3",
    theme: "decision_markets",
    question: "How is the winning outcome determined?",
    options: {
      A: "Random draw weighted by volume",
      B: "The outcome with the highest average price during the trading window (TWAP)",
      C: "The first outcome traded by 50% of users",
      D: "A vote among traders at close",
    },
    correct: "B",
  },

  // ── Theme 3: $PREDICT ───────────────────────────────────────
  {
    id: "predict_q1",
    theme: "predict",
    question: "What is $PREDICT?",
    options: {
      A: "A USD stablecoin",
      B: "A Spark governance token",
      C: 'Launched on Spark — the IdeaCoin of "Prediction Market Base Layer on Solana"',
      D: "A wrapped $SOL",
    },
    correct: "C",
  },
  {
    id: "predict_q2",
    theme: "predict",
    question: "What is the $PREDICT Hackathon building?",
    options: {
      A: "A consumer social app",
      B: "An NFT collection",
      C: "The base layer for all future Spark Decision Markets",
      D: "A Solana ↔ Ethereum bridge",
    },
    correct: "C",
  },
  {
    id: "predict_q3",
    theme: "predict",
    question: "How is the $PREDICT Hackathon winner picked?",
    options: {
      A: "A jury of investors votes",
      B: "Most GitHub stars wins",
      C: "A Decision Market where traders pick the winner",
      D: "First team to mainnet wins",
    },
    correct: "C",
  },
]

/**
 * Lookup helper used by the answer endpoint. Returns null when the
 * supplied id doesn't match a known question (treat as a 400 — the
 * client should never POST an unknown id, and we don't want to
 * silently insert orphan rows).
 */
export function findQuestion(id: string): QuizQuestion | null {
  return QUIZ_QUESTIONS.find(q => q.id === id) ?? null
}

// ── End-of-day summary copy ──────────────────────────────────
//
// Three-sentence recap of each theme's key takeaways, shown in the
// summary card after the user answers the day's last question. The
// goal is a tight didactic wrap-up — one beat per "thing the user
// just learned" — not a per-question replay (we used to render
// every question with the user's pick; the recap was repetitive
// and didn't reinforce the underlying concept).
//
// Kept here (alongside the questions) rather than in a separate
// strings file so it's obvious that updating a question's correct
// answer should also update the matching recap sentence.
export const THEME_RECAP: Record<QuizQuestion["theme"], string[]> = {
  spark: [
    "Spark is a Launchpad for ideas — anyone with a Solana wallet can permissionlessly fund, build, and ship.",
    "Capital is protected by milestones — if a hackathon doesn't ship, investors get their funds back plus trading fees.",
    "The team moves fast: break, iterate, ship.",
  ],
  decision_markets: [
    "A Decision Market is a prediction market used to make decisions — the market price is the verdict.",
    "Outcomes get priced by real trading — every buy and sell reveals the crowd's collective probability.",
    "The winner is the outcome with the highest time-weighted average price (TWAP) during the trading window.",
  ],
  predict: [
    "$PREDICT is the IdeaCoin of \"Prediction Market Base Layer on Solana\", launched on Spark.",
    "The hackathon is building the base layer that will power every future Spark Decision Market.",
    "The winning team is picked by traders themselves via a Decision Market.",
  ],
}

/**
 * UTC date string (`YYYY-MM-DD`) for the daily-cap comparison.
 * Anchoring on UTC means the rollover is the same for every user
 * regardless of timezone — simpler than per-user local-day windows
 * and matches how we bucket every other "per day" metric.
 */
export function utcDateStr(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

// ── Daily theme rotation ──────────────────────────────────────
//
// Each calendar day maps to ONE theme. The active theme determines
// which question gets served when the modal pops up that day.
// Rollout (per product spec):
//   2026-04-30 → spark
//   2026-05-01 → decision_markets
//   2026-05-02 → predict
//   2026-05-03 → spark   (rotates; same order continues indefinitely)
//   ...
//
// We don't hardcode each future date — the rotation is computed as
// `(days_since_base) % 3` so adding more themes / changing the order
// is a one-line change in `THEME_BY_DAY`.
const THEME_BASE_DATE_UTC = "2026-04-30"
const THEME_BY_DAY: Array<QuizQuestion["theme"]> = [
  "spark",            // day 0 — April 30
  "decision_markets", // day 1 — May 1
  "predict",          // day 2 — May 2
]

/**
 * Active theme for the given date. Defaults to today (UTC).
 *
 * Negative day deltas (querying a date before the base) fall back to
 * theme 0 by way of the modulo-with-correction — covers the edge case
 * where a user's clock is skewed earlier than the rollout start. Past
 * the base, the rotation simply repeats every `THEME_BY_DAY.length`
 * days.
 */
export function themeForDate(d: Date = new Date()): QuizQuestion["theme"] {
  const baseMs = new Date(`${THEME_BASE_DATE_UTC}T00:00:00Z`).getTime()
  const todayMs = new Date(`${utcDateStr(d)}T00:00:00Z`).getTime()
  const daysSince = Math.floor((todayMs - baseMs) / 86_400_000)
  const len = THEME_BY_DAY.length
  const idx = ((daysSince % len) + len) % len
  return THEME_BY_DAY[idx]
}
