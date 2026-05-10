/**
 * GET /api/mini/jupiter-quote
 *
 * Server-side proxy for Jupiter's swap quote endpoint, used by the
 * mini-app's TokenMarketCard swap modal to preview "you receive X"
 * while the user types. Lives behind same-origin so the optional
 * `JUPITER_API_KEY` stays server-side rather than leaking into the
 * browser bundle.
 *
 * Query params (all forwarded verbatim to Jupiter):
 *   - inputMint   (required)
 *   - outputMint  (required)
 *   - amount      (required, raw units of inputMint)
 *   - slippageBps (optional, default 50)
 *
 * Auth: this endpoint is unauthenticated — it's a read-only price
 * preview with no user state. The actual swap goes through
 * `/api/mini/jupiter-swap` which IS JWT-gated.
 *
 * Response shape: forwarded directly from Jupiter — `inAmount`,
 * `outAmount`, `otherAmountThreshold`, `priceImpactPct`, `slippageBps`,
 * etc. The client only needs `outAmount` + `priceImpactPct` for the
 * preview line; the rest is pass-through for future flexibility.
 */
import { jsonResponse } from "../cfPagesFunctionsUtils"

type ENV = {
  JUPITER_API_KEY?: string
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const url = new URL(ctx.request.url)
  const inputMint = url.searchParams.get("inputMint")
  const outputMint = url.searchParams.get("outputMint")
  const amount = url.searchParams.get("amount")
  if (!inputMint || !outputMint || !amount) {
    return jsonResponse(
      { error: "inputMint, outputMint, and amount are required" },
      400,
    )
  }
  const slippageBps = url.searchParams.get("slippageBps") || "50"

  const upstream = new URL("https://api.jup.ag/swap/v1/quote")
  upstream.searchParams.set("inputMint", inputMint)
  upstream.searchParams.set("outputMint", outputMint)
  upstream.searchParams.set("amount", amount)
  upstream.searchParams.set("slippageBps", slippageBps)
  upstream.searchParams.set("onlyDirectRoutes", "false")
  upstream.searchParams.set("asLegacyTransaction", "false")

  const headers: Record<string, string> = {}
  if (ctx.env.JUPITER_API_KEY) headers["x-api-key"] = ctx.env.JUPITER_API_KEY

  let r: Response
  try {
    r = await fetch(upstream.toString(), { headers })
  } catch (err) {
    return jsonResponse(
      { error: `Jupiter unreachable: ${err instanceof Error ? err.message : String(err)}` },
      502,
    )
  }
  // Forward the upstream status + body so the client sees the same
  // error shape Jupiter returns (e.g. "Could not find any route").
  const text = await r.text()
  return new Response(text, {
    status: r.status,
    headers: {
      "Content-Type": "application/json",
      // Same-origin so no CORS preflight in production, but keep a
      // permissive header for localhost dev (different port).
      "Access-Control-Allow-Origin": "*",
    },
  })
}
