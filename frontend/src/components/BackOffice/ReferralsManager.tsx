import { useState, useEffect, useMemo } from "react"
import { TableCell } from "../Tables/TableCell"
import { TableHeader } from "../Tables/TableHeader"
import { Button } from "../Button/Button"
import Text from "@/components/Text"

type ReferrerRow = {
  wallet: string
  code: string
  twitter: string | null
  createdAt: string
  referralCount: number
  totalReferredInvestment: number
}

type ReferralDetail = {
  referrer_wallet: string
  referee_wallet: string
  referee_twitter_username: string | null
  created_at: string
  total_invested: number
}

type Stats = {
  totalReferrers: number
  totalReferrals: number
  totalReferredInvestment: number
}

type SortField = "wallet" | "twitter" | "referralCount" | "totalReferredInvestment" | "createdAt"

const ReferralsManager = () => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("bo_api_key") || "")
  const [stats, setStats] = useState<Stats | null>(null)
  const [referrers, setReferrers] = useState<ReferrerRow[]>([])
  const [details, setDetails] = useState<ReferralDetail[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>("totalReferredInvestment")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  const fetchData = async () => {
    if (!apiKey) {
      setError("Enter your API key")
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/referrals-stats", {
        headers: { Authorization: apiKey },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error((data as { error?: string }).error || "Failed to fetch")
      }
      const data = await res.json() as { stats: Stats; referrers: ReferrerRow[]; referralDetails: ReferralDetail[] }
      setStats(data.stats)
      setReferrers(data.referrers)
      setDetails(data.referralDetails)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("bo_api_key", apiKey)
      fetchData()
    }
  }, [])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return "\u2193"
    return sortDirection === "asc" ? "\u2191" : "\u2193"
  }

  const sorted = useMemo(() => {
    return [...referrers].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal
      }
      return sortDirection === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }, [referrers, sortField, sortDirection])

  const getDetailsForReferrer = (wallet: string) =>
    details.filter((d) => d.referrer_wallet === wallet)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return dateString
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  }

  return (
    <main className="z-[10] flex h-full w-full max-w-full flex-col items-center gap-6 py-[100px] font-normal text-fg-primary lg:py-[20px]">
      <h1 className="text-center text-2xl font-semibold">Referrals</h1>

      {/* API Key */}
      <div className="flex w-full max-w-6xl items-center gap-3">
        <input
          type="password"
          placeholder="API Key"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value)
            localStorage.setItem("bo_api_key", e.target.value)
          }}
          className="w-full max-w-sm rounded-lg border border-bd-secondary/30 bg-transparent px-4 py-2 text-sm text-fg-primary placeholder:text-fg-secondary/50 focus:border-brand-primary/50 focus:outline-none"
        />
        <Button
          btnText={isLoading ? "Loading..." : "Refresh"}
          size="sm"
          onClick={fetchData}
          disabled={isLoading || !apiKey}
        />
      </div>

      {error && (
        <div className="w-full max-w-6xl rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="flex w-full max-w-6xl gap-4">
          <div className="flex-1 rounded-lg border border-bd-secondary/20 bg-secondary/20 p-4 text-center">
            <p className="text-xs text-fg-secondary uppercase">Referrers</p>
            <p className="text-2xl font-bold text-fg-primary mt-1">{stats.totalReferrers}</p>
          </div>
          <div className="flex-1 rounded-lg border border-bd-secondary/20 bg-secondary/20 p-4 text-center">
            <p className="text-xs text-fg-secondary uppercase">Total Referrals</p>
            <p className="text-2xl font-bold text-fg-primary mt-1">{stats.totalReferrals}</p>
          </div>
          <div className="flex-1 rounded-lg border border-bd-secondary/20 bg-secondary/20 p-4 text-center">
            <p className="text-xs text-fg-secondary uppercase">Total Referred Investment</p>
            <p className="text-2xl font-bold text-green-400 mt-1">
              ${stats.totalReferredInvestment.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Referrers Table */}
      <div className="relative flex w-full max-w-6xl flex-col rounded-lg bg-transparent">
        <div className="overflow-x-auto">
          <div className="max-h-[60vh] overflow-y-auto pr-2">
            {!isLoading && referrers.length > 0 ? (
              <table className="w-full divide-y divide-bd-secondary/15">
                <thead className="sticky top-0 z-[2] bg-accent">
                  <tr className="max-h-[52px] bg-default">
                    <TableHeader onClick={() => handleSort("wallet")}>
                      Wallet {getSortIcon("wallet")}
                    </TableHeader>
                    <TableHeader onClick={() => handleSort("twitter")}>
                      Twitter {getSortIcon("twitter")}
                    </TableHeader>
                    <TableHeader>Code</TableHeader>
                    <TableHeader onClick={() => handleSort("referralCount")}>
                      Referrals {getSortIcon("referralCount")}
                    </TableHeader>
                    <TableHeader onClick={() => handleSort("totalReferredInvestment")}>
                      Total Invested {getSortIcon("totalReferredInvestment")}
                    </TableHeader>
                    <TableHeader onClick={() => handleSort("createdAt")}>
                      Joined {getSortIcon("createdAt")}
                    </TableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bd-secondary/5 pb-10">
                  {sorted.map((r) => {
                    const isExpanded = expandedWallet === r.wallet
                    const referrerDetails = getDetailsForReferrer(r.wallet)
                    return (
                      <tr key={r.wallet} className="group">
                        <td colSpan={6} className="p-0">
                          <div
                            className="flex h-[64px] cursor-pointer items-center transition-colors hover:bg-brand-primary/5"
                            onClick={() => setExpandedWallet(isExpanded ? null : r.wallet)}
                          >
                            <div className="w-[12%] px-2 py-0">
                              <span className="font-mono text-sm text-fg-primary">
                                {r.wallet.slice(0, 4)}...{r.wallet.slice(-4)}
                              </span>
                            </div>
                            <div className="w-[12%] px-2 py-0">
                              <span className="text-sm text-blue-400">
                                {r.twitter ? `@${r.twitter}` : "-"}
                              </span>
                            </div>
                            <div className="w-[12%] px-2 py-0">
                              <span className="font-mono text-xs text-fg-secondary">{r.code}</span>
                            </div>
                            <div className="w-[12%] px-2 py-0">
                              <span className="text-sm font-medium text-fg-primary">{r.referralCount}</span>
                            </div>
                            <div className="w-[12%] px-2 py-0">
                              <span className={`text-sm font-medium ${r.totalReferredInvestment > 0 ? "text-green-400" : "text-fg-secondary"}`}>
                                ${r.totalReferredInvestment.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="w-[12%] px-2 py-0">
                              <span className="text-sm text-fg-secondary">{formatDate(r.createdAt)}</span>
                            </div>
                          </div>

                          {/* Expanded details */}
                          {isExpanded && referrerDetails.length > 0 && (
                            <div className="border-t border-bd-secondary/10 bg-secondary/10 px-6 py-3">
                              <p className="mb-2 text-xs font-medium text-fg-secondary uppercase">
                                Referred Users
                              </p>
                              <table className="w-full">
                                <thead>
                                  <tr className="text-left text-[10px] text-fg-tertiary uppercase">
                                    <th className="py-1 pr-4">Wallet</th>
                                    <th className="py-1 pr-4">Twitter</th>
                                    <th className="py-1 pr-4">Invested</th>
                                    <th className="py-1">Date</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {referrerDetails.map((d, i) => (
                                    <tr key={i} className="text-sm">
                                      <td className="py-1 pr-4 font-mono text-xs text-fg-primary">
                                        {d.referee_wallet.slice(0, 4)}...{d.referee_wallet.slice(-4)}
                                      </td>
                                      <td className="py-1 pr-4 text-xs text-blue-400">
                                        {d.referee_twitter_username ? `@${d.referee_twitter_username}` : "-"}
                                      </td>
                                      <td className={`py-1 pr-4 text-xs font-medium ${d.total_invested > 0 ? "text-green-400" : "text-fg-secondary"}`}>
                                        ${d.total_invested.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </td>
                                      <td className="py-1 text-xs text-fg-secondary">
                                        {formatDate(d.created_at)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : isLoading ? (
              <TableSkeleton />
            ) : stats ? (
              <div className="flex flex-col items-center justify-center py-12">
                <span className="text-lg text-fg-secondary">No referrals yet</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}

const TableSkeleton = () => (
  <table className="w-full divide-y divide-bd-secondary/15">
    <thead className="sticky top-0 z-[2] bg-accent">
      <tr className="max-h-[52px] bg-default">
        <TableHeader>Wallet</TableHeader>
        <TableHeader>Twitter</TableHeader>
        <TableHeader>Code</TableHeader>
        <TableHeader>Referrals</TableHeader>
        <TableHeader>Total Invested</TableHeader>
        <TableHeader>Joined</TableHeader>
      </tr>
    </thead>
    <tbody className="divide-y divide-bd-secondary/5 pb-10">
      {[1, 2, 3, 4, 5].map((item) => (
        <tr className="h-[64px]" key={item}>
          <TableCell className="py-0"><Text isLoading className="w-[80px] opacity-50" /></TableCell>
          <TableCell className="py-0"><Text isLoading className="w-[80px] opacity-50" /></TableCell>
          <TableCell className="py-0"><Text isLoading className="w-[60px] opacity-50" /></TableCell>
          <TableCell className="py-0"><Text isLoading className="w-[40px] opacity-50" /></TableCell>
          <TableCell className="py-0"><Text isLoading className="w-[80px] opacity-50" /></TableCell>
          <TableCell className="py-0"><Text isLoading className="w-[80px] opacity-50" /></TableCell>
        </tr>
      ))}
    </tbody>
  </table>
)

export default ReferralsManager
