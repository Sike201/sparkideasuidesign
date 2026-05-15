import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, ArrowUpRight } from "lucide-react";
import { useIdeasAuth } from "@/hooks/useIdeasAuth";
import { useIdeasData } from "@/hooks/useIdeasData";
import IdeasLayout from "@/components/Ideas/IdeasLayout";
import Aurora from "@/components/Aurora";
import { SEO } from "@/components/SEO";
import type { Idea } from "@/components/Ideas/types";
import { viewVault, type RedemptionCluster, type VaultState } from "@/services/redemptionVaultSdk";
import {
  MOCK_FUNDED_ACTIVE,
  MOCK_FUNDED_GRAVEYARD,
  mockProgressPct,
  type MockFundedProject,
} from "@/data/mockFundedPortfolio";

const CLUSTER: RedemptionCluster =
  (import.meta.env.VITE_SOLANA_NETWORK as RedemptionCluster) || "devnet";

const AURORA_STOPS = ["#431407", "#ea580c", "#fdba74"];
const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.48, ease: easeOut } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function MockPortfolioCard({ project, index }: { project: MockFundedProject; index: number }) {
  const pct = mockProgressPct(project);
  const isG = project.status === "graveyard";
  return (
    <motion.article variants={fadeUp} className="h-full">
      <Link
        to={`/funded/mock/${project.slug}`}
        className={`group flex h-full flex-col overflow-hidden border bg-black/60 backdrop-blur-[2px] transition-colors duration-300 ${
          isG
            ? "border-white/[0.05] hover:border-white/[0.12]"
            : "border-white/[0.08] hover:border-orange-500/30"
        }`}
      >
        <div className="relative block overflow-hidden bg-neutral-950">
          <motion.img
            src={project.image}
            alt=""
            className="aspect-[5/4] w-full object-cover sm:aspect-[16/11]"
            whileHover={{ scale: 1.04 }}
            transition={{ duration: 0.55, ease: easeOut }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-90" />
          <div className="absolute left-3 top-3 flex items-center gap-2 sm:left-4 sm:top-4">
            <span
              className={`rounded border px-2 py-0.5 font-geist-mono text-[9px] uppercase tracking-[0.18em] ${
                isG ? "border-white/10 bg-black/70 text-neutral-400" : "border-orange-500/35 bg-black/70 text-orange-200/95"
              }`}
            >
              {isG ? "Archive" : "Funded"}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col border-t border-white/[0.06] p-4 sm:p-5">
          <p className="font-geist-mono text-[10px] uppercase tracking-[0.22em] text-neutral-600">{project.category}</p>
          <h3 className="mt-1.5 font-satoshi text-[17px] font-semibold leading-snug tracking-tight text-white transition-colors group-hover:text-orange-50">
            {project.title}
          </h3>
          <p className="mt-2 line-clamp-2 flex-1 font-geist text-[12px] leading-relaxed text-neutral-500">{project.tagline}</p>

          <div className="mt-4">
            <div className="mb-1.5 flex items-end justify-between gap-2">
              <span className="font-geist-mono text-[11px] tabular-nums text-orange-300/95">{pct}%</span>
              <span className="text-right font-geist-mono text-[10px] text-neutral-600">
                {fmtMoney(project.raisedUsd)} / {fmtMoney(project.goalUsd)}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-orange-600 to-orange-400"
                initial={{ width: 0 }}
                whileInView={{ width: `${Math.min(100, pct)}%` }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.9, delay: 0.12 + index * 0.04, ease: easeOut }}
              />
            </div>
          </div>

          <span className="mt-4 inline-flex items-center gap-1.5 font-geist text-[11px] font-medium text-neutral-500 transition-colors group-hover:text-orange-400">
            Investment memo
            <ArrowUpRight className="h-3.5 w-3.5 opacity-70" strokeWidth={1.5} />
          </span>
        </div>
      </Link>
    </motion.article>
  );
}

function LiveFundedRow({
  idea,
  onClick,
  extra,
}: {
  idea: Idea & { progress: number };
  onClick: () => void;
  extra?: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35 }}
      className="flex w-full flex-col gap-2 border-b border-white/[0.06] py-5 text-left transition-colors hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 flex-1">
        <p className="font-satoshi text-[15px] font-semibold tracking-tight text-white">{idea.title}</p>
        <p className="mt-1 font-geist text-[11px] text-neutral-500">{idea.category}</p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <p className="font-geist-mono text-[12px] text-orange-300/90">
          {`${Math.round(idea.progress)}% · ${fmtMoney(idea.raisedAmount || 0)} / ${fmtMoney(idea.estimatedPrice || 0)}`}
        </p>
        {extra}
      </div>
    </motion.button>
  );
}

export default function FundedPage() {
  const auth = useIdeasAuth();
  const ideasData = useIdeasData(auth);
  const navigate = useNavigate();

  const fundedIdeasAll = useMemo(
    () =>
      ideasData.ideas
        .filter((i) => i.tokenAddress)
        .map((i) => ({
          ...i,
          progress: ((i.raisedAmount || 0) / (i.estimatedPrice || 1)) * 100,
        })),
    [ideasData.ideas],
  );

  const [vaultStates, setVaultStates] = useState<Record<string, VaultState | null>>({});
  const [isCheckingVaults, setIsCheckingVaults] = useState(false);

  useEffect(() => {
    if (fundedIdeasAll.length === 0) {
      setIsCheckingVaults(false);
      return;
    }
    const toCheck = fundedIdeasAll.filter((i) => vaultStates[i.id] === undefined);
    if (toCheck.length === 0) {
      setIsCheckingVaults(false);
      return;
    }
    let cancelled = false;
    setIsCheckingVaults(true);
    (async () => {
      const results = await Promise.all(
        toCheck.map(async (i) => {
          try {
            const v = await viewVault(i.id, CLUSTER);
            return [i.id, v] as const;
          } catch {
            return [i.id, null] as const;
          }
        }),
      );
      if (cancelled) return;
      setVaultStates((prev) => {
        const next = { ...prev };
        for (const [id, v] of results) next[id] = v;
        return next;
      });
      setIsCheckingVaults(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fundedIdeasAll, vaultStates]);

  const graveyardIdeas = fundedIdeasAll.filter((i) => vaultStates[i.id] != null);
  const graveyardIds = new Set(graveyardIdeas.map((i) => i.id));
  const fundedIdeas = fundedIdeasAll.filter((i) => i.status !== "refunded" && !graveyardIds.has(i.id));

  const handleIdeaClick = (idea: Idea) => {
    ideasData.setSelectedIdea(idea);
    navigate(`/ideas/${idea.slug}`, { state: { from: "/funded" } });
  };

  const isLoading = ideasData.isLoadingIdeas;

  const committedDisplay = useMemo(() => {
    const sum = MOCK_FUNDED_ACTIVE.reduce((s, p) => s + p.raisedUsd, 0);
    if (sum >= 1e6) return `$${(sum / 1e6).toFixed(1)}M`;
    return fmtMoney(sum);
  }, []);

  return (
    <IdeasLayout auth={auth} ideasData={ideasData}>
      <SEO
        title="Funded"
        description="Spark portfolio — active launches, live registry, and archived programs."
        path="/funded"
      />

      <div className="relative -mx-6 min-h-[calc(100vh-8rem)] md:-mx-10">
        <div className="pointer-events-none fixed inset-0 z-0 bg-black">
          <div className="h-full w-full origin-center -scale-y-100 opacity-[0.42]">
            <Aurora colorStops={AURORA_STOPS} amplitude={1} blend={0.5} />
          </div>
        </div>

        <div className="relative z-10 px-6 md:px-10">
          <motion.header
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: easeOut }}
            className="mb-10 border-b border-white/[0.07] pb-10 md:mb-14 md:pb-12"
          >
            <p className="font-geist-mono text-[11px] uppercase tracking-[0.32em] text-orange-400/90">Portfolio</p>
            <h1 className="mt-3 font-satoshi text-[clamp(1.75rem,4vw,2.35rem)] font-semibold tracking-tight text-white">
              Funded
            </h1>
            <p className="mt-4 max-w-2xl font-geist text-[13px] leading-relaxed text-neutral-500">
              Mandates that cleared Spark raise mechanics — structured like an institutional sleeve, readable like a
              venture portfolio. Figures below include curated design previews alongside the live registry.
            </p>
            <dl className="mt-8 grid max-w-lg grid-cols-2 gap-6 border-t border-white/[0.06] pt-8 font-geist">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.22em] text-neutral-600">Preview sleeve</dt>
                <dd className="mt-1 font-geist-mono text-lg tabular-nums text-white">{committedDisplay}</dd>
                <dd className="mt-0.5 text-[11px] text-neutral-600">committed (illustrative)</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.22em] text-neutral-600">Active cards</dt>
                <dd className="mt-1 font-geist-mono text-lg tabular-nums text-white">{MOCK_FUNDED_ACTIVE.length}</dd>
                <dd className="mt-0.5 text-[11px] text-neutral-600">design previews</dd>
              </div>
            </dl>
          </motion.header>

          <section className="mb-16 md:mb-20">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-geist-mono text-[10px] uppercase tracking-[0.28em] text-neutral-500">
                  Featured launches
                </h2>
                <p className="mt-1 font-geist text-[12px] text-neutral-600">Select a card to open the investment memo.</p>
              </div>
            </div>

            <motion.div
              className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
              variants={stagger}
              initial="hidden"
              animate="show"
            >
              {MOCK_FUNDED_ACTIVE.map((project, index) => (
                <MockPortfolioCard key={project.slug} project={project} index={index} />
              ))}
            </motion.div>
          </section>

          <section className="mb-16 md:mb-20">
            <h2 className="mb-1 font-geist-mono text-[10px] uppercase tracking-[0.28em] text-neutral-500">Live registry</h2>
            <p className="mb-6 max-w-xl font-geist text-[12px] text-neutral-600">
              On-chain ideas with minted exposure — pulled from your connected data source.
            </p>
            {isLoading ? (
              <div className="flex items-center gap-2 py-12 text-neutral-500">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                <span className="font-geist text-[13px]">Loading registry…</span>
              </div>
            ) : fundedIdeas.length === 0 ? (
              <p className="border-t border-white/[0.06] py-10 font-geist text-[13px] text-neutral-600">
                No live funded ideas in this environment yet.
              </p>
            ) : (
              <div className="border-t border-white/[0.06]">
                {fundedIdeas.map((idea) => (
                  <LiveFundedRow
                    key={idea.id}
                    idea={idea}
                    onClick={() => handleIdeaClick(idea)}
                    extra={
                      idea.capReachedAt ? (
                        <span className="font-geist text-[11px] text-neutral-600">Round window may apply</span>
                      ) : null
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-1 font-geist-mono text-[10px] uppercase tracking-[0.28em] text-neutral-500">Archive</h2>
            <p className="mb-6 max-w-xl font-geist text-[12px] text-neutral-600">
              Programs with concluded liquidity or redemption flows — design previews plus live vault-linked rows.
            </p>

            <motion.div
              className="mb-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
            >
              {MOCK_FUNDED_GRAVEYARD.map((project, index) => (
                <MockPortfolioCard key={project.slug} project={project} index={index} />
              ))}
            </motion.div>

            {isLoading || isCheckingVaults ? (
              <div className="flex items-center gap-2 py-6 text-neutral-500">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500/80" />
                <span className="font-geist text-[12px]">Checking vault state…</span>
              </div>
            ) : graveyardIdeas.length === 0 ? null : (
              <>
                <h3 className="mb-3 font-geist-mono text-[10px] uppercase tracking-[0.22em] text-neutral-600">
                  Redemption-linked
                </h3>
                <div className="border-t border-white/[0.06]">
                  {graveyardIdeas.map((idea) => {
                    const vault = vaultStates[idea.id];
                    const launchedAmount = idea.raisedAmount || 0;
                    const refundedAmount = vault
                      ? Number(vault.totalUsdgDeposited) / 10 ** vault.usdgDecimals
                      : 0;
                    const deltaPct =
                      launchedAmount > 0 ? ((refundedAmount - launchedAmount) / launchedAmount) * 100 : null;
                    return (
                      <LiveFundedRow
                        key={idea.id}
                        idea={idea}
                        onClick={() => handleIdeaClick(idea)}
                        extra={
                          <span className="font-geist text-[11px] text-neutral-500">
                            Launched {fmtMoney(launchedAmount)} · Refund {fmtMoney(refundedAmount)}
                            {deltaPct != null ? (
                              <span className={deltaPct < 0 ? " text-red-400/90" : " text-emerald-400/90"}>
                                {" "}
                                ({deltaPct > 0 ? "+" : ""}
                                {deltaPct.toFixed(1)}%)
                              </span>
                            ) : null}
                            <span className="block text-orange-400/80">Open detail to redeem</span>
                          </span>
                        }
                      />
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <p className="mt-16 border-t border-white/[0.06] pt-8 font-geist text-[11px] text-neutral-600">
            Featured cards are visual design previews. Live rows reflect your deployment.{" "}
            <Link to="/ideas" className="text-orange-400/90 underline-offset-4 hover:underline">
              Back to ideas
            </Link>
          </p>
        </div>
      </div>
    </IdeasLayout>
  );
}
