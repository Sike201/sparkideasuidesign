import { useState, useMemo, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { backendSparkApi, IdeaModel } from "@/data/api/backendSparkApi"
import { TableCell } from "../Tables/TableCell"
import { TableHeader } from "../Tables/TableHeader"
import { Button } from "../Button/Button"
import Text from "@/components/Text"
import IdeaEditor from "./IdeaEditor"
import { getVaultPda } from "shared/solana/sparkVaultService"

type SortField = "title" | "status" | "estimated_price" | "raised_amount" | "token_address" | "created_at"

const IdeasManager = () => {
  const [sortField, setSortField] = useState<SortField>("created_at")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryFn: () => backendSparkApi.getIdeas({ limit: 500 }),
    queryKey: ["admin-getAllIdeas"],
    refetchOnWindowFocus: false,
  })

  const ideas = data?.ideas || []

  // Map ideaId → { usdcVault, usdgVault } base58. Vault PDAs are
  // deterministic (SHA256(ideaId) and SHA256(ideaId + ':USDG')) so
  // on-chain existence n'est pas check ici — l'admin clique sur la
  // ligne pour le détail s'il veut vérifier on-chain.
  const [vaultPdas, setVaultPdas] = useState<Record<string, { usdc: string; usdg: string }>>({})
  useEffect(() => {
    let cancelled = false
    if (ideas.length === 0) return
    ;(async () => {
      const entries = await Promise.all(
        ideas.map(async (idea) => {
          const [usdc] = await getVaultPda(idea.id, "USDC")
          const [usdg] = await getVaultPda(idea.id, "USDG")
          return [idea.id, { usdc: usdc.toBase58(), usdg: usdg.toBase58() }] as const
        }),
      )
      if (cancelled) return
      const next: Record<string, { usdc: string; usdg: string }> = {}
      for (const [id, val] of entries) next[id] = val
      setVaultPdas(next)
    })()
    return () => { cancelled = true }
  }, [ideas])

  const filteredAndSorted = useMemo(() => {
    let result = ideas

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((idea) => idea.title.toLowerCase().includes(q))
    }

    result = [...result].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]

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
  }, [ideas, searchQuery, sortField, sortDirection])

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
      case "pending":
        return "text-yellow-500"
      case "in_progress":
        return "text-blue-500"
      case "completed":
        return "text-green-500"
      case "planned":
        return "text-purple-500"
      case "refunded":
        return "text-red-500"
      default:
        return "text-fg-secondary"
    }
  }

  if (selectedIdeaId) {
    return (
      <IdeaEditor
        ideaId={selectedIdeaId}
        onBack={() => {
          setSelectedIdeaId(null)
          refetch()
        }}
      />
    )
  }

  return (
    <main className="z-[10] flex h-full w-full max-w-full flex-col items-center gap-6 py-[100px] font-normal text-fg-primary lg:py-[20px]">
      <div className="flex w-full max-w-6xl items-center justify-between">
        <h1 className="mx-auto text-center text-2xl font-semibold">Ideas</h1>
        <Button
          btnText={isLoading ? "Refreshing..." : "Refresh"}
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="ml-4"
        />
      </div>

      <div className="flex w-full max-w-6xl">
        <input
          type="text"
          placeholder="Search by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-bd-secondary/30 bg-transparent px-4 py-2 text-sm text-fg-primary placeholder:text-fg-secondary/50 focus:border-brand-primary/50 focus:outline-none"
        />
        <span className="ml-4 flex items-center text-sm text-fg-secondary">
          {filteredAndSorted.length} idea{filteredAndSorted.length !== 1 ? "s" : ""}
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
                      <TableHeader onClick={() => handleSort("title")}>
                        Title {getSortIcon("title")}
                      </TableHeader>
                      <TableHeader onClick={() => handleSort("status")}>
                        Status {getSortIcon("status")}
                      </TableHeader>
                      <TableHeader onClick={() => handleSort("estimated_price")}>
                        Est. Price {getSortIcon("estimated_price")}
                      </TableHeader>
                      <TableHeader onClick={() => handleSort("raised_amount")}>
                        Raised {getSortIcon("raised_amount")}
                      </TableHeader>
                      <TableHeader onClick={() => handleSort("token_address")}>
                        Token {getSortIcon("token_address")}
                      </TableHeader>
                      <TableHeader>
                        USDC Vault
                      </TableHeader>
                      <TableHeader>
                        USDG Vault
                      </TableHeader>
                      <TableHeader onClick={() => handleSort("created_at")}>
                        Created {getSortIcon("created_at")}
                      </TableHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bd-secondary/5 pb-10">
                    {filteredAndSorted.map((idea: IdeaModel) => (
                      <tr
                        className="h-[64px] cursor-pointer transition-colors hover:bg-brand-primary/5"
                        key={idea.id}
                        onClick={() => setSelectedIdeaId(idea.id)}
                      >
                        <TableCell className="py-0">
                          <div className="max-w-[280px]">
                            <span className="block truncate text-sm font-medium text-fg-primary">
                              {idea.title}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className={`text-sm font-medium capitalize ${getStatusColor(idea.status)}`}>
                            {idea.status}
                          </span>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className="text-sm text-fg-primary">
                            {idea.estimated_price != null ? `$${idea.estimated_price.toLocaleString()}` : "-"}
                          </span>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className="text-sm text-fg-primary">
                            {idea.raised_amount != null ? `$${idea.raised_amount.toLocaleString()}` : "-"}
                          </span>
                        </TableCell>
                        <TableCell className="py-0">
                          <span className="font-mono text-xs text-fg-secondary">
                            {idea.token_address
                              ? `${idea.token_address.slice(0, 4)}...${idea.token_address.slice(-4)}`
                              : "-"}
                          </span>
                        </TableCell>
                        <TableCell className="py-0">
                          <VaultCell pubkey={vaultPdas[idea.id]?.usdc} />
                        </TableCell>
                        <TableCell className="py-0">
                          <VaultCell pubkey={vaultPdas[idea.id]?.usdg} />
                        </TableCell>
                        <TableCell className="py-0">
                          <span className="text-sm text-fg-secondary">
                            {formatDate(idea.created_at)}
                          </span>
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <span className="text-lg text-fg-secondary">No ideas found</span>
                  <span className="text-sm text-fg-tertiary">
                    {searchQuery ? "Try a different search term" : "Ideas will appear here"}
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

/**
 * Affiche un pubkey base58 tronqué (4 premiers + 4 derniers) avec un
 * click-to-copy. Le clic sur la cell stop la propagation pour éviter
 * d'ouvrir l'éditeur de l'idée. Pas de tooltip natif — on garde simple
 * et le full pubkey est attaché en `title` pour le hover du browser.
 */
const VaultCell = ({ pubkey }: { pubkey: string | undefined }) => {
  const [copied, setCopied] = useState(false)
  if (!pubkey) {
    return <span className="font-mono text-xs text-fg-tertiary">…</span>
  }
  const short = `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`
  const handleCopy = async (e: React.MouseEvent) => {
    // Stop la propagation pour ne pas trigger le onClick du row
    // parent (qui ouvre l'éditeur de l'idée).
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(pubkey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={pubkey}
      className="font-mono text-xs text-fg-secondary hover:text-brand-primary transition-colors"
    >
      {copied ? "copied!" : short}
    </button>
  )
}

const TableSkeleton = () => {
  return (
    <table className="w-full divide-y divide-bd-secondary/15">
      <thead className="sticky top-0 z-[2] bg-accent">
        <tr className="max-h-[52px] bg-default">
          <TableHeader>Title</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Est. Price</TableHeader>
          <TableHeader>Raised</TableHeader>
          <TableHeader>Token</TableHeader>
          <TableHeader>USDC Vault</TableHeader>
          <TableHeader>USDG Vault</TableHeader>
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
              <Text isLoading className="w-[80px] opacity-50" />
            </TableCell>
            <TableCell className="py-0">
              <Text isLoading className="w-[80px] opacity-50" />
            </TableCell>
            <TableCell className="py-0">
              <Text isLoading className="w-[80px] opacity-50" />
            </TableCell>
            <TableCell className="py-0">
              <Text isLoading className="w-[80px] opacity-50" />
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

export default IdeasManager
