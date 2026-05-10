/**
 * Back-office tab — mini-app analytics dashboard.
 *
 * Hits the single `/api/admin/mini-stats` aggregate endpoint and renders
 * three blocks:
 *
 *   1. Overview cards: signups, wallets, deposits + conversion %, trades,
 *      volume, notifs, withdraws
 *   2. Funnel: signin → deposit → trade with drop-off rates
 *   3. Tables: signups/deposits/trades by day, top traders, top markets
 *
 * Auth follows the same pattern as the other BackOffice tabs: the admin
 * pastes the API key once, we cache it under `bo_api_key` in localStorage,
 * every request ships `Authorization: <key>`. Backend verifies via
 * `isApiKeyValid(..., "read")`.
 *
 * No charting library — plain tables keep the diff small and the data
 * is sparse enough (30 rows max per table) that the visual gain from a
 * line chart wouldn't justify pulling in a recharts/lightweight-charts
 * dependency on the desktop bundle.
 */

import { useEffect, useState } from "react"
import { Button } from "../Button/Button"

type Overview = {
  total_signups: number
  wallets_provisioned: number
  deposits_completed: number
  deposit_conversion_pct: number
  total_trades: number
  unique_traders: number
  total_volume: number
  notif_subs_active: number
  notif_subs_total: number
  withdraws: number
}

type DayRow = { day: string }
type SignupRow = DayRow & { signups: number }
type DepositRow = DayRow & { deposits: number }
type TradeRow = DayRow & { trades: number; traders: number; volume: number }

type TopTrader = { wallet: string; trades: number; volume: number }
type TopMarket = { proposal_pda: string; trades: number; traders: number; volume: number }

type Stats = {
  generated_at: string
  overview: Overview
  signups_by_day: SignupRow[]
  deposits_by_day: DepositRow[]
  trades_by_day: TradeRow[]
  funnel: { signed_in: number; deposited: number; traded: number }
  signin_conversion: { attempts: number; completed: number; pct: number }
  top_traders: TopTrader[]
  top_markets: TopMarket[]
}

function shortAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr || "—"
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function fmtNum(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

const MiniStatsManager = () => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("bo_api_key") || "")
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async (keyOverride?: string) => {
    const key = keyOverride ?? apiKey
    if (!key) {
      setError("Enter your API key")
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/mini-stats", {
        headers: { Authorization: key },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = (data as { error?: string }).error || `HTTP ${res.status}`
        throw new Error(msg)
      }
      setStats(data as Stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats")
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-fetch if a key is already cached — saves the admin from
  // re-entering it every back-office mount.
  useEffect(() => {
    if (apiKey) void fetchStats(apiKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSaveKey = () => {
    localStorage.setItem("bo_api_key", apiKey)
    void fetchStats()
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-2">
      <div className="flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs uppercase tracking-wider text-neutral-500">
            Admin API key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="paste your API key"
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-primary"
          />
        </div>
        <Button btnText="Save & load" color="primary" onClick={handleSaveKey} />
        <Button
          btnText={isLoading ? "Refreshing…" : "Refresh"}
          color="tertiary"
          onClick={() => fetchStats()}
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {stats && (
        <>
          <div className="text-xs text-neutral-500">
            Generated at {new Date(stats.generated_at).toLocaleString()}
          </div>

          {/* Overview cards */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Overview</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Twitter signups" value={fmtNum(stats.overview.total_signups)} />
              <StatCard
                label="Public wallets"
                value={fmtNum(stats.overview.wallets_provisioned)}
              />
              <StatCard
                label="Deposits completed"
                value={fmtNum(stats.overview.deposits_completed)}
                hint={`${stats.overview.deposit_conversion_pct}% of wallets`}
              />
              <StatCard label="Withdraws" value={fmtNum(stats.overview.withdraws)} />
              <StatCard label="Total trades" value={fmtNum(stats.overview.total_trades)} />
              <StatCard label="Unique traders" value={fmtNum(stats.overview.unique_traders)} />
              <StatCard
                label="Volume (USDG)"
                value={`$${fmtNum(stats.overview.total_volume)}`}
              />
              <StatCard
                label="Notif subscribers"
                value={`${fmtNum(stats.overview.notif_subs_active)} / ${fmtNum(stats.overview.notif_subs_total)}`}
                hint="active / total"
              />
            </div>
          </section>

          {/* Funnel + sign-in conversion */}
          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-3 text-sm font-semibold">Funnel</h3>
              <FunnelRow label="Signed in" value={stats.funnel.signed_in} base={stats.funnel.signed_in} />
              <FunnelRow label="Deposited" value={stats.funnel.deposited} base={stats.funnel.signed_in} />
              <FunnelRow label="Made a trade" value={stats.funnel.traded} base={stats.funnel.signed_in} />
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-3 text-sm font-semibold">Twitter sign-in (last 7d)</h3>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-neutral-400">Attempts</span>
                <span className="font-mono">{fmtNum(stats.signin_conversion.attempts)}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-neutral-400">Completed</span>
                <span className="font-mono">{fmtNum(stats.signin_conversion.completed)}</span>
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-neutral-400">Conversion</span>
                <span className="font-mono text-brand-primary">
                  {stats.signin_conversion.pct}%
                </span>
              </div>
            </div>
          </section>

          {/* Daily activity tables */}
          <section className="grid gap-4 md:grid-cols-3">
            <DayTable
              title="Signups (30d)"
              rows={stats.signups_by_day}
              cols={[{ key: "signups", label: "#" }]}
            />
            <DayTable
              title="Deposits (30d)"
              rows={stats.deposits_by_day}
              cols={[{ key: "deposits", label: "#" }]}
            />
            <DayTable
              title="Trades (30d)"
              rows={stats.trades_by_day}
              cols={[
                { key: "trades", label: "Trades" },
                { key: "traders", label: "Users" },
                { key: "volume", label: "Vol", format: "money" },
              ]}
            />
          </section>

          {/* Leaderboards */}
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-3 text-sm font-semibold">Top traders by volume</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
                    <th className="pb-2">Wallet</th>
                    <th className="pb-2 text-right">Trades</th>
                    <th className="pb-2 text-right">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_traders.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-2 text-center text-neutral-600">
                        No data yet
                      </td>
                    </tr>
                  )}
                  {stats.top_traders.map(t => (
                    <tr key={t.wallet} className="border-t border-neutral-800">
                      <td className="py-2 font-mono text-xs">{shortAddress(t.wallet)}</td>
                      <td className="py-2 text-right font-mono">{fmtNum(t.trades)}</td>
                      <td className="py-2 text-right font-mono">${fmtNum(t.volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <h3 className="mb-3 text-sm font-semibold">Top markets by activity</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
                    <th className="pb-2">Proposal</th>
                    <th className="pb-2 text-right">Trades</th>
                    <th className="pb-2 text-right">Traders</th>
                    <th className="pb-2 text-right">Vol</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_markets.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-2 text-center text-neutral-600">
                        No data yet
                      </td>
                    </tr>
                  )}
                  {stats.top_markets.map(m => (
                    <tr key={m.proposal_pda} className="border-t border-neutral-800">
                      <td className="py-2 font-mono text-xs">{shortAddress(m.proposal_pda)}</td>
                      <td className="py-2 text-right font-mono">{fmtNum(m.trades)}</td>
                      <td className="py-2 text-right font-mono">{fmtNum(m.traders)}</td>
                      <td className="py-2 text-right font-mono">${fmtNum(m.volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-bold font-mono">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-neutral-500">{hint}</div>}
    </div>
  )
}

function FunnelRow({ label, value, base }: { label: string; value: number; base: number }) {
  const pct = base > 0 ? Math.round((1000 * value) / base) / 10 : 0
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-neutral-300">{label}</span>
        <span className="font-mono">
          {fmtNum(value)}{" "}
          <span className="text-xs text-neutral-500">({pct}%)</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full bg-brand-primary"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

type DayCol<T> = { key: keyof T & string; label: string; format?: "money" }

function DayTable<T extends DayRow>({ title, rows, cols }: { title: string; rows: T[]; cols: DayCol<T>[] }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="max-h-[260px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-900">
            <tr className="text-left text-xs uppercase tracking-wider text-neutral-500">
              <th className="pb-2">Day</th>
              {cols.map(c => (
                <th key={c.key} className="pb-2 text-right">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="py-2 text-center text-neutral-600">
                  No data yet
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.day} className="border-t border-neutral-800">
                <td className="py-2 font-mono text-xs">{row.day}</td>
                {cols.map(c => {
                  const v = row[c.key] as unknown as number
                  return (
                    <td key={c.key} className="py-2 text-right font-mono">
                      {c.format === "money" ? `$${fmtNum(v)}` : fmtNum(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default MiniStatsManager
