import { useState, useEffect } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { backendSparkApi } from "@/data/api/backendSparkApi"
import { useAuthContext } from "@/hooks/useAuthContext"
import { Button } from "../Button/Button"
import { toast } from "react-toastify"

type IdeaEditorProps = {
  ideaId: string
  onBack: () => void
}

type Tab = "form" | "json" | "launch" | "fees"

const FORM_FIELDS = [
  // Identity (read-only)
  { key: "id", label: "ID", type: "readonly" },
  // Author
  { key: "author_username", label: "Author Username", type: "text" },
  // Core
  { key: "title", label: "Title", type: "text" },
  { key: "description", label: "Description", type: "textarea" },
  { key: "status", label: "Status", type: "select", options: ["pending", "in_progress", "completed", "planned", "refunded"] },
  { key: "category", label: "Category", type: "text" },
  { key: "estimated_price", label: "Estimated Price", type: "number" },
  { key: "raised_amount", label: "Raised Amount", type: "number" },
  { key: "cap_reached_at", label: "Cap Reached At", type: "text" },
  // Metaplex Token Metadata limits (enforced on-chain at create-token):
  //   - name (coin_name) ≤ 32 chars
  //   - symbol (ticker)  ≤ 10 chars
  // Dépasser donne `Symbol too long` / `Name too long` à la simulation.
  // On limite ici pour bloquer la saisie avant le launch.
  { key: "coin_name", label: "Coin Name (max 32)", type: "text", maxLength: 32 },
  { key: "ticker", label: "Ticker (max 10)", type: "text", maxLength: 10 },
  { key: "token_address", label: "Token Address", type: "text" },
  { key: "timeline_phase", label: "Timeline Phase", type: "number_select", options: ["0|Idea Created", "1|Start Funding", "2|Funding Reached", "3|Token Launch", "4|Hackathon Starts", "5|Market Decides"] },
  { key: "generated_image_url", label: "Image URL", type: "text" },
  { key: "treasury_wallet", label: "Treasury Wallet (40% fees)", type: "text" },
  { key: "legends_url", label: "Legends URL", type: "text" },
  { key: "superteam_url", label: "Superteam URL", type: "text" },
  // Fee distribution
  { key: "ideator_wallet", label: "Ideator Wallet (for claiming 10% fees)", type: "text" },
  // Pool & fee infrastructure (set by deploy-pools)
  { key: "pool_omnipair", label: "Pool Omnipair", type: "text" },
  { key: "pool_dammv2_1", label: "Pool DAMMv2 #1 (Combinator)", type: "text" },
  { key: "pool_dammv2_2", label: "Pool DAMMv2 #2 (Single-sided)", type: "text" },
  { key: "fee_wallet", label: "Fee Wallet (derived)", type: "text" },
  { key: "ideator_fee_wallet", label: "Ideator Fee Wallet (derived, holds 10%)", type: "text" },
  { key: "buyback_wallet", label: "Buyback Wallet (derived)", type: "text" },
] as const

const IdeaEditor = ({ ideaId, onBack }: IdeaEditorProps) => {
  const { auth } = useAuthContext()
  const [activeTab, setActiveTab] = useState<Tab>("form")
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("bo_api_key") || "")
  const [launchLoading, setLaunchLoading] = useState<string | null>(null)
  const [launchResults, setLaunchResults] = useState<Record<string, { success: boolean; data?: unknown; error?: string }>>({})
  const [liquidityPercent, setLiquidityPercent] = useState(20)
  const [treasuryPercent, setTreasuryPercent] = useState(80)
  const [feesLoading, setFeesLoading] = useState(false)
  const [feesAmountUsdc, setFeesAmountUsdc] = useState("")
  const [feesResult, setFeesResult] = useState<{ success: boolean; data?: unknown; error?: string } | null>(null)
  const [distributeLoading, setDistributeLoading] = useState(false)
  const [distributeAmount, setDistributeAmount] = useState("")
  const [distributeSource, setDistributeSource] = useState<"admin_usdc" | "admin_usdg" | "fee_wallet_usdc" | "fee_wallet_usdg">("admin_usdc")
  const [distributeResult, setDistributeResult] = useState<{ success: boolean; data?: unknown; error?: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryFn: () => {
      if (!auth) throw new Error("Not authenticated")
      return backendSparkApi.adminGetIdea(auth, ideaId)
    },
    queryKey: ["admin-getIdea", ideaId],
    enabled: !!auth,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (data?.idea) {
      setFormData(data.idea)
      setJsonText(JSON.stringify(data.idea, null, 2))
    }
  }, [data])

  const { mutate: saveIdea, isPending: isSaving } = useMutation({
    mutationFn: async (updatedData: Record<string, unknown>) => {
      if (!auth) throw new Error("Not authenticated")
      const { id, ...fields } = updatedData
      return backendSparkApi.adminUpdateIdea(auth, ideaId, fields as Record<string, string | number | null>)
    },
    onSuccess: () => {
      toast.success("Idea updated successfully")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update idea")
    },
  })

  const handleFormFieldChange = (key: string, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleFormSave = () => {
    saveIdea(formData)
  }

  const handleJsonSave = () => {
    try {
      const parsed = JSON.parse(jsonText)
      setJsonError(null)
      setFormData(parsed)
      saveIdea(parsed)
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON")
    }
  }

  const handleTabSwitch = (tab: Tab) => {
    if (tab === "json") {
      setJsonText(JSON.stringify(formData, null, 2))
      setJsonError(null)
    } else if (tab === "form") {
      try {
        const parsed = JSON.parse(jsonText)
        setFormData(parsed)
        setJsonError(null)
      } catch {
        // Keep current formData if JSON is invalid
      }
    }
    setActiveTab(tab)
  }

  const handleApiKeyChange = (key: string) => {
    setApiKey(key)
    localStorage.setItem("bo_api_key", key)
  }

  type LaunchStep = {
    key: string
    label: string
    run: () => Promise<unknown>
  }

  const LAUNCH_STEPS: LaunchStep[] = [
    {
      key: "create-token",
      label: "Create Token",
      run: () => fetchLaunch("POST", "/api/admin/launch/create-token", { ideaId, tokenConfig: { suffix: "spk", prefix: "", caseInsensitive: false }, liquidityPercent: liquidityPercent / 100 }),
    },
    {
      key: "withdraw-and-swap",
      label: "Withdraw & Swap",
      run: () => fetchLaunch("POST", "/api/admin/launch/withdraw-and-swap", { ideaId, liquidityPercent: liquidityPercent / 100, treasuryPercent: treasuryPercent / 100 }),
    },
    {
      key: "deploy-pools",
      label: "Deploy Pools",
      run: () => fetchLaunch("POST", "/api/admin/launch/deploy-pools", { ideaId, liquidityPercent: liquidityPercent / 100, treasuryPercent: treasuryPercent / 100 }),
    },
    {
      key: "idea-allocation",
      label: "Compute Allocation",
      run: () => fetchLaunch("GET", `/api/idea-allocation?ideaId=${ideaId}`),
    },
    {
      key: "airdrop-tokens",
      label: "Airdrop Tokens",
      run: async () => {
        const allocationResult = launchResults["idea-allocation"]
        if (!allocationResult?.success || !allocationResult.data) {
          throw new Error("Run Compute Allocation first")
        }
        const data = allocationResult.data as { allocations?: Array<{ wallet: string; tokens: number; percentage?: number }>; totalTokenGiven?: number }
        if (!data.allocations || !data.totalTokenGiven) {
          throw new Error("No allocations found in previous result")
        }
        const tokenAddress = (formData.token_address as string) || ""
        if (!tokenAddress) {
          throw new Error("No token_address on this idea")
        }
        return fetchLaunch("POST", `/api/admin/airdrop-tokens?tokenAddress=${tokenAddress}`, {
          allocations: data.allocations,
          totalTokenGiven: data.totalTokenGiven,
        })
      },
    },
    {
      key: "finalize",
      label: "Finalize",
      run: () => fetchLaunch("POST", "/api/admin/launch/finalize", { ideaId }),
    },
  ]

  const fetchLaunch = async (method: "GET" | "POST", url: string, body?: unknown) => {
    const headers: Record<string, string> = { Authorization: apiKey }
    const opts: RequestInit = { method, headers }
    if (method === "POST" && body) {
      headers["Content-Type"] = "application/json"
      opts.body = JSON.stringify(body)
    }
    const response = await fetch(url, opts)
    const data = await response.json()
    if (!response.ok) {
      throw new Error((data as { error?: string; message?: string }).error || (data as { message?: string }).message || "Failed")
    }
    return data
  }

  const handleLaunchStep = async (step: LaunchStep) => {
    if (!apiKey) {
      toast.error("API key is required")
      return
    }
    setLaunchLoading(step.key)
    setLaunchResults((prev) => ({ ...prev, [step.key]: undefined as unknown as { success: boolean } }))
    try {
      const data = await step.run()
      setLaunchResults((prev) => ({ ...prev, [step.key]: { success: true, data } }))
      // Sync formData with fields returned by launch steps
      if (step.key === "create-token" && (data as { mintAddress?: string }).mintAddress) {
        setFormData((prev) => ({ ...prev, token_address: (data as { mintAddress: string }).mintAddress }))
      }
      toast.success(`${step.label}: Success`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error"
      setLaunchResults((prev) => ({ ...prev, [step.key]: { success: false, error: msg } }))
      toast.error(`${step.label}: ${msg}`)
    } finally {
      setLaunchLoading(null)
    }
  }

  /**
   * Lance la séquence complète en un seul appel HTTP via le wrapper
   * `/api/admin/launch-idea` (chain mode). ~3-5 min wall-clock vs
   * 6 clics manuels. Idempotent : skip les steps déjà faits, donc
   * safe de cliquer même si on a déjà fait quelques steps à la main.
   *
   * En cas d'échec mid-run, le serveur stamp `launch_error` + retourne
   * les steps faits jusque-là — on relit le state via fetchIdea() pour
   * afficher le panel rouge en haut du tab Launch.
   */
  const handleLaunchAll = async () => {
    if (!apiKey) {
      toast.error("API key is required")
      return
    }
    if (!confirm("Launch all 5 steps in sequence (~3-5 min wall-clock) ?")) {
      return
    }
    setLaunchLoading("all")
    try {
      const headers: Record<string, string> = {
        Authorization: apiKey,
        "Content-Type": "application/json",
      }
      const response = await fetch("/api/admin/launch-idea", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ideaId,
          liquidityPercent: liquidityPercent / 100,
          treasuryPercent: treasuryPercent / 100,
        }),
      })
      const data = await response.json() as {
        success?: boolean
        ranSteps?: string[]
        skippedSteps?: string[]
        failedAt?: string
        error?: string
      }
      if (!response.ok || !data.success) {
        const where = data.failedAt ? ` at ${data.failedAt}` : ""
        toast.error(`Launch failed${where}: ${data.error ?? response.status}`)
        // Sync l'UI avec le résultat partiel — chaque step ran est
        // marqué success, le step failedAt est marqué error.
        if (data.ranSteps) {
          for (const s of data.ranSteps) {
            setLaunchResults((prev) => ({ ...prev, [s]: { success: true, data: { chained: true } } }))
          }
        }
        if (data.failedAt) {
          setLaunchResults((prev) => ({ ...prev, [data.failedAt!]: { success: false, error: data.error } }))
        }
      } else {
        toast.success(`Launched ! ${data.ranSteps?.length ?? 0} steps run, ${data.skippedSteps?.length ?? 0} skipped`)
        // Marque tous les 6 steps en success dans l'UI.
        for (const k of ["create-token", "withdraw-and-swap", "deploy-pools", "idea-allocation", "airdrop-tokens", "finalize"]) {
          setLaunchResults((prev) => ({ ...prev, [k]: { success: true, data: { chained: true } } }))
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error"
      toast.error(`Launch failed: ${msg}`)
    } finally {
      setLaunchLoading(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex w-full justify-center py-20">
        <span className="text-fg-secondary">Loading idea...</span>
      </div>
    )
  }

  return (
    <main className="z-[10] flex h-full w-full max-w-full flex-col items-center gap-6 py-[100px] font-normal text-fg-primary lg:py-[20px]">
      <div className="flex w-full max-w-4xl items-center justify-between">
        <Button btnText="Back to list" size="sm" color="tertiary" onClick={onBack} />
        <h1 className="text-xl font-semibold">
          {(formData.title as string) || "Edit Idea"}
        </h1>
        <div className="w-[100px]" />
      </div>

      {/* Tabs */}
      <div className="flex w-full max-w-4xl gap-2 border-b border-bd-secondary/20 pb-0">
        <button
          onClick={() => handleTabSwitch("form")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "form"
              ? "border-b-2 border-brand-primary text-brand-primary"
              : "text-fg-secondary hover:text-fg-primary"
          }`}
        >
          Form
        </button>
        <button
          onClick={() => handleTabSwitch("json")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "json"
              ? "border-b-2 border-brand-primary text-brand-primary"
              : "text-fg-secondary hover:text-fg-primary"
          }`}
        >
          JSON
        </button>
        <button
          onClick={() => handleTabSwitch("launch")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "launch"
              ? "border-b-2 border-brand-primary text-brand-primary"
              : "text-fg-secondary hover:text-fg-primary"
          }`}
        >
          Launch
        </button>
        <button
          onClick={() => handleTabSwitch("fees")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "fees"
              ? "border-b-2 border-brand-primary text-brand-primary"
              : "text-fg-secondary hover:text-fg-primary"
          }`}
        >
          Fees
        </button>
      </div>

      {/* Form Tab */}
      {activeTab === "form" && (
        <div className="flex w-full max-w-4xl flex-col gap-4">
          {FORM_FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <label className="text-sm font-medium text-fg-secondary">{field.label}</label>
              {field.type === "textarea" ? (
                <textarea
                  value={(formData[field.key] as string) ?? ""}
                  onChange={(e) => handleFormFieldChange(field.key, e.target.value)}
                  rows={4}
                  className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                />
              ) : field.type === "select" ? (
                <select
                  value={(formData[field.key] as string) ?? ""}
                  onChange={(e) => handleFormFieldChange(field.key, e.target.value)}
                  className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                >
                  <option value="">--</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === "number_select" ? (
                <select
                  value={String(formData[field.key] ?? "")}
                  onChange={(e) => handleFormFieldChange(field.key, e.target.value === "" ? null : Number(e.target.value))}
                  className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                >
                  <option value="">--</option>
                  {field.options.map((opt) => {
                    const [val, label] = opt.split("|")
                    return (
                      <option key={val} value={val}>
                        {val} - {label}
                      </option>
                    )
                  })}
                </select>
              ) : field.type === "number" ? (
                <input
                  type="number"
                  value={(formData[field.key] as number) ?? ""}
                  onChange={(e) => {
                    const val = e.target.value
                    handleFormFieldChange(field.key, val === "" ? null : Number(val))
                  }}
                  className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                />
              ) : field.type === "readonly" ? (
                <input
                  type="text"
                  value={(formData[field.key] as string) ?? "—"}
                  readOnly
                  className="rounded-lg border border-bd-secondary/10 bg-bg-secondary/30 px-3 py-2 text-sm text-fg-secondary cursor-not-allowed focus:outline-none"
                />
              ) : (
                (() => {
                  // Pour les champs texte, on supporte un `maxLength`
                  // optionnel. Si présent : `maxLength` natif HTML
                  // (bloque la saisie au-delà) + compteur visuel pour
                  // le user. Utilisé pour coin_name (32) et ticker (10)
                  // qui sont contraints par Metaplex Token Metadata.
                  const maxLen = (field as { maxLength?: number }).maxLength
                  const value = (formData[field.key] as string) ?? ""
                  return (
                    <>
                      <input
                        type="text"
                        value={value}
                        maxLength={maxLen}
                        onChange={(e) => handleFormFieldChange(field.key, e.target.value)}
                        className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                      />
                      {maxLen !== undefined && (
                        <span className={`text-[10px] mt-1 ${
                          value.length >= maxLen ? "text-amber-400" : "text-fg-secondary"
                        }`}>
                          {value.length} / {maxLen}
                        </span>
                      )}
                    </>
                  )
                })()
              )}
            </div>
          ))}
          <div className="flex justify-end pt-4">
            <Button
              btnText={isSaving ? "Saving..." : "Save"}
              size="sm"
              onClick={handleFormSave}
              disabled={isSaving}
            />
          </div>
        </div>
      )}

      {/* JSON Tab */}
      {activeTab === "json" && (
        <div className="flex w-full max-w-4xl flex-col gap-4">
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value)
              setJsonError(null)
            }}
            rows={30}
            spellCheck={false}
            className="w-full rounded-lg border border-bd-secondary/30 bg-transparent px-4 py-3 font-mono text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
          />
          {jsonError && (
            <span className="text-sm text-red-500">JSON Error: {jsonError}</span>
          )}
          <div className="flex justify-end">
            <Button
              btnText={isSaving ? "Saving..." : "Save"}
              size="sm"
              onClick={handleJsonSave}
              disabled={isSaving}
            />
          </div>
        </div>
      )}

      {/* Fees Tab */}
      {activeTab === "fees" && (
        <div className="flex w-full max-w-4xl flex-col gap-6">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-fg-secondary">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="Enter your API key"
              className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
            />
          </div>

          {/* Fee tracking from idea data */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-bd-secondary/20 p-4">
              <p className="text-xs text-fg-secondary mb-1">Total Collected</p>
              <p className="text-lg font-semibold text-fg-primary">${((formData.total_fees_collected as number) || 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-bd-secondary/20 p-4">
              <p className="text-xs text-fg-secondary mb-1">Ideator Available</p>
              <p className="text-lg font-semibold text-green-400">${((formData.ideator_fees_available as number) || 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-bd-secondary/20 p-4">
              <p className="text-xs text-fg-secondary mb-1">Ideator Claimed</p>
              <p className="text-lg font-semibold text-orange-400">${((formData.ideator_fees_claimed as number) || 0).toFixed(2)}</p>
            </div>
          </div>

          {/* Wallets */}
          <div className="rounded-lg border border-bd-secondary/20 p-4 space-y-2">
            <p className="text-xs font-medium text-fg-secondary uppercase tracking-wide mb-2">Wallets</p>
            {[
              { label: "Fee Wallet", value: formData.fee_wallet as string },
              { label: "Ideator Fee Wallet (10%)", value: formData.ideator_fee_wallet as string },
              { label: "Treasury Wallet (40%)", value: formData.treasury_wallet as string },
              { label: "Buyback Wallet (10%)", value: formData.buyback_wallet as string },
              { label: "Ideator Wallet (claims from)", value: formData.ideator_wallet as string },
            ].map((w) => (
              <div key={w.label} className="flex items-center justify-between">
                <span className="text-xs text-fg-secondary">{w.label}</span>
                <span className="text-xs font-mono text-fg-primary">{w.value || "—"}</span>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <span className="text-xs text-fg-secondary">Spark DAO (40%)</span>
              <span className="text-xs font-mono text-fg-primary">SPArkpYRXZr2oepZp6DpG8W6oq7DFYhmVFNEqHfhcZc</span>
            </div>
          </div>

          {/* Claim & Distribute */}
          <div className="rounded-lg border border-bd-secondary/20 p-4">
            <p className="text-sm font-medium text-fg-primary mb-3">Claim & Distribute Fees</p>
            <div className="flex items-end gap-3">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs text-fg-secondary">Amount USDC to distribute</label>
                <input
                  type="number"
                  value={feesAmountUsdc}
                  onChange={(e) => setFeesAmountUsdc(e.target.value)}
                  placeholder="Leave empty to just claim"
                  className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                />
              </div>
              <Button
                btnText={feesLoading ? "Running..." : "Claim Fees"}
                size="sm"
                onClick={async () => {
                  if (!apiKey) { toast.error("API key is required"); return }
                  setFeesLoading(true)
                  setFeesResult(null)
                  try {
                    const body: Record<string, unknown> = { ideaId }
                    if (feesAmountUsdc) body.amountUsdc = Number(feesAmountUsdc)
                    const response = await fetch("/api/admin/claim-project-fees", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: apiKey },
                      body: JSON.stringify(body),
                    })
                    const data = await response.json()
                    if (!response.ok) {
                      setFeesResult({ success: false, error: (data as { error?: string }).error || "Failed" })
                      toast.error((data as { error?: string }).error || "Failed")
                    } else {
                      setFeesResult({ success: true, data })
                      toast.success("Fees claimed successfully")
                    }
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Network error"
                    setFeesResult({ success: false, error: msg })
                    toast.error(msg)
                  } finally {
                    setFeesLoading(false)
                  }
                }}
                disabled={feesLoading}
              />
            </div>
            {feesResult?.success && (
              <pre className="mt-3 max-h-48 overflow-auto rounded bg-green-500/10 px-3 py-2 text-xs text-green-400">
                {JSON.stringify(feesResult.data, null, 2)}
              </pre>
            )}
            {feesResult && !feesResult.success && (
              <p className="mt-3 text-xs text-red-400">{feesResult.error}</p>
            )}
          </div>

          {/* Distribute Fees */}
          <div className="rounded-lg border border-bd-secondary/20 p-4">
            <p className="text-sm font-medium text-fg-primary mb-3">Distribute Fees</p>
            <div className="flex flex-col gap-3">
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-fg-secondary">Source</label>
                  <select
                    value={distributeSource}
                    onChange={(e) => setDistributeSource(e.target.value as "admin_usdc" | "admin_usdg" | "fee_wallet_usdc" | "fee_wallet_usdg")}
                    className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                  >
                    <option value="admin_usdc">Admin Wallet USDC</option>
                    <option value="admin_usdg">Admin Wallet USDG</option>
                    <option value="fee_wallet_usdc">Fee Wallet USDC</option>
                    <option value="fee_wallet_usdg">Fee Wallet USDG</option>
                  </select>
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-xs text-fg-secondary">
                    Amount ({distributeSource.endsWith("_usdc") ? "USDC" : "USDG"})
                  </label>
                  <input
                    type="number"
                    value={distributeAmount}
                    onChange={(e) => setDistributeAmount(e.target.value)}
                    placeholder="e.g. 100"
                    className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                  />
                </div>
                <Button
                  btnText={distributeLoading ? "Running..." : "Distribute"}
                  size="sm"
                  onClick={async () => {
                    if (!apiKey) { toast.error("API key is required"); return }
                    if (!distributeAmount || Number(distributeAmount) <= 0) { toast.error("Amount is required"); return }
                    setDistributeLoading(true)
                    setDistributeResult(null)
                    try {
                      const response = await fetch("/api/admin/distribute-fees", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: apiKey },
                        body: JSON.stringify({ ideaId, amount: Number(distributeAmount), source: distributeSource }),
                      })
                      const data = await response.json()
                      if (!response.ok) {
                        setDistributeResult({ success: false, error: (data as { error?: string }).error || "Failed" })
                        toast.error((data as { error?: string }).error || "Failed")
                      } else {
                        setDistributeResult({ success: true, data })
                        toast.success("Fees distributed successfully")
                      }
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : "Network error"
                      setDistributeResult({ success: false, error: msg })
                      toast.error(msg)
                    } finally {
                      setDistributeLoading(false)
                    }
                  }}
                  disabled={distributeLoading}
                />
              </div>
            </div>
            {distributeResult?.success && (
              <pre className="mt-3 max-h-48 overflow-auto rounded bg-green-500/10 px-3 py-2 text-xs text-green-400">
                {JSON.stringify(distributeResult.data, null, 2)}
              </pre>
            )}
            {distributeResult && !distributeResult.success && (
              <p className="mt-3 text-xs text-red-400">{distributeResult.error}</p>
            )}
          </div>
        </div>
      )}

      {/* Launch Tab */}
      {activeTab === "launch" && (
        <div className="flex w-full max-w-4xl flex-col gap-6">
          {/*
            Auto-launch status panel — visibilité sur ce que fait
            (ou a fait) le worker `schedulerLaunchIdea`. Champs lus
            depuis `idea.data` (mis à jour par /api/admin/scheduled-launch
            à chaque tick). Les 6 boutons manuels en dessous restent en
            place comme fallback.
          */}
          {(Boolean(formData.launching_started_at) || Boolean(formData.launched_at)) && (
            <div className="flex flex-col gap-2">
              {formData.launched_at ? (
                <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-sm">
                  <div className="font-semibold text-green-300">
                    Idea launched ✓
                  </div>
                  <div className="mt-1 text-xs text-fg-secondary">
                    Completed at {String(formData.launched_at)}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                  <div className="font-semibold text-amber-300">
                    Auto-launch in progress
                  </div>
                  <div className="mt-1 text-xs text-fg-secondary">
                    Started: {String(formData.launching_started_at)}
                  </div>
                  <div className="text-xs text-fg-secondary">
                    Step: {String(formData.launch_step ?? "—")}
                  </div>
                  {formData.launch_error ? (
                    <div className="mt-2 break-all text-xs text-red-400">
                      Error: {String(formData.launch_error)}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-fg-secondary">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="Enter your API key"
              className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-fg-secondary">Distribution</label>
            <div className="flex items-center gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-fg-secondary">Liquidity %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={liquidityPercent}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setLiquidityPercent(val)
                    setTreasuryPercent(100 - val)
                  }}
                  className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-fg-secondary">Treasury %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={treasuryPercent}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setTreasuryPercent(val)
                    setLiquidityPercent(100 - val)
                  }}
                  className="rounded-lg border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                />
              </div>
            </div>
            {liquidityPercent + treasuryPercent !== 100 && (
              <p className="text-xs text-red-400">Liquidity + Treasury must equal 100%</p>
            )}
          </div>

          {/* All-in-one launcher — hit /api/admin/launch-idea qui chaîne
              les 5 steps en séquence (~3-5 min wall-clock). Idempotent :
              skip les steps déjà faits, donc safe de cliquer même après
              avoir lancé quelques steps manuellement. */}
          <div className="flex flex-col gap-2 rounded-lg border border-brand-primary/30 bg-brand-primary/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-fg-primary">
                  Launch all (one-shot)
                </span>
                <span className="text-xs text-fg-secondary">
                  Run all 5 steps in sequence (~3-5 min). Skip ceux déjà faits.
                </span>
              </div>
              <Button
                btnText={launchLoading === "all" ? "Running…" : "Launch all"}
                size="md"
                color="primary"
                onClick={handleLaunchAll}
                disabled={
                  !apiKey ||
                  launchLoading !== null ||
                  liquidityPercent + treasuryPercent !== 100 ||
                  Boolean(formData.launched_at)
                }
              />
            </div>
            {Boolean(formData.launched_at) && (
              <p className="text-xs text-green-400">
                Already launched at {String(formData.launched_at)}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-xs uppercase tracking-wider text-fg-secondary">
              Or run step by step
            </div>
            {LAUNCH_STEPS.map((step, idx) => {
              const result = launchResults[step.key]
              return (
                <div key={step.key} className="flex items-center gap-4 rounded-lg border border-bd-secondary/20 p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bd-secondary/20 text-xs font-semibold text-fg-secondary">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-fg-primary">{step.label}</p>
                    {result?.success && (
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-green-500/10 px-2 py-1 text-xs text-green-400">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    )}
                    {result && !result.success && (
                      <p className="mt-1 text-xs text-red-400">{result.error}</p>
                    )}
                  </div>
                  <Button
                    btnText={launchLoading === step.key ? "Running..." : "Run"}
                    size="sm"
                    onClick={() => handleLaunchStep(step)}
                    disabled={launchLoading !== null}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </main>
  )
}

export default IdeaEditor
