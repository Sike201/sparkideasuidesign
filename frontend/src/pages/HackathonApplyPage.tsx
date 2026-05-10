import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import HackathonLayout from "@/components/Hackathon/HackathonLayout";
import { AsciiBox } from "@/components/Hackathon/AsciiBox";
import { getMockHackathon } from "@/components/Hackathon/mockData";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import { withSwrCache } from "@/utils/miniCache";
import { useWalletContext } from "@/hooks/useWalletContext";
import { LogIn } from "lucide-react";

export default function HackathonApplyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { address, isWalletConnected } = useWalletContext();

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["hackathon", id],
    // Shares the localStorage cache with `HackathonDetailPage`'s
    // identical query — visiting either page first warms the cache
    // for the other.
    ...withSwrCache(
      () => backendSparkApi.getHackathon(id!),
      `desktop_cache_hackathon_${id ?? "anon"}`,
      5 * 60_000,
    ),
    enabled: !!id,
    refetchOnWindowFocus: false,
  });

  const hackathon = apiData?.hackathon
    ? { ...apiData.hackathon, proposals: apiData.hackathon.proposals || [], milestones: apiData.hackathon.milestones || [] }
    : (id ? getMockHackathon(id) : undefined);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [approach, setApproach] = useState("");
  const [timeline, setTimeline] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [milestones, setMilestones] = useState<{ title: string; deadline: string; amount: string }[]>([
    { title: "", deadline: "", amount: "" },
  ]);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});

  const inputClass =
    "bg-transparent border border-[#333741] px-3 py-2 text-xs text-[#F5F5F6] focus:border-[#F25C05] outline-none transition-colors font-mono w-full placeholder:text-[#85888E] rounded-none";

  const labelClass =
    "text-[10px] text-[#85888E] uppercase tracking-widest mb-1 block";

  const handleAddMember = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && memberSearch.trim()) {
      e.preventDefault();
      const username = memberSearch.trim().replace(/^@/, "");
      if (!teamMembers.includes(username)) {
        setTeamMembers([...teamMembers, username]);
      }
      setMemberSearch("");
    }
  };

  const handleRemoveMember = (username: string) => {
    setTeamMembers(teamMembers.filter((m) => m !== username));
  };

  const { mutate: submitProposal, isPending: isSubmitting } = useMutation({
    mutationFn: () =>
      backendSparkApi.submitProposal({
        hackathon_id: id!,
        builder_wallet: address || "",
        title,
        description_md: description,
        approach_md: approach || undefined,
        timeline_md: timeline || undefined,
        github_url: githubUrl || undefined,
        demo_url: demoUrl || undefined,
        team_members: teamMembers.length > 0 ? teamMembers : undefined,
        milestones: milestones.filter((m) => m.title.trim()).length > 0
          ? milestones.filter((m) => m.title.trim())
          : undefined,
      }),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit proposal");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { title?: string; description?: string } = {};
    if (!title.trim()) newErrors.title = "ERR: field required";
    if (!description.trim()) newErrors.description = "ERR: field required";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    submitProposal();
  };

  if (isLoading) {
    return (
      <HackathonLayout>
        <div className="max-w-2xl mx-auto px-6 pt-24 pb-16 font-mono">
          <p className="text-xs text-[#9C9C9D]">loading...</p>
        </div>
      </HackathonLayout>
    );
  }

  if (!hackathon) {
    return (
      <HackathonLayout>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="max-w-2xl mx-auto px-6 pt-24 pb-16 font-mono"
        >
          <p className="text-xs text-[#9C9C9D]">// hackathon not found //</p>
          <Link
            to="/hackathons"
            className="text-xs text-[#F25C05] hover:underline mt-4 block"
          >
            {">"} back to hackathons
          </Link>
        </motion.div>
      </HackathonLayout>
    );
  }

  if (!isWalletConnected || !address) {
    return (
      <HackathonLayout>
        <div className="max-w-2xl mx-auto px-6 pt-24 pb-16 font-mono text-center">
          <AsciiBox title="LOGIN REQUIRED" titleColor="orange">
            <div className="py-8 space-y-4">
              <LogIn className="w-8 h-8 text-[#A0A3A9] mx-auto" />
              <p className="text-sm text-[#F5F5F6]">
                You need to connect a wallet to submit a proposal.
              </p>
              <p className="text-xs text-[#A0A3A9]">
                Use the login button in the header to connect.
              </p>
              <Link
                to={`/hackathons/${id}`}
                className="text-xs text-[#F25C05] hover:underline inline-block mt-2"
              >
                {">"} back to hackathon
              </Link>
            </div>
          </AsciiBox>
        </div>
      </HackathonLayout>
    );
  }

  return (
    <HackathonLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-2xl mx-auto px-6 pt-24 pb-16 font-mono"
      >
        {/* Back link */}
        <Link
          to={`/hackathons/${id}`}
          className="text-xs text-[#9C9C9D] hover:text-[#F25C05] mb-6 block"
        >
          {">"} cd ../hackathons/{id}
        </Link>

        {submitted ? (
          <AsciiBox title="SUBMITTED" titleColor="green">
            <div className="text-center py-4">
              <span className="text-[#75E0A7] text-lg">✓</span>
              <p className="text-xs text-[#F5F5F6] mt-2">
                Proposal submitted successfully.
              </p>
              <p className="text-xs text-[#9C9C9D] mt-1">
                Your proposal is now public. The decision market will determine
                the winner.
              </p>
              <div className="mt-4 space-y-1">
                <Link
                  to={`/hackathons/${id}`}
                  className="text-xs text-[#F25C05] hover:underline block"
                >
                  {">"} view your proposal
                </Link>
                <Link
                  to={`/hackathons/${id}`}
                  className="text-xs text-[#F25C05] hover:underline block"
                >
                  {">"} back to hackathon
                </Link>
              </div>
            </div>
          </AsciiBox>
        ) : (
          <AsciiBox title="SUBMIT PROPOSAL" titleColor="orange">
            {/* Hackathon context */}
            <p className="text-xs text-[#F5F5F6]">
              HACKATHON :: {hackathon.idea_title}
            </p>
            <p className="text-xs text-[#F25C05] font-bold">
              PRIZE :: ${hackathon.usdg_amount.toLocaleString()} USDG
            </p>
            <div className="border-b border-dashed border-[#1F242F] my-4" />

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className={labelClass}>
                  TITLE<span className="text-[#F25C05]">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (errors.title) setErrors({ ...errors, title: undefined });
                  }}
                  className={inputClass}
                />
                {errors.title && (
                  <p className="text-[10px] text-[#FF0000] mt-1">
                    {errors.title}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className={labelClass}>
                  DESCRIPTION<span className="text-[#F25C05]">*</span>
                </label>
                <textarea
                  rows={6}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (errors.description)
                      setErrors({ ...errors, description: undefined });
                  }}
                  className={inputClass}
                />
                <p className="text-[10px] text-[#333741]">
                  // markdown supported //
                </p>
                {errors.description && (
                  <p className="text-[10px] text-[#FF0000] mt-1">
                    {errors.description}
                  </p>
                )}
              </div>

              {/* Technical Approach */}
              <div>
                <label className={labelClass}>TECHNICAL APPROACH</label>
                <textarea
                  rows={4}
                  value={approach}
                  onChange={(e) => setApproach(e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* Roadmap */}
              <div>
                <label className={labelClass}>ROADMAP <span className="text-[#85888E]">(expected delivery date)</span></label>
                <input
                  type="date"
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* GitHub URL */}
              <div>
                <label className={labelClass}>GITHUB URL</label>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/..."
                  className={inputClass}
                />
              </div>

              {/* Demo URL */}
              <div>
                <label className={labelClass}>
                  DEMO URL <span className="text-[#85888E]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={demoUrl}
                  onChange={(e) => setDemoUrl(e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* Team Members */}
              <div>
                <label className={labelClass}>TEAM MEMBERS</label>
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  onKeyDown={handleAddMember}
                  placeholder="search builders..."
                  className={inputClass}
                />
                {teamMembers.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {teamMembers.map((username) => (
                      <div
                        key={username}
                        className="text-xs text-[#F5F5F6] flex items-center gap-2"
                      >
                        <span>{">"} @{username}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(username)}
                          className="text-[#F25C05] hover:underline"
                        >
                          [x]
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Milestones */}
              <div>
                <label className={labelClass}>
                  MILESTONES <span className="text-[#85888E]">(your delivery plan)</span>
                </label>
                <div className="space-y-3 mt-2">
                  {milestones.map((ms, i) => (
                    <div key={i} className="border border-[#333741] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#85888E]">MILESTONE #{i + 1}</span>
                        {milestones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}
                            className="text-[10px] text-[#F25C05] hover:underline"
                          >
                            [remove]
                          </button>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] text-[#333741] mb-0.5 block">deliverable</span>
                        <input
                          type="text"
                          value={ms.title}
                          onChange={(e) => {
                            const updated = [...milestones];
                            updated[i] = { ...updated[i], title: e.target.value };
                            setMilestones(updated);
                          }}
                          placeholder="e.g. MVP / Prototype ready"
                          className={inputClass}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-[#333741] mb-0.5 block">payment wanted</span>
                          <input
                            type="text"
                            value={ms.amount}
                            onChange={(e) => {
                              const updated = [...milestones];
                              updated[i] = { ...updated[i], amount: e.target.value };
                              setMilestones(updated);
                            }}
                            placeholder="e.g. $2,000 USDG"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-[#333741] mb-0.5 block">deadline</span>
                          <input
                            type="date"
                            value={ms.deadline}
                            onChange={(e) => {
                              const updated = [...milestones];
                              updated[i] = { ...updated[i], deadline: e.target.value };
                              setMilestones(updated);
                            }}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setMilestones([...milestones, { title: "", deadline: "", amount: "" }])}
                  className="text-xs text-[#F25C05] hover:underline mt-2"
                >
                  {">"} add milestone
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="shiny-button w-full py-3 text-sm rounded-none text-center mt-6 disabled:opacity-50"
              >
                {isSubmitting ? ">> [ SUBMITTING... ] <<" : ">> [ SUBMIT PROPOSAL ] <<"}
              </button>
            </form>
          </AsciiBox>
        )}
      </motion.div>
    </HackathonLayout>
  );
}
