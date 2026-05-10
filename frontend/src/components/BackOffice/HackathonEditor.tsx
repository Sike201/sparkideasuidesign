import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { backendSparkApi, HackathonModel, HackathonProposalModel, IdeaModel } from "@/data/api/backendSparkApi"
import { useAuthContext } from "@/hooks/useAuthContext"
import { Button } from "../Button/Button"
import { toast } from "react-toastify"
import DateTimeField from "../InputField/DateTimeField"

type HackathonEditorProps = {
  hackathonId: string | null // null = create mode
  onBack: () => void
}

type Tab = "form" | "proposals" | "json"

const STATUS_OPTIONS = ["upcoming", "open", "voting", "completed"] as const

const HackathonEditor = ({ hackathonId, onBack }: HackathonEditorProps) => {
  const { auth } = useAuthContext()
  const isEditMode = !!hackathonId
  const [activeTab, setActiveTab] = useState<Tab>("form")
  const [formData, setFormData] = useState<Record<string, unknown>>({
    idea_slug: "",
    idea_title: "",
    idea_image_url: "",
    category: "",
    usdg_amount: 0,
    status: "upcoming",
    countdown_target: "",
    start_date: "",
    end_date: "",
    rules_md: "",
    what_is_expected_md: "",
    combinator_chart_url: "",
    combinator_trade_url: "",
    combinator_proposal_pda: "",
    dao_pda: "",
    // Comma-separated option labels for the decision market, e.g.
    // "No, Alice, Bob". Persisted to the DB as a JSON array string. Empty
    // string = don't override (falls back to proposals or "Option N").
    combinator_option_labels: "",
  })
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [ideaSearch, setIdeaSearch] = useState("")

  // Fetch existing hackathon data (edit mode)
  const { data: hackathonData, isLoading } = useQuery({
    queryFn: () => backendSparkApi.getHackathon(hackathonId!),
    queryKey: ["admin-getHackathon", hackathonId],
    enabled: isEditMode,
    refetchOnWindowFocus: false,
  })

  // Fetch ideas for linking
  const { data: ideasData } = useQuery({
    queryFn: () => backendSparkApi.getIdeas({ limit: 500 }),
    queryKey: ["admin-getAllIdeas-for-hackathon"],
    refetchOnWindowFocus: false,
  })

  const ideas = ideasData?.ideas || []
  const filteredIdeas = ideaSearch.trim()
    ? ideas.filter((i) => i.title.toLowerCase().includes(ideaSearch.toLowerCase()))
    : ideas

  // Populate form when editing
  useEffect(() => {
    if (hackathonData?.hackathon) {
      const h = hackathonData.hackathon
      setFormData({
        idea_slug: h.idea_slug,
        idea_title: h.idea_title,
        idea_image_url: h.idea_image_url,
        usdg_amount: h.usdg_amount,
        status: h.status,
        countdown_target: h.countdown_target,
        start_date: h.start_date || "",
        end_date: h.end_date || "",
        rules_md: h.rules_md,
        what_is_expected_md: h.what_is_expected_md || "",
        combinator_chart_url: h.combinator_chart_url,
        combinator_trade_url: h.combinator_trade_url,
        combinator_proposal_pda: h.combinator_proposal_pda || "",
        dao_pda: h.dao_pda || "",
        // DB stores labels as a JSON array string; UI edits them as a
        // comma-separated string for a single friendly input. Accept both
        // shapes so legacy rows that already hold a raw array still load.
        combinator_option_labels: (() => {
          const raw = h.combinator_option_labels
          if (!raw) return ""
          try {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
            return Array.isArray(parsed) ? parsed.join(", ") : ""
          } catch {
            // Not JSON — assume user typed a bare comma-separated string.
            return typeof raw === "string" ? raw : ""
          }
        })(),
        category: h.category || "",
      })
      setJsonText(JSON.stringify(h, null, 2))
    }
  }, [hackathonData])

  /**
   * Convert the UI's comma-separated labels string to a JSON array string
   * the backend can store. Empty input → null so `json_set` clears the
   * field and the UI falls back to derivation from `proposals`. Trims
   * each label and drops empties so "No, Alice, " produces ["No","Alice"].
   */
  const serializeOptionLabels = (raw: unknown): string | null => {
    if (typeof raw !== "string") return null
    const labels = raw
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0)
    return labels.length > 0 ? JSON.stringify(labels) : null
  }

  // Create mutation
  const { mutate: createHackathon, isPending: isCreating } = useMutation({
    mutationFn: async () => {
      if (!auth) throw new Error("Not authenticated")
      const { idea_slug, idea_title, idea_image_url, usdg_amount, status, countdown_target, start_date, end_date, rules_md, what_is_expected_md, combinator_chart_url, combinator_trade_url, combinator_proposal_pda } = formData
      return backendSparkApi.adminCreateHackathon(
        auth,
        {
          idea_slug: idea_slug as string,
          idea_title: idea_title as string,
          idea_image_url: idea_image_url as string,
          usdg_amount: Number(usdg_amount),
          status: status as HackathonModel["status"],
          countdown_target: countdown_target as string,
          start_date: (start_date as string) || "",
          end_date: (end_date as string) || "",
          rules_md: rules_md as string,
          what_is_expected_md: (what_is_expected_md as string) || "",
          combinator_chart_url: combinator_chart_url as string,
          combinator_trade_url: combinator_trade_url as string,
          combinator_proposal_pda: (combinator_proposal_pda as string) || "",
          dao_pda: (formData.dao_pda as string) || "",
          combinator_option_labels:
            serializeOptionLabels(formData.combinator_option_labels) || undefined,
          category: (formData.category as string) || "",
          milestone_split: [],
        },
        []
      )
    },
    onSuccess: () => {
      toast.success("Hackathon created successfully")
      onBack()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create hackathon")
    },
  })

  // Update mutation
  const { mutate: updateHackathon, isPending: isUpdating } = useMutation({
    mutationFn: async () => {
      if (!auth || !hackathonId) throw new Error("Not authenticated")
      const dataFields: Record<string, string | number | null> = {}
      for (const [key, value] of Object.entries(formData)) {
        if (key === "combinator_option_labels") {
          // UI holds a comma-separated string; DB needs a JSON array
          // string (or null to clear the field and fall back to proposals).
          dataFields[key] = serializeOptionLabels(value)
          continue
        }
        dataFields[key] = value as string | number | null
      }
      return backendSparkApi.adminUpdateHackathon(
        auth,
        hackathonId,
        dataFields
      )
    },
    onSuccess: () => {
      toast.success("Hackathon updated successfully")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update hackathon")
    },
  })

  const handleFieldChange = (key: string, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSelectIdea = (idea: IdeaModel) => {
    setFormData((prev) => ({
      ...prev,
      idea_slug: idea.slug || "",
      idea_title: idea.title,
      idea_image_url: idea.generated_image_url || "",
      category: idea.category || "",
    }))
    setIdeaSearch("")
  }

  const handleSave = () => {
    if (isEditMode) {
      updateHackathon()
    } else {
      createHackathon()
    }
  }

  const handleTabSwitch = (tab: Tab) => {
    if (tab === "json") {
      setJsonText(JSON.stringify(formData, null, 2))
      setJsonError(null)
    }
    setActiveTab(tab)
  }

  const handleJsonSave = () => {
    try {
      const parsed = JSON.parse(jsonText)
      setJsonError(null)
      setFormData(parsed)
      if (isEditMode) {
        updateHackathon()
      }
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON")
    }
  }

  if (isLoading && isEditMode) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <span className="text-fg-secondary">Loading hackathon...</span>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4 px-4 py-[100px] lg:py-[20px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button btnText="Back" color="tertiary" size="sm" onClick={onBack} />
        <h2 className="text-xl font-semibold text-fg-primary">
          {isEditMode ? `Edit Hackathon` : "New Hackathon"}
        </h2>
        <Button
          btnText={isCreating || isUpdating ? "Saving..." : "Save"}
          size="sm"
          onClick={handleSave}
          disabled={isCreating || isUpdating}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-bd-secondary/20">
        {(["form", ...(isEditMode ? ["proposals"] : []), "json"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabSwitch(tab)}
            className={`px-4 py-2 text-sm capitalize transition-colors ${
              activeTab === tab
                ? "border-b-2 border-brand-primary text-fg-primary"
                : "text-fg-secondary hover:text-fg-primary"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Form Tab */}
      {activeTab === "form" && (
        <div className="flex flex-col gap-4">
          {/* Idea Selector */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase text-fg-secondary">Link to Idea</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search ideas..."
                value={ideaSearch}
                onChange={(e) => setIdeaSearch(e.target.value)}
                className="w-full rounded border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary placeholder:text-fg-secondary/50 focus:border-brand-primary/50 focus:outline-none"
              />
              {ideaSearch && filteredIdeas.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border border-bd-secondary/30 bg-secondary">
                  {filteredIdeas.slice(0, 10).map((idea) => (
                    <button
                      key={idea.id}
                      onClick={() => handleSelectIdea(idea)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg-primary hover:bg-brand-primary/10"
                    >
                      {idea.generated_image_url && (
                        <img src={idea.generated_image_url} alt="" className="h-6 w-6 rounded object-cover" />
                      )}
                      <span className="truncate">{idea.title}</span>
                      <span className="ml-auto text-xs text-fg-secondary">{idea.status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {formData.idea_title ? (
              <p className="text-xs text-brand-primary">
                Linked: {String(formData.idea_title)}
              </p>
            ) : null}
          </div>

          {/* Fields */}
          {[
            { key: "idea_slug", label: "Idea Slug", type: "text" },
            { key: "idea_title", label: "Idea Title", type: "text" },
            { key: "idea_image_url", label: "Idea Image URL", type: "text" },
            { key: "category", label: "Category (auto from idea)", type: "text" },
            { key: "usdg_amount", label: "USDG Amount", type: "number" },
            { key: "status", label: "Status", type: "select" },
            { key: "rules_md", label: "Rules (Markdown)", type: "textarea" },
            { key: "what_is_expected_md", label: "What is Expected (Markdown)", type: "textarea" },
            { key: "combinator_chart_url", label: "Combinator Chart URL", type: "text" },
            { key: "combinator_trade_url", label: "Combinator Trade URL", type: "text" },
            { key: "combinator_proposal_pda", label: "Combinator Proposal PDA", type: "text" },
            { key: "dao_pda", label: "DAO PDA (Combinator)", type: "text" },
            {
              key: "combinator_option_labels",
              label: "Option Labels (comma-separated, e.g. \"No, Alice, Bob\")",
              type: "text",
            },
            {
              // Custom title for the decision proposal — surfaced on
              // the mini-app idea page as the collapsible section
              // header. Falls back to "Select the builder of $TICKER"
              // if empty (resolved client-side, no need to seed every
              // hackathon row).
              key: "decision_proposal_title",
              label: "Decision Proposal Title (e.g. \"Select the builder of $PREDICT\")",
              type: "text",
            },
          ].map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <label className="text-xs font-medium uppercase text-fg-secondary">{field.label}</label>
              {field.type === "select" ? (
                <select
                  value={(formData[field.key] as string) || ""}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  className="rounded border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} className="bg-secondary">
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  value={(formData[field.key] as string) || ""}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  rows={6}
                  className="rounded border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary placeholder:text-fg-secondary/50 focus:border-brand-primary/50 focus:outline-none"
                />
              ) : field.type === "number" ? (
                <input
                  type="number"
                  value={(formData[field.key] as number) ?? ""}
                  onChange={(e) => handleFieldChange(field.key, e.target.value ? Number(e.target.value) : null)}
                  className="rounded border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                />
              ) : (
                <input
                  type="text"
                  value={(formData[field.key] as string) || ""}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  className="rounded border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                />
              )}
            </div>
          ))}

          {/* Start Date */}
          <DateTimeField
            label="Start Date"
            value={formData.start_date ? new Date(formData.start_date as string) : null}
            onChange={(date) => {
              handleFieldChange("start_date", date ? date.toISOString() : "")
            }}
          />

          {/* End Date */}
          <DateTimeField
            label="End Date"
            value={formData.end_date ? new Date(formData.end_date as string) : null}
            onChange={(date) => {
              handleFieldChange("end_date", date ? date.toISOString() : "")
              // Also set countdown_target to end_date for backward compat
              handleFieldChange("countdown_target", date ? date.toISOString() : "")
            }}
          />
        </div>
      )}

      {/* Proposals Tab */}
      {activeTab === "proposals" && hackathonId && (
        <ProposalsSection hackathonId={hackathonId} />
      )}

      {/* JSON Tab */}
      {activeTab === "json" && (
        <div className="flex flex-col gap-2">
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={30}
            className="w-full rounded border border-bd-secondary/30 bg-transparent p-3 font-mono text-xs text-fg-primary focus:border-brand-primary/50 focus:outline-none"
          />
          {jsonError && (
            <p className="text-sm text-red-400">{jsonError}</p>
          )}
          <Button
            btnText="Save JSON"
            size="sm"
            onClick={handleJsonSave}
          />
        </div>
      )}
    </div>
  )
}

/* ── Proposals Section ──────────────────────────────────────── */

function ProposalsSection({ hackathonId }: { hackathonId: string }) {
  const { auth } = useAuthContext()
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Record<string, string | null>>({})

  const { data: hackathonData, isLoading } = useQuery({
    queryFn: () => backendSparkApi.getHackathon(hackathonId),
    queryKey: ["admin-hackathon-proposals", hackathonId],
    refetchOnWindowFocus: false,
  })

  const proposals = (hackathonData?.hackathon?.proposals || []) as HackathonProposalModel[]

  const { mutate: updateProposal, isPending: isUpdating } = useMutation({
    mutationFn: async () => {
      if (!auth || !editingId) throw new Error("Not authenticated")
      return backendSparkApi.adminUpdateProposal(auth, editingId, editData)
    },
    onSuccess: () => {
      toast.success("Proposal updated")
      setEditingId(null)
      setEditData({})
      queryClient.invalidateQueries({ queryKey: ["admin-hackathon-proposals", hackathonId] })
    },
    onError: (e) => toast.error(e.message || "Failed to update"),
  })

  const { mutate: deleteProposal } = useMutation({
    mutationFn: async (proposalId: string) => {
      if (!auth) throw new Error("Not authenticated")
      return backendSparkApi.adminDeleteProposal(auth, proposalId)
    },
    onSuccess: () => {
      toast.success("Proposal deleted")
      queryClient.invalidateQueries({ queryKey: ["admin-hackathon-proposals", hackathonId] })
    },
    onError: (e) => toast.error(e.message || "Failed to delete"),
  })

  const startEditing = (p: HackathonProposalModel) => {
    setEditingId(p.id)
    setEditData({
      title: p.title,
      description_md: p.description_md,
      approach_md: p.approach_md,
      timeline_md: p.timeline_md,
      github_url: p.github_url,
      demo_url: p.demo_url,
    })
  }

  const toggleShortlist = async (proposalId: string, currentValue: number | null) => {
    if (!auth) return
    const newValue = currentValue ? 0 : 1
    try {
      await backendSparkApi.adminUpdateProposal(auth, proposalId, { shortlisted: newValue })
      toast.success(newValue ? "Shortlisted!" : "Removed from shortlist")
      queryClient.invalidateQueries({ queryKey: ["admin-hackathon-proposals", hackathonId] })
    } catch (e: any) {
      toast.error(e.message || "Failed to update")
    }
  }

  if (isLoading) return <p className="text-fg-secondary text-sm py-8 text-center">Loading proposals...</p>
  if (proposals.length === 0) return <p className="text-fg-secondary text-sm py-8 text-center">No proposals yet</p>

  const shortlistedCount = proposals.filter((p) => p.shortlisted).length

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-secondary">
        {proposals.length} proposal{proposals.length !== 1 ? "s" : ""}
        {shortlistedCount > 0 && <span className="text-amber-400 ml-2">({shortlistedCount} shortlisted)</span>}
      </p>

      {proposals.map((p) => {
        const isEditing = editingId === p.id
        const builder = p.builder as any
        const isShortlisted = !!(p as any).shortlisted

        return (
          <div key={p.id} className={`rounded border p-4 ${isShortlisted ? "border-amber-500/60 bg-amber-500/5" : "border-bd-secondary/30"}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-semibold text-fg-primary">
                  @{builder?.username || "unknown"}
                </span>
                <span className="text-xs text-fg-secondary ml-2">{builder?.position || ""}</span>
              </div>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => toggleShortlist(p.id, (p as any).shortlisted)}
                  className={`text-xs px-2 py-1 rounded border transition-all ${
                    isShortlisted
                      ? "border-amber-500 text-amber-400 bg-amber-500/10"
                      : "border-bd-secondary/30 text-fg-secondary hover:border-amber-500/50 hover:text-amber-400"
                  }`}
                  title={isShortlisted ? "Remove from shortlist" : "Add to shortlist"}
                >
                  {isShortlisted ? "★ Shortlisted" : "☆ Shortlist"}
                </button>
                {!isEditing ? (
                  <>
                    <Button btnText="Edit" size="sm" color="tertiary" onClick={() => startEditing(p)} />
                    <Button
                      btnText="Delete"
                      size="sm"
                      color="tertiary"
                      onClick={() => {
                        if (confirm(`Delete proposal "${p.title}" by @${builder?.username}?`)) {
                          deleteProposal(p.id)
                        }
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Button btnText={isUpdating ? "Saving..." : "Save"} size="sm" onClick={() => updateProposal()} disabled={isUpdating} />
                    <Button btnText="Cancel" size="sm" color="tertiary" onClick={() => { setEditingId(null); setEditData({}) }} />
                  </>
                )}
              </div>
            </div>

            {/* Fields */}
            {isEditing ? (
              <div className="flex flex-col gap-3">
                {[
                  { key: "title", label: "Title", type: "text" },
                  { key: "description_md", label: "Description", type: "textarea" },
                  { key: "approach_md", label: "Approach", type: "textarea" },
                  { key: "timeline_md", label: "Timeline", type: "textarea" },
                  { key: "github_url", label: "GitHub URL", type: "text" },
                  { key: "demo_url", label: "Demo URL", type: "text" },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="text-xs font-medium uppercase text-fg-secondary">{field.label}</label>
                    {field.type === "textarea" ? (
                      <textarea
                        rows={3}
                        value={(editData[field.key] as string) || ""}
                        onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
                        className="w-full rounded border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={(editData[field.key] as string) || ""}
                        onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
                        className="w-full rounded border border-bd-secondary/30 bg-transparent px-3 py-2 text-sm text-fg-primary focus:border-brand-primary/50 focus:outline-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-fg-primary">{p.title}</p>
                {p.description_md && (
                  <p className="text-xs text-fg-secondary line-clamp-3">{p.description_md}</p>
                )}
                <div className="flex flex-wrap gap-3 text-xs text-fg-secondary mt-1">
                  {p.github_url && <span>GitHub: <a href={p.github_url} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">{p.github_url}</a></span>}
                  {p.demo_url && <span>Demo: <a href={p.demo_url} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">{p.demo_url}</a></span>}
                  <span>Submitted: {new Date(p.submitted_at).toLocaleDateString()}</span>
                  {p.market_odds != null && <span>Odds: {Math.round(p.market_odds * 100)}%</span>}
                </div>
                {/* Team members & milestones */}
                {p.team_members && (() => {
                  const tm = p.team_members as any
                  const members = Array.isArray(tm) ? tm : (tm?.members || [])
                  const milestones = Array.isArray(tm) ? [] : (tm?.milestones || [])
                  return (
                    <div className="flex flex-col gap-1 mt-1">
                      {members.length > 0 && (
                        <p className="text-xs text-fg-secondary">Team: {members.join(", ")}</p>
                      )}
                      {milestones.length > 0 && (
                        <div className="text-xs text-fg-secondary">
                          Milestones: {milestones.map((ms: any, i: number) => (
                            <span key={i} className="inline-block mr-2">
                              #{i + 1} {ms.title} {ms.amount && `($${ms.amount})`} {ms.deadline && `by ${ms.deadline}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default HackathonEditor
