import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { backendSparkApi, HackathonModel } from "@/data/api/backendSparkApi"
import { useAuthContext } from "@/hooks/useAuthContext"
import { TableCell } from "../Tables/TableCell"
import { TableHeader } from "../Tables/TableHeader"
import { Button } from "../Button/Button"
import Text from "@/components/Text"
import HackathonEditor from "./HackathonEditor"

type SortField = "idea_title" | "status" | "usdg_amount" | "proposals_count" | "created_at"

const HackathonsManager = () => {
  const { auth } = useAuthContext()
  const [sortField, setSortField] = useState<SortField>("created_at")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedHackathonId, setSelectedHackathonId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryFn: () => {
      if (!auth) throw new Error("Not authenticated")
      return backendSparkApi.adminGetHackathons(auth)
    },
    queryKey: ["admin-getHackathons"],
    enabled: !!auth,
    refetchOnWindowFocus: false,
  })

  const hackathons = data?.hackathons || []

  const filteredAndSorted = useMemo(() => {
    let result = hackathons

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((h) => h.idea_title.toLowerCase().includes(q))
    }

    result = [...result].sort((a, b) => {
      const aVal = a[sortField as keyof HackathonModel]
      const bVal = b[sortField as keyof HackathonModel]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal
      }

      const aStr = String(aVal)
      const bStr = String(bVal)
      return sortDirection === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
    })

    return result
  }, [hackathons, searchQuery, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return "\u2193"
    return sortDirection === "asc" ? "\u2191" : "\u2193"
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return dateString
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "upcoming":
        return "text-blue-400"
      case "open":
        return "text-green-500"
      case "voting":
        return "text-yellow-500"
      case "completed":
        return "text-fg-secondary"
      default:
        return "text-fg-secondary"
    }
  }

  if (selectedHackathonId || isCreating) {
    return (
      <HackathonEditor
        hackathonId={selectedHackathonId}
        onBack={() => {
          setSelectedHackathonId(null)
          setIsCreating(false)
          refetch()
        }}
      />
    )
  }

  return (
    <main className="z-[10] flex h-full w-full max-w-full flex-col items-center gap-6 py-[100px] font-normal text-fg-primary lg:py-[20px]">
      <div className="flex w-full max-w-6xl items-center justify-between">
        <h1 className="mx-auto text-center text-2xl font-semibold">Hackathons</h1>
        <div className="flex gap-2">
          <Button
            btnText="New Hackathon"
            size="sm"
            onClick={() => setIsCreating(true)}
          />
          <Button
            btnText={isLoading ? "Refreshing..." : "Refresh"}
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="flex w-full max-w-6xl">
        <input
          type="text"
          placeholder="Search by idea title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-bd-secondary/30 bg-transparent px-4 py-2 text-sm text-fg-primary placeholder:text-fg-secondary/50 focus:border-brand-primary/50 focus:outline-none"
        />
        <span className="ml-4 flex items-center text-sm text-fg-secondary">
          {filteredAndSorted.length} hackathon{filteredAndSorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="relative flex w-full max-w-6xl flex-col rounded-lg bg-transparent">
        <div className="overflow-x-auto">
          <div className="max-h-[70vh] overflow-y-auto pr-2">
            {!isLoading ? (
              filteredAndSorted.length ? (
                <table className="w-full divide-y divide-bd-secondary/15">
                  <thead className="sticky top-0 z-[2] bg-accent">
                    <tr className="max-h-[52px] bg-default">
                      <TableHeader onClick={() => handleSort("idea_title")}>
                        Idea Title {getSortIcon("idea_title")}
                      </TableHeader>
                      <TableHeader onClick={() => handleSort("status")}>
                        Status {getSortIcon("status")}
                      </TableHeader>
                      <TableHeader onClick={() => handleSort("usdg_amount")}>
                        USDG Amount {getSortIcon("usdg_amount")}
                      </TableHeader>
                      <TableHeader onClick={() => handleSort("proposals_count")}>
                        Proposals {getSortIcon("proposals_count")}
                      </TableHeader>
                      <TableHeader onClick={() => handleSort("created_at")}>
                        Created {getSortIcon("created_at")}
                      </TableHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bd-secondary/5 pb-10">
                    {filteredAndSorted.map((h: HackathonModel) => (
                      <tr
                        className="h-[64px] cursor-pointer transition-colors hover:bg-brand-primary/5"
                        key={h.id}
                        onClick={() => setSelectedHackathonId(h.id)}
                      >
                        <TableCell className="py-0">
                          <div className="max-w-[280px]">
                            <span className="block truncate text-sm font-medium text-fg-primary">
                              {h.idea_title}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className={`text-sm font-medium uppercase ${getStatusColor(h.status)}`}>
                            {h.status}
                          </span>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className="text-sm text-fg-primary">
                            {h.usdg_amount != null ? `$${h.usdg_amount.toLocaleString()}` : "-"}
                          </span>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className="text-sm text-fg-primary">
                            {h.proposals_count ?? 0}
                          </span>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className="text-sm text-fg-secondary">
                            {formatDate(h.created_at)}
                          </span>
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <span className="text-lg text-fg-secondary">No hackathons found</span>
                  <span className="text-sm text-fg-tertiary">
                    {searchQuery ? "Try a different search term" : "Click 'New Hackathon' to create one"}
                  </span>
                </div>
              )
            ) : (
              <TableSkeleton />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

const TableSkeleton = () => {
  return (
    <table className="w-full divide-y divide-bd-secondary/15">
      <thead className="sticky top-0 z-[2] bg-accent">
        <tr className="max-h-[52px] bg-default">
          <TableHeader>Idea Title</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>USDG Amount</TableHeader>
          <TableHeader>Proposals</TableHeader>
          <TableHeader>Created</TableHeader>
        </tr>
      </thead>
      <tbody className="divide-y divide-bd-secondary/5 pb-10">
        {[1, 2, 3, 4, 5].map((item) => (
          <tr className="h-[64px]" key={item}>
            <TableCell className="py-0">
              <Text isLoading className="w-[180px] opacity-50" />
            </TableCell>
            <TableCell className="py-0">
              <Text isLoading className="w-[60px] opacity-50" />
            </TableCell>
            <TableCell className="py-0">
              <Text isLoading className="w-[80px] opacity-50" />
            </TableCell>
            <TableCell className="py-0">
              <Text isLoading className="w-[40px] opacity-50" />
            </TableCell>
            <TableCell className="py-0">
              <Text isLoading className="w-[80px] opacity-50" />
            </TableCell>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default HackathonsManager
