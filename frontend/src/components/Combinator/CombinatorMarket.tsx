import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProposalMarketStatus } from "@/services/combinatorService";
import type { MarketStatus } from "@/services/combinatorService";
import CombinatorChart from "./CombinatorChart";
import CombinatorTrade from "./CombinatorTrade";

interface CombinatorMarketProps {
  proposalPda: string;
  tradeUrl?: string;
  baseSymbol?: string;
  optionLabels?: string[];
  twitterProfile?: { xId?: string; xUsername?: string; xConnected?: boolean };
}

function useMarketCountdown(endTime: number | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endTime) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endTime]);

  if (!endTime) return null;
  const diff = Math.max(0, endTime - now);
  if (diff === 0) return "ENDED";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}h:${pad(m)}m:${pad(s)}s`;
}

export default function CombinatorMarket({
  proposalPda,
  tradeUrl,
  baseSymbol: baseSymbolOverride,
  optionLabels,
  twitterProfile,
}: CombinatorMarketProps) {
  const {
    data: market,
    isLoading,
    error,
    refetch,
  } = useQuery<MarketStatus>({
    queryKey: ["combinator-market", proposalPda],
    queryFn: () => getProposalMarketStatus(proposalPda, optionLabels),
    enabled: !!proposalPda,
    refetchInterval: (query) => query.state.data?.isFinalized ? false : 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Push prices to DB for historical charts (fire-and-forget)
  useEffect(() => {
    if (!market?.options?.length || market.isFinalized) return;
    // Always push — even identical prices — to have data points over time
    const hasAnyPrice = market.options.some(o => o.spotPrice > 0 || o.twapPrice > 0);
    if (!hasAnyPrice) return;
    fetch("/api/combinator-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposal_pda: proposalPda,
        prices: market.options.map(o => ({ index: o.index, spot: o.spotPrice, twap: o.twapPrice })),
      }),
    }).catch(() => {});
  }, [market, proposalPda]);

  const resolvedBaseSymbol = baseSymbolOverride || market?.baseSymbol;
  const countdown = useMarketCountdown(market?.endTime);

  // Price preview from trade quoting
  const [pricePreview, setPricePreview] = useState<{ optionIndex: number; price: number } | null>(null);
  const handlePricePreview = useCallback((optionIndex: number, priceAfter: number | null) => {
    setPricePreview(priceAfter != null ? { optionIndex, price: priceAfter } : null);
  }, []);

  // After a trade: wait for blockchain, push new prices, then refresh chart
  const [chartRefreshKey, setChartRefreshKey] = useState(0);
  const handleTradeExecuted = useCallback(() => {
    // 1) After 5s: refetch market data from chain → pushes new prices to DB via useEffect
    setTimeout(async () => {
      await refetch();
      // 2) After another 5s: bump chart key to re-fetch historical prices from DB
      setTimeout(() => setChartRefreshKey(k => k + 1), 5000);
    }, 5000);
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <div className="w-6 h-6 border-2 border-[#F25C05] border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] text-[#A0A3A9]">loading market data...</p>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="text-center py-6 space-y-3">
        <p className="text-xs text-[#A0A3A9]">
          {"// unable to load market data //"}
        </p>
        <button
          onClick={() => refetch()}
          className="text-[10px] text-[#F25C05] hover:underline cursor-pointer"
        >
          {">"} retry
        </button>
        {tradeUrl && (
          <a
            href={tradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[10px] text-[#B0B3B8] hover:text-[#F5F5F6] transition-colors"
          >
            {">"} trade on combinator.trade
          </a>
        )}
      </div>
    );
  }

  const statusLabel = market.isWarmup
    ? "WARMUP"
    : market.isActive
    ? "ACTIVE"
    : market.isFinalized
    ? "FINALIZED"
    : "PENDING";

  return (
    <div className="space-y-4">
      {/* How it works */}
      <div className="flex items-center justify-between text-[10px] font-mono text-[#A0A3A9]">
        <span>The highest TWAP at the end wins the decision market</span>
        <div className="relative group shrink-0 ml-2">
          <a
            href="https://www.combinator.trade/how-it-works"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-3.5 h-3.5 border border-[#444B57] text-[8px] text-[#A0A3A9] hover:text-[#F25C05] hover:border-[#F25C05]/50 transition-colors"
          >
            ?
          </a>
          <div className="absolute right-0 top-full mt-1.5 w-56 p-2.5 bg-[#131822] border border-[#2A3040] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
            <p className="text-[10px] text-[#F25C05] font-bold mb-2 uppercase tracking-wider">
              WHO do you want to see winning?
            </p>
            <div className="space-y-1.5">
              {market.options.map((opt) => (
                <div key={opt.index} className="text-[9px] text-[#B0B3B8]">
                  <span className="text-[#F5F5F6] font-bold">{opt.label}</span>
                  {" — Buy "}
                  <span className="text-[#F5F5F6]">{opt.label}</span>
                  {" with "}{market.quoteSymbol}{" or sell "}{resolvedBaseSymbol}{" in others markets"}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-[#A0A3A9]">STATUS:</span>
          <span
            className={`font-bold ${
              market.isWarmup
                ? "text-[#EAB308]"
                : market.isActive
                ? "text-[#22C55E]"
                : market.isFinalized
                ? "text-[#A0A3A9]"
                : "text-[#B0B3B8]"
            }`}
          >
            {statusLabel}
          </span>
          {market.isActive && !market.isWarmup && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[#A0A3A9]">TWAP:</span>
          {market.isTwapActive ? (
            <>
              <span className="text-[#22C55E] font-bold">ACTIVE</span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]" />
              </span>
            </>
          ) : (
            <span className="text-[#555E6B]">INACTIVE</span>
          )}
        </div>
        {market.volume > 0 && (
          <div>
            <span className="text-[#A0A3A9]">VOL:</span>{" "}
            <span className="text-[#F5F5F6]">${market.volume.toFixed(2)}</span>
          </div>
        )}
        {market.trades > 0 && (
          <div>
            <span className="text-[#A0A3A9]">TRADES:</span>{" "}
            <span className="text-[#F5F5F6]">{market.trades}</span>
          </div>
        )}
        {market.traders > 0 && (
          <div>
            <span className="text-[#A0A3A9]">TRADERS:</span>{" "}
            <span className="text-[#F5F5F6]">{market.traders}</span>
          </div>
        )}
        {countdown && countdown !== "ENDED" && (
          <div>
            <span className="text-[#A0A3A9]">ENDS IN:</span>{" "}
            <span className="text-[#F5F5F6] flicker">{countdown}</span>
          </div>
        )}
        {market.leadingOption && (() => {
          // Win probability based on TWAP gap + time remaining
          // TWAP is active during last 48h of a 72h market — the longer it runs,
          // the harder it is to overtake the leader (TWAP inertia).
          const twaps = market.options.map(o => o.twapPrice).sort((a, b) => b - a);
          const topTwap = twaps[0] || 0;
          const secondTwap = twaps[1] || 0;
          const twapGap = topTwap > 0 ? (topTwap - secondTwap) / topTwap : 0; // 0-1 (relative gap)
          const totalDuration = (market.endTime - market.startTime) || 1;
          const remaining = Math.max(0, market.endTime - Date.now());
          const timeLeft = remaining / totalDuration; // 1 = just started, 0 = ended

          // TWAP inertia: with X% of time left, you'd need to move the spot price by
          // gap/timeLeft to catch up — which grows exponentially as time runs out.
          // At 12% gap with 2% time left: need 600% spot move = virtually impossible.
          // Formula: sigmoid mapping of (gap / timeLeft) to 50-99% range
          let winPct: number;
          if (market.isFinalized) {
            winPct = 100;
          } else if (timeLeft <= 0) {
            winPct = 99;
          } else {
            const difficulty = twapGap / timeLeft; // how hard it is to overtake
            // Sigmoid: 0→50%, 0.5→85%, 1→95%, 2→99%
            winPct = Math.min(99, Math.round(50 + 49 * (1 - Math.exp(-3 * difficulty))));
          }

          return (
            <div>
              <span className="text-[#A0A3A9]">LEADING:</span>{" "}
              <span className="text-[#F25C05] font-bold">{market.leadingOption}</span>
              {(market.isTwapActive || market.isFinalized) && (
                <span className="text-[#22C55E] ml-1">({winPct}% winning chance)</span>
              )}
            </div>
          );
        })()}
      </div>

      {/* Chart */}
      <CombinatorChart
        proposalPda={proposalPda}
        options={market.options}
        pricePreview={pricePreview}
        refreshKey={chartRefreshKey}
      />

      {/* Trade panel */}
      <CombinatorTrade
        proposalPda={proposalPda}
        options={market.options}
        isActive={market.isActive}
        isFinalized={market.isFinalized}
        vaultPda={market.vaultPda}
        baseMint={market.baseMint}
        quoteMint={market.quoteMint}
        baseSymbol={resolvedBaseSymbol}
        quoteSymbol={market.quoteSymbol}
        baseDecimals={market.baseDecimals}
        quoteDecimals={market.quoteDecimals}
        tradeUrl={tradeUrl}
        twitterProfile={twitterProfile}
        onPricePreview={handlePricePreview}
        onTradeExecuted={handleTradeExecuted}
      />

      {/* External link */}
      {tradeUrl && (
        <a
          href={tradeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-[10px] text-[#A0A3A9] hover:text-[#F25C05] transition-colors"
        >
          {">"} view full market on combinator.trade
        </a>
      )}
    </div>
  );
}
