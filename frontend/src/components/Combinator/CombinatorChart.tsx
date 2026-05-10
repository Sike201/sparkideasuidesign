import { useState, useEffect, useRef } from "react";
import { createChart, IChartApi, ISeriesApi, LineSeries, UTCTimestamp, IPriceLine } from "lightweight-charts";
import type { MarketOption } from "@/services/combinatorService";
import { sdkSubscribeMarket } from "@/services/combinatorSdk";

const OPTION_COLORS = [
  "#EF4444", // red    - option 0 (usually "No")
  "#F25C05", // orange - option 1
  "#22C55E", // green  - option 2
  "#3B82F6", // blue   - option 3
  "#A855F7", // purple - option 4
  "#EAB308", // yellow - option 5
];

type ChartMode = "price" | "twap";
/**
 * Time window the chart fetches + displays. The buttons in the header
 * map 1:1 to a `range` query param the backend honors (see
 * `combinator-prices.ts handleGet`). Defaulting to "24h" gives a
 * useful initial view even on long-running markets — "all" used to
 * be the default but loaded thousands of points for any market that
 * had been live for weeks, dragging chart init.
 */
type ChartRange = "2h" | "24h" | "all";
const RANGE_LABELS: Record<ChartRange, string> = { "2h": "2H", "24h": "24H", "all": "All" };

interface PriceRow {
  option_index: number;
  spot_price: number;
  twap_price: number;
  timestamp: string;
}

interface CombinatorChartProps {
  proposalPda: string;
  options: MarketOption[];
  className?: string;
  pricePreview?: { optionIndex: number; price: number } | null;
  refreshKey?: number;
  /**
   * Fires on every on-chain price tick observed by this chart's SDK
   * subscription. Lets the parent keep its React Query cache in sync
   * WITHOUT opening a second `sdkSubscribeMarket` — two parallel subs
   * to the same pools get rate-limited by public mainnet-beta RPC,
   * and the silent one leaves the parent's cache stale (which in turn
   * makes `/api/combinator-prices` POSTs write pre-trade values).
   * Optional: desktop `CombinatorMarket` doesn't need it (polls at 60s).
   */
  onPriceTick?: (tick: { index: number; spotPrice: number; twapPrice: number }) => void;
}

export default function CombinatorChart({
  proposalPda,
  options,
  className = "",
  pricePreview,
  refreshKey = 0,
  onPriceTick,
}: CombinatorChartProps) {
  // Stash in a ref so the subscription effect doesn't re-run every time
  // the parent passes a new callback identity — its deps would otherwise
  // churn the WebSocket on each render.
  const onPriceTickRef = useRef(onPriceTick);
  useEffect(() => {
    onPriceTickRef.current = onPriceTick;
  }, [onPriceTick]);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Map<number, ISeriesApi<"Line">>>(new Map());
  const [mode, setMode] = useState<ChartMode>("price");
  const [range, setRange] = useState<ChartRange>("24h");
  /**
   * Guard that gates live updates until the DB history fetch has settled.
   * Without this, the sequence on mount was:
   *   1. series created (empty)
   *   2. SDK tick arrives → series.update() paints ONE live point
   *   3. history fetch resolves → series.setData() OVERWRITES that point
   *   4. next tick lands → series.update() again, now on top of history
   * Step 3 made the chart visibly "flash and re-draw" a minute or so
   * after load, because the user would accumulate a few live ticks on
   * an otherwise empty line before setData wiped them. We now buffer
   * any ticks that race the history fetch and replay them after
   * setData, so the transition is seamless.
   */
  const historyLoadedRef = useRef(false);
  /** Latest-tick-per-option buffer for ticks that arrive before setData. */
  const pendingTicksRef = useRef<Map<number, { time: UTCTimestamp; value: number }>>(new Map());
  /**
   * Wall-clock timestamp of the most recent on-chain tick that ACTUALLY
   * changed the displayed value, surfaced as a "last update HH:MM:SS"
   * indicator above the chart. We track per-option last-seen value in
   * `lastValueByIndexRef` and only stamp `lastUpdateAt` when the new
   * value is different — same-value ticks (the WS fires whenever the
   * account is touched, even when reserves don't move) would otherwise
   * make the clock look like a heartbeat instead of a real-data marker.
   * Reset on `proposalPda` change so a stale timestamp from a previous
   * market doesn't leak across navigation.
   */
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const lastValueByIndexRef = useRef<Map<number, number>>(new Map());

  // Initialize chart + fetch data from our DB
  useEffect(() => {
    if (!containerRef.current || !proposalPda || options.length === 0) return;

    // Reset the gate + buffer on every re-init (mount, refreshKey bump,
    // proposal change, mode toggle). Live ticks will queue in the buffer
    // until history has been setData'd.
    historyLoadedRef.current = false;
    pendingTicksRef.current.clear();
    // Clear the "last update" heartbeat so the user doesn't see a stale
    // timestamp from a previous market while the new one bootstraps.
    setLastUpdateAt(null);
    lastValueByIndexRef.current.clear();

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#A0A3A9",
        fontFamily: "monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(42, 48, 64, 0.3)" },
        horzLines: { color: "rgba(42, 48, 64, 0.3)" },
      },
      crosshair: {
        vertLine: { color: "#F25C05", width: 1, style: 2 },
        horzLine: { color: "#F25C05", width: 1, style: 2 },
      },
      timeScale: {
        borderColor: "#2A3040",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: { borderColor: "#2A3040" },
      handleScroll: { vertTouchDrag: false },
      width: containerRef.current.clientWidth,
      height: 280,
    });

    chartRef.current = chart;

    const localSeries = new Map<number, ISeriesApi<"Line">>();
    // Auto-detect precision from price magnitude
    const samplePrice = options.find(o => o.spotPrice > 0)?.spotPrice || 0;
    const precision = samplePrice > 0 && samplePrice < 0.01 ? 7 : samplePrice < 1 ? 4 : 2;
    const minMove = Math.pow(10, -precision);

    options.forEach((opt) => {
      const color = OPTION_COLORS[opt.index % OPTION_COLORS.length];
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        title: opt.label,
        priceFormat: { type: "price", precision, minMove },
      });
      localSeries.set(opt.index, series);
      seriesRef.current.set(opt.index, series);
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(containerRef.current);

    // Fetch price history from our DB, then flip the gate and flush
    // any ticks that raced us. `try/finally` guarantees the gate flips
    // even on a 4xx/5xx so live updates aren't silently blocked forever
    // when the DB is empty or the endpoint is down.
    (async () => {
      try {
        const fetchUrl = `/api/combinator-prices?proposal_pda=${encodeURIComponent(proposalPda)}&range=${range}`;
        console.log("[chart-debug] fetching history", { range, fetchUrl });
        const res = await fetch(fetchUrl);
        if (!res.ok) {
          console.warn("[chart-debug] history fetch failed", { status: res.status });
          return;
        }
        const { data } = (await res.json()) as { data: PriceRow[] };
        console.log("[chart-debug] history fetched", {
          range,
          rowCount: data?.length ?? 0,
          firstTimestamp: data?.[0]?.timestamp,
          lastTimestamp: data?.[data.length - 1]?.timestamp,
        });
        if (!data?.length) return;

        // Group by option index
        const byIndex = new Map<number, { time: UTCTimestamp; value: number }[]>();
        for (const row of data) {
          const time = (new Date(row.timestamp).getTime() / 1000) as UTCTimestamp;
          const value = mode === "price" ? row.spot_price : row.twap_price;
          if (!byIndex.has(row.option_index)) byIndex.set(row.option_index, []);
          byIndex.get(row.option_index)!.push({ time, value });
        }

        byIndex.forEach((points, index) => {
          const series = localSeries.get(index);
          if (series) {
            series.setData(points.sort((a, b) => (a.time as number) - (b.time as number)));
          }
        });

        // Initial visible window per range. We deliberately fetch
        // beyond the visible window for 24h/All (the backend doesn't
        // cutoff there) so the user can scroll-pan left to see
        // older data — `setVisibleRange` just sets the INITIAL
        // zoom, not a hard limit. For 2h the backend already cuts
        // off at 2h ago, so `fitContent` is sufficient.
        const nowSec = Math.floor(Date.now() / 1000) as UTCTimestamp;
        if (range === "2h") {
          chart.timeScale().fitContent();
        } else if (range === "24h") {
          chart.timeScale().setVisibleRange({
            from: (nowSec - 24 * 3600) as UTCTimestamp,
            to: nowSec,
          });
        } else {
          // "all" — fit everything; the user can still pan/zoom.
          chart.timeScale().fitContent();
        }
      } catch {
        // DB may not have data yet
      } finally {
        // Open the gate. Any ticks buffered during the fetch (via the
        // props-driven and SDK subscription effects below) get replayed
        // now so the chart picks up exactly where live is — no flash.
        historyLoadedRef.current = true;
        pendingTicksRef.current.forEach((tick, index) => {
          const series = localSeries.get(index);
          if (series) series.update(tick);
        });
        pendingTicksRef.current.clear();
      }
    })();

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current.clear();
    };
    // CRITICAL: depend on `options.length`, NOT `options`. The parent
    // patches the options array on every on-chain tick via setQueryData,
    // so the array reference changes constantly. Using `options` here
    // would tear down and recreate the entire chart (including re-fetch
    // of historical prices) on every trade, making live updates appear
    // stuck — the viewer sees a reset before any new tick lands.
    // `options.length` only changes when the market actually loads
    // (0 → N) or reshuffles, which is the only case we need to re-init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalPda, options.length, mode, range, refreshKey]);

  // Price preview line (dashed) showing where price will go after trade
  const priceLineRef = useRef<{ series: ISeriesApi<"Line">; line: IPriceLine } | null>(null);

  useEffect(() => {
    // Remove old line
    if (priceLineRef.current) {
      try { priceLineRef.current.series.removePriceLine(priceLineRef.current.line); } catch { /* */ }
      priceLineRef.current = null;
    }
    // Add new line if preview exists
    if (pricePreview && pricePreview.price > 0) {
      const series = seriesRef.current.get(pricePreview.optionIndex);
      if (series) {
        const color = OPTION_COLORS[pricePreview.optionIndex % OPTION_COLORS.length];
        const line = series.createPriceLine({
          price: pricePreview.price,
          color,
          lineWidth: 2,
          lineStyle: 2, // dashed
          axisLabelVisible: true,
          title: "→ after trade",
        });
        priceLineRef.current = { series, line };
        // Force chart to include the preview price in visible range
        if (chartRef.current) {
          chartRef.current.priceScale("right").applyOptions({ autoScale: true });
        }
      }
    } else {
      // Reset auto scale when preview is removed
      if (chartRef.current) {
        chartRef.current.priceScale("right").applyOptions({ autoScale: true });
      }
    }
  }, [pricePreview]);

  // Live updates: when parent re-renders with new option prices, update
  // chart. If history hasn't loaded yet, buffer the LATEST tick per
  // option — the `finally` in the init effect replays them once setData
  // has painted the historical line.
  useEffect(() => {
    if (!chartRef.current) return;
    const now = (Date.now() / 1000) as UTCTimestamp;
    for (const opt of options) {
      const series = seriesRef.current.get(opt.index);
      if (!series) continue;
      const value = mode === "price" ? opt.spotPrice : opt.twapPrice;
      if (!(value > 0)) continue;
      if (!historyLoadedRef.current) {
        pendingTicksRef.current.set(opt.index, { time: now, value });
      } else {
        series.update({ time: now, value });
      }
    }
  }, [options, mode]);

  /**
   * Sub-second live updates pulled directly from chain via
   * `sdkSubscribeMarket`. Each pool account is watched with a Solana
   * WebSocket account subscription (`Connection.onAccountChange`), and
   * every mutation — i.e. every trade — fires a decode → series.update.
   *
   * We avoid the Combinator HTTP/SSE indexer entirely: prices come from
   * the same Anchor coder `sdkGetMarketStatus` uses at boot, so the live
   * values match byte-for-byte the initial history.
   *
   * Cleanup teardown is async (removeAccountChangeListener returns a
   * Promise). We fire-and-forget it inside the effect cleanup — the
   * listener no longer pushes events once its ID is freed, so ordering
   * doesn't matter for correctness.
   */
  useEffect(() => {
    if (!proposalPda || options.length === 0) return;
    let unsubscribe: (() => Promise<void>) | null = null;
    let cancelled = false;

    sdkSubscribeMarket(proposalPda, ({ index, spotPrice, twapPrice }) => {
      // Notify the parent FIRST so it can patch its React Query cache
      // off the same tick we're about to paint on the chart. Order
      // matters: if the parent's cache update is still pending when the
      // parent's own effects fire (e.g. the `/api/combinator-prices`
      // POST), they'd send pre-tick values and the DB history would
      // diverge from the visible chart.
      onPriceTickRef.current?.({ index, spotPrice, twapPrice });

      const series = seriesRef.current.get(index);
      if (!series) return;
      const value = mode === "price" ? spotPrice : twapPrice;
      if (!(value > 0)) return;
      // Stamp "last update" only when the displayed value actually
      // changed — same-value ticks (e.g. when the pool account was
      // mutated by a non-swap instruction) would otherwise make the
      // clock tick every second and stop being a useful "real data
      // arrived" marker.
      const prevValue = lastValueByIndexRef.current.get(index);
      if (prevValue !== value) {
        lastValueByIndexRef.current.set(index, value);
        setLastUpdateAt(Date.now());
      }
      // Use the browser clock for the x-axis: Solana gives us a slot,
      // not a wall-clock, and the SDK subscription hasn't observed any
      // drift vs. our polling cadence that would be visible at 1s tick.
      const now = (Date.now() / 1000) as UTCTimestamp;
      if (!historyLoadedRef.current) {
        // Buffer during the history fetch race window — the init
        // effect's `finally` block replays us right after setData.
        pendingTicksRef.current.set(index, { time: now, value });
        return;
      }
      series.update({ time: now, value });
    }).then((fn) => {
      console.log("[combinator-debug] sdkSubscribeMarket: setup OK", { proposalPda, cancelled });
      if (cancelled) void fn();
      else unsubscribe = fn;
    }).catch((err) => {
      // RPC unreachable (typically CORS on Helius from the browser origin).
      // Polling fallback still runs — but live ticks won't reach this client.
      console.error("[combinator-debug] sdkSubscribeMarket: setup FAILED — chart won't get live updates", { proposalPda, err });
    });

    return () => {
      cancelled = true;
      if (unsubscribe) void unsubscribe();
    };
  }, [proposalPda, options.length, mode]);

  return (
    <div className={`w-full ${className}`}>
      {/* Names legend — top row, FULL WIDTH so all builder labels fit on
          a single line on phones with 6+ entries. Text is intentionally
          xs-tier (9px) and dot smaller so the row stays under one line
          even with handles like "TobiasBond" / "Mathis_Btc". Overflow
          falls back to horizontal scroll on overflow rather than wrap
          (wrapping pushed the chart down and re-jittered on render). */}
      <div className="flex gap-2.5 flex-nowrap overflow-x-auto whitespace-nowrap mb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {options.map((opt) => (
          <div key={opt.index} className="flex items-center gap-1 text-[9px] font-mono shrink-0">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: OPTION_COLORS[opt.index % OPTION_COLORS.length] }}
            />
            <span className="text-[#B0B3B8]">{opt.label}</span>
          </div>
        ))}
      </div>

      {/* Mode toggle + range buttons + last-update clock — second row.
          Mode toggle and range chips on the left (thumb-reachable),
          clock right-aligned as the secondary, ambient info. */}
      <div className="flex items-center justify-between gap-2 mb-2 min-h-[18px]">
        <div className="flex items-center gap-2 text-[10px] font-mono">
          {/* Mode toggle: spot price vs TWAP */}
          <div className="flex items-center gap-1">
            {(["price", "twap"] as ChartMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-0.5 border transition-colors ${
                  mode === m
                    ? "text-[#F5F5F6] border-[#F25C05] bg-[#F25C05]/10"
                    : "text-[#A0A3A9] border-[#444B57] hover:border-[#F25C05]/30 cursor-pointer"
                }`}
              >
                {m === "price" ? "Price" : "TWAP"}
              </button>
            ))}
          </div>
          {/* Range chips — sit immediately right of the mode toggle so
              the user reads "what / when" left-to-right. Same pill
              style for visual consistency. Changing the range
              re-fires the history fetch (the effect dep array
              includes `range`) so the chart redraws against the new
              window without remounting the TradingView instance. */}
          <div className="flex items-center gap-1">
            {(["2h", "24h", "all"] as ChartRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2 py-0.5 border transition-colors ${
                  range === r
                    ? "text-[#F5F5F6] border-[#F25C05] bg-[#F25C05]/10"
                    : "text-[#A0A3A9] border-[#444B57] hover:border-[#F25C05]/30 cursor-pointer"
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {lastUpdateAt && (
          <span
            className="text-[10px] font-mono text-[#6B7280] shrink-0"
            title="Most recent on-chain price change"
          >
            Last update{" "}
            {new Date(lastUpdateAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}
          </span>
        )}
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        className="w-full border border-[#2A3040] rounded"
        style={{ minHeight: 280 }}
      />
    </div>
  );
}
