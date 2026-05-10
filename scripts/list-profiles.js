#!/usr/bin/env node
/**
 * List Paxos profiles to find your PAXOS_PROFILE_ID
 * Usage: node list-profiles.js
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, ".env") });

const { PAXOS_CLIENT_ID, PAXOS_CLIENT_SECRET, PAXOS_ORGANIZATION_ID, PAXOS_ENV } = process.env;

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
    scope: "funding:read_profile",
  }),
});

if (!authRes.ok) {
  console.error("Auth failed:", await authRes.text());
  process.exit(1);
}

const { access_token } = await authRes.json();

// List profiles
const res = await fetch(`${PAXOS_BASE}/profiles`, {
  headers: {
    Authorization: `Bearer ${access_token}`,
    "Paxos-Organization-Id": PAXOS_ORGANIZATION_ID,
  },
});

if (!res.ok) {
  console.error(`List profiles failed (${res.status}):`, await res.text());
  process.exit(1);
}

const data = await res.json();
const items = data.items || [data];

console.log(`\nFound ${items.length} profile(s):\n`);
for (const p of items) {
  console.log(`  ID:     ${p.id}`);
  console.log(`  Name:   ${p.name || "—"}`);
  console.log(`  Type:   ${p.type || "—"}`);
  console.log("");
}
console.log("Copy the ID into PAXOS_PROFILE_ID in your .env file.");
