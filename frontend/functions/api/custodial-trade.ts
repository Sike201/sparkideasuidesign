/**
 * POST /api/custodial-trade
 * Execute a trade on behalf of a user using their custodial wallet.
 * The backend decrypts the secret key, builds and signs the transaction.
 */

import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { VaultClient, AMMClient, VaultType } from "@zcomb/programs-sdk";
import { verifyMiniAuth } from "./mini/_auth";
import { pickRpcUrl } from "./cfPagesFunctionsUtils";

type ENV = {
  DB: D1Database;
  WALLET_ENCRYPTION_KEY: string;
  /** Server-side Helius URL — preferred over VITE_RPC_URL because the
   * latter can be `/api/rpc` (browser proxy mode). */
  HELIUS_RPC_URL?: string;
  VITE_RPC_URL?: string;
  /**
   * Mini-app JWT secret. When a request carries
   * `Authorization: Bearer <token>`, we verify it and use the JWT's
   * `twitter_id` as the source of truth — body values are ignored so
   * callers can't impersonate other users. Absent header → legacy
   * desktop path (body-trusted `twitter_id`).
   */
  JWT_SECRET?: string;
  /**
   * Shared fee-payer for every custodial tx. When set, this keypair:
   *   - becomes `tx.feePayer` (covers the ~5000 lamports/tx network fee)
   *   - co-signs alongside the custodial keypair
   * so the user's custodial wallet never needs SOL for gas. Accepted
   * formats:
   *   - base58 string (same encoding as `solana-keygen`'s "encoded" form)
   *   - JSON byte array (the format `solana-keygen new -o keypair.json`
   *     writes to disk, e.g. `[174,47,...]`)
   * Unset / unparseable → falls back to the custodial as its own fee-
   * payer (pre-PR2 behaviour; kept so desktop + dev runs without the
   * var keep working).
   */
  FEE_PAYER_SECRET_KEY?: string;
};

// ── Crypto helpers ──────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function decrypt(encrypted: string, keyHex: string): Promise<string> {
  const [ivHex, ciphertextHex] = encrypted.split(":");
  const keyBytes = hexToBytes(keyHex.slice(0, 64));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ── Base58 ──────────────────────────────────────────────────

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(str: string): Uint8Array {
  let result = BigInt(0);
  for (const char of str) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base58 character");
    result = result * 58n + BigInt(index);
  }
  const bytes: number[] = [];
  while (result > 0n) {
    bytes.unshift(Number(result % 256n));
    result = result / 256n;
  }
  // Leading zeros
  for (const char of str) {
    if (char !== "1") break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

// ── Fee-payer loader ────────────────────────────────────────

/**
 * Parse `FEE_PAYER_SECRET_KEY` env var into a usable `Keypair`. Accepts
 * both base58 (most compact) and the JSON byte-array format that
 * `solana-keygen` writes to keypair files — whichever the operator
 * pasted into the secret.
 *
 * Returns `null` on any parse error (with a warning logged). The caller
 * must tolerate `null` and fall back to the custodial wallet as its own
 * fee-payer, which is the pre-PR2 behaviour — this lets dev servers run
 * without the secret configured.
 */
function loadFeePayer(secretKeyStr: string | undefined): Keypair | null {
  if (!secretKeyStr) return null;
  const trimmed = secretKeyStr.trim();
  try {
    if (trimmed.startsWith("[")) {
      // `solana-keygen new -o file.json` format: JSON array of 64 bytes.
      const arr = JSON.parse(trimmed) as number[];
      if (!Array.isArray(arr) || arr.length !== 64) {
        throw new Error(`Expected 64-byte array, got ${arr.length}`);
      }
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    // Assume base58 otherwise. base58Decode is defined above and
    // already handles the length sanity check via Keypair.fromSecretKey.
    const bytes = base58Decode(trimmed);
    return Keypair.fromSecretKey(bytes);
  } catch (err) {
    console.error(
      "[custodial-trade] FEE_PAYER_SECRET_KEY parse failed — falling back to custodial as fee-payer:",
      err,
    );
    return null;
  }
}

// ── Main handler ────────────────────────────────────────────

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const request = ctx.request;
  const origin = request.headers.get("Origin") || "*";
  const cors = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // `Authorization` is required for the mini-app JWT gate — without it
    // listed here, browsers reject the preflight and the POST never fires.
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const body = await request.json() as {
      twitter_id: string;
      action: "deposit" | "trade" | "withdraw" | "redeem";
      proposal_pda: string;
      vault_pda?: string;
      pool_address?: string;
      side?: "BUY" | "SELL";
      amount?: number;
      decimals?: number;
      vault_type?: "base" | "quote";
      option_index?: number;
      option_label?: string;
      // Mini-app v1 — each Twitter user can own 1 public + 1 private
      // custodial wallet. Defaults to "public" for backwards compat with the
      // pre-mini flow which only ever had one wallet per user.
      wallet_type?: "public" | "private";
    };

    // Auth — two accepted modes, mirroring the two callers:
    //
    //   1. Mini-app (mobile): sends `Authorization: Bearer <JWT>` issued
    //      by `/api/twitter-oauth-token?mode=mini`. We verify the token
    //      and **override** `body.twitter_id` with the JWT's `twitter_id`
    //      so a malicious client can't impersonate another user even if
    //      they know the target's twitter_id. Invalid / expired tokens
    //      are rejected with 401.
    //
    //   2. Desktop (legacy): no Authorization header. `twitter_id` is
    //      trusted from the body. This is a known gap we'll close once
    //      desktop also carries a session token.
    //
    // Future: when desktop migrates, flip this to require JWT always.
    const hasAuthHeader = !!request.headers.get("Authorization");
    if (hasAuthHeader) {
      const auth = await verifyMiniAuth(request, ctx.env.JWT_SECRET);
      if (auth.ok === false) {
        return json({ error: auth.message }, auth.status, cors);
      }
      // Force-override — the body value is never trusted when a JWT is
      // present. If the caller supplied a different twitter_id we silently
      // correct it (logging the mismatch for abuse detection).
      if (body.twitter_id && body.twitter_id !== auth.twitter_id) {
        console.warn(
          `[custodial-trade] twitter_id mismatch — JWT=${auth.twitter_id} body=${body.twitter_id}`,
        );
      }
      body.twitter_id = auth.twitter_id;
    }

    if (!body.twitter_id || !body.action || !body.proposal_pda) {
      return json({ error: "twitter_id, action, and proposal_pda required" }, 400, cors);
    }

    const walletType: "public" | "private" = body.wallet_type ?? "public";
    if (walletType !== "public" && walletType !== "private") {
      return json({ error: "wallet_type must be 'public' or 'private'" }, 400, cors);
    }

    // Fetch the custodial wallet of the requested type. We match on twitter_id
    // (or the `username:` placeholder created by the admin endpoint when a
    // wallet is pre-assigned before the user has logged in). The proposal_pda
    // predicate only excludes rows that were scoped to a *different* proposal —
    // unscoped rows (proposal_pda IS NULL) are always eligible.
    const row = await ctx.env.DB
      .prepare(
        `SELECT wallet_address, encrypted_secret_key FROM custodial_wallets
         WHERE (twitter_id = ? OR twitter_id = ? OR twitter_username = ?)
         AND (proposal_pda IS NULL OR proposal_pda = ?)
         AND wallet_type = ?`
      )
      .bind(
        body.twitter_id,
        `username:${body.twitter_id}`,
        body.twitter_id,
        body.proposal_pda,
        walletType
      )
      .first<{ wallet_address: string; encrypted_secret_key: string }>();

    if (!row) {
      return json({ error: `No ${walletType} custodial wallet assigned` }, 403, cors);
    }

    // Decrypt secret key
    const secretKeyBase58 = await decrypt(row.encrypted_secret_key, ctx.env.WALLET_ENCRYPTION_KEY);
    const secretKey = base58Decode(secretKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKey);

    // Shared fee-payer (PR 2). When configured, all custodial txs get
    // signed by this treasury keypair and charged its lamports instead
    // of the custodial's — so a freshly-provisioned mini-app user can
    // trade without ever needing SOL in their wallet. Absent / malformed
    // → `null`, and the custodial falls back to being its own fee-payer
    // (pre-PR2 behaviour kept for backwards compat with the desktop flow).
    const feePayer = loadFeePayer(ctx.env.FEE_PAYER_SECRET_KEY);

    // Setup connection and providers
    const rpcUrl = pickRpcUrl(ctx.env.HELIUS_RPC_URL, ctx.env.VITE_RPC_URL);
    const connection = new Connection(rpcUrl, "confirmed");
    const wallet = {
      publicKey: keypair.publicKey,
      signTransaction: async <T extends Transaction>(tx: T): Promise<T> => {
        (tx as Transaction).sign(keypair);
        return tx;
      },
      signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => {
        txs.forEach(tx => (tx as Transaction).sign(keypair));
        return txs;
      },
    };
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });

    let tx: Transaction;

    // Build transaction based on action
    switch (body.action) {
      case "deposit": {
        if (!body.vault_pda || !body.amount || !body.decimals || !body.vault_type) {
          return json({ error: "vault_pda, amount, decimals, vault_type required for deposit" }, 400, cors);
        }
        const vaultClient = new VaultClient(provider);
        const rawAmount = new BN(Math.floor(body.amount * 10 ** body.decimals));
        const vType = body.vault_type === "base" ? VaultType.Base : VaultType.Quote;
        const builder = await vaultClient.deposit(keypair.publicKey, new PublicKey(body.vault_pda), vType, rawAmount);
        tx = await prepareTransaction(await builder.transaction(), keypair, connection, feePayer);
        break;
      }

      case "trade": {
        if (!body.pool_address || !body.amount || !body.decimals || !body.side) {
          return json({ error: "pool_address, amount, decimals, side required for trade" }, 400, cors);
        }
        const ammClient = new AMMClient(provider);
        const rawAmount = new BN(Math.floor(body.amount * 10 ** body.decimals));
        const { builder } = await ammClient.swapWithSlippage(
          keypair.publicKey,
          new PublicKey(body.pool_address),
          body.side === "BUY",
          rawAmount,
          0.5
        );
        tx = await prepareTransaction(await builder.transaction(), keypair, connection, feePayer);
        break;
      }

      case "withdraw": {
        if (!body.vault_pda || !body.amount || !body.decimals || !body.vault_type) {
          return json({ error: "vault_pda, amount, decimals, vault_type required for withdraw" }, 400, cors);
        }
        const vaultClient2 = new VaultClient(provider);
        const rawAmount2 = new BN(Math.floor(body.amount * 10 ** body.decimals));
        const vType2 = body.vault_type === "base" ? VaultType.Base : VaultType.Quote;
        const builder2 = await vaultClient2.withdraw(keypair.publicKey, new PublicKey(body.vault_pda), vType2, rawAmount2);
        tx = await prepareTransaction(await builder2.transaction(), keypair, connection, feePayer);
        break;
      }

      case "redeem": {
        if (!body.vault_pda || !body.vault_type) {
          return json({ error: "vault_pda and vault_type required for redeem" }, 400, cors);
        }
        const vaultClient3 = new VaultClient(provider);
        const vType3 = body.vault_type === "base" ? VaultType.Base : VaultType.Quote;
        const builder3 = await vaultClient3.redeemWinnings(keypair.publicKey, new PublicKey(body.vault_pda), vType3);
        tx = await prepareTransaction(await builder3.transaction(), keypair, connection, feePayer);
        break;
      }

      default:
        return json({ error: "Invalid action" }, 400, cors);
    }

    // Sign and send. When a treasury fee-payer is configured, both it and
    // the custodial must sign — the fee-payer covers lamports, the
    // custodial authorizes the token movements. `Transaction.sign`
    // replaces any prior signatures and takes variadic signers.
    if (feePayer) {
      tx.sign(feePayer, keypair);
    } else {
      tx.sign(keypair);
    }
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    // Poll confirmation 6 times, 3s apart
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const status = await connection.getSignatureStatus(sig);
        if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmationStatus === "finalized") break;
      } catch { /* retry */ }
    }

    // Record trade
    await ctx.env.DB
      .prepare(
        "INSERT INTO combinator_trades (id, proposal_pda, wallet, action, option_label, option_index, side, amount, token, tx_signature, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        crypto.randomUUID(),
        body.proposal_pda,
        row.wallet_address,
        body.action,
        body.option_label || null,
        body.option_index ?? null,
        body.side || null,
        body.amount || 0,
        body.vault_type || null,
        sig,
        new Date().toISOString()
      )
      .run();

    return json({ success: true, signature: sig }, 200, cors);

  } catch (err) {
    console.error("[custodial-trade]", err);
    return json({ error: err instanceof Error ? err.message : "Trade failed" }, 500, cors);
  }
};

/**
 * Minimum lamports the custodial must hold when entering a tx. PR 3
 * rationale:
 *
 * `tx.feePayer = treasury` (PR 2) only covers the ~5000-lamport network
 * fee. Rent-exempt deposits for newly created Associated Token Accounts
 * (~2039280 lamports / ~0.00204 SOL each) are paid by whichever account
 * the creating ix passes as its "funding account" — and when the Vault
 * program creates a conditional ATA via CPI, it hardcodes the depositor
 * (our custodial) as that payer. We can't rewrite that from the outside.
 *
 * Two ways out:
 *   (a) Pre-create each ATA ourselves with treasury as payer, so the
 *       Vault CPI sees an existing account and no-ops. Requires SDK
 *       introspection per action type (mint discovery, per-pool state).
 *   (b) Top up the custodial from the treasury as the first ix of the
 *       same tx, so the custodial *has* lamports when its CPI fires.
 *
 * We do (b) — much less SDK-coupled, and the ATA rent stays reclaimable
 * later by closing the ATAs after market finalization. 0.015 SOL covers
 * ~7 ATAs which is more than any single deposit/trade/withdraw needs.
 *
 * The top-up is SKIPPED when there's no treasury configured — dev and
 * desktop flows fall back to the pre-PR-2 behaviour where the custodial
 * must already be funded, which is the contract they had before.
 */
const MIN_CUSTODIAL_LAMPORTS = 15_000_000; // 0.015 SOL

/**
 * Build a fresh `Transaction` with a recent blockhash, the caller's
 * instructions, and the right fee-payer. When `feePayer` is set (PR 2),
 * it becomes `tx.feePayer` so the treasury eats the tx cost; otherwise
 * the custodial pays for itself (pre-PR2 path).
 *
 * When `feePayer` is set we *also* prepend a treasury → custodial
 * SystemProgram.transfer if the custodial is under
 * `MIN_CUSTODIAL_LAMPORTS`. See the constant's doc for why (PR 3).
 *
 * Note: we rebuild the tx from scratch rather than mutating the Anchor-
 * emitted one because Anchor's tx may already carry signers / a blockhash
 * from an earlier simulate — copying the ixs into a new container gives
 * us a clean slate to sign.
 */
async function prepareTransaction(
  anchorTx: Transaction,
  custodialKeypair: Keypair,
  connection: Connection,
  feePayer?: Keypair | null,
): Promise<Transaction> {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = (feePayer ?? custodialKeypair).publicKey;

  // PR 3 — top up custodial lamports from the treasury if it's below the
  // threshold, so inline ATA-creation CPIs (Vault → ATA program → System)
  // have lamports to draw rent from. Only runs when we have a treasury
  // to draw from; otherwise the custodial is on its own (dev / desktop).
  if (feePayer) {
    try {
      const currentBalance = await connection.getBalance(custodialKeypair.publicKey, "confirmed");
      if (currentBalance < MIN_CUSTODIAL_LAMPORTS) {
        const topup = MIN_CUSTODIAL_LAMPORTS - currentBalance;
        tx.add(
          SystemProgram.transfer({
            fromPubkey: feePayer.publicKey,
            toPubkey: custodialKeypair.publicKey,
            lamports: topup,
          }),
        );
        console.log(
          `[custodial-trade] topping up custodial ${custodialKeypair.publicKey.toBase58()} ` +
            `by ${topup} lamports (had ${currentBalance}, need ${MIN_CUSTODIAL_LAMPORTS})`,
        );
      }
    } catch (err) {
      // Balance lookup failure shouldn't block the tx — if the custodial
      // is actually empty, the tx will just fail downstream with the
      // original "insufficient lamports" error and the user retries.
      console.warn("[custodial-trade] balance check failed — skipping top-up:", err);
    }
  }

  for (const ix of anchorTx.instructions) {
    tx.add(ix);
  }
  return tx;
}

function json(data: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
