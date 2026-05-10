// File: functions/api/idea-allocation.ts
// Token allocation API for idea raises

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";
import { getRpcUrlForCluster } from "../../shared/solana/rpcUtils";

type ENV = {
  DB: D1Database;
  VITE_SOLANA_NETWORK?: string;
  RPC_URL?: string;
  RPC_URL2?: string;
  JUPITER_API_KEY?: string;
};

// Partner token mint addresses (Solana mainnet)
// TODO: Replace placeholder addresses with real mint addresses
const PARTNER_TOKENS: Record<string, string> = {
  SPARK: "SPaRKoVUfuj8FSnmbZmwAD1xP1jPEB4Vik8sgVxnJPq",
  OMFG: "omfgRBnxHsNJh6YeGbGAmWenNkenzsXyBXm3WDhmeta",
  BORG: "3dQTr7ror2QPKQ3GbBCokJUmjErGg8kTJzdnYjNfvi3Z",
  ZCOMBINATOR: "GVvPZpC6ymCoiHzYJ7CWZ8LhVn9tL2AUpRjSAsLh6jZC",
  META: "METAwkXcqyXKy1AtsSgJ8JiUHwGCafnZL38n3vYmeta",
};

const TIER_THRESHOLD_USD = 1;
const TOTAL_SUPPLY = 10_000_000;
const TIER_WEIGHT_BONUS = 0.1; // 10% bonus per tier level on effective investment

// Fee structure: 1% total per investment
// 0.5% → Spark in USDG (handled by withdraw-and-swap)
// 0.5% → Referrer in tokens (if referred) or Spark in tokens (if not)
const INVESTOR_TOKEN_PERCENT = 0.99;   // 99% of investment → investor tokens
const REFERRAL_TOKEN_PERCENT = 0.005;  // 0.5% of investment → referrer/Spark tokens

// SECURITY: Whitelist of allowed origins for CORS
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://sparkidea.io",
  "https://www.sparkidea.io",
  "https://spark-it.pages.dev",
  "https://stage.spark-it.pages.dev",
  "https://justspark.fun",
];

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

interface Allocation {
  wallet: string;
  invested: number;
  effectiveInvested: number;
  effectivePercent: number;
  refund: number;
  percentage: number;
  tokens: number;
  tier: number;
  isIdeator: boolean;
  isReferralReward: boolean;
  breakdown: {
    proRata: number;
    tierWeighted: number;
    ideator: number;
    referralReward: number;
  };
}

export const onRequest: PagesFunction<ENV> = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }

  if (method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...corsHeaders(request), Allow: "OPTIONS, GET" },
    });
  }

  const db = context.env.DB;

  try {
    const { searchParams } = new URL(request.url);
    const ideaId = searchParams.get("ideaId");

    const log = searchParams.get("log") === "true";

    if (!ideaId) {
      return jsonResponse({ message: "ideaId parameter is required" }, 400);
    }

    // a. Fetch idea data
    const idea = await db
      .prepare(
        `SELECT id,
                json_extract(data, '$.estimated_price') as estimated_price,
                json_extract(data, '$.raised_amount') as raised_amount,
                json_extract(data, '$.author_twitter_id') as author_twitter_id
         FROM ideas WHERE id = ?`
      )
      .bind(ideaId)
      .first<{
        id: string;
        estimated_price: number;
        raised_amount: number;
        author_twitter_id: string | null;
      }>();

    if (!idea) {
      return jsonResponse({ message: "Idea not found" }, 404);
    }

    // b. Get net investments per wallet
    const netByWallet = await getNetByWallet(db, ideaId);

    const totalRaised = Object.values(netByWallet).reduce((a, b) => a + b, 0);

    if (totalRaised <= 0) {
      return jsonResponse({
        ideaId,
        totalRaised: 0,
        cap: idea.estimated_price || 0,
        mode: "simple",
        totalSupply: TOTAL_SUPPLY,
        allocations: [],
        ideatorWallet: null,
        unallocatedTokens: TOTAL_SUPPLY,
      }, 200);
    }

    // b2. Get referral data: who referred whom
    const referralMap = await getReferralMap(db, Object.keys(netByWallet));

    // c. Determine distribution mode
    const cap = idea.estimated_price || 0;
    const isOverSubscribed = cap > 0 && totalRaised >= cap * 2;

    let allocations: Allocation[];
    let ideatorWallet: string | null = null;
    let unallocatedTokens = 0;
    let ideatorRefund = 0;

    if (!isOverSubscribed) {
      // d. Simple pro-rata distribution with referral fee split
      // Token price: totalRaised maps to TOTAL_SUPPLY tokens
      // Each investor gets 99% of their investment in tokens
      // 0.5% goes to referrer (or Spark) in tokens

      // Calculate referral reward tokens per referrer
      const referrerRewards: Record<string, number> = {}; // wallet → total reward in $
      let sparkTokenReward = 0; // $ worth of tokens going to Spark

      for (const [wallet, invested] of Object.entries(netByWallet)) {
        const referralFee = invested * REFERRAL_TOKEN_PERCENT; // 0.5% in tokens
        const referrer = referralMap[wallet];
        if (referrer) {
          referrerRewards[referrer] = (referrerRewards[referrer] || 0) + referralFee;
        } else {
          sparkTokenReward += referralFee;
        }
      }

      // Build allocations: investors (99%) + referrer rewards (0.5%)
      const allocationMap: Record<string, { invested: number; tokenValue: number; referralReward: number }> = {};

      for (const [wallet, invested] of Object.entries(netByWallet)) {
        const investorTokenValue = invested * INVESTOR_TOKEN_PERCENT; // 99%
        allocationMap[wallet] = {
          invested,
          tokenValue: investorTokenValue,
          referralReward: 0,
        };
      }

      // Add referral rewards (referrer may or may not be an investor)
      for (const [referrer, reward] of Object.entries(referrerRewards)) {
        if (!allocationMap[referrer]) {
          allocationMap[referrer] = { invested: 0, tokenValue: 0, referralReward: 0 };
        }
        allocationMap[referrer].referralReward += reward;
        allocationMap[referrer].tokenValue += reward;
      }

      // Add Spark token reward (0.5% of non-referred investments)
      // Spark wallet gets tokens but is not an investor
      const SPARK_DAO_WALLET = "SParKVpXZpZmAbXpc5ijwRCHYs4u1G6STjDDLZZWGg2";
      if (sparkTokenReward > 0) {
        if (!allocationMap[SPARK_DAO_WALLET]) {
          allocationMap[SPARK_DAO_WALLET] = { invested: 0, tokenValue: 0, referralReward: 0 };
        }
        allocationMap[SPARK_DAO_WALLET].referralReward += sparkTokenReward;
        allocationMap[SPARK_DAO_WALLET].tokenValue += sparkTokenReward;
      }

      // Total token value = sum of all tokenValues (should ≈ totalRaised * 99.5%)
      const totalTokenValue = Object.values(allocationMap).reduce((s, a) => s + a.tokenValue, 0);

      allocations = Object.entries(allocationMap).map(([wallet, data]) => {
        const tokens = (data.tokenValue / totalTokenValue) * TOTAL_SUPPLY;
        const percentage = (tokens / TOTAL_SUPPLY) * 100;
        const referralTokens = (data.referralReward / totalTokenValue) * TOTAL_SUPPLY;
        return {
          wallet,
          invested: data.invested,
          effectiveInvested: data.tokenValue,
          effectivePercent: data.invested > 0 ? Math.round((data.tokenValue / data.invested) * 10000) / 100 : 0,
          refund: 0,
          percentage: Math.round(percentage * 100) / 100,
          tokens: Math.round(tokens),
          tier: 0,
          isIdeator: false,
          isReferralReward: data.invested === 0 && data.referralReward > 0,
          breakdown: {
            proRata: Math.round(tokens - referralTokens),
            tierWeighted: 0,
            ideator: 0,
            referralReward: Math.round(referralTokens),
          },
        };
      });
    } else {
      // e. Oversubscribed distribution
      // Total effective investment = 2 × cap, excess refunded per wallet proportionally
      // Tokens are always proportional to investment (no inversions)
      const effectiveTotal = cap * 2;

      // e.1 Find ideator wallet
      if (idea.author_twitter_id) {
        const twitterUser = await db
          .prepare("SELECT wallet_address FROM twitter_users WHERE twitter_id = ?")
          .bind(idea.author_twitter_id)
          .first<{ wallet_address: string | null }>();
        ideatorWallet = twitterUser?.wallet_address || null;
      }

      // e.2 Compute tiers (informational)
      const wallets = Object.keys(netByWallet);
      const network = context.env.VITE_SOLANA_NETWORK || "devnet";
      const baseRpc = context.env.RPC_URL || context.env.RPC_URL2 || "https://mainnet.helius-rpc.com";
      const rpcUrl = getRpcUrlForCluster(baseRpc, network);

      const jupiterApiKey = context.env.JUPITER_API_KEY || "";
      const tierByWallet = await computeTiers(wallets, rpcUrl, jupiterApiKey);

      // e.3 Ideator tokens (10% = 1M max, proportional to their investment)
      let IDEATOR_TOKENS = TOTAL_SUPPLY * 0.1; // 1M
      const ideatorInvested = ideatorWallet ? (netByWallet[ideatorWallet] || 0) : 0;
      const ideatorMaxInvestment = totalRaised * 0.1;

      let effectiveIdeatorTokens = 0;
      if (ideatorWallet && ideatorInvested > 0) {
        if (ideatorInvested <= ideatorMaxInvestment) {
          effectiveIdeatorTokens = (ideatorInvested / ideatorMaxInvestment) * IDEATOR_TOKENS;
        } else {
          effectiveIdeatorTokens = IDEATOR_TOKENS;
        }
      }
      IDEATOR_TOKENS = effectiveIdeatorTokens;

      // e.4 Remaining tokens distributed pro-rata (proportional to investment)
      const PRORATA_TOKENS = TOTAL_SUPPLY - IDEATOR_TOKENS;

      // e.5 Compute tier-weighted effective investments
      // Higher tier → higher share of effectiveTotal → less refund
      const walletEntries = Object.entries(netByWallet);

      let totalWeight = 0;
      const weights: Record<string, number> = {};
      for (const [wallet, invested] of walletEntries) {
        const tier = tierByWallet[wallet] || 0;
        const weight = invested * (1 + tier * TIER_WEIGHT_BONUS);
        weights[wallet] = weight;
        totalWeight += weight;
      }

      // e.6 Build allocations with tier-adjusted refunds + referral fee split
      // Same 99%/0.5% logic as simple mode but applied to effective invested amounts
      const referrerRewardsOS: Record<string, number> = {};
      let sparkTokenRewardOS = 0;

      for (const [wallet] of walletEntries) {
        const weightedShare = weights[wallet] / totalWeight;
        const effectiveInvested = Math.round(weightedShare * effectiveTotal * 100) / 100;
        const referralFee = effectiveInvested * REFERRAL_TOKEN_PERCENT;
        const referrer = referralMap[wallet];
        if (referrer) {
          referrerRewardsOS[referrer] = (referrerRewardsOS[referrer] || 0) + referralFee;
        } else {
          sparkTokenRewardOS += referralFee;
        }
      }

      // Build base allocations for investors
      const allocationMapOS: Record<string, {
        invested: number; effectiveInvested: number; refund: number;
        tokenValue: number; referralReward: number; tier: number; isIdeator: boolean; ideatorTokens: number;
      }> = {};

      for (const [wallet, invested] of walletEntries) {
        const weightedShare = weights[wallet] / totalWeight;
        const effectiveInvested = Math.round(weightedShare * effectiveTotal * 100) / 100;
        const refund = Math.round((invested - effectiveInvested) * 100) / 100;
        const investorTokenValue = effectiveInvested * INVESTOR_TOKEN_PERCENT;

        let ideatorTokens = 0;
        const isIdeator = wallet === ideatorWallet;
        if (isIdeator) {
          ideatorTokens = IDEATOR_TOKENS;
        }

        allocationMapOS[wallet] = {
          invested, effectiveInvested, refund,
          tokenValue: investorTokenValue, referralReward: 0,
          tier: tierByWallet[wallet] || 0, isIdeator, ideatorTokens,
        };
      }

      // Add referral rewards
      for (const [referrer, reward] of Object.entries(referrerRewardsOS)) {
        if (!allocationMapOS[referrer]) {
          allocationMapOS[referrer] = {
            invested: 0, effectiveInvested: 0, refund: 0,
            tokenValue: 0, referralReward: 0, tier: 0, isIdeator: false, ideatorTokens: 0,
          };
        }
        allocationMapOS[referrer].referralReward += reward;
        allocationMapOS[referrer].tokenValue += reward;
      }

      // Add Spark DAO token reward
      const SPARK_DAO_WALLET_OS = "SParKVpXZpZmAbXpc5ijwRCHYs4u1G6STjDDLZZWGg2";
      if (sparkTokenRewardOS > 0) {
        if (!allocationMapOS[SPARK_DAO_WALLET_OS]) {
          allocationMapOS[SPARK_DAO_WALLET_OS] = {
            invested: 0, effectiveInvested: 0, refund: 0,
            tokenValue: 0, referralReward: 0, tier: 0, isIdeator: false, ideatorTokens: 0,
          };
        }
        allocationMapOS[SPARK_DAO_WALLET_OS].referralReward += sparkTokenRewardOS;
        allocationMapOS[SPARK_DAO_WALLET_OS].tokenValue += sparkTokenRewardOS;
      }

      // Total token value for pro-rata (excluding ideator bonus)
      const totalTokenValueOS = Object.values(allocationMapOS).reduce((s, a) => s + a.tokenValue, 0);

      allocations = Object.entries(allocationMapOS).map(([wallet, data]) => {
        const proRataTokens = (data.tokenValue / totalTokenValueOS) * PRORATA_TOKENS;
        const totalTokens = proRataTokens + data.ideatorTokens;
        const percentage = (totalTokens / TOTAL_SUPPLY) * 100;
        const referralTokens = (data.referralReward / totalTokenValueOS) * PRORATA_TOKENS;

        return {
          wallet,
          invested: data.invested,
          effectiveInvested: data.effectiveInvested,
          effectivePercent: data.invested > 0 ? Math.round((data.effectiveInvested / data.invested) * 10000) / 100 : 0,
          refund: data.refund,
          percentage: Math.round(percentage * 100) / 100,
          tokens: Math.round(totalTokens),
          tier: data.tier,
          isIdeator: data.isIdeator,
          isReferralReward: data.invested === 0 && data.referralReward > 0,
          breakdown: {
            proRata: Math.round(proRataTokens - referralTokens),
            tierWeighted: 0,
            ideator: Math.round(data.ideatorTokens),
            referralReward: Math.round(referralTokens),
          },
        };
      });

    }

    const totalTokenGiven = allocations.reduce((sum, a) => sum + a.tokens, 0);

    const totalRefund = allocations.reduce((sum, a) => sum + a.refund, 0);

    const compact = {
      allocations: allocations.map((a) => ({
        wallet: a.wallet,
        percentage: a.percentage,
        tokens: a.tokens,
        refund: a.refund,
        effectivePercent: a.effectivePercent,
      })),
      totalTokenGiven,
      totalRefund: Math.round(totalRefund * 100) / 100,
    };

    for (const a of allocations) {
      const ep = a.invested > 0
        ? Math.round((a.effectiveInvested / a.invested) * 10000) / 100
        : 0;
      const tags = [
        a.isIdeator ? "[ideator]" : "",
        a.isReferralReward ? "[referral-only]" : "",
        a.breakdown.referralReward > 0 ? `[ref+${a.breakdown.referralReward}]` : "",
      ].filter(Boolean).join(" ");
      console.log(`[ALLOC] ${a.wallet.slice(0, 8)}... invested=$${a.invested} effective=$${a.effectiveInvested} (${ep}%) refund=$${a.refund} tokens=${a.tokens} tier=${a.tier} ${tags}`);
    }
    console.log(`[ALLOC] Total: ${allocations.length} wallets, ${totalTokenGiven} tokens, $${Math.round(totalRefund * 100) / 100} refunded`);

    const full = {
      ideaId,
      totalRaised: Math.round(totalRaised * 100) / 100,
      cap,
      mode: isOverSubscribed ? "oversubscribed" : "simple",
      totalSupply: TOTAL_SUPPLY,
      effectiveTotal: isOverSubscribed ? cap * 2 : totalRaised,
      allocations,
      ideatorWallet,
      totalRefund: Math.round(totalRefund * 100) / 100,
      totalTokenGiven,
    };

    return jsonResponse(
      log ? full : compact,
      200
    );
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong..." }, 500);
  }
};

/**
 * Returns a map of referee_wallet → referrer_wallet for the given investor wallets.
 */
async function getReferralMap(
  db: D1Database,
  investorWallets: string[]
): Promise<Record<string, string>> {
  if (investorWallets.length === 0) return {};

  // D1 doesn't support large IN clauses well, batch in groups of 50
  const map: Record<string, string> = {};
  const BATCH = 50;
  for (let i = 0; i < investorWallets.length; i += BATCH) {
    const batch = investorWallets.slice(i, i + BATCH);
    const placeholders = batch.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT referee_wallet, referrer_wallet FROM referrals
         WHERE referee_wallet IN (${placeholders}) AND status = 'active'`
      )
      .bind(...batch)
      .all<{ referee_wallet: string; referrer_wallet: string }>();

    for (const row of rows.results || []) {
      map[row.referee_wallet] = row.referrer_wallet;
    }
  }
  return map;
}

/**
 * Computes net invested amount per wallet for a given idea.
 * Sums active investments then subtracts withdrawals.
 */
async function getNetByWallet(
  db: D1Database,
  ideaId: string
): Promise<Record<string, number>> {
  const investments = await db
    .prepare(
      `SELECT investor_wallet, SUM(amount_usdc) as total_invested
       FROM idea_investments
       WHERE idea_id = ? AND status = 'active'
       GROUP BY investor_wallet`
    )
    .bind(ideaId)
    .all<{ investor_wallet: string; total_invested: number }>();

  const investedByWallet: Record<string, number> = {};
  for (const row of investments.results || []) {
    investedByWallet[row.investor_wallet] = row.total_invested;
  }

  const withdrawals = await db
    .prepare(
      `SELECT investor_wallet, SUM(amount_usdc) as total_withdrawn
       FROM idea_withdrawals
       WHERE idea_id = ?
       GROUP BY investor_wallet`
    )
    .bind(ideaId)
    .all<{ investor_wallet: string; total_withdrawn: number }>();

  const netByWallet: Record<string, number> = {};
  for (const [wallet, invested] of Object.entries(investedByWallet)) {
    const withdrawn =
      (withdrawals.results || []).find((w) => w.investor_wallet === wallet)
        ?.total_withdrawn || 0;
    const net = Math.max(0, invested - withdrawn);
    if (net > 0.001) {
      netByWallet[wallet] = Math.round(net * 100) / 100;
    }
  }

  return netByWallet;
}

/**
 * Fetches Jupiter prices for partner tokens in a single batch call.
 */
async function fetchPartnerPrices(jupiterApiKey: string): Promise<Record<string, number>> {
  const mints = Object.values(PARTNER_TOKENS);
  const ids = mints.join(",");

  try {
    const headers: Record<string, string> = {};
    if (jupiterApiKey) {
      headers["x-api-key"] = jupiterApiKey;
    }
    const response = await fetch(
      `https://api.jup.ag/price/v3?ids=${ids}`,
      { headers }
    );
    const data = (await response.json()) as
      Record<string, { usdPrice?: number; price?: string }>;

    const prices: Record<string, number> = {};
    for (const [name, mint] of Object.entries(PARTNER_TOKENS)) {
      const entry = data[mint] || (data as any).data?.[mint];
      prices[name] = entry?.usdPrice ?? (entry?.price ? parseFloat(entry.price) : 0);
    }
    console.log(`[TIER] Jupiter prices: ${Object.entries(prices).map(([n, p]) => `${n}=$${p}`).join(", ")}`);
    return prices;
  } catch (err) {
    console.error("Failed to fetch Jupiter prices:", err);
    // Return zero prices on failure — wallets will get tier 0
    const prices: Record<string, number> = {};
    for (const name of Object.keys(PARTNER_TOKENS)) {
      prices[name] = 0;
    }
    return prices;
  }
}

/**
 * Gets the token balance for a given wallet and mint via RPC.
 * Uses getParsedTokenAccountsByOwner filtered by mint.
 */
async function getTokenBalance(
  rpcUrl: string,
  walletAddress: string,
  mintAddress: string
): Promise<number> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          walletAddress,
          { mint: mintAddress },
          { encoding: "jsonParsed" },
        ],
      }),
    });

    const data = (await response.json()) as {
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

    const accounts = data.result?.value || [];
    let totalBalance = 0;
    for (const account of accounts) {
      totalBalance +=
        account.account.data.parsed.info.tokenAmount.uiAmount || 0;
    }
    return totalBalance;
  } catch {
    return 0;
  }
}

/**
 * Computes tier (0-5) for each wallet based on partner token holdings.
 * Batches RPC calls to avoid rate limiting.
 */
async function computeTiers(
  wallets: string[],
  rpcUrl: string,
  jupiterApiKey: string
): Promise<Record<string, number>> {
  if (wallets.length === 0) return {};

  // Fetch all partner token prices in one call
  const prices = await fetchPartnerPrices(jupiterApiKey);
  const mints = Object.entries(PARTNER_TOKENS);

  const tierByWallet: Record<string, number> = {};

  // Process wallets in batches of 10 to avoid RPC rate limiting
  const BATCH_SIZE = 10;
  for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
    const batch = wallets.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (wallet) => {
        let tierPoints = 0;

        // Check each partner token
        const tokenDetails: string[] = [];
        const balancePromises = mints.map(async ([name, mint]) => {
          const balance = await getTokenBalance(rpcUrl, wallet, mint);
          const price = prices[name] || 0;
          const valueUsd = balance * price;
          const qualifies = valueUsd >= TIER_THRESHOLD_USD;
          if (balance > 0) {
            tokenDetails.push(`${name}: ${balance.toFixed(2)} ($${valueUsd.toFixed(2)})${qualifies ? " ✓" : ""}`);
          }
          return qualifies ? 1 : 0;
        });

        const points = await Promise.all(balancePromises);
        tierPoints = points.reduce((a, b) => a + b, 0);

        const holdingsStr = tokenDetails.length > 0 ? tokenDetails.join(", ") : "no holdings";
        console.log(`[TIER] ${wallet.slice(0, 8)}... → tier ${tierPoints}/5 (${holdingsStr})`);

        return { wallet, tier: tierPoints };
      })
    );

    for (const { wallet, tier } of batchResults) {
      tierByWallet[wallet] = tier;
    }
  }

  const tierCounts = [0, 0, 0, 0, 0, 0]; // tier 0-5
  for (const tier of Object.values(tierByWallet)) {
    tierCounts[tier]++;
  }
  console.log(`[TIER] Summary: ${wallets.length} wallets — ${tierCounts.map((c, i) => `T${i}:${c}`).join(" ")}`);

  return tierByWallet;
}
