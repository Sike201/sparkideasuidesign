/**
 * Shared resolver for the Solana RPC URL the browser uses.
 *
 * Multiple components (combinatorSdk, CombinatorTrade, InvestmentSection)
 * historically read `import.meta.env.VITE_RPC_URL` directly and passed it
 * straight to `new Connection(...)`. That broke the moment we set
 * `VITE_RPC_URL=/api/rpc` to route through the same-origin proxy: web3.js
 * rejects relative URLs with "Endpoint URL must start with http: or https:".
 *
 * This util is the single source of truth — every Connection in the app
 * should call `getRpcUrl()` instead of touching the env var directly.
 *
 * Resolution order:
 *   1. `VITE_RPC_URL` if it's already an absolute `http(s)://` URL — keeps
 *      every previous deployment working unchanged.
 *   2. `VITE_RPC_URL` starts with `/` (e.g. `/api/rpc`) → promote to
 *      `${origin}${env}`. This is the new recommended setting: HTTP RPC
 *      goes through our `/api/rpc` Pages Function which forwards to
 *      Helius server-side, killing the CORS preflight that was blocking
 *      every browser-issued `getAccountInfo` / `getSignatureStatus`.
 *   3. Unset → default to same-origin `/api/rpc`.
 *   4. SSR / no `window` → public mainnet endpoint so module load doesn't
 *      crash during build-time prerender.
 */
export function getRpcUrl(): string {
  const env = import.meta.env.VITE_RPC_URL as string | undefined
  const hasWindow = typeof window !== "undefined"
  if (env && /^https?:\/\//i.test(env)) return env
  if (env && env.startsWith("/") && hasWindow) {
    return `${window.location.origin}${env}`
  }
  if (hasWindow) {
    return `${window.location.origin}/api/rpc`
  }
  return "https://api.mainnet-beta.solana.com"
}

/**
 * Resolve the WebSocket endpoint for `Connection.onAccountChange` subs.
 *
 * web3.js auto-derives `wss://...` from the HTTP URL by default, which
 * works for absolute Helius / public RPCs but fails for our same-origin
 * proxy: Cloudflare Pages Functions don't accept the WS upgrade, so the
 * derived `wss://justspark.fun/api/rpc` dies on connect and live ticks
 * never arrive.
 *
 * Resolution:
 *   1. `VITE_RPC_WS_URL` if it's a `ws(s)://` URL — explicit override, the
 *      recommended setting in proxy mode (point it at Helius's wss URL,
 *      WebSockets aren't subject to CORS).
 *   2. If `httpUrl` is an absolute `http(s)://` and not the same origin,
 *      swap the scheme — preserves behavior for direct-Helius setups.
 *   3. Same-origin proxy and no override → undefined + warn. The caller's
 *      Connection will fall back to web3.js's derivation (and fail loudly
 *      on connect, which is the right signal to set `VITE_RPC_WS_URL`).
 */
export function getWsUrl(httpUrl: string = getRpcUrl()): string | undefined {
  const env = import.meta.env.VITE_RPC_WS_URL as string | undefined
  if (env && /^wss?:\/\//i.test(env)) return env
  if (/^https?:\/\//i.test(httpUrl)) {
    if (
      typeof window !== "undefined" &&
      httpUrl.startsWith(window.location.origin)
    ) {
      console.warn(
        "[utils/rpc] HTTP RPC routes through same-origin proxy but VITE_RPC_WS_URL is not set — WS subscriptions will fail. Set it to your upstream wss:// URL.",
      )
      return undefined
    }
    return httpUrl.replace(/^http/i, "ws")
  }
  return undefined
}
