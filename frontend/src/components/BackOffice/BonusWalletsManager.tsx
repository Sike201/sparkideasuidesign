/**
 * Back-office tab — list every user's "bonus" (private) custodial wallet
 * and send USDG to one of them on demand.
 *
 * Auth mirrors `BroadcastNotificationsManager`: the admin pastes their
 * API key once, we persist it under the shared `bo_api_key` localStorage
 * slot, and every request ships `Authorization: <key>`. The backend
 * endpoints (`/api/admin/bonus-wallets`, `/api/admin/fund-bonus-wallet`)
 * verify via `isApiKeyValid` with the `write` permission.
 *
 * Why a dedicated tab rather than reusing `/api/admin/airdrop-tokens`?
 * That endpoint targets an arbitrary SPL mint and requires the admin to
 * know per-wallet token amounts up-front. The bonus-wallet flow is
 * "fund one user X USDG, see on-chain confirmation" — a single-user
 * action with no allocation math. Keeping this surface dedicated also
 * means the list only shows private wallets (not all custodial rows),
 * which is what the admin actually needs.
 */

import { Fragment, useEffect, useState } from "react"
import { Button } from "../Button/Button"

type BonusWallet = {
  twitter_id: string | null
  twitter_username: string | null
  wallet_address: string
  created_at: string | null
  /** Null when the per-wallet RPC lookup failed — render as "—". */
  usdg_balance: number | null
  /**
   * Companion main (public) wallet for the same user. `null` when no
   * public wallet is on file (rare — typically users with only a stale
   * private row). Inner balances are individually nullable when the RPC
   * lookup for that program failed.
   */
  main_wallet: {
    address: string
    usdg: number | null
    usdc: number | null
    predict: number | null
  } | null
}

type ListResponse = {
  wallets: BonusWallet[]
  count: number
}

type FundResponse = {
  success: true
  signature: string
  destination: string
  amount: number
  twitter_id: string | null
  twitter_username: string | null
} | {
  error: string
}

function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

// ── Quiz responses (per-user expander) ──────────────────────
type QuizResponseRow = {
  twitter_id: string
  twitter_username: string | null
  question_id: string
  answer: string
  is_correct: boolean
  answered_at: string
  question_text: string | null
}
type QuizQuestionMeta = {
  id: string
  theme: string
  question: string
  correct: string
}
type QuizResponsesPayload = {
  responses: QuizResponseRow[]
  questions: QuizQuestionMeta[]
  count: number
}

function QuizResponsesPanel({
  twitterId,
  apiKey,
}: {
  twitterId: string
  apiKey: string
}) {
  const [data, setData] = useState<QuizResponsesPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/admin/quiz-responses?twitter_id=${encodeURIComponent(twitterId)}`,
          { headers: { Authorization: apiKey } },
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
        }
        const j = (await res.json()) as QuizResponsesPayload
        if (!cancelled) setData(j)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [twitterId, apiKey])

  if (loading) return <div className="text-xs text-white/50 px-3 py-2">Loading…</div>
  if (error) return <div className="text-xs text-red-300 px-3 py-2">{error}</div>
  if (!data || data.responses.length === 0) {
    return <div className="text-xs text-white/40 px-3 py-2">No quiz responses yet.</div>
  }

  const correctCount = data.responses.filter(r => r.is_correct).length
  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="text-[11px] text-white/50">
        {correctCount} / {data.responses.length} correct
        <span className="text-white/30"> · {data.questions.length} questions total</span>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {data.responses.map((r) => (
          <div
            key={r.question_id}
            className="flex items-center gap-2 text-[11px] font-mono px-2 py-1 rounded border border-white/5 bg-black/30"
          >
            <span className="text-white/40 w-20 truncate">{r.question_id}</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                r.is_correct
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-red-500/15 text-red-300"
              }`}
              title={`Correct answer: ${
                data.questions.find(q => q.id === r.question_id)?.correct ?? "?"
              }`}
            >
              {r.is_correct ? "✓" : "✗"} {r.answer}
            </span>
            <span className="text-white/60 truncate flex-1" title={r.question_text ?? r.question_id}>
              {r.question_text ?? r.question_id}
            </span>
            <span className="text-white/30 text-[10px] shrink-0">
              {new Date(r.answered_at).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const BonusWalletsManager = () => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("bo_api_key") || "")
  const [wallets, setWallets] = useState<BonusWallet[]>([])
  const [count, setCount] = useState<number>(0)
  const [filter, setFilter] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Funding state — one row at a time. `fundingTarget` is the address we
  // opened the mini-form for; when non-null the row shows the amount
  // input + confirm button. `lastResult` is the last signature so the UI
  // can show an inline success pill without a global toast system.
  const [fundingTarget, setFundingTarget] = useState<string | null>(null)
  const [fundingAmount, setFundingAmount] = useState("")
  const [isFunding, setIsFunding] = useState(false)
  const [lastResult, setLastResult] = useState<{ address: string; signature: string; amount: number } | null>(null)

  // Per-row quiz expander — keyed on `twitter_id` rather than wallet
  // address because a user has both a public + private row but a
  // single quiz response history; opening "quiz" should show the
  // same panel either way.
  const [quizOpenFor, setQuizOpenFor] = useState<string | null>(null)

  const fetchList = async (keyOverride?: string) => {
    const key = keyOverride ?? apiKey
    if (!key) {
      setError("Enter your API key")
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/bonus-wallets", {
        headers: { Authorization: key },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as ListResponse
      setWallets(data.wallets)
      setCount(data.count)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("bo_api_key", apiKey)
      fetchList()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFund = async (wallet: BonusWallet) => {
    const amount = Number(fundingAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Amount must be a positive number")
      return
    }
    if (!apiKey) {
      setError("Enter your API key")
      return
    }
    setIsFunding(true)
    setError(null)
    setLastResult(null)
    try {
      const res = await fetch("/api/admin/fund-bonus-wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        // Send by wallet_address directly — unambiguous and avoids
        // ambiguity from twitter_username collisions (not expected but
        // cheap insurance).
        body: JSON.stringify({
          wallet_address: wallet.wallet_address,
          amount,
        }),
      })
      const data = (await res.json()) as FundResponse
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `HTTP ${res.status}`)
      }
      setLastResult({ address: wallet.wallet_address, signature: data.signature, amount: data.amount })
      setFundingTarget(null)
      setFundingAmount("")
      // Refresh list so the new balance is visible. Best-effort: RPC may
      // need a beat to reflect the transfer, so the new balance may lag
      // by one refetch. Admin can click "Refresh" if needed.
      await fetchList()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fund failed")
    } finally {
      setIsFunding(false)
    }
  }

  const filtered = wallets.filter((w) => {
    if (!filter) return true
    const f = filter.toLowerCase()
    // Match against username, twitter_id, bonus address, OR the paired
    // main wallet address — admins often paste a wallet they're looking
    // up without knowing which surface (main/bonus) it came from.
    return (
      (w.twitter_username ?? "").toLowerCase().includes(f) ||
      (w.twitter_id ?? "").toLowerCase().includes(f) ||
      w.wallet_address.toLowerCase().includes(f) ||
      (w.main_wallet?.address ?? "").toLowerCase().includes(f)
    )
  })

  return (
    <div className="flex flex-col gap-6 w-full mt-16">
      <div className="flex flex-col gap-2">
        <h3 className="text-2xl font-semibold text-white">Bonus wallets</h3>
        <p className="text-sm text-white/60">
          Send USDG from the admin wallet (PRIVATE_KEY env) to a user's
          private custodial wallet. Confirmations are on-chain and
          surfaced as a transaction signature.
        </p>
      </div>

      {/* API key field. Hidden once a key is cached in localStorage —
          admins rarely rotate, and the field being always-visible encouraged
          accidental pastes into the wrong input. */}
      {!apiKey && (
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-sm text-white/60">Admin API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key"
              className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white outline-none focus:border-white/40"
            />
          </div>
          <Button
            btnText="Load"
            color="primary"
            onClick={() => {
              localStorage.setItem("bo_api_key", apiKey)
              fetchList(apiKey)
            }}
          />
        </div>
      )}

      {apiKey && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by @username, twitter_id or address"
              className="w-[420px] rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
            />
            <span className="text-sm text-white/60">
              {filtered.length} of {count}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              btnText={isLoading ? "Loading…" : "Refresh"}
              color="tertiary"
              onClick={() => fetchList()}
              disabled={isLoading}
            />
            <Button
              btnText="Forget API key"
              color="tertiary"
              onClick={() => {
                localStorage.removeItem("bo_api_key")
                setApiKey("")
                setWallets([])
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {lastResult && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-200">
          Sent {lastResult.amount} USDG to {shortAddress(lastResult.address)} —{" "}
          <a
            href={`https://solscan.io/tx/${lastResult.signature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-mono"
          >
            {lastResult.signature.slice(0, 12)}…
          </a>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/50 text-xs uppercase tracking-wider">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Bonus wallet</th>
              <th className="px-4 py-3 text-right">Bonus USDG</th>
              <th className="px-4 py-3" title="The user's main (public) wallet address">
                Main wallet
              </th>
              <th className="px-4 py-3 text-right" title="USDG balance on the user's main (public) wallet">
                Main $
              </th>
              <th className="px-4 py-3 text-right" title="USDC balance on the user's main (public) wallet">
                Main USDC
              </th>
              <th className="px-4 py-3 text-right" title="$PREDICT balance on the user's main (public) wallet">
                Main PREDICT
              </th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => (
              <Fragment key={w.wallet_address}>
              <tr className="border-t border-white/5">
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-white">
                      {w.twitter_username ? `@${w.twitter_username}` : "—"}
                    </span>
                    <span className="text-xs text-white/40 font-mono">
                      {w.twitter_id ?? "no twitter_id"}
                    </span>
                    {/* Quiz toggle — only shown when we have a
                        twitter_id to query against. The expanded panel
                        appears as a full-width row beneath this one. */}
                    {w.twitter_id && (
                      <button
                        type="button"
                        onClick={() =>
                          setQuizOpenFor(prev =>
                            prev === w.twitter_id ? null : w.twitter_id,
                          )
                        }
                        className="mt-1 self-start text-[10px] uppercase tracking-wider text-amber-300/70 hover:text-amber-300"
                      >
                        {quizOpenFor === w.twitter_id ? "▾ hide quiz" : "▸ quiz"}
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-white/80">
                  <div className="flex items-center gap-2">
                    <span>{shortAddress(w.wallet_address)}</span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(w.wallet_address).catch(() => {})}
                      className="text-[10px] uppercase tracking-wider text-white/40 hover:text-white"
                    >
                      copy
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {w.usdg_balance === null
                    ? <span className="text-white/40">—</span>
                    : <span className="text-amber-200">${w.usdg_balance.toFixed(2)}</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-white/80">
                  {!w.main_wallet ? (
                    <span className="text-white/30" title="No main wallet on file">∅</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span title={w.main_wallet.address}>{shortAddress(w.main_wallet.address)}</span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(w.main_wallet!.address).catch(() => {})}
                        className="text-[10px] uppercase tracking-wider text-white/40 hover:text-white"
                      >
                        copy
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {!w.main_wallet
                    ? <span className="text-white/30" title="No main wallet on file">∅</span>
                    : w.main_wallet.usdg === null
                      ? <span className="text-white/40">—</span>
                      : <span className="text-white/80">${w.main_wallet.usdg.toFixed(2)}</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {!w.main_wallet
                    ? <span className="text-white/30">∅</span>
                    : w.main_wallet.usdc === null
                      ? <span className="text-white/40">—</span>
                      : <span className="text-white/80">{w.main_wallet.usdc.toFixed(2)}</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {!w.main_wallet
                    ? <span className="text-white/30">∅</span>
                    : w.main_wallet.predict === null
                      ? <span className="text-white/40">—</span>
                      : <span className="text-white/80">{w.main_wallet.predict.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {fundingTarget === w.wallet_address ? (
                    <div className="flex items-center justify-end gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0"
                        value={fundingAmount}
                        onChange={(e) => setFundingAmount(e.target.value)}
                        placeholder="Amount USDG"
                        autoFocus
                        className="w-32 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm text-white outline-none focus:border-white/40"
                      />
                      <Button
                        btnText={isFunding ? "Sending…" : "Confirm"}
                        color="primary"
                        disabled={isFunding || Number(fundingAmount) <= 0}
                        onClick={() => handleFund(w)}
                      />
                      <Button
                        btnText="Cancel"
                        color="tertiary"
                        disabled={isFunding}
                        onClick={() => {
                          setFundingTarget(null)
                          setFundingAmount("")
                        }}
                      />
                    </div>
                  ) : (
                    <Button
                      btnText="Fund"
                      color="tertiary"
                      onClick={() => {
                        setFundingTarget(w.wallet_address)
                        setFundingAmount("")
                      }}
                    />
                  )}
                </td>
              </tr>
              {/* Quiz expander row — only mounts when the user clicked
                  the "quiz" link, so we don't fan out 50 admin API
                  requests on first render of the table. */}
              {quizOpenFor && quizOpenFor === w.twitter_id && (
                <tr className="border-t border-white/5 bg-black/40">
                  <td colSpan={8} className="px-4 py-2">
                    <QuizResponsesPanel twitterId={quizOpenFor} apiKey={apiKey} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {filtered.length === 0 && !isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-white/40">
                  {apiKey ? "No bonus wallets match the filter." : "Enter your API key to load."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default BonusWalletsManager
