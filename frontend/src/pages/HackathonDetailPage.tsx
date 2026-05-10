import { useState, useEffect, useMemo, Fragment } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import HackathonLayout from "@/components/Hackathon/HackathonLayout";
import WalletProfileBadge, { type WalletProfile } from "@/components/Hackathon/WalletProfileBadge";
import {
  AsciiBox,
  SectionDivider,
  StatusBadge,
  OddsBar,
} from "@/components/Hackathon/AsciiBox";
import { backendSparkApi } from "@/data/api/backendSparkApi";
import type { TokenHolderModel } from "@/data/api/backendSparkApi";
import { withSwrCache } from "@/utils/miniCache";
import type { Hackathon, Proposal, HackathonStatus } from "@/components/Hackathon/types";
import { useWalletContext } from "@/hooks/useWalletContext";
import CombinatorMarket from "@/components/Combinator/CombinatorMarket";
import type { MarketStatus } from "@/services/combinatorService";
import { createCombinatorProposal, getProposalMarketStatus } from "@/services/combinatorService";
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadUserProfile, saveUserProfile } from "@/components/Ideas";
import type { UserProfile } from "@/components/Ideas";

/* ── Compute effective status from dates ───────────────────── */

function computeStatus(hackathon: { status: HackathonStatus; start_date?: string; end_date?: string }): HackathonStatus {
  // "completed" is always manual — user decides
  if (hackathon.status === "completed") return "completed";

  const now = Date.now();
  const start = hackathon.start_date ? new Date(hackathon.start_date).getTime() : null;
  const end = hackathon.end_date ? new Date(hackathon.end_date).getTime() : null;

  // If we have dates, compute automatically
  if (start && end) {
    if (now < start) return "upcoming";
    if (now >= start && now < end) return "open";
    if (now >= end) return "voting";
  }

  // Fallback to stored status if no dates
  return hackathon.status;
}

/* ── Countdown hook ─────────────────────────────────────────── */

function useCountdown(target: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, new Date(target).getTime() - now);
  if (diff === 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d)}d:${pad(h)}h:${pad(m)}m:${pad(s)}s`;
}

/* ── Simple Markdown renderer (shared by Rules, What is Expected, and
   proposal description / approach / roadmap) ──

   Block-level: ### / ## / # headers, `- ` and `* ` bullets, `1. ` ordered
   items, `> ` blockquotes, ``` fenced code, `---` rules.
   Inline: **bold**, *italic* / _italic_, `code`, [text](url), and naked
   URLs. Designed to match the terminal aesthetic (orange accents, mono
   font for code) so user-authored markdown drops in cleanly. */

function renderInlineMarkdown(text: string): React.ReactNode[] {
  // Tokenise inline syntax in one pass. Order matters: code first (so its
  // contents are not re-parsed), then bold (** before *), then italic,
  // then explicit links, then bare URLs.
  const out: React.ReactNode[] = [];
  // [pattern, render]. Ordered by precedence — first match wins per slice.
  const patterns: { regex: RegExp; render: (m: RegExpExecArray, key: string) => React.ReactNode }[] = [
    {
      regex: /`([^`]+)`/,
      render: (m, key) => (
        <code key={key} className="bg-[#1A1F2A] text-[#F5F5F6] px-1 py-0.5 font-mono text-[11px]">
          {m[1]}
        </code>
      ),
    },
    {
      regex: /\*\*([^*]+)\*\*/,
      render: (m, key) => (
        <strong key={key} className="text-[#F5F5F6] font-semibold">{m[1]}</strong>
      ),
    },
    {
      regex: /(?<![\w*])\*([^*\n]+)\*(?!\w)|(?<![\w_])_([^_\n]+)_(?!\w)/,
      render: (m, key) => (
        <em key={key} className="text-[#D5D7DC] italic">{m[1] ?? m[2]}</em>
      ),
    },
    {
      regex: /\[([^\]]+)\]\(([^)\s]+)\)/,
      render: (m, key) => (
        <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-[#F25C05] underline underline-offset-2 hover:text-[#FF7A1F] break-all">
          {m[1]}
        </a>
      ),
    },
    {
      regex: /(?<!\]\()(https?:\/\/[^\s)]+)/,
      render: (m, key) => (
        <a key={key} href={m[1]} target="_blank" rel="noopener noreferrer" className="text-[#F25C05] underline underline-offset-2 hover:text-[#FF7A1F] break-all">
          {m[1]}
        </a>
      ),
    },
  ];

  let remaining = text;
  let keyN = 0;
  while (remaining.length > 0) {
    let earliest: { idx: number; match: RegExpExecArray; pat: typeof patterns[number] } | null = null;
    for (const pat of patterns) {
      const m = pat.regex.exec(remaining);
      if (m && (earliest === null || m.index < earliest.idx)) {
        earliest = { idx: m.index, match: m, pat };
      }
    }
    if (!earliest) {
      out.push(remaining);
      break;
    }
    if (earliest.idx > 0) out.push(remaining.slice(0, earliest.idx));
    out.push(earliest.pat.render(earliest.match, `i-${keyN++}`));
    remaining = remaining.slice(earliest.idx + earliest.match[0].length);
  }
  return out;
}

function MarkdownRenderer({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const elements: React.ReactNode[] = [];
  let codeBuffer: string[] | null = null;

  lines.forEach((line, i) => {
    // Fenced code block
    if (line.trim().startsWith("```")) {
      if (codeBuffer === null) {
        codeBuffer = [];
      } else {
        elements.push(
          <pre key={`code-${i}`} className="bg-[#0F1419] border border-[#2A3040] p-2 my-2 overflow-x-auto">
            <code className="text-[11px] font-mono text-[#B0B3B8] whitespace-pre">
              {codeBuffer.join("\n")}
            </code>
          </pre>,
        );
        codeBuffer = null;
      }
      return;
    }
    if (codeBuffer !== null) {
      codeBuffer.push(line);
      return;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={i} className="h-1.5" />);
      return;
    }

    // Horizontal rule
    if (trimmed === "---" || trimmed === "***") {
      elements.push(<hr key={i} className="my-2 border-[#2A3040]" />);
      return;
    }

    // Headers — three levels, all using the same uppercase-eyebrow style
    // but at different sizes so users can build a hierarchy.
    if (trimmed.startsWith("### ")) {
      elements.push(
        <p key={i} className="text-[10px] text-[#A0A3A9] uppercase tracking-widest mt-3 first:mt-0">
          {renderInlineMarkdown(trimmed.replace(/^###\s*/, ""))}
        </p>,
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <p key={i} className="text-xs text-[#F5F5F6] font-semibold uppercase tracking-wider mt-3 first:mt-0">
          {renderInlineMarkdown(trimmed.replace(/^##\s*/, ""))}
        </p>,
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <p key={i} className="text-sm text-[#F5F5F6] font-bold mt-3 first:mt-0">
          {renderInlineMarkdown(trimmed.replace(/^#\s*/, ""))}
        </p>,
      );
      return;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      elements.push(
        <p key={i} className="text-xs text-[#A0A3A9] italic border-l-2 border-[#F25C05]/40 pl-2 my-1">
          {renderInlineMarkdown(trimmed.replace(/^>\s*/, ""))}
        </p>,
      );
      return;
    }

    // Unordered list (- or *)
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <p key={i} className="text-xs text-[#B0B3B8] leading-relaxed">
          <span className="text-[#F25C05]">&gt; </span>
          {renderInlineMarkdown(trimmed.replace(/^[-*]\s*/, ""))}
        </p>,
      );
      return;
    }

    // Ordered list (1. 2. ...)
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      elements.push(
        <p key={i} className="text-xs text-[#B0B3B8] leading-relaxed">
          <span className="text-[#F25C05]">{orderedMatch[1]}. </span>
          {renderInlineMarkdown(orderedMatch[2])}
        </p>,
      );
      return;
    }

    // Plain paragraph
    elements.push(
      <p key={i} className="text-xs text-[#B0B3B8] leading-relaxed">
        {renderInlineMarkdown(trimmed)}
      </p>,
    );
  });

  // If a code fence was opened but never closed, flush it as plain code.
  if (codeBuffer !== null && codeBuffer.length > 0) {
    elements.push(
      <pre key="code-tail" className="bg-[#0F1419] border border-[#2A3040] p-2 my-2 overflow-x-auto">
        <code className="text-[11px] font-mono text-[#B0B3B8] whitespace-pre">
          {codeBuffer.join("\n")}
        </code>
      </pre>,
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}

/* ── Proposal Edit History ────────────────────────────────────── */

interface EditHistoryEntry {
  id: string;
  proposal_id: string;
  builder_wallet: string;
  changes: string; // JSON array of { field, from, to }
  timestamp: string;
}

function ProposalEditHistory({ hackathonId, proposals }: { hackathonId: string; proposals: Proposal[] }) {
  const { data } = useQuery<{ data: EditHistoryEntry[] }>({
    queryKey: ["proposal-edit-history", hackathonId],
    queryFn: async () => {
      const res = await fetch(`/api/proposal-edit-history?hackathon_id=${hackathonId}`);
      return res.json();
    },
    enabled: !!hackathonId,
    staleTime: 60_000,
  });

  const entries = data?.data;
  if (!entries?.length) return null;

  const getBuilderName = (proposalId: string) => {
    const p = proposals.find(p => p.id === proposalId);
    return p?.builder?.username || p?.title || proposalId.slice(0, 8);
  };

  const fieldLabel = (f: string) => {
    const map: Record<string, string> = {
      title: "Title",
      description_md: "Description",
      approach_md: "Approach",
      timeline_md: "Timeline",
      github_url: "GitHub",
      demo_url: "Demo",
      "team_members/milestones": "Team/Milestones",
    };
    return map[f] || f;
  };

  return (
    <AsciiBox title="EDIT HISTORY" titleColor="orange">
      <div className="max-h-48 overflow-y-auto space-y-2">
        {entries.map((entry) => {
          const changes: { field: string; from: string; to: string }[] = JSON.parse(entry.changes);
          const time = new Date(entry.timestamp);
          const timeStr = time.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={entry.id} className="text-[10px] border-b border-[#2A3040]/50 pb-1.5">
              <div className="flex items-center gap-2 text-[#A0A3A9] mb-0.5">
                <span className="text-[#555E6B]">{timeStr}</span>
                <span className="text-[#F5F5F6] font-bold">@{getBuilderName(entry.proposal_id)}</span>
                <span>edited {changes.length} field{changes.length > 1 ? "s" : ""}</span>
              </div>
              {changes.map((c, i) => (
                <div key={i} className="ml-4 text-[9px] text-[#B0B3B8]">
                  <span className="text-[#F25C05]">{fieldLabel(c.field)}</span>
                  {c.field !== "team_members/milestones" && c.from && (
                    <span className="text-[#555E6B]"> "{c.from.length > 60 ? c.from.slice(0, 60) + "…" : c.from}"</span>
                  )}
                  <span className="text-[#A0A3A9]"> → </span>
                  <span className="text-[#F5F5F6]">"{c.to.length > 60 ? c.to.slice(0, 60) + "…" : c.to}"</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </AsciiBox>
  );
}

/* ── Sort types ──────────────────────────────────────────────── */

type SortKey = "newest" | "oldest" | "leading";

function sortProposals(proposals: Proposal[], key: SortKey, marketOptions?: MarketStatus["options"]): Proposal[] {
  const sorted = [...proposals];
  // Always put shortlisted first, then sort by key
  const byShortlist = (a: Proposal, b: Proposal) => (b.shortlisted ?? 0) - (a.shortlisted ?? 0);
  switch (key) {
    case "newest":
      return sorted.sort(
        (a, b) => byShortlist(a, b) || new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      );
    case "oldest":
      return sorted.sort(
        (a, b) => byShortlist(a, b) || new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
      );
    case "leading":
      // Sort by TWAP from decision market (highest first)
      return sorted.sort((a, b) => {
        const s = byShortlist(a, b);
        if (s !== 0) return s;
        if (!marketOptions?.length) return 0;
        // Match proposals to market options by builder username
        const aOpt = marketOptions.find(o => o.label === a.builder?.username);
        const bOpt = marketOptions.find(o => o.label === b.builder?.username);
        return (bOpt?.twapPrice ?? 0) - (aOpt?.twapPrice ?? 0);
      });
    default:
      return sorted;
  }
}

/* ── Create Decision Market Proposal ─────────────────────────── */

interface DaoInfo {
  dao_name: string;
  token_mint: string;
  token_decimals: number;
  admin_wallet: string;
  proposer_token_threshold: string | null;
  proposer_holding_period_hours: number | null;
}

function useProposerEligibility(daoPda: string, walletAddress: string) {
  const [daoInfo, setDaoInfo] = useState<DaoInfo | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://api.zcombinator.io/dao/${daoPda}`);
        if (!res.ok) return;
        const dao = await res.json() as DaoInfo;
        if (cancelled) return;
        setDaoInfo(dao);

        if (walletAddress && dao.token_mint) {
          // DAO tokens live on mainnet — use Helius mainnet directly (public RPC blocks CORS)
          const rpc = await fetch("https://mainnet.helius-rpc.com/?api-key=83a9b751-8891-4765-a50d-8f8ef2fdb9fb", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner",
              params: [walletAddress, { mint: dao.token_mint }, { encoding: "jsonParsed" }],
            }),
          });
          const rpcData = await rpc.json() as any;
          if (cancelled) return;
          const accounts = rpcData?.result?.value || [];
          const rawBalance = accounts.reduce((sum: number, a: any) =>
            sum + Number(a.account?.data?.parsed?.info?.tokenAmount?.amount || 0), 0);
          setBalance(rawBalance / 10 ** dao.token_decimals);
        }
      } catch { /* best-effort */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [daoPda, walletAddress]);

  const threshold = daoInfo?.proposer_token_threshold
    ? Number(daoInfo.proposer_token_threshold) / 10 ** (daoInfo?.token_decimals || 9)
    : null;
  const holdingHours = daoInfo?.proposer_holding_period_hours || null;
  const isEligible = threshold === null || (balance !== null && balance >= threshold);

  return { daoInfo, balance, threshold, holdingHours, isEligible, loading };
}

const ADMIN_FUNDING_LAMPORTS = 0.1 * LAMPORTS_PER_SOL;

function CreateProposalForm({
  hackathon,
  walletAddress,
  signMessage,
  signTransaction,
  walletProvider,
  onCreated,
}: {
  hackathon: Hackathon;
  walletAddress: string;
  signMessage: (message: string) => Promise<Uint8Array>;
  signTransaction: (tx: Transaction, provider: any) => Promise<Transaction | null>;
  walletProvider: string | null;
  onCreated: (proposalPda: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [optionsText, setOptionsText] = useState("No, Yes");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { daoInfo, balance, threshold, holdingHours, isEligible, loading } =
    useProposerEligibility(hackathon.dao_pda!, walletAddress);

  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

  const handleSubmit = async () => {
    if (!walletAddress) { setError("Connect your wallet first"); return; }
    if (!title.trim()) { setError("Title is required"); return; }
    if (!description.trim()) { setError("Description is required"); return; }

    const options = optionsText.split(",").map((s) => s.trim()).filter(Boolean);
    if (options.length < 2) { setError("At least 2 options required"); return; }
    if (options.length > 6) { setError("Maximum 6 options"); return; }

    if (!daoInfo?.admin_wallet) { setError("DAO info not loaded yet"); return; }

    setError(null);
    setIsSubmitting(true);
    try {
      // Step 1: Fund the DAO admin wallet with 0.1 SOL (required for on-chain proposal creation)
      setStatus("Sending 0.1 SOL to fund proposal creation...");
      const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=83a9b751-8891-4765-a50d-8f8ef2fdb9fb", "confirmed");
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(walletAddress),
          toPubkey: new PublicKey(daoInfo.admin_wallet),
          lamports: ADMIN_FUNDING_LAMPORTS,
        }),
      );
      tx.feePayer = new PublicKey(walletAddress);
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const signedTx = await signTransaction(tx, walletProvider);
      if (!signedTx) throw new Error("Transaction signing rejected");
      const sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");
      await new Promise(r => setTimeout(r, 1000));

      // Step 2: Create the proposal via Combinator API
      setStatus("Creating decision market...");
      const result = await createCombinatorProposal(
        {
          wallet: walletAddress,
          dao_pda: hackathon.dao_pda!,
          title: title.trim(),
          description: description.trim(),
          options,
        },
        signMessage,
      );
      onCreated(result.proposal_pda);
    } catch (e: any) {
      setError(e.message || "Failed to create proposal");
    } finally {
      setIsSubmitting(false);
      setStatus("");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[#A0A3A9] text-xs font-mono mb-2">
        {"// Launch a 72h decision market (24h warmup + 48h TWAP)"}
      </p>

      {/* Eligibility info */}
      {!loading && daoInfo && threshold !== null && walletAddress && (
        <div className={`border px-3 py-2 text-xs font-mono ${
          isEligible
            ? "border-green-700/50 bg-green-900/10 text-green-400"
            : "border-red-700/50 bg-red-900/10 text-red-400"
        }`}>
          {isEligible ? (
            <p>You hold {fmt(balance!)} ${daoInfo.dao_name} — eligible to propose</p>
          ) : (
            <>
              <p>
                You need an average of {fmt(threshold)} ${daoInfo.dao_name}
                {holdingHours ? ` over ${holdingHours >= 24 ? `${holdingHours / 24} day${holdingHours >= 48 ? "s" : ""}` : `${holdingHours}h`}` : ""}
                {" "}to create proposals.
              </p>
              <p className="mt-1 text-[#A0A3A9]">
                Your current balance: {balance !== null ? fmt(balance) : "..."} ${daoInfo.dao_name}
              </p>
            </>
          )}
        </div>
      )}

      <div>
        <label className="text-[10px] font-mono text-[#A0A3A9] uppercase">Title</label>
        <input
          type="text"
          maxLength={128}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`Should we fund "${hackathon.idea_title}"?`}
          className="w-full mt-1 bg-[#0D1117] border border-[#444B57] px-3 py-2 text-sm text-[#F5F5F6] font-mono placeholder:text-[#444B57] focus:border-[#F25C05]/50 focus:outline-none"
        />
      </div>

      <div>
        <label className="text-[10px] font-mono text-[#A0A3A9] uppercase">Description</label>
        <textarea
          maxLength={1024}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Describe what this proposal is about..."
          className="w-full mt-1 bg-[#0D1117] border border-[#444B57] px-3 py-2 text-sm text-[#F5F5F6] font-mono placeholder:text-[#444B57] focus:border-[#F25C05]/50 focus:outline-none resize-none"
        />
      </div>

      <div>
        <label className="text-[10px] font-mono text-[#A0A3A9] uppercase">
          Options (comma-separated, 2-6)
        </label>
        <input
          type="text"
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          placeholder="No, Yes"
          className="w-full mt-1 bg-[#0D1117] border border-[#444B57] px-3 py-2 text-sm text-[#F5F5F6] font-mono placeholder:text-[#444B57] focus:border-[#F25C05]/50 focus:outline-none"
        />
      </div>

      {error && (
        <p className="text-red-400 text-xs font-mono">{`ERR: ${error}`}</p>
      )}

      {status && (
        <p className="text-[#F25C05] text-xs font-mono animate-pulse">{status}</p>
      )}

      <p className="text-[#444B57] text-[10px] font-mono">
        {"// 0.1 SOL fee to fund on-chain proposal creation"}
      </p>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || !walletAddress || (!loading && !isEligible)}
        className="border border-[#F25C05] py-2 w-full text-center text-xs text-[#F25C05] font-mono hover:bg-[#F25C05]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {isSubmitting ? `>> ${status || "PROCESSING..."}` : ">> [ LAUNCH DECISION MARKET — 0.1 SOL ] <<"}
      </button>

      {!walletAddress && (
        <p className="text-[#444B57] text-xs font-mono text-center">
          {"// connect wallet to create a proposal"}
        </p>
      )}
    </div>
  );
}

/* ── Decision Market Section (tabbed: current / previous / create) ── */

type MarketTab = "current" | "previous" | "create";

function DecisionMarketSection({
  hackathon,
  ideaTicker,
  xProfile,
  walletAddress,
  signMessage,
  signTransaction,
  walletProvider,
  onProposalCreated,
}: {
  hackathon: Hackathon;
  ideaTicker?: string;
  xProfile: UserProfile;
  walletAddress: string;
  signMessage: (message: string) => Promise<Uint8Array>;
  signTransaction: (tx: Transaction, provider: any) => Promise<Transaction | null>;
  walletProvider: string | null;
  onProposalCreated: (proposalPda: string) => void;
}) {
  const livePda = hackathon.combinator_proposal_pda;
  const previousPdas = hackathon.previous_proposal_pdas || [];
  const hasPrevious = previousPdas.length > 0;
  const hasAnyMarket = !!livePda || hasPrevious;

  const { data: liveMarketData } = useQuery<MarketStatus>({
    queryKey: ["combinator-market", livePda],
    queryFn: () => getProposalMarketStatus(livePda!),
    enabled: !!livePda,
    staleTime: 60_000,
  });
  const liveIsFinalized = liveMarketData?.isFinalized ?? false;
  const canCreateNew = !!hackathon.dao_pda && (!livePda || liveIsFinalized);

  const defaultTab: MarketTab = livePda ? "current" : canCreateNew ? "create" : "current";
  const [activeTab, setActiveTab] = useState<MarketTab>(defaultTab);
  const [expandedPrevious, setExpandedPrevious] = useState<string | null>(null);

  const optionLabels = useMemo(() => {
    if (hackathon.combinator_option_labels) {
      try {
        const parsed = typeof hackathon.combinator_option_labels === "string"
          ? JSON.parse(hackathon.combinator_option_labels)
          : hackathon.combinator_option_labels;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* invalid JSON */ }
    }
    const shortlisted = hackathon.proposals.filter((p: Proposal) => p.shortlisted);
    if (shortlisted.length > 0) {
      return ["No", ...shortlisted.map((p: Proposal) => p.builder?.username || p.title || "")];
    }
    if (hackathon.proposals.length > 0) {
      return ["No", ...hackathon.proposals.map((p: Proposal) => p.builder?.username || p.title || "")];
    }
    return undefined;
  }, [hackathon.combinator_option_labels, hackathon.proposals]);

  if (!hasAnyMarket && !hackathon.dao_pda && !hackathon.combinator_chart_url) {
    return (
      <AsciiBox title="DECISION MARKET" titleColor="green">
        <div className="text-[#444B57] text-center py-8 font-mono text-sm">
          {"╔═ MARKET NOT YET ACTIVE ═╗"}
        </div>
      </AsciiBox>
    );
  }

  const showTabs = hasPrevious || canCreateNew;

  const tabs: { key: MarketTab; label: string; show: boolean }[] = [
    { key: "current", label: livePda ? (liveIsFinalized ? "current (ended)" : "current") : "current", show: !!livePda || !!hackathon.combinator_chart_url },
    { key: "previous", label: `previous [${previousPdas.length}]`, show: hasPrevious },
    { key: "create", label: "create market", show: canCreateNew },
  ];

  return (
    <AsciiBox title="DECISION MARKET" titleColor="green">
      {/* Tab bar — same style as the proposals sort bar */}
      {showTabs && (
        <div className="flex items-center gap-3 mb-4 text-[10px] font-mono">
          {tabs.filter(t => t.show).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`transition-colors ${
                activeTab === tab.key
                  ? "text-[#F25C05] border-b border-[#F25C05]"
                  : "text-[#A0A3A9] hover:text-[#B0B3B8] cursor-pointer"
              }`}
            >
              [{tab.label}]
            </button>
          ))}
        </div>
      )}

      {/* Current tab */}
      {activeTab === "current" && (
        <div>
          {livePda && (
            <CombinatorMarket
              proposalPda={livePda}
              tradeUrl={hackathon.combinator_trade_url}
              baseSymbol={ideaTicker}
              twitterProfile={xProfile}
              optionLabels={optionLabels}
            />
          )}

          {/* Legacy iframe fallback */}
          {!livePda && hackathon.combinator_chart_url && (
            <div>
              <iframe
                src={hackathon.combinator_chart_url}
                sandbox="allow-scripts allow-same-origin"
                className="w-full aspect-[16/9] border border-[#444B57]"
                title="Decision Market Chart"
              />
              {hackathon.combinator_trade_url && (
                <a
                  href={hackathon.combinator_trade_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-[#444B57] py-2 w-full text-center text-xs text-[#F5F5F6] hover:border-[#F25C05]/50 hover:bg-[#131822] mt-3 block transition-all"
                >
                  {">> [ TRADE ON COMBINATOR.TRADE ↗ ] <<"}
                </a>
              )}
            </div>
          )}

          {!livePda && !hackathon.combinator_chart_url && (
            <div className="text-[#444B57] text-center py-8 font-mono text-sm">
              {"╔═ MARKET NOT YET ACTIVE ═╗"}
            </div>
          )}
        </div>
      )}

      {/* Previous tab */}
      {activeTab === "previous" && (
        <div className="space-y-3">
          {previousPdas.map((pda, i) => (
            <div key={pda} className="border border-[#2A3040] bg-[#0D1117]/50">
              <button
                onClick={() => setExpandedPrevious(expandedPrevious === pda ? null : pda)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono hover:bg-[#131822] transition-colors"
              >
                <span className="text-[#A0A3A9]">
                  Market #{previousPdas.length - i}
                  <span className="text-[#555E6B] ml-2">{pda.slice(0, 8)}...{pda.slice(-4)}</span>
                </span>
                <span className="text-[10px] text-[#555E6B]">
                  {expandedPrevious === pda ? "▲" : "▼"}
                </span>
              </button>
              {expandedPrevious === pda && (
                <div className="px-3 pb-3">
                  <CombinatorMarket
                    proposalPda={pda}
                    baseSymbol={ideaTicker}
                    twitterProfile={xProfile}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create market tab */}
      {activeTab === "create" && (
        <CreateProposalForm
          hackathon={hackathon}
          walletAddress={walletAddress}
          signMessage={signMessage}
          signTransaction={signTransaction}
          walletProvider={walletProvider}
          onCreated={onProposalCreated}
        />
      )}
    </AsciiBox>
  );
}

/* ── Page component ──────────────────────────────────────────── */

export default function HackathonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [xProfile, setXProfile] = useState<UserProfile>(loadUserProfile);

  // Handle Twitter OAuth callback (redirected back to this page)
  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) return;

    const storedState = localStorage.getItem("twitter_oauth_state");
    if (state !== storedState) return;

    (async () => {
      try {
        const codeVerifier = localStorage.getItem("twitter_code_verifier");
        if (!codeVerifier) return;
        const redirectUri = `${window.location.origin}/ideas`;
        const res = await fetch("/api/twitter-oauth-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, redirect_uri: redirectUri, code_verifier: codeVerifier }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const newProfile: UserProfile = {
          ...loadUserProfile(),
          xId: data.user.id,
          xUsername: data.user.username,
          xName: data.user.name,
          xAvatar: data.user.profile_image_url || `https://unavatar.io/twitter/${data.user.username}`,
          xConnected: true,
        };
        saveUserProfile(newProfile);
        setXProfile(newProfile);
        // Clean up OAuth params from URL
        localStorage.removeItem("twitter_code_verifier");
        localStorage.removeItem("twitter_oauth_state");
        localStorage.removeItem("twitter_oauth_timestamp");
        navigate(`/hackathons/${id}`, { replace: true });
      } catch { /* silent */ }
    })();
  }, [searchParams, id, navigate]);

  // Re-read profile on focus (in case user connected X on /ideas in another tab)
  useEffect(() => {
    const handleFocus = () => setXProfile(loadUserProfile());
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [expandedProposal, setExpandedProposal] = useState<string | null>(null);
  const [editingProposal, setEditingProposal] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editMilestones, setEditMilestones] = useState<{ title: string; amount: string; deadline: string }[]>([]);
  const [editTeamMembers, setEditTeamMembers] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { address: walletAddress, signMessage, signTransaction, walletProvider } = useWalletContext();
  const queryClient = useQueryClient();

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["hackathon", id],
    // Cache key includes the id so two hackathons don't overwrite
    // each other's cached payloads. 5-min TTL is short enough that
    // proposal counts / status flips show up fast for users
    // bouncing between markets, long enough to skip the spinner on
    // back-button navigation.
    ...withSwrCache(
      () => backendSparkApi.getHackathon(id!),
      `desktop_cache_hackathon_${id ?? "anon"}`,
      5 * 60_000,
    ),
    enabled: !!id,
    refetchOnWindowFocus: false,
  });

  const hackathon = useMemo(() => {
    if (apiData?.hackathon) {
      const h = apiData.hackathon;
      const effectiveStatus = computeStatus(h as any);
      return {
        ...h,
        status: effectiveStatus,
        proposals: (h.proposals || []) as unknown as Proposal[],
        milestones: (h.milestones || []) as any,
      } as unknown as Hackathon;
    }
    return undefined;
  }, [apiData]);

  // Fetch the linked idea to get token_address
  const { data: ideaData } = useQuery({
    queryFn: () => backendSparkApi.getIdeaBySlug(hackathon!.idea_slug),
    queryKey: ["idea-for-hackathon", hackathon?.idea_slug],
    enabled: !!hackathon?.idea_slug,
    refetchOnWindowFocus: false,
  });

  const tokenAddress = (ideaData?.idea as any)?.token_address as string | undefined;
  const ideatorWallet = (ideaData?.idea as any)?.treasury_wallet as string | undefined;
  const ideaTicker = (ideaData?.idea as any)?.ticker as string | undefined;

  // Fetch token holders if token is launched
  const { data: holdersData, isLoading: holdersLoading } = useQuery({
    queryFn: () => backendSparkApi.getTokenHolders(tokenAddress!),
    queryKey: ["token-holders", tokenAddress],
    enabled: !!tokenAddress,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000, // fresh for 5 min
    gcTime: 30 * 60_000,   // keep in cache 30 min
  });

  // Resolve wallet → profile for INVESTORS list
  const [investorUsernames, setInvestorUsernames] = useState<Record<string, WalletProfile | null>>({});
  useEffect(() => {
    const addrs = Array.from(new Set((holdersData?.holders || []).map(h => h.address))).filter(Boolean);
    const unknown = addrs.filter(a => !(a in investorUsernames));
    if (unknown.length === 0) return;
    let cancelled = false;
    fetch(`/api/usernames?wallets=${encodeURIComponent(unknown.join(","))}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { map?: Record<string, WalletProfile> } | null) => {
        if (cancelled) return;
        setInvestorUsernames(prev => {
          const next = { ...prev };
          for (const a of unknown) next[a] = data?.map?.[a] || null;
          return next;
        });
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [holdersData, investorUsernames]);

  // Countdown: if upcoming → countdown to start; if open → countdown to end
  const effectiveStatus = hackathon?.status;
  const startsInTarget = hackathon?.start_date || "";
  const endsInTarget = hackathon?.end_date || hackathon?.countdown_target || "";
  const startsIn = useCountdown(startsInTarget);
  const endsIn = useCountdown(endsInTarget);

  // Read market options from query cache (populated by CombinatorMarket component)
  const marketData = queryClient.getQueryData<MarketStatus>(
    ["combinator-market", hackathon?.combinator_proposal_pda]
  );

  const sortedProposals = useMemo(
    () => (hackathon ? sortProposals(hackathon.proposals, sortKey, marketData?.options) : []),
    [hackathon, sortKey, marketData?.options]
  );

  // Position of the "No" card in the proposals list.
  // "No" is the first option created on-chain when the market opens, so:
  //   - newest → last (it's the oldest)
  //   - oldest → first (it's the oldest)
  //   - leading → ranked by TWAP like every other option
  // Returns a 0-based index at which the No card should be inserted.
  const noCardIndex = useMemo(() => {
    if (sortedProposals.length === 0) return 0;
    if (sortKey === "oldest") return 0;
    if (sortKey === "newest") return sortedProposals.length;
    // leading: slot based on NO's TWAP among the builder proposals
    const noOpt = marketData?.options?.find(o => o.label === "No");
    const noTwap = noOpt?.twapPrice ?? 0;
    let idx = 0;
    for (const p of sortedProposals) {
      const pOpt = marketData?.options?.find(o => o.label === p.builder?.username);
      const pTwap = pOpt?.twapPrice ?? 0;
      if (noTwap >= pTwap) break;
      idx++;
    }
    return idx;
  }, [sortKey, sortedProposals, marketData?.options]);

  // Check if current wallet owns a proposal
  function isProposalOwner(proposal: Proposal): boolean {
    if (!walletAddress) return false;
    const bWallet = proposal.builder?.wallet_address || "";
    return bWallet.toLowerCase() === walletAddress.toLowerCase();
  }

  function startEditingProposal(proposal: Proposal) {
    setEditingProposal(proposal.id);
    setEditForm({
      title: proposal.title || "",
      description_md: proposal.description_md || "",
      approach_md: proposal.approach_md || "",
      timeline_md: proposal.timeline_md || "",
      github_url: proposal.github_url || "",
      demo_url: proposal.demo_url || "",
    });
    // Parse team_members JSON
    const tm = proposal.team_members as any;
    setEditTeamMembers(Array.isArray(tm) ? tm : (tm?.members || []));
    setEditMilestones(Array.isArray(tm) ? [] : (tm?.milestones || []));
    setExpandedProposal(proposal.id);
  }

  async function saveProposal(proposalId: string) {
    if (!walletAddress) return;
    setIsSaving(true);
    try {
      await backendSparkApi.updateProposal({
        proposal_id: proposalId,
        builder_wallet: walletAddress,
        ...editForm,
        team_members: editTeamMembers,
        milestones: editMilestones.filter((m) => m.title.trim()),
      });
      toast.success("Proposal updated!");
      setEditingProposal(null);
      setEditForm({});
      queryClient.invalidateQueries({ queryKey: ["hackathon", id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsSaving(false);
    }
  }

  /* ── Not found ──────────────────────────────────────────────── */

  if (isLoading || !hackathon) {
    return (
      <HackathonLayout>
        <div className="flex flex-col items-center justify-center py-32 font-mono gap-4">
          {isLoading ? (
            <div className="w-8 h-8 border-2 border-[#F25C05] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <p className="text-[#A0A3A9] text-sm">
                {"// hackathon not found //"}
              </p>
              <Link
                to="/hackathons"
                className="text-xs text-[#F25C05] hover:underline"
              >
                {">"} back to hackathons
              </Link>
            </>
          )}
        </div>
      </HackathonLayout>
    );
  }

  const prizeFormatted = `Up to $${hackathon.usdg_amount.toLocaleString()} USDG`;

  /* ── Sort toggles ───────────────────────────────────────────── */

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "newest", label: "newest" },
    { key: "oldest", label: "oldest" },
    { key: "leading", label: "leading" },
  ];

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <HackathonLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="max-w-5xl mx-auto px-3 sm:px-6 pt-24 pb-16 font-mono"
      >
        {/* ── 1. Back + Status Row ────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <Link
            to="/hackathons"
            className="text-xs text-[#B0B3B8] hover:text-[#F25C05] transition-colors"
          >
            {">"} cd ../hackathons
          </Link>
          <div className="text-xs text-[#A0A3A9] flex items-center gap-2">
            STATUS: <StatusBadge status={hackathon.status} />
          </div>
        </div>

        {/* ── 2. Header Card ──────────────────────────────────── */}
        <AsciiBox title="HACKATHON">
          {/* Infos + image side by side */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="text-sm font-mono space-y-2 flex-1 min-w-0">
              {/* IDEA */}
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[#A0A3A9]">IDEA :</span>
                <span className="text-[#F5F5F6]">{hackathon.idea_title}</span>
                <Link
                  to={`/ideas/${hackathon.idea_slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#F25C05] text-xs hover:underline"
                >
                  {"[→ view on spark]"}
                </Link>
              </div>

              {/* PRIZE */}
              <div className="flex items-baseline gap-2">
                <span className="text-[#A0A3A9]">PRIZE :</span>
                <span className="text-[#F25C05] font-bold text-lg">
                  {prizeFormatted}
                </span>
              </div>

              {/* STATUS + PROPOSALS */}
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-[#A0A3A9]">STATUS :</span>
                  <span className="text-[#F5F5F6]">
                    {hackathon.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[#A0A3A9]">PROPOSALS :</span>
                  <span className="text-[#F5F5F6]">
                    {hackathon.proposals.length}
                  </span>
                </div>
              </div>

              {/* STARTS IN (upcoming) */}
              {effectiveStatus === "upcoming" && startsIn && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[#A0A3A9]">STARTS IN :</span>
                  <span className="text-[#F5F5F6] flicker">{startsIn}</span>
                </div>
              )}

              {/* ENDS IN (open/voting) */}
              {(effectiveStatus === "open" || effectiveStatus === "voting") && endsIn && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[#A0A3A9]">ENDS IN :</span>
                  <span className="text-[#F5F5F6] flicker">{endsIn}</span>
                </div>
              )}

              {/* Static dates */}
              {hackathon.start_date && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[#A0A3A9]">FROM :</span>
                  <span className="text-[#F5F5F6]">
                    {new Date(hackathon.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                  {hackathon.end_date && (
                    <>
                      <span className="text-[#A0A3A9]">TO :</span>
                      <span className="text-[#F5F5F6]">
                        {new Date(hackathon.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Image */}
            {hackathon.idea_image_url && (
              <img
                src={hackathon.idea_image_url}
                alt={hackathon.idea_title}
                className="w-24 h-24 sm:w-36 sm:h-36 object-cover rounded border border-[#2A3040] shrink-0 self-start"
              />
            )}
          </div>

          {/* What is Expected */}
          {hackathon.what_is_expected_md && (
            <div className="mt-4 pt-4 border-t border-[#2A3040]">
              <p className="text-[10px] text-[#F25C05] uppercase tracking-widest mb-2">
                What is Expected
              </p>
              <MarkdownRenderer markdown={hackathon.what_is_expected_md} />
            </div>
          )}

          {/* CTA */}
          <div className="text-sm font-mono mt-4">
            {hackathon.status === "open" && (
              <Link
                to={`/hackathons/${hackathon.id}/apply`}
                className="shiny-button px-6 py-3 text-sm rounded-none w-full text-center block"
              >
                {">> [ APPLY WITH A PROPOSAL ] <<"}
              </Link>
            )}
            {hackathon.status === "voting" && (
              <p className="text-[#A0A3A9] text-xs text-center">
                {"// voting in progress on combinator.trade //"}
              </p>
            )}
            {hackathon.status === "completed" && (
              <p className="text-[#A0A3A9] text-xs text-center">
                {"// hackathon completed //"}
              </p>
            )}
          </div>
        </AsciiBox>

        {/* ── 3. Grid ─────────────────────────────────────────── */}
        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6 mt-6">
          {/* ── Rules (mobile: 1st, desktop: sidebar) ────────── */}
          <div className="order-1 lg:order-none lg:col-start-3 lg:row-start-1">
            <AsciiBox title="TL;DR">
              {hackathon.rules_md ? (
                <MarkdownRenderer markdown={hackathon.rules_md} />
              ) : (
                <p className="text-xs text-[#A0A3A9] text-center py-4">
                  {"// rules not published yet //"}
                </p>
              )}

              {/* Builder Guide link */}
              <div className="mt-4 pt-3 border-t border-[#2A3040]">
                <a
                  href="https://justspark.notion.site/Hackathon-Builder-Guide-33041bf35b7781fa8369f7a622ac732f"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#F25C05] hover:underline"
                >
                  {"[→ Builder Guide]"}
                </a>
              </div>
            </AsciiBox>
          </div>

          {/* ── Milestones (sidebar, between TL;DR and Investors) ── */}
          {hackathon.milestones && hackathon.milestones.length > 0 && (
            <div className="order-1 lg:order-none lg:col-start-3 lg:row-start-2">
              <AsciiBox title="MILESTONES">
                <div className="space-y-2">
                  {hackathon.milestones
                    .sort((a, b) => a.milestone_order - b.milestone_order)
                    .map((ms, i) => {
                      const statusColor =
                        ms.status === "paid" ? "text-[#22C55E]" :
                        ms.status === "completed" ? "text-[#3B82F6]" :
                        ms.status === "active" ? "text-[#F25C05]" :
                        "text-[#555E6B]";
                      const statusIcon =
                        ms.status === "paid" ? "✓" :
                        ms.status === "completed" ? "●" :
                        ms.status === "active" ? "►" :
                        "○";
                      return (
                        <div key={ms.id} className="flex items-start gap-2 text-xs">
                          <span className={`${statusColor} shrink-0 mt-0.5 font-mono`}>{statusIcon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[#F5F5F6] truncate">{ms.title}</span>
                              <span className="text-[#F25C05] shrink-0 font-mono">${ms.amount_usdg.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] uppercase tracking-wider ${statusColor}`}>{ms.status}</span>
                              {ms.deadline && (
                                <span className="text-[10px] text-[#555E6B]">
                                  {new Date(ms.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              )}
                              {ms.paid_to && (
                                <span className="text-[10px] text-[#22C55E]">→ @{ms.paid_to}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
                {/* Total */}
                <div className="mt-3 pt-2 border-t border-[#2A3040] flex justify-between text-[10px]">
                  <span className="text-[#A0A3A9]">TOTAL</span>
                  <span className="text-[#F25C05] font-mono">
                    ${hackathon.milestones.reduce((s, m) => s + m.amount_usdg, 0).toLocaleString()} USDG
                  </span>
                </div>
              </AsciiBox>
            </div>
          )}

          {/* ── Main column ───────────────────────────────────── */}
          <div className="lg:col-span-2 lg:row-span-3 space-y-6 order-2 lg:order-none">

            {/* ── Decision Market (tabbed: Live / Previous) ──── */}
            <DecisionMarketSection
              hackathon={hackathon}
              ideaTicker={ideaTicker}
              xProfile={xProfile}
              walletAddress={walletAddress}
              signMessage={signMessage}
              signTransaction={signTransaction}
              walletProvider={walletProvider}
              onProposalCreated={async (proposalPda) => {
                try {
                  await fetch("/api/set-hackathon-proposal-pda", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ hackathon_id: hackathon.id, proposal_pda: proposalPda }),
                  });
                } catch { /* best-effort */ }
                queryClient.invalidateQueries({ queryKey: ["hackathon", id] });
                toast.success(`Decision market created: ${proposalPda.slice(0, 8)}...`);
              }}
            />

            {/* ── Proposals ───────────────────────────────────── */}
            <AsciiBox
              title={`PROPOSALS [${hackathon.proposals.length}]`}
              titleColor="orange"
            >
              {/* Sort bar */}
              <div className="flex items-center gap-3 mb-4 text-[10px] font-mono">
                <span className="text-[#A0A3A9]">SORT:</span>
                {sortOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSortKey(opt.key)}
                    className={`transition-colors ${
                      sortKey === opt.key
                        ? "text-[#F25C05] border-b border-[#F25C05]"
                        : "text-[#A0A3A9] hover:text-[#B0B3B8] cursor-pointer"
                    }`}
                  >
                    [{opt.label}]
                  </button>
                ))}
              </div>

              {/* Proposal cards — "No" is treated like any other proposal and slotted by sort order */}
              {sortedProposals.length === 0 ? (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }}
                  className="space-y-3"
                >
                  <motion.div
                    key="__no_option__"
                    variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                    className="border border-dashed border-[#EF4444]/40 bg-[#EF4444]/[0.03] p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#EF4444]">No</span>
                      <span className="text-[10px] text-[#A0A3A9]">— none of the proposals win</span>
                    </div>
                    <p className="text-[10px] text-[#A0A3A9] mt-2">
                      If "No" wins, all investors get their money back. No prize is distributed.
                    </p>
                  </motion.div>
                  <div className="text-center py-8 space-y-2">
                    <p className="text-[#A0A3A9] text-xs">
                      {"// no proposals yet //"}
                    </p>
                    <Link
                      to={`/hackathons/${hackathon.id}/apply`}
                      className="text-xs text-[#F25C05] hover:underline"
                    >
                      {">"} submit a proposal
                    </Link>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: {},
                    visible: { transition: { staggerChildren: 0.03 } },
                  }}
                  className="space-y-3"
                >
                  {sortedProposals.map((proposal, proposalIdx) => {
                    const isExpanded = expandedProposal === proposal.id;
                    const isEditing = editingProposal === proposal.id;
                    const isOwner = isProposalOwner(proposal);
                    const showNoBefore = proposalIdx === noCardIndex;
                    return (
                    <Fragment key={proposal.id}>
                    {showNoBefore && (
                      <motion.div
                        key="__no_option__"
                        variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                        className="border border-dashed border-[#EF4444]/40 bg-[#EF4444]/[0.03] p-4"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#EF4444]">No</span>
                          <span className="text-[10px] text-[#A0A3A9]">— none of the proposals win</span>
                        </div>
                        <p className="text-[10px] text-[#A0A3A9] mt-2">
                          If "No" wins, all investors get their money back. No prize is distributed.
                        </p>
                      </motion.div>
                    )}
                    <motion.div
                      variants={{
                        hidden: { opacity: 0, y: 6 },
                        visible: { opacity: 1, y: 0 },
                      }}
                      onClick={() => setExpandedProposal(isExpanded ? null : proposal.id)}
                      className={`border p-4 transition-all duration-300 cursor-pointer ${
                        proposal.shortlisted
                          ? "border-amber-500/60 border-solid bg-amber-500/[0.03] hover:border-amber-400"
                          : "border-dashed border-[#2A3040] hover:border-[#F25C05]/40"
                      }`}
                    >
                      {/* Header: name + position left, milestones right */}
                      {(() => {
                        const tm = proposal.team_members as any;
                        const ms = Array.isArray(tm) ? [] : (tm?.milestones || []);
                        const totalPrice = ms.reduce((s: number, m: { amount?: string }) => s + (parseFloat(m.amount || "0") || 0), 0);
                        return (
                          <>
                            {/* Line 1: badge + name + position + edit */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {proposal.shortlisted ? (
                                <span className="text-[10px] text-amber-400 border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5">★ SHORTLISTED</span>
                              ) : null}
                              <span className="text-sm font-bold text-[#F5F5F6]">
                                @{proposal.builder.username}
                              </span>
                              {proposal.builder.position && (
                                <span className="text-[10px] text-[#555E6B]">— {proposal.builder.position}</span>
                              )}
                              {isOwner && !isEditing && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); startEditingProposal(proposal); }}
                                  className="text-[10px] text-[#F25C05] border border-[#F25C05]/30 px-1.5 py-0.5 hover:bg-[#F25C05]/10 transition-colors"
                                >
                                  [edit]
                                </button>
                              )}
                              {isEditing && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); saveProposal(proposal.id); }}
                                    disabled={isSaving}
                                    className="text-[10px] text-[#22C55E] border border-[#22C55E]/30 px-1.5 py-0.5 hover:bg-[#22C55E]/10 transition-colors"
                                  >
                                    {isSaving ? "[saving...]" : "[save]"}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEditingProposal(null); setEditForm({}); }}
                                    className="text-[10px] text-[#A0A3A9] border border-[#2A3040] px-1.5 py-0.5 hover:bg-white/5 transition-colors"
                                  >
                                    [cancel]
                                  </button>
                                </div>
                              )}
                            </div>
                            {/* Line 2: milestones + total (if any) */}
                            {ms.length > 0 && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[9px]">
                                {ms.map((m: { title: string; amount?: string }, i: number) => (
                                  <span key={i} className="text-[#B0B3B8]">
                                    <span className="text-[#555E6B]">#{i + 1}</span> {m.title}{m.amount && <span className="text-[#F25C05]"> ${m.amount}</span>}
                                  </span>
                                ))}
                                {totalPrice > 0 && (
                                  <span className="text-[10px] text-[#F25C05] font-bold">Total: ${totalPrice.toLocaleString()}</span>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}

                      {/* Title */}
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.title || ""}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full bg-transparent border border-[#2A3040] text-sm text-[#F5F5F6] px-2 py-1 mt-1 focus:border-[#F25C05]/50 outline-none"
                        />
                      ) : (
                        <p className="text-sm text-[#F5F5F6] mt-1">
                          <span className="text-[#F25C05]">{">"} </span>
                          {proposal.title}
                        </p>
                      )}

                      {/* Summary (collapsed) or full content (expanded) */}
                      {!isExpanded ? (
                          <div className="mt-1">
                            <p className="text-xs text-[#B0B3B8] line-clamp-3">
                              {proposal.description_md?.slice(0, 200)}
                              {(proposal.description_md?.length ?? 0) > 200 && "..."}
                            </p>
                          </div>
                      ) : (
                        <div className="mt-3 space-y-4">
                          {/* Description */}
                          <div>
                            <p className="text-[10px] text-[#F25C05] uppercase tracking-widest mb-1">Description</p>
                            {isEditing ? (
                              <textarea rows={4} value={editForm.description_md || ""} onChange={(e) => { e.stopPropagation(); setEditForm({ ...editForm, description_md: e.target.value }); }} onClick={(e) => e.stopPropagation()} className="w-full bg-transparent border border-[#2A3040] text-xs text-[#B0B3B8] px-2 py-1.5 focus:border-[#F25C05]/50 outline-none" />
                            ) : proposal.description_md ? (
                              <div className="text-xs text-[#B0B3B8] whitespace-pre-wrap leading-relaxed"><MarkdownRenderer markdown={proposal.description_md} /></div>
                            ) : null}
                          </div>

                          {/* Approach */}
                          <div>
                            <p className="text-[10px] text-[#F25C05] uppercase tracking-widest mb-1">Approach</p>
                            {isEditing ? (
                              <textarea rows={3} value={editForm.approach_md || ""} onChange={(e) => { e.stopPropagation(); setEditForm({ ...editForm, approach_md: e.target.value }); }} onClick={(e) => e.stopPropagation()} className="w-full bg-transparent border border-[#2A3040] text-xs text-[#B0B3B8] px-2 py-1.5 focus:border-[#F25C05]/50 outline-none" />
                            ) : proposal.approach_md ? (
                              <div className="text-xs text-[#B0B3B8] whitespace-pre-wrap leading-relaxed"><MarkdownRenderer markdown={proposal.approach_md} /></div>
                            ) : null}
                          </div>

                          {/* Roadmap */}
                          <div>
                            <p className="text-[10px] text-[#F25C05] uppercase tracking-widest mb-1">Roadmap</p>
                            {isEditing ? (
                              <textarea rows={3} value={editForm.timeline_md || ""} onChange={(e) => { e.stopPropagation(); setEditForm({ ...editForm, timeline_md: e.target.value }); }} onClick={(e) => e.stopPropagation()} className="w-full bg-transparent border border-[#2A3040] text-xs text-[#B0B3B8] px-2 py-1.5 focus:border-[#F25C05]/50 outline-none" />
                            ) : proposal.timeline_md ? (
                              <div className="text-xs text-[#B0B3B8] whitespace-pre-wrap leading-relaxed"><MarkdownRenderer markdown={proposal.timeline_md} /></div>
                            ) : null}
                          </div>

                          {/* GitHub + Demo URLs (editable) */}
                          {isEditing && (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[10px] text-[#F25C05] uppercase tracking-widest mb-1">GitHub URL</p>
                                <input type="text" value={editForm.github_url || ""} onChange={(e) => setEditForm({ ...editForm, github_url: e.target.value })} onClick={(e) => e.stopPropagation()} className="w-full bg-transparent border border-[#2A3040] text-xs text-[#B0B3B8] px-2 py-1.5 focus:border-[#F25C05]/50 outline-none" />
                              </div>
                              <div>
                                <p className="text-[10px] text-[#F25C05] uppercase tracking-widest mb-1">Demo URL</p>
                                <input type="text" value={editForm.demo_url || ""} onChange={(e) => setEditForm({ ...editForm, demo_url: e.target.value })} onClick={(e) => e.stopPropagation()} className="w-full bg-transparent border border-[#2A3040] text-xs text-[#B0B3B8] px-2 py-1.5 focus:border-[#F25C05]/50 outline-none" />
                              </div>
                            </div>
                          )}

                          {/* Team Members */}
                          {isEditing ? (
                            <div>
                              <p className="text-[10px] text-[#F25C05] uppercase tracking-widest mb-1">Team Members</p>
                              <input
                                type="text"
                                value={editTeamMembers.join(", ")}
                                onChange={(e) => { e.stopPropagation(); setEditTeamMembers(e.target.value.split(",").map((s) => s.trim()).filter(Boolean)); }}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="alice, bob, carol (comma-separated)"
                                className="w-full bg-transparent border border-[#2A3040] text-xs text-[#B0B3B8] px-2 py-1.5 focus:border-[#F25C05]/50 outline-none"
                              />
                            </div>
                          ) : (() => {
                            const tm = proposal.team_members as any;
                            const members = Array.isArray(tm) ? tm : (tm?.members || []);
                            return members.length > 0 ? (
                              <div>
                                <p className="text-[10px] text-[#F25C05] uppercase tracking-widest mb-1">Team</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {members.map((member: string, i: number) => (
                                    <span key={i} className="text-[10px] text-[#B0B3B8] px-1.5 py-0.5 border border-[#2A3040]">{member}</span>
                                  ))}
                                </div>
                              </div>
                            ) : null;
                          })()}

                          {/* Milestones */}
                          {isEditing ? (
                            <div>
                              <p className="text-[10px] text-[#F25C05] uppercase tracking-widest mb-1">Milestones</p>
                              <div className="space-y-2">
                                {editMilestones.map((ms, i) => (
                                  <div key={i} className="border border-[#2A3040] p-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] text-[#555E6B]">#{i + 1}</span>
                                      <button onClick={() => setEditMilestones(editMilestones.filter((_, j) => j !== i))} className="text-[10px] text-[#F25C05] hover:underline">[remove]</button>
                                    </div>
                                    <input type="text" value={ms.title} onChange={(e) => { const u = [...editMilestones]; u[i] = { ...u[i], title: e.target.value }; setEditMilestones(u); }} placeholder="Deliverable" className="w-full bg-transparent border border-[#2A3040] text-xs text-[#B0B3B8] px-2 py-1 focus:border-[#F25C05]/50 outline-none" />
                                    <div className="grid grid-cols-2 gap-1">
                                      <input type="text" value={ms.amount} onChange={(e) => { const u = [...editMilestones]; u[i] = { ...u[i], amount: e.target.value }; setEditMilestones(u); }} placeholder="$amount" className="bg-transparent border border-[#2A3040] text-xs text-[#B0B3B8] px-2 py-1 focus:border-[#F25C05]/50 outline-none" />
                                      <input type="date" value={ms.deadline} onChange={(e) => { const u = [...editMilestones]; u[i] = { ...u[i], deadline: e.target.value }; setEditMilestones(u); }} className="bg-transparent border border-[#2A3040] text-xs text-[#B0B3B8] px-2 py-1 focus:border-[#F25C05]/50 outline-none" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); setEditMilestones([...editMilestones, { title: "", amount: "", deadline: "" }]); }} className="text-[10px] text-[#F25C05] hover:underline mt-1">{">"} add milestone</button>
                            </div>
                          ) : (() => {
                            const tm = proposal.team_members as any;
                            const proposalMilestones = Array.isArray(tm) ? [] : (tm?.milestones || []);
                            return proposalMilestones.length > 0 ? (
                              <div>
                                <p className="text-[10px] text-[#F25C05] uppercase tracking-widest mb-1">Milestones</p>
                                <div className="space-y-2">
                                  {proposalMilestones.map((ms: { title: string; amount: string; deadline: string }, i: number) => (
                                    // Two-row layout so long titles wrap onto their own lines
                                    // instead of being truncated. The amount + deadline live
                                    // on the second row, right-aligned, so they never get
                                    // pushed off-screen by a long title.
                                    <div key={i} className="text-xs">
                                      <div className="flex items-baseline gap-2">
                                        <span className="text-[#F25C05] shrink-0">#{i + 1}</span>
                                        <span className="text-[#F5F5F6] break-words flex-1">{ms.title}</span>
                                      </div>
                                      {(ms.amount || ms.deadline) && (
                                        <div className="flex items-baseline gap-2 mt-0.5 ml-5">
                                          {ms.amount && <span className="text-[#F25C05] font-mono">${ms.amount}</span>}
                                          {ms.deadline && <span className="text-[10px] text-[#555E6B]">{new Date(ms.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      )}

                      {/* Skills */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(Array.isArray(proposal.builder.skills) ? proposal.builder.skills : []).map((skill) => (
                          <span
                            key={skill}
                            className="text-[10px] text-[#F25C05] px-1.5 py-0.5 border border-[#F25C05]/30 bg-[#F25C05]/5"
                          >
                            [{skill}]
                          </span>
                        ))}
                      </div>

                      {/* Links */}
                      <div className="flex items-center gap-4 mt-2 text-xs">
                        {proposal.github_url && (
                          <a
                            href={proposal.github_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#B0B3B8] hover:text-[#F5F5F6] transition-colors"
                          >
                            {"<gh>"} github
                          </a>
                        )}
                        <Link
                          to={`/builders/${proposal.builder.username}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[#B0B3B8] hover:text-[#F5F5F6] transition-colors"
                        >
                          {"<→>"} profile
                        </Link>
                        {proposal.demo_url && (
                          <a
                            href={proposal.demo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#B0B3B8] hover:text-[#F5F5F6] transition-colors"
                          >
                            {"<→>"} demo
                          </a>
                        )}
                        <span className="text-[10px] text-[#555E6B] ml-auto">
                          {isExpanded ? "▲ collapse" : "▼ expand"}
                        </span>
                      </div>

                      {/* Market odds */}
                      {hackathon.status === "voting" &&
                        proposal.market_odds != null && (
                          <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-[#A0A3A9]">
                            <span>
                              ODDS: {Math.round(proposal.market_odds * 100)}%
                            </span>
                            <OddsBar odds={proposal.market_odds} />
                          </div>
                        )}
                    </motion.div>
                    </Fragment>
                    );
                  })}
                  {noCardIndex >= sortedProposals.length && (
                    <motion.div
                      key="__no_option_tail__"
                      variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                      className="border border-dashed border-[#EF4444]/40 bg-[#EF4444]/[0.03] p-4"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#EF4444]">No</span>
                        <span className="text-[10px] text-[#A0A3A9]">— none of the proposals win</span>
                      </div>
                      <p className="text-[10px] text-[#A0A3A9] mt-2">
                        If "No" wins, all investors get their money back. No prize is distributed.
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AsciiBox>

            {/* ── Proposal Edit History ────────────────────────── */}
            <ProposalEditHistory hackathonId={hackathon.id} proposals={hackathon.proposals} />

          </div>

          {/* ── Investors (token holders, mobile: last, desktop: sidebar) ── */}
          <div className="order-3 lg:order-none lg:col-start-3 lg:row-start-2">
              <AsciiBox title="INVESTORS" titleColor="green">
                {!tokenAddress ? (
                  <p className="text-xs text-[#A0A3A9] text-center py-4">
                    {"// token not launched yet //"}
                  </p>
                ) : holdersLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-[#F25C05] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : holdersData?.holders && holdersData.holders.length > 0 ? (
                  <div className="space-y-1.5 overflow-hidden">
                    <div className="flex items-center justify-between text-[10px] text-[#A0A3A9] uppercase tracking-widest mb-2">
                      <span>Wallet</span>
                      <span className="shrink-0">Supply %</span>
                    </div>
                    {holdersData.holders.map((holder, idx) => {
                      const isIdeator = ideatorWallet && holder.address === ideatorWallet;
                      const shortAddr = `${holder.address.slice(0, 4)}...${holder.address.slice(-4)}`;
                      const profile = investorUsernames[holder.address] || undefined;
                      return (
                        <div
                          key={`${holder.address}-${idx}`}
                          className={`flex items-center justify-between text-xs py-1 ${
                            isIdeator ? "text-[#F25C05]" : "text-[#B0B3B8]"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {profile?.username ? (
                              <WalletProfileBadge
                                wallet={holder.address}
                                profile={profile ?? undefined}
                                fallbackLabel={shortAddr}
                                className={`font-mono truncate ${isIdeator ? "text-[#F25C05]" : "text-[#B0B3B8]"}`}
                              />
                            ) : (
                              <a
                                href={`https://solscan.io/account/${holder.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={holder.address}
                                className="hover:underline font-mono truncate"
                              >
                                {shortAddr}
                              </a>
                            )}
                            {profile?.username && (
                              <span className="text-[10px] text-[#555E6B] font-mono shrink-0 hidden sm:inline">
                                ({shortAddr})
                              </span>
                            )}
                            {isIdeator && (
                              <span className="text-[10px] text-[#F25C05] border border-[#F25C05]/30 px-1 shrink-0">
                                [IDEATOR]
                              </span>
                            )}
                          </div>
                          <span className="font-mono shrink-0 ml-2">
                            {(holder.percentage ?? 0).toFixed(2)}%
                          </span>
                        </div>
                      );
                    })}
                    <div className="mt-2 pt-2 border-t border-[#2A3040] text-[10px] text-[#A0A3A9]">
                      Total supply: {(holdersData.totalSupply ?? 0).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#A0A3A9] text-center py-4">
                    {"// no holders found //"}
                  </p>
                )}
              </AsciiBox>
          </div>
        </div>
      </motion.div>
    </HackathonLayout>
  );
}
