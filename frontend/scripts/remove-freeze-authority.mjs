/**
 * Remove Freeze Authority from a token mint.
 * Mint authority is NOT affected.
 *
 * Usage:
 *   PRIVATE_KEY=<bs58_key> node scripts/remove-freeze-authority.mjs <MINT_ADDRESS>
 *
 * Example:
 *   PRIVATE_KEY=xxx node scripts/remove-freeze-authority.mjs D4FeaXPt7ZQTH5bYkLzFpyamFER4ZGue6F4tuC6fZspk
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { setAuthority, AuthorityType, getMint } from "@solana/spl-token";
import bs58 from "bs58";

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const mintAddress = process.argv[2];

if (!PRIVATE_KEY) {
  console.error("Error: PRIVATE_KEY env var is required");
  process.exit(1);
}
if (!mintAddress) {
  console.error("Usage: PRIVATE_KEY=<key> node scripts/remove-freeze-authority.mjs <MINT_ADDRESS>");
  process.exit(1);
}

const connection = new Connection(RPC_URL, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
const mint = new PublicKey(mintAddress);

console.log(`Wallet:  ${wallet.publicKey.toBase58()}`);
console.log(`Mint:    ${mintAddress}`);

// Check current state
const mintInfo = await getMint(connection, mint);
console.log(`Current mint authority:   ${mintInfo.mintAuthority?.toBase58() || "NONE"}`);
console.log(`Current freeze authority: ${mintInfo.freezeAuthority?.toBase58() || "NONE"}`);

if (!mintInfo.freezeAuthority) {
  console.log("\nFreeze authority is already removed. Nothing to do.");
  process.exit(0);
}

if (mintInfo.freezeAuthority.toBase58() !== wallet.publicKey.toBase58()) {
  console.error(`\nError: Freeze authority is ${mintInfo.freezeAuthority.toBase58()}, not your wallet.`);
  process.exit(1);
}

console.log("\nRemoving freeze authority...");

const sig = await setAuthority(
  connection,
  wallet,          // payer
  mint,            // mint account
  wallet,          // current authority
  AuthorityType.FreezeAccount,
  null,            // new authority = null (remove)
);

console.log(`\nDone! Tx: ${sig}`);
console.log(`https://solscan.io/tx/${sig}`);

// Verify
const updated = await getMint(connection, mint);
console.log(`\nVerification:`);
console.log(`  Mint authority:   ${updated.mintAuthority?.toBase58() || "NONE"}`);
console.log(`  Freeze authority: ${updated.freezeAuthority?.toBase58() || "NONE"}`);
