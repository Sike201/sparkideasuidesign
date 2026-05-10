#!/usr/bin/env node
/**
 * Generate a fresh VAPID keypair for Web Push.
 *
 *   node scripts/generate-vapid-keys.mjs
 *
 * Emits a base64url-encoded public key (65-byte uncompressed P-256 point)
 * and private key (32-byte scalar), in the exact format the server
 * (`frontend/functions/services/webpush.ts`) and the browser
 * (`pushManager.subscribe({ applicationServerKey })`) expect.
 *
 * Regenerating invalidates every existing subscription — users have to
 * re-enable notifications — so only rotate deliberately (e.g. if the
 * private key leaks). Store the private key in Cloudflare Pages secrets,
 * never commit it to git.
 */

import { webcrypto } from "node:crypto";

function base64UrlEncode(bytes) {
  return Buffer.from(bytes).toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

const pubRaw = await webcrypto.subtle.exportKey("raw", publicKey);       // 65 bytes
const privJwk = await webcrypto.subtle.exportKey("jwk", privateKey);

const pub = base64UrlEncode(new Uint8Array(pubRaw));
const priv = privJwk.d; // already base64url per JWK spec

console.log("");
console.log("─".repeat(72));
console.log("VAPID keypair — add to frontend/wrangler.toml [vars]:");
console.log("─".repeat(72));
console.log("");
console.log(`VITE_VAPID_PUBLIC_KEY = "${pub}"`);
console.log(`VAPID_PRIVATE_KEY     = "${priv}"`);
console.log(`VAPID_SUBJECT         = "mailto:ewan@borgpad.com"`);
console.log("");
console.log("⚠️  VAPID_PRIVATE_KEY is sensitive. In prod, don't commit it:");
console.log("   wrangler pages secret put VAPID_PRIVATE_KEY --project-name <your-project>");
console.log("");
