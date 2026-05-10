#!/usr/bin/env node
/**
 * Check Paxos deposits and profile balance
 * Usage: node check-deposits.js
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, ".env") });

const { PAXOS_CLIENT_ID, PAXOS_CLIENT_SECRET, PAXOS_ORGANIZATION_ID, PAXOS_PROFILE_ID, PAXOS_ENV } = process.env;

const IS_SANDBOX = PAXOS_ENV !== "production";
const PAXOS_BASE = IS_SANDBOX ? "https://api.sandbox.paxos.com/v2" : "https://api.paxos.com/v2";
const OAUTH_URL = IS_SANDBOX ? "https://oauth.sandbox.paxos.com/oauth2/token" : "https://oauth.paxos.com/oauth2/token";

// Auth
const authRes = await fetch(OAUTH_URL, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: PAXOS_CLIENT_ID,
    client_secret: PAXOS_CLIENT_SECRET,
    scope: "funding:read_profile transfer:read_transfer transfer:read_deposit_address",
  }),
});

if (!authRes.ok) {
  console.error("Auth failed:", await authRes.text());
  process.exit(1);
}

const { access_token } = await authRes.json();
const headers = {
  Authorization: `Bearer ${access_token}`,
  "Paxos-Organization-Id": PAXOS_ORGANIZATION_ID,
};

console.log("=== Profile Balance ===");
const balRes = await fetch(`${PAXOS_BASE}/profiles/${PAXOS_PROFILE_ID}/balances`, { headers });
if (balRes.ok) {
  const data = await balRes.json();
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log(`Balance API (${balRes.status}):`, await balRes.text());
}

console.log("\n=== Deposit Addresses ===");
const addrRes = await fetch(`${PAXOS_BASE}/transfer/deposit-addresses?profile_id=${PAXOS_PROFILE_ID}`, { headers });
if (addrRes.ok) {
  const data = await addrRes.json();
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log(`Deposit addresses API (${addrRes.status}):`, await addrRes.text());
}

console.log("\n=== Recent Deposits ===");
const depRes = await fetch(`${PAXOS_BASE}/transfer/deposits?profile_id=${PAXOS_PROFILE_ID}`, { headers });
if (depRes.ok) {
  const data = await depRes.json();
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log(`Deposits API (${depRes.status}):`, await depRes.text());
}

console.log("\n=== Recent Transfers ===");
const trRes = await fetch(`${PAXOS_BASE}/transfer/activities?profile_id=${PAXOS_PROFILE_ID}`, { headers });
if (trRes.ok) {
  const data = await trRes.json();
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log(`Activities API (${trRes.status}):`, await trRes.text());
}
