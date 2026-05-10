/**
 * Web Push sender for Cloudflare Workers — uses only the Web Crypto API
 * (no Node dependencies, works in Pages Functions / Workers).
 *
 * Implements:
 *   - VAPID (RFC 8292) — JWT signed with ES256 using the server's P-256
 *     private key, placed in the `Authorization: vapid t=…, k=…` header.
 *   - aes128gcm payload encryption (RFC 8291) — ephemeral ECDH exchange
 *     with the client's p256dh key, HKDF-derived CEK + nonce, single
 *     record body with `[salt(16) || rs(4) || idlen(1) || keyid || ct]`.
 *
 * Not implemented (not needed for MVP):
 *   - aesgcm (legacy, pre-RFC8291) — all modern browsers support aes128gcm.
 *   - Topic / urgency headers — we send normal-priority, untopiced pushes.
 *
 * Error handling: `sendWebPush` never throws on HTTP errors. It returns
 * a `PushResult` with `ok: false` and the status code so the caller can
 * decide whether to drop the subscription (404/410 = gone) or retry
 * (429/5xx = transient).
 */

// ── Types ───────────────────────────────────────────────────

export interface WebPushSubscription {
  /** Push service URL — globally unique, opaque. */
  endpoint: string;
  /** Client's ECDH public key, uncompressed, base64url (without padding). */
  p256dh: string;
  /** Client's auth secret (16 bytes), base64url (without padding). */
  auth: string;
}

export interface VapidKeys {
  /**
   * Public key — uncompressed P-256 point (65 bytes, 0x04 || X || Y),
   * base64url-encoded. This is what browsers expect in the
   * `applicationServerKey` option of `pushManager.subscribe`.
   */
  publicKey: string;
  /** Private key — 32-byte P-256 scalar, base64url-encoded. */
  privateKey: string;
  /**
   * `sub` claim of the VAPID JWT — either `mailto:...` or an https URL
   * the push service can use to contact us about abuse. Browser-enforced
   * format; a malformed value gets the push rejected with 400.
   */
  subject: string;
}

export interface PushResult {
  ok: boolean;
  status: number;
  endpoint: string;
  /** Only populated on `ok: false`. Short string, fine to log. */
  error?: string;
  /**
   * True when the subscription is permanently gone (404 / 410). Callers
   * should delete the DB row — retrying will never succeed.
   */
  gone: boolean;
}

// ── Base64URL (no padding) ──────────────────────────────────

function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// ── VAPID JWT ───────────────────────────────────────────────

/**
 * Build a VAPID JWT for a specific push origin. The JWT is valid for
 * 12 hours; we re-sign per broadcast rather than cache because a single
 * broadcast typically hits N origins (one per browser vendor) and signing
 * is fast (~1 ms).
 *
 * Output format: `header.payload.signature`, all base64url-encoded.
 */
async function buildVapidJwt(audience: string, vapid: VapidKeys): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: vapid.subject,
  };
  const enc = (obj: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const signingInput = `${enc(header)}.${enc(claims)}`;

  // Decode the stored keypair. Web Crypto wants JWK form for EC private
  // keys — we reconstruct it from the raw scalars we have in env vars.
  const pubRaw = base64UrlDecode(vapid.publicKey);
  if (pubRaw.length !== 65 || pubRaw[0] !== 0x04) {
    throw new Error(`VAPID public key must be 65-byte uncompressed P-256 (0x04 || X || Y), got ${pubRaw.length}`);
  }
  const x = pubRaw.slice(1, 33);
  const y = pubRaw.slice(33, 65);
  const d = base64UrlDecode(vapid.privateKey);
  if (d.length !== 32) {
    throw new Error(`VAPID private key must be 32 bytes, got ${d.length}`);
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(x),
      y: base64UrlEncode(y),
      d: base64UrlEncode(d),
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  // Web Crypto ECDSA output is raw (r || s, 64 bytes) — that's the
  // format JWT ES256 expects, so no DER conversion needed.
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

// ── Payload encryption (aes128gcm, RFC 8291) ───────────────

async function hkdf(
  salt: BufferSource,
  ikm: BufferSource,
  info: BufferSource,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HKDF" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Encrypt a payload for a specific subscription using the aes128gcm
 * scheme described in RFC 8291. Returns the full body to POST — salt +
 * record header + ciphertext — ready to stream as the `fetch` body.
 */
async function encryptPayload(
  payload: Uint8Array,
  p256dhBase64Url: string,
  authBase64Url: string,
): Promise<Uint8Array> {
  const clientPublicKey = base64UrlDecode(p256dhBase64Url);
  const clientAuth = base64UrlDecode(authBase64Url);

  if (clientPublicKey.length !== 65 || clientPublicKey[0] !== 0x04) {
    throw new Error("p256dh must be 65-byte uncompressed P-256 point");
  }
  if (clientAuth.length !== 16) {
    throw new Error("auth must be 16 bytes");
  }

  // 1. Ephemeral server ECDH keypair — fresh per push.
  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const serverPubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeys.publicKey),
  );

  // 2. Import client pub as ECDH peer.
  const clientPubImported = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );

  // 3. Shared secret.
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPubImported },
      serverKeys.privateKey,
      256,
    ),
  );

  // 4. Random salt (16 bytes).
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 5. PRK_KEY = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" + ua_pub + as_pub, 32)
  const keyInfo = concat(
    new TextEncoder().encode("WebPush: info\0"),
    clientPublicKey,
    serverPubRaw,
  );
  const prkKey = await hkdf(clientAuth, shared, keyInfo, 32);

  // 6. CEK = HKDF(salt, PRK_KEY, "Content-Encoding: aes128gcm\0", 16)
  const cek = await hkdf(
    salt,
    prkKey,
    new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
    16,
  );

  // 7. Nonce = HKDF(salt, PRK_KEY, "Content-Encoding: nonce\0", 12)
  const nonce = await hkdf(
    salt,
    prkKey,
    new TextEncoder().encode("Content-Encoding: nonce\0"),
    12,
  );

  // 8. Plaintext: payload || 0x02 (single-record final-byte delimiter).
  const plaintext = new Uint8Array(payload.length + 1);
  plaintext.set(payload);
  plaintext[payload.length] = 0x02;

  // 9. Encrypt.
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext),
  );

  // 10. Body layout (RFC 8188 / 8291):
  //        salt (16) | rs (4 BE) | idlen (1) | keyid (65) | ciphertext
  //     rs = record size. Must be > plaintext+17. 4096 is a safe upper
  //     bound for our short notification payloads (< 4KB by spec anyway).
  const rs = 4096;
  const body = new Uint8Array(16 + 4 + 1 + 65 + ciphertext.length);
  body.set(salt, 0);
  body[16] = (rs >>> 24) & 0xff;
  body[17] = (rs >>> 16) & 0xff;
  body[18] = (rs >>> 8) & 0xff;
  body[19] = rs & 0xff;
  body[20] = 65;
  body.set(serverPubRaw, 21);
  body.set(ciphertext, 21 + 65);
  return body;
}

// ── Public API ──────────────────────────────────────────────

/**
 * Send a single push to one subscription. Encrypted payload + VAPID auth
 * + standard headers. Does NOT throw on failure — check `result.ok`.
 *
 * `payload` is a JSON string the SW will parse in its `push` handler
 * (see public/push-handler.js). Keep it small (< 3 KB after encryption)
 * since some push services (Apple) drop oversized messages silently.
 *
 * @param ttl Time-to-live in seconds — how long the push service keeps
 *            the message for offline devices. Default 4 weeks matches
 *            Chrome's upper limit.
 */
export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: string,
  vapid: VapidKeys,
  ttl = 2419200,
): Promise<PushResult> {
  try {
    const endpointUrl = new URL(subscription.endpoint);
    const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
    const jwt = await buildVapidJwt(audience, vapid);
    const encryptedBody = await encryptPayload(
      new TextEncoder().encode(payload),
      subscription.p256dh,
      subscription.auth,
    );

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Content-Length": String(encryptedBody.length),
        "TTL": String(ttl),
        "Authorization": `vapid t=${jwt}, k=${vapid.publicKey}`,
      },
      body: encryptedBody,
    });

    if (res.ok) {
      return { ok: true, status: res.status, endpoint: subscription.endpoint, gone: false };
    }

    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    // 404 "Not Found" / 410 "Gone" means the subscription is permanently
    // invalid (user uninstalled, cleared site data, revoked permission).
    // Callers should delete the DB row instead of retrying.
    const gone = res.status === 404 || res.status === 410;
    return {
      ok: false,
      status: res.status,
      endpoint: subscription.endpoint,
      error: errText.slice(0, 240),
      gone,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      endpoint: subscription.endpoint,
      error: err instanceof Error ? err.message : "Unknown error",
      gone: false,
    };
  }
}

/**
 * Fan out a payload to many subscriptions, batched to `concurrency`
 * parallel requests. Returns an array of results in the same order as
 * the input. Safe to call with thousands of subs — we batch to avoid
 * bursting Cloudflare's per-request subrequest cap (1000 on Workers),
 * and to give the push services room to queue on their side.
 */
export async function sendWebPushBatch(
  subscriptions: WebPushSubscription[],
  payload: string,
  vapid: VapidKeys,
  concurrency = 25,
): Promise<PushResult[]> {
  const results: PushResult[] = new Array(subscriptions.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= subscriptions.length) return;
      results[idx] = await sendWebPush(subscriptions[idx], payload, vapid);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, subscriptions.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
