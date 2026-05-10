// File: functions/api/idea-investments.ts
// Investment API for ideas funding

import { jsonResponse, reportError } from "./cfPagesFunctionsUtils";
import { getRpcUrlForCluster } from '../../shared/solana/rpcUtils';
import { PublicKey } from '@solana/web3.js';

const SPARK_VAULT_PROGRAM_ID = new PublicKey("8u9AUqFv25xUpXqVwE83EiQ91YkvJbmsa5BheTVb3xvZ");

/**
 * SECURITY: Verify the on-chain UserDeposit PDA balance matches expectations.
 * Prevents deposit-then-withdraw exploit where the API records an investment
 * but the attacker immediately withdraws the funds in a subsequent transaction.
 *
 * Computes the UserDeposit PDA, reads it via RPC, and checks that the on-chain
 * amount >= (total previously recorded active investments + this new investment).
 */
async function verifyOnChainDepositBalance(
  rpcUrl: string,
  ideaId: string,
  investorWallet: string,
  newAmountUsdc: number,
  existingActiveTotal: number,
  currency: 'USDC' | 'USDG' = 'USDC'
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Compute vault_seed = SHA256(vaultIdeaId)
    // USDC uses raw ideaId, USDG uses ideaId + ":USDG" (must match client-side derivation)
    const vaultIdeaId = currency === 'USDG' ? `${ideaId}:USDG` : ideaId;
    const ideaIdBytes = new TextEncoder().encode(vaultIdeaId);
    const hashBuffer = await crypto.subtle.digest("SHA-256", ideaIdBytes);
    const vaultSeed = new Uint8Array(hashBuffer);

    // Derive Vault PDA
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), vaultSeed],
      SPARK_VAULT_PROGRAM_ID
    );

    // Derive UserDeposit PDA
    const userPubkey = new PublicKey(investorWallet);
    const [userDepositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), vaultPda.toBuffer(), userPubkey.toBuffer()],
      SPARK_VAULT_PROGRAM_ID
    );

    // Fetch account via RPC
    const resp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [userDepositPda.toBase58(), { encoding: "base64", commitment: "confirmed" }],
      }),
    });

    const data = await resp.json() as {
      result?: { value?: { data?: [string, string] } };
    };

    if (!data.result?.value?.data?.[0]) {
      // Account doesn't exist — user has 0 on-chain deposit
      return { valid: false, error: "On-chain deposit account not found — funds may have been withdrawn" };
    }

    // Decode base64 account data
    const raw = Uint8Array.from(atob(data.result.value.data[0]), c => c.charCodeAt(0));

    // UserDeposit layout: 8 (discriminator) + 32 (vault) + 32 (user) + 8 (amount u64 LE)
    if (raw.length < 80) {
      return { valid: false, error: "Invalid UserDeposit account data" };
    }

    // Read amount as u64 LE at offset 72
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const amountLow = view.getUint32(72, true);
    const amountHigh = view.getUint32(76, true);
    const onChainAmountRaw = amountLow + amountHigh * 0x100000000;
    // USDC has 6 decimals
    const onChainAmountUsdc = onChainAmountRaw / 1_000_000;

    const expectedMinimum = existingActiveTotal + newAmountUsdc;

    console.log(`🔍 [DEPOSIT-CHECK] on-chain=${onChainAmountUsdc}, expected>=${expectedMinimum} (existing=${existingActiveTotal}, new=${newAmountUsdc})`);

    if (onChainAmountUsdc < expectedMinimum * 0.99) {
      return {
        valid: false,
        error: `On-chain deposit balance ($${onChainAmountUsdc.toFixed(2)}) is less than expected ($${expectedMinimum.toFixed(2)}). Funds may have been withdrawn.`,
      };
    }

    return { valid: true };
  } catch (error) {
    console.error("[DEPOSIT-CHECK] Failed to verify on-chain deposit:", error);
    // Don't block on verification failure — the sysvar check on-chain is the primary defense
    return { valid: true };
  }
}

type ENV = {
  DB: D1Database;
  VITE_ENVIRONMENT_TYPE: string;
  VITE_SOLANA_NETWORK?: string;
  TREASURY_WALLETS?: string;
  ADMIN_ADDRESSES?: string;
  RPC_URL?: string;
  RPC_URL2?: string;
};

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

  // SECURITY: Only allow whitelisted origins
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

// SECURITY: Validate Solana transaction signature format (base58, 88 chars typical)
function isValidTransactionSignature(signature: string): boolean {
  if (!signature || typeof signature !== "string") return false;
  // Solana signatures are base58 encoded, typically 87-88 characters
  if (signature.length < 80 || signature.length > 100) return false;
  // Base58 character set (no 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(signature);
}

// SECURITY: Validate Solana wallet address format
function isValidWalletAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  // Solana addresses are base58 encoded, 32-44 characters
  if (address.length < 32 || address.length > 44) return false;
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(address);
}

// Wait for transaction confirmation via getSignatureStatuses (faster than getTransaction)
async function waitForConfirmation(
  rpcUrl: string,
  signature: string,
  maxAttempts = 12,
  intervalMs = 2500
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const resp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[signature], { searchTransactionHistory: true }],
      }),
    });
    const data = await resp.json() as {
      result?: { value: Array<{ confirmationStatus?: string; err?: unknown } | null> };
    };
    const status = data.result?.value?.[0];
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      console.log(`✅ [VERIFY] Transaction confirmed (attempt ${i + 1}/${maxAttempts}): ${status.confirmationStatus}`);
      return true;
    }
    if (status?.err) {
      console.log(`❌ [VERIFY] Transaction failed on-chain (attempt ${i + 1}): ${JSON.stringify(status.err)}`);
      return false;
    }
    console.log(`⏳ [VERIFY] Waiting for confirmation (attempt ${i + 1}/${maxAttempts})...`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// SECURITY: Verify on-chain transaction exists and matches expected details
// direction: "deposit" = user spent USDC (pre > post), "withdraw" = user received USDC (post > pre)
async function verifyTransaction(
  rpcUrl: string,
  signature: string,
  expectedWallet: string,
  expectedAmountUsdc: number,
  direction: "deposit" | "withdraw" = "deposit"
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Step 1: Wait for transaction to be confirmed (up to 30s)
    const confirmed = await waitForConfirmation(rpcUrl, signature);
    if (!confirmed) {
      return { valid: false, error: "Transaction not confirmed on-chain (timeout after 30s)" };
    }

    // Step 2: Fetch full transaction details
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
      }),
    });

    const data = await response.json() as {
      result?: {
        meta?: {
          err: unknown;
          preTokenBalances?: Array<{ owner: string; uiTokenAmount: { uiAmount: number }; mint: string }>;
          postTokenBalances?: Array<{ owner: string; uiTokenAmount: { uiAmount: number }; mint: string }>;
        };
        transaction?: {
          message?: {
            accountKeys?: Array<{ pubkey: string; signer: boolean }>;
          };
        };
      };
      error?: { message: string };
    };

    // If getTransaction still returns null after confirmation, retry a few times
    if (data.error || !data.result) {
      const retryDelays = [2000, 3000, 5000];
      let found = false;
      for (const delay of retryDelays) {
        console.log(`⏳ [VERIFY] getTransaction returned null after confirmation, retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        const retryResponse = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
          }),
        });
        const retryData = await retryResponse.json() as typeof data;
        if (!retryData.error && retryData.result) {
          Object.assign(data, retryData);
          found = true;
          break;
        }
      }
      if (!found) {
        return { valid: false, error: "Transaction confirmed but details unavailable from RPC" };
      }
    }

    // Check transaction didn't fail
    if (data.result.meta?.err) {
      return { valid: false, error: "Transaction failed on-chain" };
    }

    // Verify the signer matches the expected wallet
    const signers = data.result.transaction?.message?.accountKeys
      ?.filter((k) => k.signer)
      .map((k) => k.pubkey) || [];

    if (!signers.includes(expectedWallet)) {
      return { valid: false, error: "Transaction signer does not match investor wallet" };
    }

    // Verify token transfer amount by checking balance changes
    // Allowed mint addresses (USDC + USDG, devnet + mainnet)
    const ALLOWED_MINTS = [
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC mainnet
      "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // USDC devnet
      "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH", // USDG mainnet
      "4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7",   // USDG devnet
    ];

    const preBalances = data.result.meta?.preTokenBalances || [];
    const postBalances = data.result.meta?.postTokenBalances || [];

    // Find the signer's USDC balance change
    const preUsdcBalance = preBalances.find(
      (b) => b.owner === expectedWallet && ALLOWED_MINTS.includes(b.mint)
    );
    const postUsdcBalance = postBalances.find(
      (b) => b.owner === expectedWallet && ALLOWED_MINTS.includes(b.mint)
    );

    if (preUsdcBalance && postUsdcBalance) {
      const preAmount = preUsdcBalance.uiTokenAmount.uiAmount || 0;
      const postAmount = postUsdcBalance.uiTokenAmount.uiAmount || 0;

      // For deposit: user spent USDC (pre > post), change is positive
      // For withdraw: user received USDC (post > pre), change is positive
      const balanceChange = direction === "deposit"
        ? preAmount - postAmount   // spent
        : postAmount - preAmount;  // received

      // Allow 1% tolerance for rounding
      if (balanceChange < expectedAmountUsdc * 0.99) {
        return {
          valid: false,
          error: `Transaction amount mismatch: expected $${expectedAmountUsdc} ${direction}, found $${balanceChange.toFixed(6)} ${direction === "deposit" ? "spent" : "received"}`,
        };
      }
    }

    return { valid: true };
  } catch (error) {
    console.error("Transaction verification failed:", error);
    return { valid: false, error: "Failed to verify transaction on-chain" };
  }
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

  switch (method) {
    case "GET":
      return handleGetRequest(context);
    case "POST":
      return handlePostRequest(context);
    case "PUT":
      return handlePutRequest(context);
    default:
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          ...corsHeaders(request),
          Allow: "OPTIONS, GET, POST, PUT",
        },
      });
  }
};

// GET - Fetch investments for an idea or by wallet
async function handleGetRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const ideaId = searchParams.get("ideaId");
    const wallet = searchParams.get("wallet");
    const twitterUsername = searchParams.get("username");

    let investments;

    if (ideaId) {
      // Get all investments for an idea
      investments = await db
        .prepare(
          `SELECT * FROM idea_investments 
           WHERE idea_id = ? 
           ORDER BY created_at DESC`
        )
        .bind(ideaId)
        .all();
      
      // Get the treasury wallet for this idea, assign one if it doesn't exist
      let idea = await db
        .prepare("SELECT json_extract(data, '$.treasury_wallet') as treasury_wallet, json_extract(data, '$.raised_amount') as raised_amount FROM ideas WHERE id = ?")
        .bind(ideaId)
        .first<{ treasury_wallet?: string; raised_amount?: number }>();

      let treasuryWallet = idea?.treasury_wallet || null;
      const raisedAmount = idea?.raised_amount || 0;

      // Compute net invested per wallet: total invested - total withdrawn
      const activeInvestments = (investments.results || []) as Array<{ investor_wallet: string; amount_usdc: number; status: string }>;
      const investedByWallet: Record<string, number> = {};
      for (const inv of activeInvestments) {
        if (inv.status === 'active') {
          investedByWallet[inv.investor_wallet] = (investedByWallet[inv.investor_wallet] || 0) + inv.amount_usdc;
        }
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

      const withdrawMap: Record<string, number> = {};
      for (const w of (withdrawals.results || [])) {
        withdrawMap[w.investor_wallet] = w.total_withdrawn;
      }

      const netByWallet: Record<string, number> = {};
      for (const [wallet, invested] of Object.entries(investedByWallet)) {
        const withdrawn = withdrawMap[wallet] || 0;
        const net = Math.max(0, invested - withdrawn);
        if (net > 0.001) {
          netByWallet[wallet] = Math.round(net * 100) / 100;
        }
      }

      return jsonResponse({
        investments: investments.results,
        withdrawals: withdrawMap,
        net_by_wallet: netByWallet,
        raised_amount: raisedAmount,
        treasury_wallet: treasuryWallet || null
      }, 200);
    } else if (twitterUsername) {
      // Get all investments by twitter username (wallet-independent), exclude refunded
      investments = await db
        .prepare(
          `SELECT i.*, json_extract(ideas.data, '$.title') as idea_title, json_extract(ideas.data, '$.slug') as idea_slug
           FROM idea_investments i
           JOIN ideas ON i.idea_id = ideas.id
           WHERE i.investor_twitter_username = ? AND i.status != 'refunded'
           ORDER BY i.created_at DESC`
        )
        .bind(twitterUsername)
        .all();

      // Also include older investments linked via wallet (before username was stored)
      const twitterUser = await db
        .prepare("SELECT wallet_address FROM twitter_users WHERE username = ?")
        .bind(twitterUsername)
        .first<{ wallet_address?: string }>();

      if (twitterUser?.wallet_address) {
        const walletInvestments = await db
          .prepare(
            `SELECT i.*, json_extract(ideas.data, '$.title') as idea_title, json_extract(ideas.data, '$.slug') as idea_slug
             FROM idea_investments i
             JOIN ideas ON i.idea_id = ideas.id
             WHERE i.investor_wallet = ? AND (i.investor_twitter_username IS NULL OR i.investor_twitter_username != ?) AND i.status != 'refunded'
             ORDER BY i.created_at DESC`
          )
          .bind(twitterUser.wallet_address, twitterUsername)
          .all();

        investments.results = [...(investments.results || []), ...(walletInvestments.results || [])];
      }
    } else if (wallet) {
      // Get all investments by a specific wallet, exclude refunded
      investments = await db
        .prepare(
          `SELECT i.*, json_extract(ideas.data, '$.title') as idea_title, json_extract(ideas.data, '$.slug') as idea_slug
           FROM idea_investments i
           JOIN ideas ON i.idea_id = ideas.id
           WHERE i.investor_wallet = ? AND i.status != 'refunded'
           ORDER BY i.created_at DESC`
        )
        .bind(wallet)
        .all();
    } else {
      return jsonResponse({ message: "ideaId, wallet, or username parameter is required" }, 400);
    }

    return jsonResponse({ investments: investments.results }, 200);
  } catch (e) {
    await reportError(db, e);
    return jsonResponse({ message: "Something went wrong..." }, 500);
  }
}

// POST - Create a new investment
async function handlePostRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      ideaId?: string;
      investorWallet?: string;
      amountUsdc?: number;
      transactionSignature?: string;
      currency?: string;
      investorEmail?: string;
      touAccepted?: boolean;
      investorTwitterUsername?: string;
    };

    const { ideaId, investorWallet, amountUsdc, transactionSignature } = body;
    const currency = body.currency === 'USDG' ? 'USDG' : 'USDC';

    // Validate required fields
    if (!ideaId || !investorWallet || !amountUsdc) {
      return new Response(
        JSON.stringify({ message: "ideaId, investorWallet, and amountUsdc are required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // Check if user already has email + TOU accepted in the user table
    let resolvedEmail = body.investorEmail;
    let resolvedTouAccepted = body.touAccepted === true;

    try {
      const existingUser = await db
        .prepare("SELECT address, data FROM user WHERE address = ?")
        .bind(investorWallet)
        .first<{ address: string; data: string }>();

      if (existingUser) {
        const userData = JSON.parse(existingUser.data || '{}');
        if (userData.email && userData.tou_accepted_at) {
          // User already provided email and accepted TOU previously
          resolvedEmail = resolvedEmail || userData.email;
          resolvedTouAccepted = true;
        }
      }
    } catch (lookupErr) {
      console.error("⚠️ [INVESTMENT] Failed to lookup user data (non-blocking):", lookupErr);
    }

    // Validate email and Terms of Use acceptance
    if (!resolvedEmail || typeof resolvedEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedEmail)) {
      return new Response(
        JSON.stringify({ message: "A valid email address is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    if (!resolvedTouAccepted) {
      return new Response(
        JSON.stringify({ message: "You must accept the Terms of Use" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // SECURITY: Validate wallet address format
    if (!isValidWalletAddress(investorWallet)) {
      return new Response(
        JSON.stringify({ message: "Invalid wallet address format" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // SECURITY: Validate transaction signature format if provided
    if (transactionSignature && !isValidTransactionSignature(transactionSignature)) {
      return new Response(
        JSON.stringify({ message: "Invalid transaction signature format" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // SECURITY: Validate amount is a positive number with reasonable bounds
    if (typeof amountUsdc !== "number" || amountUsdc <= 0) {
      return new Response(
        JSON.stringify({ message: "Amount must be greater than 0" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // SECURITY: Check for reasonable amount limits (max 1 billion USDC)
    if (amountUsdc > 1_000_000_000) {
      return new Response(
        JSON.stringify({ message: "Amount exceeds maximum allowed" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // SECURITY: Validate decimal precision (max 6 decimals for USDC)
    const decimalParts = amountUsdc.toString().split(".");
    if (decimalParts[1] && decimalParts[1].length > 6) {
      return new Response(
        JSON.stringify({ message: "Amount exceeds maximum decimal precision (6 decimals)" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // Check if idea exists and get current raised amount and treasury_wallet
    const idea = await db
      .prepare("SELECT id, json_extract(data, '$.estimated_price') as estimated_price, json_extract(data, '$.raised_amount') as raised_amount, json_extract(data, '$.treasury_wallet') as treasury_wallet, json_extract(data, '$.status') as status FROM ideas WHERE id = ?")
      .bind(ideaId)
      .first<{ id: string; estimated_price: number; raised_amount: number; treasury_wallet?: string; status?: string }>();

    if (!idea) {
      return new Response(JSON.stringify({ message: "Idea not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    if (idea.status === "refunded") {
      return new Response(JSON.stringify({ message: "This idea has been refunded. Investments are no longer accepted." }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    // Treasury wallet is configured manually via back-office
    let treasuryWallet = idea.treasury_wallet || null;

    // Check if investment would exceed the goal
    const currentRaised = idea.raised_amount || 0;
    const goal = idea.estimated_price || 0;
    const remaining = Math.max(0, goal - currentRaised);

    // Note: We no longer block investments exceeding the goal.
    // The on-chain vault accepts deposits beyond the cap, and raised_amount
    // should reflect the real total to stay in sync.

    // SECURITY: Verify on-chain transaction before recording investment
    if (!transactionSignature) {
      return new Response(
        JSON.stringify({ message: "Transaction signature is required. Investments must be verified on-chain." }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // Check for duplicate transaction signature
    const existingTx = await db
      .prepare("SELECT id FROM idea_investments WHERE transaction_signature = ?")
      .bind(transactionSignature)
      .first();

    if (existingTx) {
      return new Response(
        JSON.stringify({ message: "This transaction has already been recorded" }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // Verify transaction on-chain via RPC
    const network = ctx.env.VITE_SOLANA_NETWORK || 'devnet';
    const baseRpc = ctx.env.RPC_URL || ctx.env.RPC_URL2 || "https://mainnet.helius-rpc.com";
    const rpcUrl = getRpcUrlForCluster(baseRpc, network);
    console.log(`🔍 [VERIFY] network=${network}, baseRpc=${baseRpc}, rpcUrl=${rpcUrl}, signature=${transactionSignature}`);
    const verification = await verifyTransaction(rpcUrl, transactionSignature, investorWallet, amountUsdc);

    if (!verification.valid) {
      console.error(`❌ [INVESTMENT] Transaction verification failed: ${verification.error}`, {
        signature: transactionSignature,
        wallet: investorWallet,
        amount: amountUsdc,
      });
      return new Response(
        JSON.stringify({ message: `Transaction verification failed: ${verification.error}` }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    console.log(`✅ [INVESTMENT] Transaction verified on-chain: ${transactionSignature}`);

    // SECURITY: Verify on-chain deposit PDA balance matches DB total + this new deposit.
    // Prevents deposit-then-withdraw exploit across separate transactions.
    //
    // BUG FIX: filter by `currency`. The on-chain UserDeposit PDA is
    // per-vault (USDC vault vs USDG vault — different seeds), so we
    // must compare it against the SAME-currency historical total in
    // the DB. Pre-fix, a user with both USDC and USDG investments saw
    // their USDG check fail because `existingActiveTotal` summed both
    // currencies but the PDA only carried the USDC slice (or vice
    // versa).
    const existingActiveResult = await db
      .prepare(
        `SELECT COALESCE(SUM(amount_usdc), 0) as total
         FROM idea_investments
         WHERE idea_id = ? AND investor_wallet = ?
           AND status = 'active' AND currency = ?`
      )
      .bind(ideaId, investorWallet, currency)
      .first<{ total: number }>();

    const existingWithdrawnResult = await db
      .prepare(
        `SELECT COALESCE(SUM(amount_usdc), 0) as total
         FROM idea_withdrawals
         WHERE idea_id = ? AND investor_wallet = ? AND currency = ?`
      )
      .bind(ideaId, investorWallet, currency)
      .first<{ total: number }>();

    const existingActiveTotal = Math.max(0, (existingActiveResult?.total || 0) - (existingWithdrawnResult?.total || 0));

    const depositCheck = await verifyOnChainDepositBalance(rpcUrl, ideaId, investorWallet, amountUsdc, existingActiveTotal, currency);
    if (!depositCheck.valid) {
      console.error(`❌ [INVESTMENT] On-chain deposit check failed: ${depositCheck.error}`, {
        signature: transactionSignature,
        wallet: investorWallet,
        amount: amountUsdc,
        existingActiveTotal,
      });
      return new Response(
        JSON.stringify({ message: `Investment rejected: ${depositCheck.error}` }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // Upsert investor email + TOU acceptance into user table
    try {
      const existingUser = await db
        .prepare("SELECT address, data FROM user WHERE address = ?")
        .bind(investorWallet)
        .first<{ address: string; data: string }>();

      const nowIso = new Date().toISOString();
      if (!existingUser) {
        await db
          .prepare("INSERT INTO user (address, data) VALUES (?1, ?2)")
          .bind(investorWallet, JSON.stringify({ email: resolvedEmail, tou_accepted_at: nowIso }))
          .run();
      } else {
        const userData = JSON.parse(existingUser.data || '{}');
        userData.email = resolvedEmail;
        if (!userData.tou_accepted_at) {
          userData.tou_accepted_at = nowIso;
        }
        await db
          .prepare("UPDATE user SET data = ?2 WHERE address = ?1")
          .bind(investorWallet, JSON.stringify(userData))
          .run();
      }
    } catch (emailErr) {
      console.error("⚠️ [INVESTMENT] Failed to upsert user data (non-blocking):", emailErr);
    }

    const id = generateUUID();
    const createdAt = new Date().toISOString();

    // Resolve twitter username for this wallet (for comment investment display)
    let resolvedTwitterUsername = body.investorTwitterUsername || null;
    if (!resolvedTwitterUsername) {
      try {
        const twitterUser = await db
          .prepare("SELECT username FROM twitter_users WHERE wallet_address = ?")
          .bind(investorWallet)
          .first<{ username?: string }>();
        resolvedTwitterUsername = twitterUser?.username || null;
      } catch { /* non-blocking */ }
    }

    // Insert investment
    await db
      .prepare(
        `INSERT INTO idea_investments (id, idea_id, investor_wallet, amount_usdc, status, transaction_signature, currency, investor_email, tou_accepted_at, investor_twitter_username, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
      )
      .bind(id, ideaId, investorWallet, amountUsdc, 'active', transactionSignature || null, currency, resolvedEmail, createdAt, resolvedTwitterUsername, createdAt)
      .run();

    // Update raised amount on idea
    const newRaisedAmount = currentRaised + amountUsdc;
    await db
      .prepare("UPDATE ideas SET data = json_set(data, '$.raised_amount', ?) WHERE id = ?")
      .bind(newRaisedAmount, ideaId)
      .run();

    // If cap is reached, record the timestamp
    if (newRaisedAmount >= goal && goal > 0) {
      await db
        .prepare("UPDATE ideas SET data = json_set(data, '$.cap_reached_at', ?) WHERE id = ? AND json_extract(data, '$.cap_reached_at') IS NULL")
        .bind(new Date().toISOString(), ideaId)
        .run();
    }

    return new Response(
      JSON.stringify({
        success: true,
        investment: {
          id,
          idea_id: ideaId,
          investor_wallet: investorWallet,
          amount_usdc: amountUsdc,
          currency,
          status: 'active',
          created_at: createdAt,
        },
        treasury_wallet: treasuryWallet,
        message: "Investment recorded successfully",
      }),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      }
    );
  } catch (e) {
    await reportError(db, e);
    return new Response(JSON.stringify({ message: "Something went wrong..." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  }
}

// PUT - Update investment status (claim/refund)
async function handlePutRequest(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const request = ctx.request;

  try {
    const body = await request.json() as {
      id?: string;
      action?: 'claim' | 'refund' | 'withdraw';
      amountUsdc?: number;
      transactionSignature?: string;
      ideaId?: string;
      investorWallet?: string;
      currency?: string;
    };

    const { id, action, transactionSignature } = body;

    if (!action) {
      return new Response(
        JSON.stringify({ message: "action is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // ── withdraw: record a partial or full withdrawal ──
    if (action === 'withdraw') {
      const { ideaId, investorWallet, amountUsdc, transactionSignature: txSig } = body;
      const withdrawCurrency = body.currency === 'USDG' ? 'USDG' : 'USDC';

      if (!ideaId || !investorWallet || !amountUsdc || !txSig) {
        return new Response(
          JSON.stringify({ message: "ideaId, investorWallet, amountUsdc and transactionSignature are required for withdraw" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(request) } }
        );
      }

      if (!isValidWalletAddress(investorWallet)) {
        return new Response(
          JSON.stringify({ message: "Invalid wallet address format" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(request) } }
        );
      }

      if (!isValidTransactionSignature(txSig)) {
        return new Response(
          JSON.stringify({ message: "Invalid transaction signature format" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(request) } }
        );
      }

      // Verify tx on-chain
      const network = ctx.env.VITE_SOLANA_NETWORK || 'devnet';
      const rpcUrl = getRpcUrlForCluster(ctx.env.RPC_URL || ctx.env.RPC_URL2 || "https://mainnet.helius-rpc.com", network);
      const verification = await verifyTransaction(rpcUrl, txSig, investorWallet, 0, "withdraw");
      if (!verification.valid) {
        console.error(`❌ [WITHDRAW] Verification failed: ${verification.error}`);
        return new Response(
          JSON.stringify({ message: `Withdrawal verification failed: ${verification.error}` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(request) } }
        );
      }

      // Check for duplicate tx
      const existingWithdraw = await db
        .prepare("SELECT id FROM idea_withdrawals WHERE transaction_signature = ?")
        .bind(txSig)
        .first();

      if (existingWithdraw) {
        return new Response(
          JSON.stringify({ message: "This withdrawal has already been recorded" }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders(request) } }
        );
      }

      const withdrawId = generateUUID();

      // Record withdrawal
      await db
        .prepare(
          `INSERT INTO idea_withdrawals (id, idea_id, investor_wallet, amount_usdc, transaction_signature, currency, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
        )
        .bind(withdrawId, ideaId, investorWallet, amountUsdc, txSig, withdrawCurrency, new Date().toISOString())
        .run();

      // Reduce raised_amount
      const idea = await db
        .prepare("SELECT json_extract(data, '$.raised_amount') as raised_amount FROM ideas WHERE id = ?")
        .bind(ideaId)
        .first<{ raised_amount: number }>();

      if (idea) {
        const newRaisedAmount = Math.max(0, (idea.raised_amount || 0) - amountUsdc);
        await db
          .prepare("UPDATE ideas SET data = json_set(data, '$.raised_amount', ?) WHERE id = ?")
          .bind(newRaisedAmount, ideaId)
          .run();
      }

      console.log(`✅ [WITHDRAW] Recorded ${amountUsdc} ${withdrawCurrency} withdrawal for ${investorWallet} on idea ${ideaId}`);

      return new Response(
        JSON.stringify({ success: true, withdrawalId: withdrawId, message: "Withdrawal recorded" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(request) } }
      );
    }

    // ── claim / refund: update investment status ──
    if (!id) {
      return new Response(
        JSON.stringify({ message: "id is required for claim/refund" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(request) } }
      );
    }

    // Get current investment
    const investment = await db
      .prepare("SELECT * FROM idea_investments WHERE id = ?")
      .bind(id)
      .first<{ id: string; idea_id: string; investor_wallet: string; amount_usdc: number; status: string }>();

    if (!investment) {
      return new Response(JSON.stringify({ message: "Investment not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    if (investment.status !== 'active') {
      return new Response(
        JSON.stringify({ message: `Investment is already ${investment.status}` }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(request),
          },
        }
      );
    }

    // SECURITY: Verify withdrawal transaction on-chain
    if (action === 'refund') {
      if (!transactionSignature) {
        return new Response(
          JSON.stringify({ message: "Transaction signature is required for withdrawals. Must be verified on-chain." }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(request),
            },
          }
        );
      }

      if (!isValidTransactionSignature(transactionSignature)) {
        return new Response(
          JSON.stringify({ message: "Invalid transaction signature format" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(request),
            },
          }
        );
      }

      const network = ctx.env.VITE_SOLANA_NETWORK || 'devnet';
      const rpcUrl = getRpcUrlForCluster(ctx.env.RPC_URL || ctx.env.RPC_URL2 || "https://mainnet.helius-rpc.com", network);
      const verification = await verifyTransaction(rpcUrl, transactionSignature, investment.investor_wallet, 0, "withdraw");

      if (!verification.valid) {
        console.error(`❌ [WITHDRAW] Transaction verification failed: ${verification.error}`, {
          signature: transactionSignature,
          wallet: investment.investor_wallet,
          investmentId: id,
        });
        return new Response(
          JSON.stringify({ message: `Withdrawal verification failed: ${verification.error}` }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(request),
            },
          }
        );
      }

      console.log(`✅ [WITHDRAW] Transaction verified on-chain: ${transactionSignature}`);
    }

    const newStatus = action === 'claim' ? 'claimed' : 'refunded';

    // Update investment status
    await db
      .prepare("UPDATE idea_investments SET status = ? WHERE id = ?")
      .bind(newStatus, id)
      .run();

    // If refunding, reduce the raised amount and revoke points
    if (action === 'refund') {
      const idea = await db
        .prepare("SELECT json_extract(data, '$.raised_amount') as raised_amount FROM ideas WHERE id = ?")
        .bind(investment.idea_id)
        .first<{ raised_amount: number }>();

      if (idea) {
        const newRaisedAmount = Math.max(0, (idea.raised_amount || 0) - investment.amount_usdc);
        await db
          .prepare("UPDATE ideas SET data = json_set(data, '$.raised_amount', ?) WHERE id = ?")
          .bind(newRaisedAmount, investment.idea_id)
          .run();
      }

    }

    return new Response(
      JSON.stringify({
        success: true,
        status: newStatus,
        message: `Investment ${newStatus} successfully`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      }
    );
  } catch (e) {
    await reportError(db, e);
    return new Response(JSON.stringify({ message: "Something went wrong..." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(request),
      },
    });
  }
}

function generateUUID() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      +c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))
    ).toString(16)
  );
}
