#!/usr/bin/env node
/**
 * Convert USDC → USDG via Paxos Orchestrations API
 *
 * Full pipeline:
 *   1. Send USDC on-chain from admin wallet → Paxos deposit address
 *   2. Wait for Paxos to credit the deposit
 *   3. Create orchestration: USDC → USDG (profile to profile)
 *   4. Poll until completed
 *   5. Withdraw USDG from Paxos → admin wallet on Solana
 *
 * Usage: node convert.js <amount> [--skip-deposit] [--skip-wait]
 * Example: node convert.js 100
 */

import { randomUUID } from "crypto";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, ".env") });

// ── Config ──────────────────────────────────────────────────────────
const { PAXOS_ENV } = process.env;
const IS_SANDBOX = PAXOS_ENV !== "production";
const PAXOS_BASE = IS_SANDBOX
  ? "https://api.sandbox.paxos.com/v2"
  : "https://api.paxos.com/v2";
const OAUTH_URL = IS_SANDBOX
  ? "https://oauth.sandbox.paxos.com/oauth2/token"
  : "https://oauth.paxos.com/oauth2/token";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 600_000; // 10 min
const USDC_DECIMALS = 6;

const USDC_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const SCOPES = [
  "conversion:read_conversion_stablecoin",
  "conversion:write_conversion_stablecoin",
  "funding:read_profile",
  "funding:write_profile",
  "transfer:read_transfer",
  "transfer:read_deposit_address",
  "transfer:write_deposit_address",
  "transfer:write_crypto_withdrawal",
  "orchestration:read_orchestration",
  "orchestration:write_orchestration",
].join(" ");

const {
  PAXOS_CLIENT_ID,
  PAXOS_CLIENT_SECRET,
  PAXOS_ORGANIZATION_ID,
  PAXOS_PROFILE_ID,
  RPC_URL,
  PRIVATE_KEY,
  SOLANA_NETWORK,
} = process.env;

const USDC_MINT = SOLANA_NETWORK === "mainnet" ? USDC_MAINNET : USDC_DEVNET;

// ── Helpers ─────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function fail(msg) {
  console.error(`[${new Date().toISOString()}] ERROR: ${msg}`);
  process.exit(1);
}

async function paxosFetch(token, path, options = {}) {
  const url = path.startsWith("http") ? path : `${PAXOS_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Paxos-Organization-Id": PAXOS_ORGANIZATION_ID,
      ...options.headers,
    },
  });
  return res;
}

// ── Auth ────────────────────────────────────────────────────────────
async function getAccessToken() {
  log("Authenticating with Paxos OAuth2...");

  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: PAXOS_CLIENT_ID,
      client_secret: PAXOS_CLIENT_SECRET,
      scope: SCOPES,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    fail(`OAuth failed (${res.status}): ${text}`);
  }

  const { access_token } = await res.json();
  log("Authenticated");
  return access_token;
}

// ── Step 1: Get/create Paxos deposit address ────────────────────────
async function getDepositAddress(token) {
  log("Getting Paxos deposit address for USDC on Solana...");

  const listRes = await paxosFetch(token, `/transfer/deposit-addresses?profile_id=${PAXOS_PROFILE_ID}`);
  if (listRes.ok) {
    const list = await listRes.json();
    const items = list.items || [];
    const existing = items.find(
      (a) => a.crypto_network === "SOLANA"
    );
    if (existing) {
      log(`Reusing existing deposit address: ${existing.address}`);
      return existing;
    }
  }

  const body = {
    profile_id: PAXOS_PROFILE_ID,
    crypto_network: "SOLANA",
    ref_id: randomUUID(),
  };

  const res = await paxosFetch(token, "/transfer/deposit-addresses", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    fail(`Create deposit address failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  log(`Deposit address created: ${data.address}`);
  return data;
}

// ── Step 2: Send USDC on-chain to Paxos ─────────────────────────────
async function sendUsdcOnChain(connection, wallet, depositAddress, amount) {
  const amountRaw = BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
  log(`Sending ${amount} USDC on-chain to ${depositAddress}...`);

  const adminPublicKey = wallet.publicKey;
  const destPublicKey = new PublicKey(depositAddress);

  const adminAta = await getAssociatedTokenAddress(USDC_MINT, adminPublicKey);
  const destAta = await getAssociatedTokenAddress(USDC_MINT, destPublicKey);

  const adminAccount = await getAccount(connection, adminAta);
  const balance = Number(adminAccount.amount) / 10 ** USDC_DECIMALS;
  if (balance < amount) {
    fail(`Insufficient USDC balance: have ${balance}, need ${amount}`);
  }
  log(`Admin USDC balance: ${balance}`);

  const tx = new Transaction();

  try {
    await getAccount(connection, destAta);
  } catch {
    log("Creating destination ATA...");
    tx.add(
      createAssociatedTokenAccountInstruction(
        adminPublicKey, destAta, destPublicKey, USDC_MINT
      )
    );
  }

  tx.add(
    createTransferCheckedInstruction(
      adminAta, USDC_MINT, destAta, adminPublicKey, amountRaw, USDC_DECIMALS
    )
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = adminPublicKey;
  tx.sign(wallet);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  log(`USDC transfer tx sent: ${sig}`);
  const confirmation = await connection.confirmTransaction(sig, "confirmed");
  if (confirmation.value.err) {
    fail(`Transfer failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  log(`USDC transfer confirmed: ${sig}`);
  return sig;
}

// ── Step 3: Wait for Paxos to credit the deposit ────────────────────
async function waitForDeposit(token, amount) {
  log(`Waiting for Paxos to credit ${amount} USDC (polling balance)...`);
  const start = Date.now();

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await paxosFetch(token, `/profiles/${PAXOS_PROFILE_ID}/balances`);
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      const usdc = items.find((b) => b.asset === "USDC");
      const available = parseFloat(usdc?.available || "0");

      if (available >= amount) {
        log(`USDC balance: ${available} — deposit credited`);
        return;
      }
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    log(`  Waiting... (${elapsed}s)`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  fail(`Deposit not credited after ${POLL_TIMEOUT_MS / 1000}s. Check Paxos dashboard.`);
}

// ── Step 4: Orchestration USDC → USDG ──────────────────────────────
async function createOrchestration(token, amount) {
  const refId = randomUUID();
  log(`Creating orchestration: ${amount} USDC → USDG (ref: ${refId})`);

  const body = {
    ref_id: refId,
    profile_id: PAXOS_PROFILE_ID,
    source_asset: "USDC",
    source_amount: String(amount),
    destination_asset: "USDG",
    source: {
      profile: {
        profile_id: PAXOS_PROFILE_ID,
      },
    },
    destination: {
      profile: {
        profile_id: PAXOS_PROFILE_ID,
      },
    },
  };

  const res = await paxosFetch(token, "/orchestration/orchestrations", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    fail(`Create orchestration failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const orch = data.orchestration || data;
  log(`Orchestration created: id=${orch.id}, status=${orch.status}`);
  return orch;
}

async function pollOrchestration(token, orchId) {
  const start = Date.now();
  log(`Polling orchestration ${orchId}...`);

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await paxosFetch(token, `/orchestration/orchestrations/${orchId}`);

    if (!res.ok) {
      const text = await res.text();
      fail(`Poll failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    const orch = data.orchestration || data;
    log(`  status: ${orch.status}`);

    if (orch.status === "SETTLED" || orch.status === "COMPLETED") {
      log(`Orchestration ${orchId} completed`);
      return orch;
    }

    if (orch.status === "FAILED" || orch.status === "CANCELLED") {
      fail(`Orchestration ${orchId} ended with status: ${orch.status}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  fail(`Orchestration ${orchId} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

// ── Step 5: Withdraw USDG to admin wallet ───────────────────────────
async function withdrawUsdg(token, adminWalletAddress, amount) {
  const refId = randomUUID();
  log(`Withdrawing ${amount} USDG to ${adminWalletAddress} (ref: ${refId})`);

  const body = {
    ref_id: refId,
    profile_id: PAXOS_PROFILE_ID,
    amount: String(amount),
    asset: "USDG",
    crypto_network: "SOLANA",
    destination_address: adminWalletAddress,
  };

  const res = await paxosFetch(token, "/transfer/crypto-withdrawals", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    fail(`Withdrawal failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  log(`Withdrawal created: id=${data.id}, status=${data.status}`);
  return data;
}

async function pollWithdrawal(token) {
  const start = Date.now();
  log("Polling USDG balance until withdrawal completes...");

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await paxosFetch(token, `/profiles/${PAXOS_PROFILE_ID}/balances`);
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      const usdg = items.find((b) => b.asset === "USDG");
      const available = parseFloat(usdg?.available || "0");

      if (available === 0) {
        log("USDG balance: 0 — withdrawal processed");
        return { status: "COMPLETED" };
      }

      const elapsed = Math.round((Date.now() - start) / 1000);
      log(`  USDG balance: ${available} — waiting... (${elapsed}s)`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  log("Withdrawal polling timed out — check Paxos dashboard and admin wallet");
  return { status: "TIMEOUT" };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const skipDeposit = args.includes("--skip-deposit");
  const skipWait = args.includes("--skip-wait");
  const skipConvert = args.includes("--skip-convert");
  const amountArg = args.find((a) => !a.startsWith("--"));
  if (!amountArg) {
    fail("Usage: node convert.js <amount> [--skip-deposit] [--skip-wait] [--skip-convert]\nExample: node convert.js 100");
  }

  const amount = parseFloat(amountArg);
  if (isNaN(amount) || amount <= 0) {
    fail(`Invalid amount: ${amountArg}`);
  }

  if (!PAXOS_CLIENT_ID || !PAXOS_CLIENT_SECRET || !PAXOS_ORGANIZATION_ID || !PAXOS_PROFILE_ID) {
    fail("Missing env vars: PAXOS_CLIENT_ID, PAXOS_CLIENT_SECRET, PAXOS_ORGANIZATION_ID, PAXOS_PROFILE_ID");
  }
  if (!RPC_URL || !PRIVATE_KEY) {
    fail("Missing env vars: RPC_URL, PRIVATE_KEY");
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
  const adminWallet = wallet.publicKey.toBase58();

  log(`=== Converting ${amount} USDC → USDG via Paxos ===`);
  log(`Admin wallet: ${adminWallet}`);
  log(`Solana: ${SOLANA_NETWORK || "devnet"}`);
  log(`Paxos: ${IS_SANDBOX ? "sandbox" : "production"}`);

  // 0. Auth
  const token = await getAccessToken();

  let transferTx = "skipped";

  if (skipDeposit) {
    log("--skip-deposit: skipping on-chain transfer");
  } else {
    // 1. Get Paxos deposit address
    log("\n── Step 1: Get deposit address ──");
    const depositAddr = await getDepositAddress(token);

    // 2. Send USDC on-chain
    log("\n── Step 2: Send USDC to Paxos ──");
    transferTx = await sendUsdcOnChain(connection, wallet, depositAddr.address, amount);
  }

  // 3. Wait for deposit credit
  if (skipWait) {
    log("\n--skip-wait: assuming USDC is already on Paxos");
  } else {
    log("\n── Step 3: Wait for deposit ──");
    await waitForDeposit(token, amount);
  }

  // 4. Orchestration: USDC → USDG
  let settled = { id: "skipped", status: "skipped" };
  if (skipConvert) {
    log("\n--skip-convert: skipping orchestration");
  } else {
    log("\n── Step 4: USDC → USDG (orchestration) ──");
    const orch = await createOrchestration(token, amount);
    settled = await pollOrchestration(token, orch.id);
  }

  // 5. Withdraw USDG to admin wallet
  log("\n── Step 5: Withdraw USDG ──");
  const withdrawal = await withdrawUsdg(token, adminWallet, amount);

  // Summary
  console.log("\n" + "=".repeat(60));
  log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Amount in:       ${amount} USDC`);
  console.log(`  Amount out:      ${amount} USDG`);
  console.log(`  USDC transfer:   ${transferTx}`);
  console.log(`  Orchestration:   ${settled.id} — ${settled.status}`);
  console.log(`  Withdrawal:      ${withdrawal.id} — ${withdrawal.status}`);
  console.log(`  Admin wallet:    ${adminWallet}`);
  console.log("=".repeat(60));
}

main();
