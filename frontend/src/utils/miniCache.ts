/**
 * Simple stale-while-revalidate cache for the mini-app, backed by
 * localStorage. Pattern:
 *
 *   1. Page mounts → `readCache(key, maxAgeMs)` returns the last
 *      successful response (or `null` if expired/missing).
 *   2. Render the page using cached data immediately — no spinner.
 *   3. Fire a fresh fetch in the background.
 *   4. When the fetch resolves, `writeCache(key, data)` persists
 *      the new data and the page re-renders with up-to-date values.
 *
 * Used to make cold opens feel instant: the cache holds the user's
 * `/api/mini/me` payload + the hackathons list — both are slow to
 * fetch (Helius RPC + Combinator decode) but barely change between
 * sessions, so the user sees yesterday's balances for a few seconds
 * while the fresh ones come in.
 *
 * Invariants:
 *   - Cache write happens on successful fetch only — never blow
 *     away a valid entry with an error response.
 *   - `maxAgeMs` is an UPPER bound: anything older is treated as
 *     missing, so a stale-but-still-displayed entry doesn't pile
 *     up indefinitely. We pick generous values (a few hours for
 *     the user-facing redirect path, less for in-page balances).
 *   - localStorage is best-effort: blocked / full / disabled
 *     storage degrades silently to "no cache". The app stays
 *     functional, just slower on cold open.
 *   - Don't store secrets here. The cache is plain JSON and
 *     readable by any same-origin script. Wallet addresses,
 *     balances, public chain data is fine.
 */

type CacheEnvelope<T> = {
  /** UTC milliseconds when the entry was written. */
  ts: number
  /** Cached payload — same shape the API returns. */
  data: T
}

/**
 * Read a cache entry. Returns the data if still within `maxAgeMs`,
 * otherwise `null`. Any parse error / quota issue / JSON corruption
 * is silently treated as "no cache" — never throws.
 */
export function readCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const env = JSON.parse(raw) as CacheEnvelope<T>
    if (typeof env?.ts !== "number") return null
    if (Date.now() - env.ts > maxAgeMs) return null
    return env.data
  } catch {
    return null
  }
}

/**
 * Write a cache entry. Silent no-op on quota / blocked / SSR
 * environments — caller should never block on the result.
 */
export function writeCache<T>(key: string, data: T): void {
  try {
    const env: CacheEnvelope<T> = { ts: Date.now(), data }
    localStorage.setItem(key, JSON.stringify(env))
  } catch {
    /* quota exceeded, third-party-cookie blocked, etc. — silent */
  }
}

/**
 * Best-effort delete. Used after logout / wallet switch / explicit
 * cache-bust scenarios.
 */
export function clearCache(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* silent */
  }
}

// Stable cache keys so consumers don't have to remember strings.
// Keep them all under a `spark_mini_*` prefix for easy targeted
// clearing during a logout sweep.
export const MINI_CACHE_KEYS = {
  /** Last successful `/api/mini/me` payload. ~hours of validity for
   *  the auth-redirect path; in-page reads use a shorter freshness
   *  threshold (~1 minute) to keep balances reasonable. */
  ME: "spark_mini_cache_me",
  /** Last successful hackathons list (`backendSparkApi.getHackathons`).
   *  Items barely change once a hackathon is live — minutes-to-hours
   *  is fine for the UI list. */
  HACKATHONS: "spark_mini_cache_hackathons",
} as const

/** Auth-redirect path tolerates older data (just used for "where do
 *  I send the user"). 6 hours captures the typical "open the app
 *  once a day" pattern without ever being so old that the deposit
 *  state is misleading. */
export const ME_CACHE_AUTH_REDIRECT_MAX_MS = 6 * 60 * 60_000

/** In-page balance display: tighter so a user who opens the Me tab
 *  doesn't see a balance from yesterday. The fresh fetch still
 *  updates within a few seconds; this is the "show last-known
 *  immediately" window. */
export const ME_CACHE_PLACEHOLDER_MAX_MS = 60 * 60_000

/** Hackathons list: very static — titles, tickers, statuses don't
 *  change between sessions for the same hackathon. */
export const HACKATHONS_CACHE_MAX_MS = 30 * 60_000

/**
 * Spread-able helper that adds the SWR cache pattern to any
 * `useQuery` config. Returns the two options the consumer needs:
 *
 *   - `queryFn`: wraps the original fetch so the result is also
 *     written to localStorage on every successful response.
 *   - `placeholderData`: reads the last cached entry (within
 *     `maxAgeMs`) so the component renders something useful while
 *     the first fetch is in flight.
 *
 * Usage:
 *   useQuery({
 *     queryKey: ["hackathons"],
 *     ...withSwrCache(() => api.getHackathons(), "hackathons_cache", 30 * 60_000),
 *     enabled: ...,
 *   })
 *
 * The cache key MUST be unique per logical resource AND per
 * relevant identity bucket (e.g. include the user wallet, item id,
 * etc. in the key). Two consumers sharing a key will overwrite
 * each other's data — fine if they fetch the same shape, surprising
 * if they don't.
 */
export function withSwrCache<T>(
  queryFn: () => Promise<T>,
  key: string,
  maxAgeMs: number,
): {
  queryFn: () => Promise<T>
  placeholderData: () => T | undefined
} {
  return {
    queryFn: async () => {
      const result = await queryFn()
      writeCache(key, result)
      return result
    },
    placeholderData: () => readCache<T>(key, maxAgeMs) ?? undefined,
  }
}
