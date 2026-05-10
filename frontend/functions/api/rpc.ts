/**
 * POST /api/rpc — same-origin Solana JSON-RPC proxy with read-method
 * caching + singleflight deduplication.
 *
 * The browser bundle was hitting a Helius dedicated endpoint directly. That
 * leaked the RPC URL into the client AND tripped CORS for any origin not
 * pre-allowlisted on the Helius dashboard. Both problems disappear if the
 * client speaks to its own origin and we forward server-side.
 *
 * Why we don't just passthrough: a single trade triggers a fan-out of
 * `getAccountInfo` / `getSignatureStatuses` from React Query consumers,
 * the SDK's confirmation poll, and the chart's live ticks — all hitting
 * the proxy in the same second with effectively identical payloads. Helius
 * rate-limits at the per-second level; web3.js's retry-with-backoff on a
 * 429 turns it into a feedback loop where the retry storm keeps the
 * limiter saturated. The cache + singleflight collapses identical
 * concurrent calls into one upstream hit, which is enough to keep the
 * burst inside the limit.
 *
 * Caching rules:
 *   - Only safe READ methods are cached, with TTLs tuned for "good
 *     enough" UI freshness (1.5s for accounts, 2s for sig statuses).
 *   - WRITE methods (`sendTransaction`, `requestAirdrop`, etc.) and any
 *     method not on the allowlist are forwarded verbatim every time.
 *   - JSON-RPC batches are forwarded verbatim — caching the inner ids is
 *     fiddly and the win is small.
 *   - The cached payload has its `id` rewritten to match the caller's
 *     request id so the JSON-RPC contract is preserved.
 *
 * Config: set `HELIUS_RPC_URL` (server-side env var on Cloudflare Pages)
 * to the upstream URL — the secret Helius key never reaches the bundle.
 */
type ENV = {
  HELIUS_RPC_URL?: string
  /** Legacy fallback: the same URL was previously exposed via VITE_RPC_URL.
   * Only honored if it's still an absolute http(s) URL — once the deploy
   * flips `VITE_RPC_URL` to `/api/rpc` (proxy mode), this value points at
   * the proxy itself and we'd recurse forever. The `pickAbsolute` filter
   * screens that out. */
  VITE_RPC_URL?: string
}

function pickAbsolute(...candidates: Array<string | undefined>): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c)) return c
  }
  return undefined
}

function corsHeaders(): Record<string, string> {
  // Same-origin in prod, but localhost dev hits this from a different port,
  // so leave a permissive CORS shim. The proxy itself doesn't carry user
  // auth — the upstream key is what matters and it stays server-side.
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, solana-client, Authorization",
    "Access-Control-Max-Age": "86400",
  }
}

/**
 * Per-method TTL (ms) for the in-isolate response cache. Tuned so the
 * UI never feels stale — the chart updates on a 5s tick anyway, balances
 * are read on every market state change, and the post-trade confirmation
 * poll runs at 3s cadence. A miss inside one of these windows just means
 * we serve last-known-good once instead of hammering Helius twice in a
 * row with the exact same query.
 *
 * Anything not listed here bypasses the cache (write methods, anything
 * exotic). `sendTransaction` MUST stay out — it's not idempotent and
 * caching the response would re-send the same signature.
 */
const READ_METHOD_TTL_MS: Record<string, number> = {
  getAccountInfo: 1500,
  getMultipleAccounts: 1500,
  getSignatureStatus: 2000,
  getSignatureStatuses: 2000,
  getTokenAccountsByOwner: 3000,
  getTokenAccountBalance: 2000,
  getBalance: 2000,
  getLatestBlockhash: 500,
  getRecentBlockhash: 500,
  getSlot: 1000,
  getProgramAccounts: 5000,
  getMinimumBalanceForRentExemption: 30_000, // basically static
  getEpochInfo: 5000,
  getVersion: 60_000,
}

type ParsedRpc = {
  jsonrpc?: string
  id?: unknown
  result?: unknown
  error?: unknown
}
type CacheEntry = { parsed: ParsedRpc; status: number; expiresAt: number }
type InflightResult = { parsed: ParsedRpc | null; status: number; rawText: string }

// Module-scope state survives across requests on the same isolate. Cloudflare
// recycles isolates frequently, so this is best-effort burst absorption —
// good for sub-second fan-out from a single client, not a real cache layer.
const responseCache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<InflightResult>>()

// Lightweight cap so a long-lived isolate doesn't grow without bound.
const CACHE_MAX_ENTRIES = 500
function gcCacheIfHuge() {
  if (responseCache.size <= CACHE_MAX_ENTRIES) return
  const now = Date.now()
  // First pass: drop expired.
  for (const [k, v] of responseCache) {
    if (v.expiresAt <= now) responseCache.delete(k)
  }
  if (responseCache.size <= CACHE_MAX_ENTRIES) return
  // Still too big → drop oldest by insertion order until we're under cap.
  const overflow = responseCache.size - CACHE_MAX_ENTRIES
  let removed = 0
  for (const k of responseCache.keys()) {
    if (removed >= overflow) break
    responseCache.delete(k)
    removed++
  }
}

function cacheKey(method: string, params: unknown): string {
  // Stable-enough: same method + same params object → same key. Slightly
  // brittle for object-key-order differences, but web3.js builds these
  // deterministically so it's fine in practice.
  return `${method}::${JSON.stringify(params ?? null)}`
}

async function forward(target: string, body: string): Promise<{ status: number; text: string }> {
  const upstream = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })
  return { status: upstream.status, text: await upstream.text() }
}

/**
 * Resolve a single JSON-RPC call through the cache + singleflight layers.
 * Returns the response body string + status the proxy should send back.
 */
async function resolveSingle(
  target: string,
  parsedRequest: ParsedRpc & { method: string; params?: unknown },
  rawBody: string,
): Promise<{ body: string; status: number }> {
  const ttl = READ_METHOD_TTL_MS[parsedRequest.method]
  if (!ttl) {
    // Not cacheable → straight passthrough, no dedup. We DO NOT singleflight
    // write methods because their responses (signatures, etc.) are
    // request-specific.
    const { status, text } = await forward(target, rawBody)
    return { body: text, status }
  }

  const key = cacheKey(parsedRequest.method, parsedRequest.params)
  const now = Date.now()

  const cached = responseCache.get(key)
  if (cached && cached.expiresAt > now) {
    // Inject the caller's id into the cached response so JSON-RPC matching
    // on the client side stays correct.
    const body = JSON.stringify({ ...cached.parsed, id: parsedRequest.id ?? null })
    return { body, status: cached.status }
  }

  let promise = inflight.get(key)
  if (!promise) {
    promise = (async (): Promise<InflightResult> => {
      const { status, text } = await forward(target, rawBody)
      let parsed: ParsedRpc | null = null
      try {
        parsed = JSON.parse(text) as ParsedRpc
      } catch {
        /* malformed upstream response — return raw, skip caching */
      }
      // Only cache successful responses without a JSON-RPC error. Caching
      // a 429 or an `error` payload would extend the failure window
      // instead of letting the next request retry.
      if (status >= 200 && status < 300 && parsed && !parsed.error) {
        responseCache.set(key, { parsed, status, expiresAt: Date.now() + ttl })
        gcCacheIfHuge()
      }
      return { parsed, status, rawText: text }
    })().finally(() => inflight.delete(key))
    inflight.set(key, promise)
  }

  const { parsed, status, rawText } = await promise
  if (parsed) {
    return {
      body: JSON.stringify({ ...parsed, id: parsedRequest.id ?? null }),
      status,
    }
  }
  // Couldn't parse upstream — return its raw bytes so the client sees
  // whatever Helius said (typically a 429 or HTML error page).
  return { body: rawText, status }
}

export const onRequestOptions: PagesFunction<ENV> = async () => {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const target = pickAbsolute(ctx.env.HELIUS_RPC_URL, ctx.env.VITE_RPC_URL)
  if (!target) {
    return new Response(
      JSON.stringify({ error: "RPC upstream not configured (set HELIUS_RPC_URL to an absolute https:// URL)" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      },
    )
  }

  const rawBody = await ctx.request.text()

  // Try to parse as a single JSON-RPC call. Batches (`[{...}, {...}]`),
  // empty bodies, and malformed payloads fall through to verbatim
  // forwarding — caching them isn't worth the complexity.
  let parsedRequest: (ParsedRpc & { method?: string; params?: unknown }) | null = null
  try {
    const candidate = JSON.parse(rawBody)
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && typeof candidate.method === "string") {
      parsedRequest = candidate
    }
  } catch {
    /* fall through to passthrough */
  }

  if (parsedRequest && parsedRequest.method) {
    try {
      const { body, status } = await resolveSingle(target, parsedRequest as ParsedRpc & { method: string }, rawBody)
      return new Response(body, {
        status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      })
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : "Upstream fetch failed" }),
        {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        },
      )
    }
  }

  // Verbatim passthrough for batches / unparseable bodies.
  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody,
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Upstream fetch failed" }),
      {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      },
    )
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      ...corsHeaders(),
    },
  })
}
