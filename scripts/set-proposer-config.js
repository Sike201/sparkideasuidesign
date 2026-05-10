#!/usr/bin/env node
/**
 * Configure DAO proposer requirements via Combinator API.
 *
 * Usage:
 *   node set-proposer-config.js --threshold <raw_units> [--holding-period <hours>] [--dao-pda <pda>] [--dry-run]
 *
 * Examples:
 *   node set-proposer-config.js --threshold 1000000000 --holding-period 72
 *   node set-proposer-config.js --threshold 1000000000 --holding-period 72 --dao-pda ABC...
 *   node set-proposer-config.js --threshold 1000000000 --dry-run
 */

import { createHash } from "crypto";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Keypair } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, ".env") });

const COMBINATOR_API = "https://api.zcombinator.io";

// ── CLI args ───────────────────────────────────────────────────────
function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}

const daoPda = flag("dao-pda") || process.env.DAO_PDA;
const threshold = flag("threshold");
const holdingPeriod = flag("holding-period") ?? "72";
const dryRun = flag("dry-run") === true;

if (!daoPda) {
  console.error("Missing --dao-pda or DAO_PDA env var");
  process.exit(1);
}
if (!threshold) {
  console.error("Missing --threshold <raw_token_units>");
  process.exit(1);
}
if (!process.env.PRIVATE_KEY) {
  console.error("Missing PRIVATE_KEY in .env");
  process.exit(1);
}

// ── Wallet ─────────────────────────────────────────────────────────
const keypair = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
const walletAddress = keypair.publicKey.toBase58();

// ── Build payload & sign its hash ──────────────────────────────────
const timestamp = Math.floor(Date.now() / 1000).toString();
const url = `${COMBINATOR_API}/dao/${daoPda}/proposer-config`;

// Combinator auth: sign a human-readable message containing SHA-256(body) hex
const payload = {
  wallet: walletAddress,
  threshold,
  holding_period_hours: Number(holdingPeriod),
};
const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
const message = `Combinator Authentication\n\nSign this message to verify your request.\n\nRequest hash: ${hash}`;
const messageBytes = new TextEncoder().encode(message);
const signatureBytes = ed25519.sign(messageBytes, keypair.secretKey.slice(0, 32));
const signedHash = bs58.encode(signatureBytes);

const body = { ...payload, signed_hash: signedHash };
const headers = { "Content-Type": "application/json" };

console.log("\n=== Set Proposer Config ===");
console.log("DAO PDA:        ", daoPda);
console.log("Wallet:         ", walletAddress);
console.log("Threshold:      ", threshold);
console.log("Holding period: ", holdingPeriod, "hours");
console.log("Timestamp:      ", timestamp);
console.log("URL:            ", url);

if (dryRun) {
  console.log("\n[DRY RUN] Request body:", JSON.stringify(body, null, 2));
  console.log("[DRY RUN] Headers:", JSON.stringify(headers, null, 2));
  process.exit(0);
}

// ── Execute ────────────────────────────────────────────────────────
const res = await fetch(url, {
  method: "PUT",
  headers,
  body: JSON.stringify(body),
});

const data = await res.json().catch(() => null);

if (!res.ok) {
  console.error(`\nError ${res.status}:`, data || res.statusText);
  process.exit(1);
}

console.log("\nSuccess:", JSON.stringify(data, null, 2));
