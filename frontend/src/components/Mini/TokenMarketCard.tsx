/**
 * Token-market card on the mini-app hackathon detail page.
 *
 * Surfaces the project token's headline numbers + a Buy/Sell entry
 * point so the user can act on the token without leaving the idea
 * page. Phase-1 layout (display + placeholder swap):
 *
 *   - Ticker + token name
 *   - Current spot price (from `/api/gettokenmarket`)
 *   - FDV (from same endpoint, fallback chain Jupiter → DexScreener
 *     → CoinGecko → GeckoTerminal)
 *   - Treasury balance (read on-chain via the proxied RPC)
 *   - Buy / Sell buttons that open a modal — for now the modal
 *     announces the custodial-Jupiter integration is in flight.
 *     Phase-2 (separate change) will wire the real swap through a
 *     new `/api/mini/jupiter-swap` endpoint that signs server-side.
 *
 * The card returns null when the hackathon has no `token_address`
 * yet (early-stage idea before token deploy) — no point rendering an
 * empty card with "—" everywhere.
 */

import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Connection, PublicKey } from "@solana/web3.js"
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token"
import {
  Coins,
  Wallet,
  Loader2,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  LineChart,
} from "lucide-react"
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts"
import { getRpcUrl } from "@/utils/rpc"

/**
 * USDG mint addresses. USDG is the canonical Combinator quote token —
 * project treasuries hold their working capital here, not in the
 * project token itself (which would be circular). Token-2022 mint, so
 * lookups MUST use TOKEN_2022_PROGRAM_ID — calling
 * `getParsedTokenAccountsByOwner` against the classic Token program
 * for these mints returns an empty list and made the treasury card
 * read 0 even when the wallet was funded.
 *
 * We keep both env mints because dev/staging deployments may point at
 * devnet RPC; the client picks whichever one matches an actual ATA
 * (rather than guessing from a `VITE_SOLANA_NETWORK` flag that isn't
 * always available in the bundle).
 */
const USDG_MINT_MAINNET = new PublicKey("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH")
const USDG_MINT_DEVNET = new PublicKey("4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7")

/**
 * Token market data sourced **from Jupiter + on-chain**:
 *   - `price` + `priceChange24h` from Jupiter Price API v3
 *     (`api.jup.ag/price/v3`) — canonical host, keyless tier still
 *     accepts unauthenticated calls. The older `lite-api.jup.ag/price/v2`
 *     and `price.jup.ag/v6` were deprecated and now return 404 / 5xx.
 *   - `fdv` computed as `price × total_supply` where `total_supply`
 *     comes from `getMint(mint)` on-chain. Jupiter's Price API
 *     doesn't expose FDV directly, but the on-chain computation is
 *     authoritative and works for newly-deployed tokens that DEX
 *     aggregators may not yet index.
 */
type TokenStats = {
  price: number
  priceChange24h: number
  fdv: number
  supply: number
  decimals: number
}

async function fetchTokenStats(
  mint: string,
  connection: Connection,
): Promise<TokenStats> {
  // Jupiter Price API v3 — public, CORS-enabled, no API key needed
  // for the keyless tier (low RPS but enough for a card refreshing
  // every 60s). Response shape: `{ [mint]: { usdPrice, decimals,
  // priceChange24h, liquidity, blockId, createdAt } }` — keys are
  // the mint addresses directly, no `data` wrapper.
  const priceUrl = `https://api.jup.ag/price/v3?ids=${encodeURIComponent(mint)}`
  const [priceRes, mintInfo] = await Promise.all([
    fetch(priceUrl).then(r => (r.ok ? r.json() : null)).catch(() => null),
    getMint(connection, new PublicKey(mint)).catch(() => null),
  ])
  const priceData = (priceRes as Record<string, {
    usdPrice?: number | string
    priceChange24h?: number | string
  }> | null)?.[mint]
  const price = Number(priceData?.usdPrice ?? 0)
  const priceChange24h = Number(priceData?.priceChange24h ?? 0)
  const decimals = mintInfo?.decimals ?? 0
  // `mintInfo.supply` is a bigint on the SDK; convert via Number (safe
  // up to 2^53; tokens with supply beyond ~9 quadrillion atomic units
  // are extremely rare and would only lose precision in the last
  // decimal places of the display).
  const supply = mintInfo ? Number(mintInfo.supply) / 10 ** decimals : 0
  return {
    price: Number.isFinite(price) ? price : 0,
    priceChange24h: Number.isFinite(priceChange24h) ? priceChange24h : 0,
    fdv: price > 0 && supply > 0 ? price * supply : 0,
    supply,
    decimals,
  }
}

function fmtCompactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  return `$${n.toPrecision(3)}`
}

function fmtTokenAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0"
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/**
 * Treasury figure: full precision, period as thousands separator, comma
 * as decimal — `14.570,31` style. We pin to `de-DE` so the format is
 * stable regardless of the user's browser locale (a French locale would
 * use a non-breaking space as thousands separator and we want the period
 * for visual density on a small mini-app card).
 */
function fmtTreasuryAmount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0"
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Inline price chart for the project token. Lazy-mounted: the parent
 * only renders this component when the user expands the toggle, so the
 * GeckoTerminal lookup + lightweight-charts initialization don't run on
 * every page load.
 *
 * Data source: GeckoTerminal's free public API (no key required, CORS
 * enabled). Two-step fetch:
 *   1. resolve the token's top pool — GeckoTerminal pages pools by
 *      reserve_in_usd DESC so `?page=1` first entry IS the deepest
 *      liquidity pool, which is what a price chart should track.
 *   2. fetch OHLCV for that pool. We use the `day` timeframe at
 *      aggregate=1 with limit=1000 (the API max) so the chart shows
 *      every daily candle since the token launched — for a sub-3-year
 *      project this is effectively the all-time chart. Tokens younger
 *      than 1000 days simply return however many candles exist.
 *
 * We render the close-price as a single line series rather than candles
 * because the available card width (mini-app, ~340px) doesn't have the
 * resolution to make candles legible. The line gives the user a clear
 * trend signal in the same footprint.
 */
function TokenPriceChart({ tokenAddress }: { tokenAddress: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let chart: IChartApi | null = null
    let series: ISeriesApi<"Line"> | null = null
    let resizeObserver: ResizeObserver | null = null

    const init = async () => {
      try {
        // 1. Resolve the top pool for this token. GeckoTerminal returns
        // pools sorted by USD reserves DESC, so the first hit is the
        // deepest-liquidity pool (the one we want to track for price).
        const poolsRes = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}/pools?page=1`,
        )
        if (!poolsRes.ok) throw new Error(`pools ${poolsRes.status}`)
        const poolsJson = (await poolsRes.json()) as {
          data?: Array<{ attributes?: { address?: string } }>
        }
        const poolAddress = poolsJson.data?.[0]?.attributes?.address
        if (!poolAddress) throw new Error("no pool")
        if (cancelled) return

        // 2. Fetch all-time daily OHLCV. `token=base` makes the price
        // denominated in USD against the project token (otherwise we'd
        // get the inverse rate for some pools). limit=1000 is the
        // GeckoTerminal max — for any pool younger than ~3 years that
        // returns every daily candle since launch, i.e. the all-time
        // chart. Tokens older than that get truncated to the most recent
        // 1000 days, which is fine for a mini-app surface.
        const ohlcvRes = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/day?aggregate=1&limit=1000&currency=usd&token=base`,
        )
        if (!ohlcvRes.ok) throw new Error(`ohlcv ${ohlcvRes.status}`)
        const ohlcvJson = (await ohlcvRes.json()) as {
          data?: { attributes?: { ohlcv_list?: Array<[number, number, number, number, number, number]> } }
        }
        const list = ohlcvJson.data?.attributes?.ohlcv_list ?? []
        if (cancelled) return
        if (list.length === 0) throw new Error("no points")

        // GeckoTerminal returns DESC (newest first); lightweight-charts
        // requires ASC by time. Each row is [unix_seconds, o, h, l, c, v].
        const points = list
          .slice()
          .reverse()
          .map(([t, _o, _h, _l, c]) => ({
            time: t as UTCTimestamp,
            value: Number(c),
          }))
          .filter(p => Number.isFinite(p.value) && p.value > 0)

        if (cancelled || !containerRef.current) return

        // Auto-pick price precision so sub-cent tokens render with
        // enough digits to be informative (PREDICT at $0.00237 needs at
        // least 5–7 decimals).
        const sample = points[points.length - 1]?.value ?? 0
        const precision = sample > 0 && sample < 0.01 ? 7 : sample < 1 ? 4 : 2
        const minMove = Math.pow(10, -precision)

        chart = createChart(containerRef.current, {
          layout: {
            background: { color: "transparent" },
            textColor: "#A0A3A9",
            fontFamily: "monospace",
            fontSize: 9,
          },
          grid: {
            vertLines: { color: "rgba(42, 48, 64, 0.25)" },
            horzLines: { color: "rgba(42, 48, 64, 0.25)" },
          },
          crosshair: {
            vertLine: { color: "#10b981", width: 1, style: 2 },
            horzLine: { color: "#10b981", width: 1, style: 2 },
          },
          timeScale: {
            borderColor: "#2A3040",
            timeVisible: true,
            secondsVisible: false,
          },
          rightPriceScale: { borderColor: "#2A3040" },
          handleScroll: { vertTouchDrag: false },
          width: containerRef.current.clientWidth,
          height: 180,
        })

        series = chart.addSeries(LineSeries, {
          color: "#10b981",
          lineWidth: 2,
          priceFormat: { type: "price", precision, minMove },
        })
        series.setData(points)
        chart.timeScale().fitContent()

        // Track container width so the chart re-flows on rotation /
        // viewport changes without a remount.
        resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            chart?.applyOptions({ width: entry.contentRect.width })
          }
        })
        resizeObserver.observe(containerRef.current)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void init()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      // `chart.remove()` is the canonical teardown for lightweight-charts;
      // it disposes the inner canvas + series so we don't leak DOM nodes
      // on re-mount.
      try { chart?.remove() } catch { /* already disposed */ }
    }
  }, [tokenAddress])

  return (
    <div className="relative mt-3 rounded-xl bg-white/[0.02] border border-white/[0.04] p-2">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}
      {error && !loading && (
        <div className="text-center text-[10px] text-neutral-500 py-10">
          chart unavailable
        </div>
      )}
      <div ref={containerRef} className="w-full h-[180px]" />
    </div>
  )
}

export default function TokenMarketCard({
  ticker,
  coinName,
  tokenAddress,
  treasuryWallet,
  onBuy,
  onSell,
}: {
  ticker?: string | null
  coinName?: string | null
  tokenAddress?: string | null
  treasuryWallet?: string | null
  onBuy?: () => void
  onSell?: () => void
}) {
  // Token stats — Jupiter Price API for live USD price + on-chain
  // `getMint` for total supply. FDV is derived locally as
  // `price × supply` so we don't depend on a 3rd-party aggregator
  // for that figure (more accurate for newly-deployed tokens).
  // 60s staleTime mirrors Jupiter's own price refresh cadence.
  const { data: stats, isLoading: marketLoading } = useQuery<TokenStats>({
    queryKey: ["token-stats", tokenAddress],
    queryFn: async () => {
      const conn = new Connection(getRpcUrl(), "confirmed")
      return fetchTokenStats(tokenAddress!, conn)
    },
    enabled: !!tokenAddress,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  // Treasury USDG balance — read on-chain via the proxied RPC. We
  // look up Token-2022 ATAs for both the mainnet and devnet USDG
  // mints in parallel and pick whichever one resolves to a real
  // account; whichever network the deployment targets, the right
  // mint wins. Failure → null → "—" in the UI rather than a
  // misleading 0.
  //
  // USDG is treated 1:1 USD (the whole Combinator stack assumes this),
  // so the displayed balance IS the dollar figure — no price multiply
  // needed and no chance of price-staleness mismatch.
  const [treasuryUsdg, setTreasuryUsdg] = useState<number | null>(null)
  const [treasuryLoading, setTreasuryLoading] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (!treasuryWallet) {
      setTreasuryUsdg(null)
      return
    }
    setTreasuryLoading(true)
    ;(async () => {
      try {
        const conn = new Connection(getRpcUrl(), "confirmed")
        const owner = new PublicKey(treasuryWallet)
        // Try both USDG mints in parallel — only one will match the
        // network the deployment is actually on; the other returns
        // an empty `value` array which contributes 0.
        const [mainnetRes, devnetRes] = await Promise.all([
          conn.getParsedTokenAccountsByOwner(
            owner,
            { mint: USDG_MINT_MAINNET, programId: TOKEN_2022_PROGRAM_ID },
          ).catch(() => ({ value: [] as Array<{ account: { data: unknown } }> })),
          conn.getParsedTokenAccountsByOwner(
            owner,
            { mint: USDG_MINT_DEVNET, programId: TOKEN_2022_PROGRAM_ID },
          ).catch(() => ({ value: [] as Array<{ account: { data: unknown } }> })),
        ])
        let total = 0
        for (const { account } of [...mainnetRes.value, ...devnetRes.value]) {
          const info = (account.data as { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } })?.parsed?.info
          total += info?.tokenAmount?.uiAmount ?? 0
        }
        if (!cancelled) setTreasuryUsdg(total)
      } catch {
        if (!cancelled) setTreasuryUsdg(null)
      } finally {
        if (!cancelled) setTreasuryLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [treasuryWallet])

  // Inline chart toggle. Closed by default — the chart is a heavier
  // mount (GeckoTerminal fetch + lightweight-charts canvas) and most
  // users land on the page to act on the token, not to study its
  // history. Lazy-mount via the gated render below means we pay nothing
  // until the user explicitly asks to see it.
  const [showChart, setShowChart] = useState(false)

  if (!tokenAddress) return null

  const symbol = ticker || coinName || "TOKEN"
  const name = coinName || ticker || "Project token"

  return (
    <div className="mb-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      {/* Header — ticker + name on the left, current price on the right */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-400" />
            <div className="text-base font-bold tracking-tight">${symbol}</div>
          </div>
          {name && name !== symbol && (
            <div className="text-[11px] text-neutral-500 truncate mt-0.5">{name}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          {marketLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-neutral-500 inline-block" />
          ) : (
            <>
              <div className="text-lg font-mono font-bold">{fmtPrice(stats?.price ?? 0)}</div>
              {stats?.priceChange24h !== undefined &&
                stats.priceChange24h !== 0 &&
                stats.price > 0 && (
                  <div
                    className={`text-[10px] font-mono inline-flex items-center gap-0.5 ${
                      stats.priceChange24h >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {stats.priceChange24h >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {stats.priceChange24h.toFixed(2)}%
                  </div>
                )}
            </>
          )}
        </div>
      </div>

      {/* Stats grid — FDV + treasury, presented with the same compact
          "label above value" layout as the rest of the mini-app's
          cards. Treasury shows USD as the primary figure (that's
          what users actually want to compare across projects); the
          raw token amount is the dimmer sub-line. */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3">
          <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">
            FDV
          </div>
          <div className="text-sm font-mono font-bold">
            {marketLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-500 inline-block" />
            ) : (
              fmtCompactUsd(stats?.fdv ?? 0)
            )}
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3">
          <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold mb-1 flex items-center gap-1">
            <Wallet className="w-2.5 h-2.5" />
            Treasury
          </div>
          {treasuryLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-500 inline-block" />
          ) : treasuryWallet ? (
            // USDG ≈ $1 so the raw token amount IS the USD figure — no
            // price multiply needed. We collapsed the previous two-line
            // (compact USD + raw amount) layout into a single bold line:
            // the compact "$14.6K" was redundant once the full amount
            // is rendered with thousands separators.
            <div className="text-sm font-mono font-bold text-white">
              {treasuryUsdg !== null ? `${fmtTreasuryAmount(treasuryUsdg)} $USDG` : "—"}
            </div>
          ) : (
            <div className="text-[11px] text-neutral-600">—</div>
          )}
        </div>
      </div>

      {/* Chart toggle — collapsed by default. The chart is mounted
          conditionally below so the network request to GeckoTerminal +
          the lightweight-charts canvas are deferred until the user
          actually asks to see them. */}
      <button
        type="button"
        onClick={() => setShowChart(s => !s)}
        className="w-full mb-3 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] text-[11px] text-neutral-400 hover:text-neutral-200 transition-colors"
        aria-expanded={showChart}
      >
        <LineChart className="w-3 h-3" />
        {showChart ? "Hide chart" : `Show ${symbol} chart`}
        {showChart ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>
      {showChart && <TokenPriceChart tokenAddress={tokenAddress} />}

      {/* Buy / Sell — open a swap modal driven by the parent. We don't
          own the modal here so the parent can route through whatever
          custodial flow is wired (Phase 2 will plug in
          `/api/mini/jupiter-swap`). Buttons stay enabled even before
          market data lands so a fast user can tap immediately. */}
      <div className={`grid grid-cols-2 gap-2 ${showChart ? "mt-3" : ""}`}>
        <button
          type="button"
          onClick={onBuy}
          className="py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-300 text-sm font-semibold text-black transition-colors"
        >
          Buy ${symbol}
        </button>
        <button
          type="button"
          onClick={onSell}
          className="py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-sm font-semibold text-red-200 transition-colors"
        >
          Sell ${symbol}
        </button>
      </div>
    </div>
  )
}
