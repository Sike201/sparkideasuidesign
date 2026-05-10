// File: functions/api/launched-ideas.ts
// Returns dashboard data for completed/launched ideas:
// price_launch, treasury_launch, market_cap, ticker, name, nav_current, nav_launch

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
  JUPITER_API_KEY?: string;
  RPC_URL?: string;
  VITE_SOLANA_NETWORK?: string;
};

const AIRDROP_TOKENS = 10_000_000;
const TREASURY_PERCENT = 0.80;
const LIQUIDITY_PERCENT = 0.20;

// Total supply depends on liquidity percent: airdrop + (liquidityPct × airdrop) + 900K DAMMv2#2
const DAMMV2_2_TOKENS = 900_000;
const TOTAL_SUPPLY = AIRDROP_TOKENS + Math.round(AIRDROP_TOKENS * LIQUIDITY_PERCENT) + DAMMV2_2_TOKENS;

// Stablecoin mints
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDG_MAINNET = "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH";
const USDG_DEVNET = "4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7";

// Token programs
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface IdeaRow {
  id: string;
  title: string;
  slug: string;
  ticker: string | null;
  coin_name: string | null;
  token_address: string | null;
  initial_token_price: number | null;
  raised_amount: number;
  estimated_price: number;
  treasury_wallet: string | null;
  status: string;
  pool_omnipair: string | null;
  pool_dammv2_1: string | null;
  pool_dammv2_2: string | null;
  liquidity_percent: number | null;
}

interface LaunchedIdeaData {
  id: string;
  name: string;
  ticker: string | null;
  slug: string;
  token_address: string | null;
  price_launch: number | null;
  price_current: number | null;
  market_cap: number | null;
  treasury_launch: number;
  treasury_current: number | null;
  nav_launch: number | null;
  nav_current: number | null;
  pool_omnipair: string | null;
  pool_dammv2_1: string | null;
  pool_dammv2_2: string | null;
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "http://localhost:5173";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

export const onRequest: PagesFunction<ENV> = async (context) => {
  const request = context.request;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...corsHeaders(request), Allow: "OPTIONS, GET" },
    });
  }

  const db = context.env.DB;

  try {
    const rows = await db
      .prepare(
        `SELECT id,
                json_extract(data, '$.title') as title,
                json_extract(data, '$.slug') as slug,
                json_extract(data, '$.ticker') as ticker,
                json_extract(data, '$.coin_name') as coin_name,
                json_extract(data, '$.token_address') as token_address,
                json_extract(data, '$.initial_token_price') as initial_token_price,
                json_extract(data, '$.raised_amount') as raised_amount,
                json_extract(data, '$.estimated_price') as estimated_price,
                json_extract(data, '$.treasury_wallet') as treasury_wallet,
                json_extract(data, '$.status') as status,
                json_extract(data, '$.pool_omnipair') as pool_omnipair,
                json_extract(data, '$.pool_dammv2_1') as pool_dammv2_1,
                json_extract(data, '$.pool_dammv2_2') as pool_dammv2_2,
                json_extract(data, '$.liquidity_percent') as liquidity_percent
         FROM ideas
         WHERE json_extract(data, '$.status') = 'completed'
           AND json_extract(data, '$.token_address') IS NOT NULL`
      )
      .all<IdeaRow>();

    const ideas = rows.results || [];

    if (ideas.length === 0) {
      return jsonResponse({ ideas: [] });
    }

    // Batch-fetch current token prices
    const mints = ideas
      .map((i) => i.token_address)
      .filter((m): m is string => !!m);
    const prices = await fetchPrices(mints, context.env.JUPITER_API_KEY);

    // Batch-fetch treasury balances (USDC + USDG) on-chain
    const network = context.env.VITE_SOLANA_NETWORK || "mainnet";
    const rpcUrl = context.env.RPC_URL || "https://mainnet.helius-rpc.com";
    const usdcMint = network === "mainnet" ? USDC_MAINNET : USDC_DEVNET;
    const usdgMint = network === "mainnet" ? USDG_MAINNET : USDG_DEVNET;
    const treasuryWallets = ideas
      .map((i) => i.treasury_wallet)
      .filter((w): w is string => !!w);
    const treasuryBalances = await fetchTreasuryBalances(rpcUrl, usdcMint, usdgMint, treasuryWallets);

    // Build response
    const result: LaunchedIdeaData[] = ideas.map((idea) => {
      // Per-idea liquidity percent (stored at deploy time, fallback to global default)
      const ideaLiqPct = idea.liquidity_percent ?? LIQUIDITY_PERCENT;
      const ideaTreasuryPct = 1 - ideaLiqPct;
      const ideaTotalSupply = AIRDROP_TOKENS + Math.round(AIRDROP_TOKENS * ideaLiqPct) + DAMMV2_2_TOKENS;

      const cappedRaised = Math.min(
        idea.raised_amount,
        idea.estimated_price > 0 ? idea.estimated_price * 2 : idea.raised_amount
      );
      const treasuryLaunch = cappedRaised * ideaTreasuryPct;
      const liquidityLaunch = cappedRaised * ideaLiqPct;

      // NAV at launch = initial token price, fallback to raised_amount / airdrop supply
      const navLaunch = idea.initial_token_price ?? (idea.raised_amount > 0 ? idea.raised_amount / AIRDROP_TOKENS : null);

      // Current price
      const currentPrice = idea.token_address ? (prices[idea.token_address] ?? null) : null;

      // Market cap = current price × total supply (dynamic per idea)
      const marketCap = currentPrice != null ? currentPrice * ideaTotalSupply : null;

      // Treasury current = USDC + USDG balance of treasury wallet
      const treasuryCurrent = idea.treasury_wallet ? (treasuryBalances[idea.treasury_wallet] ?? null) : null;

      // NAV current = (initial liquidity + current treasury balance) / airdrop supply
      const navCurrent = treasuryCurrent != null ? (liquidityLaunch + treasuryCurrent) / AIRDROP_TOKENS : null;

      return {
        id: idea.id,
        name: idea.coin_name || idea.title,
        ticker: idea.ticker,
        slug: idea.slug,
        token_address: idea.token_address,
        price_launch: idea.initial_token_price ?? null,
        price_current: currentPrice,
        market_cap: marketCap != null ? Math.round(marketCap) : null,
        treasury_launch: Math.round(treasuryLaunch * 100) / 100,
        treasury_current: treasuryCurrent != null ? Math.round(treasuryCurrent * 100) / 100 : null,
        nav_launch: navLaunch,
        nav_current: navCurrent != null ? Math.round(navCurrent * 1_000_000) / 1_000_000 : null,
        pool_omnipair: idea.pool_omnipair ?? null,
        pool_dammv2_1: idea.pool_dammv2_1 ?? null,
        pool_dammv2_2: idea.pool_dammv2_2 ?? null,
      };
    });

    return jsonResponse({ ideas: result });
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong..." }, 500);
  }
};

/**
 * Batch-fetch token prices from Jupiter, fallback to DexScreener.
 */
async function fetchPrices(
  mints: string[],
  jupiterApiKey?: string
): Promise<Record<string, number>> {
  if (mints.length === 0) return {};

  const prices: Record<string, number> = {};

  try {
    const ids = mints.join(",");
    const headers: Record<string, string> = {};
    if (jupiterApiKey) headers["x-api-key"] = jupiterApiKey;

    const res = await fetch(`https://api.jup.ag/price/v3?ids=${ids}`, { headers });
    if (res.ok) {
      const data = (await res.json()) as Record<string, { usdPrice?: number; price?: string }>;
      for (const mint of mints) {
        const entry = data[mint] || (data as any).data?.[mint];
        const price = entry?.usdPrice ?? (entry?.price ? Number(entry.price) : null);
        if (price != null && price > 0) {
          prices[mint] = price;
        }
      }
    }
  } catch (err) {
    console.error("[LAUNCHED] Jupiter batch error:", err);
  }

  const missing = mints.filter((m) => !(m in prices));
  for (const mint of missing) {
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`);
      if (res.ok) {
        const pairs = (await res.json()) as Array<{ priceUsd?: string }>;
        if (Array.isArray(pairs) && pairs.length > 0 && pairs[0].priceUsd) {
          prices[mint] = Number(pairs[0].priceUsd);
        }
      }
    } catch {
      // skip
    }
  }

  return prices;
}

/**
 * Fetch USDC + USDG balances for treasury wallets via RPC.
 * USDC uses TOKEN_PROGRAM, USDG uses TOKEN_2022_PROGRAM.
 */
async function fetchTreasuryBalances(
  rpcUrl: string,
  usdcMint: string,
  usdgMint: string,
  wallets: string[]
): Promise<Record<string, number>> {
  if (wallets.length === 0) return {};

  const balances: Record<string, number> = {};
  const BATCH = 5;

  for (let i = 0; i < wallets.length; i += BATCH) {
    const batch = wallets.slice(i, i + BATCH);

    const results = await Promise.all(
      batch.map(async (wallet) => {
        const [usdc, usdg] = await Promise.all([
          fetchTokenBalance(rpcUrl, wallet, usdcMint, TOKEN_PROGRAM),
          fetchTokenBalance(rpcUrl, wallet, usdgMint, TOKEN_2022_PROGRAM),
        ]);
        return { wallet, balance: usdc + usdg };
      })
    );

    for (const { wallet, balance } of results) {
      balances[wallet] = balance;
    }
  }

  return balances;
}

/**
 * Fetch a single SPL/Token-2022 balance via RPC.
 */
async function fetchTokenBalance(
  rpcUrl: string,
  wallet: string,
  mint: string,
  programId: string
): Promise<number> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          wallet,
          { mint },
          { encoding: "jsonParsed", programId },
        ],
      }),
    });

    if (!res.ok) return 0;

    const data = (await res.json()) as {
      result?: {
        value: Array<{
          account: {
            data: {
              parsed: {
                info: {
                  tokenAmount: { uiAmount: number };
                };
              };
            };
          };
        }>;
      };
    };

    let total = 0;
    for (const acc of data.result?.value || []) {
      total += acc.account.data.parsed.info.tokenAmount.uiAmount || 0;
    }
    return total;
  } catch {
    return 0;
  }
}
