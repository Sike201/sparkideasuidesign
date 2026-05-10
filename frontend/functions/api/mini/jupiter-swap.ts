/**
 * POST /api/mini/jupiter-swap
 *
 * Custodial Jupiter swap for mini-app users — Buy / Sell of any SPL
 * token from the user's PUBLIC custodial wallet, routed through
 * Jupiter's aggregator (`/v6/quote` + `/v6/swap`). Used by the
 * hackathon detail page's TokenMarketCard "Buy / Sell" CTA.
 *
 * Auth: mini-app JWT (`Authorization: Bearer <token>`). The PRIVATE
 * (bonus) wallet is intentionally not eligible — bonus funds stay on
 * the trading surface, same rule as `/api/mini/withdraw`.
 *
 * Body:
 *   {
 *     input_mint:    string,        // mint to spend (USDC for BUY, project token for SELL)
 *     output_mint:   string,        // mint to receive (project token for BUY, USDC for SELL)
 *     amount:        number,        // human input amount (e.g. 12.5)
 *     input_decimals: number,       // decimals of input_mint, used to convert to raw units
 *     slippage_bps?: number,        // default 50 = 0.5%
 *   }
 *
 * Flow:
 *   1. Verify JWT, load PUBLIC custodial wallet, decrypt secret.
 *   2. Top up custodial SOL from treasury fee-payer (if configured)
 *      so the swap tx has gas. Mirrors `custodial-trade.ts`.
 *   3. GET https://api.jup.ag/swap/v1/quote → quote payload.
 *   4. POST https://api.jup.ag/swap/v1/swap with `userPublicKey` =
 *      custodial → returns base64 VersionedTransaction.
 *   5. Deserialize, sign with custodial keypair, send, confirm.
 *   6. Return signature + in/out amounts + price impact.
 *
 * Why VersionedTransaction: Jupiter v6 returns versioned txns (Address
 * Lookup Tables, route compaction). Legacy `Transaction.sign()` would
 * lose the LUTs and the swap would fail. We use the v0 sign path.
 *
 * Error mapping: Jupiter responses are forwarded with their HTTP code
 * and body so the client can surface "no route", "slippage exceeded",
 * etc. without us having to inventory every error string.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js"

import { jsonResponse, pickRpcUrl } from "../cfPagesFunctionsUtils"
import { verifyMiniAuth } from "./_auth"

type ENV = {
  DB: D1Database
  WALLET_ENCRYPTION_KEY: string
  JWT_SECRET?: string
  HELIUS_RPC_URL?: string
  VITE_RPC_URL?: string
  VITE_REDEMPTION_MAINNET_RPC_URL?: string
  VITE_REDEMPTION_DEVNET_RPC_URL?: string
  VITE_SOLANA_NETWORK?: "mainnet" | "devnet"
  FEE_PAYER_SECRET_KEY?: string
  /** Optional Jupiter API key (Pro tier). When set, forwarded as
   *  `x-api-key` to upstream so we get the higher rate-limit budget.
   *  When unset, requests still work on the keyless tier — Jupiter's
   *  `api.jup.ag/swap/v1/*` accepts unauthenticated calls at a low
   *  RPS quota (sufficient for mini-app traffic, ~1 request per
   *  second per IP). Get a key at https://developers.jup.ag/portal */
  JUPITER_API_KEY?: string
}

/** Build the auth headers we send to Jupiter. The keyless tier gets
 *  the same response shape; the only effect of the header is the rate
 *  limit Jupiter applies. */
function jupiterHeaders(env: ENV, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (env.JUPITER_API_KEY) headers["x-api-key"] = env.JUPITER_API_KEY
  return headers
}

// ── Crypto helpers (mirrors custodial-trade.ts / withdraw.ts) ────
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}
async function decryptSecret(encrypted: string, keyHex: string): Promise<string> {
  const [ivHex, ciphertextHex] = encrypted.split(":")
  const keyBytes = hexToBytes(keyHex.slice(0, 64))
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"])
  const iv = hexToBytes(ivHex)
  const ciphertext = hexToBytes(ciphertextHex)
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
function base58Decode(str: string): Uint8Array {
  let result = BigInt(0)
  for (const char of str) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index === -1) throw new Error("Invalid base58 character")
    result = result * 58n + BigInt(index)
  }
  const bytes: number[] = []
  while (result > 0n) {
    bytes.unshift(Number(result % 256n))
    result = result / 256n
  }
  for (const char of str) {
    if (char !== "1") break
    bytes.unshift(0)
  }
  return new Uint8Array(bytes)
}
function loadFeePayer(secretKeyStr: string | undefined): Keypair | null {
  if (!secretKeyStr) return null
  const trimmed = secretKeyStr.trim()
  try {
    if (trimmed.startsWith("[")) {
      const arr = JSON.parse(trimmed) as number[]
      if (!Array.isArray(arr) || arr.length !== 64) {
        throw new Error(`Expected 64-byte array, got ${arr.length}`)
      }
      return Keypair.fromSecretKey(Uint8Array.from(arr))
    }
    return Keypair.fromSecretKey(base58Decode(trimmed))
  } catch (err) {
    console.error("[mini/jupiter-swap] FEE_PAYER_SECRET_KEY parse failed:", err)
    return null
  }
}

function resolveRpc(env: ENV): string {
  const network = env.VITE_SOLANA_NETWORK ?? "devnet"
  if (network === "mainnet") {
    return pickRpcUrl(env.HELIUS_RPC_URL, env.VITE_REDEMPTION_MAINNET_RPC_URL, env.VITE_RPC_URL, "https://api.mainnet-beta.solana.com")
  }
  return pickRpcUrl(env.VITE_REDEMPTION_DEVNET_RPC_URL, env.VITE_RPC_URL, "https://api.devnet.solana.com")
}

async function confirmTx(connection: Connection, signature: string, maxAttempts = 20): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await connection.getSignatureStatus(signature)
    if (status?.value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`)
    }
    const conf = status?.value?.confirmationStatus
    if (conf === "confirmed" || conf === "finalized") return
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error(`Transaction ${signature} not confirmed after ${maxAttempts} attempts.`)
}

type Body = {
  input_mint?: string
  output_mint?: string
  amount?: number
  input_decimals?: number
  slippage_bps?: number
}

// Jupiter quote response — keeping only the fields we read. The full
// payload also contains route plan, time taken, etc.
type JupQuote = {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  otherAmountThreshold: string
  priceImpactPct: string
  slippageBps: number
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const auth = await verifyMiniAuth(ctx.request, ctx.env.JWT_SECRET, ctx.env)
    if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status)

    let body: Body
    try {
      body = (await ctx.request.json()) as Body
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400)
    }

    if (!body.input_mint || !body.output_mint) {
      return jsonResponse({ error: "input_mint and output_mint are required" }, 400)
    }
    let inputMint: PublicKey
    let outputMint: PublicKey
    try {
      inputMint = new PublicKey(body.input_mint)
      outputMint = new PublicKey(body.output_mint)
    } catch {
      return jsonResponse({ error: "input_mint or output_mint is not a valid pubkey" }, 400)
    }
    if (inputMint.equals(outputMint)) {
      return jsonResponse({ error: "input_mint and output_mint must differ" }, 400)
    }
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: "amount must be a positive number" }, 400)
    }
    const decimals = Number(body.input_decimals)
    if (!Number.isFinite(decimals) || decimals < 0 || decimals > 18) {
      return jsonResponse({ error: "input_decimals must be a non-negative integer ≤ 18" }, 400)
    }
    const slippageBps = Number.isFinite(body.slippage_bps) && body.slippage_bps! > 0 && body.slippage_bps! <= 5000
      ? Math.floor(body.slippage_bps!)
      : 50 // default 0.5%

    // PUBLIC custodial wallet only — same rule as withdraw.
    const row = await ctx.env.DB
      .prepare(
        `SELECT wallet_address, encrypted_secret_key
         FROM custodial_wallets
         WHERE wallet_type = 'public'
           AND (twitter_id = ? OR twitter_id = ? OR twitter_username = ?)
         LIMIT 1`,
      )
      .bind(
        auth.twitter_id,
        `username:${auth.username ?? ""}`,
        auth.username ?? "",
      )
      .first<{ wallet_address: string; encrypted_secret_key: string }>()

    if (!row) {
      return jsonResponse({ error: "No public custodial wallet for user" }, 404)
    }

    const secretKeyBase58 = await decryptSecret(row.encrypted_secret_key, ctx.env.WALLET_ENCRYPTION_KEY)
    const custodialKeypair = Keypair.fromSecretKey(base58Decode(secretKeyBase58))
    const connection = new Connection(resolveRpc(ctx.env), "confirmed")
    const feePayer = loadFeePayer(ctx.env.FEE_PAYER_SECRET_KEY)

    // Top-up SOL on the custodial wallet from treasury so the Jupiter
    // swap (which can be ~5-15k lamports of base fee + priority fees +
    // ATA rent for output mint) doesn't fail with "insufficient
    // lamports". Same logic as `custodial-trade.ts` PR-3.
    if (feePayer) {
      try {
        const currentLamports = await connection.getBalance(custodialKeypair.publicKey, "confirmed")
        const MIN = 15_000_000 // 0.015 SOL — covers swap fee + a fresh output ATA
        if (currentLamports < MIN) {
          const topupTx = new Transaction()
          topupTx.feePayer = feePayer.publicKey
          topupTx.add(
            SystemProgram.transfer({
              fromPubkey: feePayer.publicKey,
              toPubkey: custodialKeypair.publicKey,
              lamports: MIN - currentLamports,
            }),
          )
          const { blockhash: topupBh } = await connection.getLatestBlockhash("confirmed")
          topupTx.recentBlockhash = topupBh
          topupTx.sign(feePayer)
          const sig = await connection.sendRawTransaction(topupTx.serialize(), { skipPreflight: false })
          await confirmTx(connection, sig)
        }
      } catch (err) {
        console.warn("[mini/jupiter-swap] SOL top-up failed — continuing with current balance:", err)
      }
    }

    // ── Step 1: Jupiter quote ─────────────────────────────────
    // Canonical Jupiter API host: `api.jup.ag/swap/v1/*`. The older
    // `quote-api.jup.ag/v6` and `lite-api.jup.ag` hosts are in the
    // migration documentation as phased-out — `api.jup.ag` is the
    // path-forward, accepts both keyless and `x-api-key` requests,
    // and returns the same v1 payload shape we already handle.
    //
    // V2 (`/swap/v2/build`) returns *instructions* instead of a
    // serialized tx, requiring us to assemble a VersionedTransaction
    // ourselves with ALT resolution — out of scope for this v1 of
    // the swap endpoint. We'll migrate when v1 is actually decommissioned.
    const rawAmount = BigInt(Math.floor(amount * 10 ** decimals))
    const quoteUrl = new URL("https://api.jup.ag/swap/v1/quote")
    quoteUrl.searchParams.set("inputMint", inputMint.toBase58())
    quoteUrl.searchParams.set("outputMint", outputMint.toBase58())
    quoteUrl.searchParams.set("amount", rawAmount.toString())
    quoteUrl.searchParams.set("slippageBps", slippageBps.toString())
    quoteUrl.searchParams.set("onlyDirectRoutes", "false")
    quoteUrl.searchParams.set("asLegacyTransaction", "false")

    let quote: JupQuote
    try {
      const r = await fetch(quoteUrl.toString(), {
        headers: jupiterHeaders(ctx.env),
      })
      if (!r.ok) {
        const text = await r.text()
        return jsonResponse(
          { error: `Jupiter quote failed: ${text.slice(0, 200)}` },
          502,
        )
      }
      quote = (await r.json()) as JupQuote
    } catch (err) {
      return jsonResponse(
        { error: `Jupiter quote unreachable: ${err instanceof Error ? err.message : String(err)}` },
        502,
      )
    }

    // ── Step 2: Jupiter swap → serialized VersionedTransaction ─
    let swapTxBase64: string
    try {
      const r = await fetch("https://api.jup.ag/swap/v1/swap", {
        method: "POST",
        headers: jupiterHeaders(ctx.env, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: custodialKeypair.publicKey.toBase58(),
          // Wrap/unwrap SOL automatically — covers SOL legs without
          // us having to manage WSOL ATAs ourselves.
          wrapAndUnwrapSol: true,
          // Dynamic compute unit + priority fee bumping. Without
          // these, swaps frequently land slow on busy mainnet slots.
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto",
        }),
      })
      if (!r.ok) {
        const text = await r.text()
        return jsonResponse(
          { error: `Jupiter swap-build failed: ${text.slice(0, 200)}` },
          502,
        )
      }
      const data = (await r.json()) as { swapTransaction?: string }
      if (!data.swapTransaction) {
        return jsonResponse({ error: "Jupiter swap-build returned no transaction" }, 502)
      }
      swapTxBase64 = data.swapTransaction
    } catch (err) {
      return jsonResponse(
        { error: `Jupiter swap-build unreachable: ${err instanceof Error ? err.message : String(err)}` },
        502,
      )
    }

    // ── Step 3: Sign + send ────────────────────────────────────
    let signature: string
    try {
      // Workers don't have Buffer global, but `Uint8Array.from(atob(...))`
      // works in any modern runtime. The b64 → bytes conversion is what
      // VersionedTransaction.deserialize wants.
      const rawTxBytes = Uint8Array.from(atob(swapTxBase64), c => c.charCodeAt(0))
      const tx = VersionedTransaction.deserialize(rawTxBytes)
      tx.sign([custodialKeypair])
      signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      })
      await confirmTx(connection, signature)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return jsonResponse({ error: `Swap submission failed: ${msg}` }, 500)
    }

    return jsonResponse({
      success: true,
      signature,
      input_mint: quote.inputMint,
      output_mint: quote.outputMint,
      in_amount: quote.inAmount,
      out_amount: quote.outAmount,
      other_amount_threshold: quote.otherAmountThreshold,
      price_impact_pct: Number(quote.priceImpactPct) || 0,
      slippage_bps: quote.slippageBps,
    })
  } catch (err) {
    console.error("[mini/jupiter-swap]", err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    )
  }
}
