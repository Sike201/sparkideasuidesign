import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DollarSign, Timer, Lock, Trophy, Skull, Loader2 } from "lucide-react";
import { useIdeasAuth } from "@/hooks/useIdeasAuth";
import { useIdeasData } from "@/hooks/useIdeasData";
import IdeasLayout from "@/components/Ideas/IdeasLayout";
import { categoryColors } from "@/components/Ideas";
import { SEO } from "@/components/SEO";
import type { Idea } from "@/components/Ideas/types";
import { viewVault, type RedemptionCluster, type VaultState } from "@/services/redemptionVaultSdk";

// The redemption vault program lives on devnet today — mirrors RedemptionSection.
const CLUSTER: RedemptionCluster =
  (import.meta.env.VITE_SOLANA_NETWORK as RedemptionCluster) || "devnet";

export default function FundedPage() {
  const auth = useIdeasAuth();
  const ideasData = useIdeasData(auth);
  const navigate = useNavigate();

  // All funded ideas (token launched). Graveyard is a subset of these — funded
  // ideas that have a redemption vault initialized on-chain. We only render
  // cards where `hasVault` is true in the Graveyard grid below.
  const fundedIdeasAll = useMemo(
    () =>
      ideasData.ideas
        .filter(i => i.tokenAddress)
        .map(i => ({
          ...i,
          progress: ((i.raisedAmount || 0) / (i.estimatedPrice || 1)) * 100,
        })),
    [ideasData.ideas],
  );

  // Per-funded-idea vault state. `undefined` = not checked yet, `null` = no
  // vault, otherwise the full VaultState so the graveyard card can show the
  // refund figures (totalUsdgDeposited, decimals, etc.).
  const [vaultStates, setVaultStates] = useState<Record<string, VaultState | null>>({});
  const [isCheckingVaults, setIsCheckingVaults] = useState(false);

  useEffect(() => {
    if (fundedIdeasAll.length === 0) {
      setIsCheckingVaults(false);
      return;
    }
    // Only check ideas we haven't resolved yet, so re-renders don't re-fetch.
    const toCheck = fundedIdeasAll.filter(i => vaultStates[i.id] === undefined);
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
      setVaultStates(prev => {
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

  // Graveyard = funded ideas with a redemption vault initialized on-chain.
  // Holders can burn their Ideacoin against the vault (RedemptionSection on
  // the detail page).
  const graveyardIdeas = fundedIdeasAll.filter(i => vaultStates[i.id] != null);

  // Funded Ideas shown at top = launched tokens that AREN'T in the graveyard.
  // An idea in the graveyard has been wound down; keeping it in the Funded
  // grid would overstate the "alive" count and double-list it on the page.
  const graveyardIds = new Set(graveyardIdeas.map(i => i.id));
  const fundedIdeas = fundedIdeasAll.filter(
    i => i.status !== "refunded" && !graveyardIds.has(i.id),
  );

  const handleIdeaClick = (idea: Idea) => {
    ideasData.setSelectedIdea(idea);
    navigate(`/ideas/${idea.slug}`, { state: { from: "/funded" } });
  };

  const isLoading = ideasData.isLoadingIdeas;

  return (
    <IdeasLayout auth={auth} ideasData={ideasData}>
      <SEO
        title="Funded Ideas"
        description="Explore ideas that have been funded by the community and are being built right now."
        path="/funded"
      />
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-1.5">
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          <h2 className="text-lg font-semibold text-white font-satoshi">Funded Ideas</h2>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-white/[0.02] border border-white/[0.04] overflow-hidden animate-pulse"
              >
                <div className="h-[2px] bg-gradient-to-r from-amber-500/20 via-amber-400/20 to-transparent" />
                <div className="h-64 bg-neutral-900/40" />
                <div className="-mt-8 relative z-10 p-5 space-y-3">
                  <div className="h-4 w-2/3 rounded bg-white/5" />
                  <div className="h-1.5 w-full rounded-full bg-white/5" />
                  <div className="h-3 w-1/2 rounded bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : fundedIdeas.length === 0 ? (
          <div className="text-center py-16 text-neutral-500 font-satoshi">
            <Trophy className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No funded ideas yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {fundedIdeas.map((idea) => {
              const colors = categoryColors[idea.category] || categoryColors["AI x Crypto"];
              return (
                <div
                  key={idea.id}
                  onClick={() => handleIdeaClick(idea)}
                  className="relative rounded-2xl bg-white/[0.02] border border-amber-500/15 hover:border-amber-500/40 transition-all cursor-pointer group overflow-hidden"
                >
                  {/* Accent Line */}
                  <div className="h-[2px] bg-gradient-to-r from-amber-500/40 via-amber-400/40 to-transparent" />
                  {/* Funded Badge */}
                  <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 backdrop-blur-sm text-[10px] font-semibold text-amber-300">
                    Funded ✓
                  </div>
                  {/* Image */}
                  <div className="relative h-64 bg-neutral-900/30">
                    {idea.generatedImageUrl ? (
                      <img
                        src={idea.generatedImageUrl}
                        alt={idea.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Trophy className="w-8 h-8 text-amber-500/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#030303] via-transparent to-transparent" />
                  </div>
                  {/* Content */}
                  <div className="-mt-8 relative z-10 p-5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-sm font-medium text-white font-satoshi line-clamp-1 group-hover:text-amber-100 transition-colors">
                        {idea.title}
                      </h4>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] font-medium ${colors.bg} ${colors.text} ${colors.border} border`}>
                        {idea.category}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-500"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-geist">
                      <span className="text-amber-400 font-black font-satoshi">{idea.progress.toFixed(0)}%</span>
                      <span className="text-neutral-500 flex items-center gap-0.5">
                        <DollarSign className="w-2.5 h-2.5" />
                        <span className="font-bold font-satoshi">{(idea.raisedAmount || 0).toLocaleString()}</span> / <span className="font-bold font-satoshi">{(idea.estimatedPrice || 0).toLocaleString()}</span>
                      </span>
                    </div>
                    {/* Countdown */}
                    {(() => {
                      if (!idea.capReachedAt) return null;
                      const capDeadline = new Date(new Date(idea.capReachedAt).getTime() + 24 * 60 * 60 * 1000);
                      const timeLeft = Math.max(0, capDeadline.getTime() - ideasData.now.getTime());
                      if (timeLeft === 0) {
                        return (
                          <div className="mt-2 flex items-center gap-1 text-[10px] text-red-400">
                            <Lock className="w-3 h-3" />
                            <span className="font-medium">Investment Round Closed</span>
                          </div>
                        );
                      }
                      const d = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                      const h = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                      const m = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                      const s = Math.floor((timeLeft % (1000 * 60)) / 1000);
                      const pad = (n: number) => n.toString().padStart(2, "0");
                      return (
                        <div className="mt-2 flex items-center gap-1.5 text-[10px]">
                          <Timer className="w-3 h-3 text-yellow-400" />
                          <span className="text-yellow-400 font-medium">Closes in</span>
                          <span className="text-yellow-300 font-mono font-bold">{pad(d)}:{pad(h)}:{pad(m)}:{pad(s)}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Graveyard ── */}
        <div className="mt-12">
          <div className="flex items-center gap-2 mb-4">
            <div className="rounded-xl bg-neutral-500/10 border border-neutral-500/20 p-1.5">
              <Skull className="w-5 h-5 text-neutral-400" />
            </div>
            <h2 className="text-lg font-semibold text-white font-satoshi">Graveyard</h2>
            <span className="text-[11px] text-neutral-500 font-satoshi hidden sm:inline">
              — funded ideas with a redemption vault · burn your Ideacoin for USDG
            </span>
          </div>
          {isLoading || isCheckingVaults ? (
            <div className="flex items-center justify-center py-10 text-neutral-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : graveyardIdeas.length === 0 ? (
            <div className="text-center py-10 text-neutral-600 font-satoshi">
              <Skull className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No graveyard ideas — all funded projects are still alive.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {graveyardIdeas.map((idea) => {
                const colors = categoryColors[idea.category] || categoryColors["AI x Crypto"];
                const vault = vaultStates[idea.id];
                // Launch figure = what the token actually raised at funding
                // close. Refund figure = USDG the ideator deposited into the
                // vault for holders to burn their tokens against. We compare
                // the two to show how much of the raise is being returned.
                const launchedAmount = idea.raisedAmount || 0;
                const refundedAmount = vault
                  ? Number(vault.totalUsdgDeposited) / 10 ** vault.usdgDecimals
                  : 0;
                // Delta as % of launch. Guard against divide-by-zero for the
                // rare legacy idea that has a vault but no raise record.
                const deltaPct =
                  launchedAmount > 0
                    ? ((refundedAmount - launchedAmount) / launchedAmount) * 100
                    : null;
                const deltaIsLoss = deltaPct !== null && deltaPct < 0;
                const deltaColor =
                  deltaPct === null
                    ? "text-neutral-500"
                    : deltaIsLoss
                      ? "text-red-400"
                      : "text-emerald-400";
                return (
                  <div
                    key={idea.id}
                    onClick={() => handleIdeaClick(idea)}
                    className="relative rounded-2xl bg-white/[0.01] border border-white/[0.06] hover:border-red-500/30 transition-all cursor-pointer group overflow-hidden"
                  >
                    {/* Accent Line */}
                    <div className="h-[2px] bg-gradient-to-r from-red-500/30 via-neutral-500/20 to-transparent" />
                    {/* Redemption Badge */}
                    <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 backdrop-blur-sm text-[10px] font-semibold text-red-300">
                      Redemption
                    </div>
                    {/* Image */}
                    <div className="relative h-48 bg-neutral-900/30">
                      {idea.generatedImageUrl ? (
                        <img
                          src={idea.generatedImageUrl}
                          alt={idea.title}
                          className="w-full h-full object-cover opacity-50 grayscale group-hover:opacity-70 transition-all duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Skull className="w-8 h-8 text-neutral-500/30" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#030303] via-[#030303]/60 to-transparent" />
                    </div>
                    {/* Content */}
                    <div className="-mt-8 relative z-10 p-5">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <h4 className="text-sm font-medium text-neutral-200 font-satoshi line-clamp-1 group-hover:text-red-100 transition-colors">
                          {idea.title}
                        </h4>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] font-medium ${colors.bg} ${colors.text} ${colors.border} border opacity-60`}>
                          {idea.category}
                        </span>
                      </div>
                      {/* Launched vs Refunded — two-column compact readout
                          with a delta chip. Uses whole-number formatting;
                          fractional stablecoin amounts add noise here. */}
                      <div className="grid grid-cols-2 gap-2 mb-2 font-satoshi">
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-neutral-600 font-semibold">
                            Launched
                          </div>
                          <div className="flex items-center gap-0.5 text-xs font-bold text-neutral-200">
                            <DollarSign className="w-2.5 h-2.5 text-neutral-500" />
                            {launchedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-neutral-600 font-semibold">
                            Refunded
                          </div>
                          <div className="flex items-center gap-0.5 text-xs font-bold text-neutral-200">
                            <DollarSign className="w-2.5 h-2.5 text-neutral-500" />
                            {refundedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-satoshi">
                        <span className={`font-bold ${deltaColor}`}>
                          {deltaPct === null
                            ? "—"
                            : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`}
                        </span>
                        <span className="text-red-400/80 font-medium">
                          → redeem tokens
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </IdeasLayout>
  );
}
