import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { decodeUTF8 } from 'tweetnacl-util';
import { jsonResponse, reportError } from './cfPagesFunctionsUtils';
import { getRpcUrlForCluster } from '../../shared/solana/rpcUtils';
import {
  USDG_MINT,
  USDC_DECIMALS,
  initMints,
  confirmTx,
  deriveProjectIdeatorFeeKeypair,
} from './admin/launch/_shared';

type ENV = {
  DB: D1Database;
  RPC_URL: string;
  PRIVATE_KEY: string;
  VITE_SOLANA_NETWORK?: string;
};

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  );
}

interface IdeatorClaimRequest {
  ideaId: string;
  address: string;       // Ideator's wallet public key
  message: string;       // Signed message
  signature: number[];   // Signature as array of numbers
}

/**
 * POST /api/ideator-claim
 *
 * Allows the ideator to claim their 10% fee share.
 *
 * Security:
 * 1. Ideator must sign a message to prove wallet ownership
 * 2. Wallet must match ideator_wallet in idea data
 * 3. Available amount calculated server-side (ideator_fees_available - ideator_fees_claimed)
 * 4. Claim recorded in ideator_claims table to prevent double-claiming
 */
export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  initMints(ctx.env.VITE_SOLANA_NETWORK);

  try {
    const body: IdeatorClaimRequest = await ctx.request.json();
    const { ideaId, address, message, signature } = body;

    // Validate required fields
    if (!ideaId || !address || !message || !signature) {
      return jsonResponse({ error: 'Missing required fields: ideaId, address, message, signature' }, 400);
    }

    // ── Step 1: Verify wallet signature ──
    let isVerified = false;
    try {
      isVerified = nacl.sign.detached.verify(
        decodeUTF8(message),
        new Uint8Array(signature),
        new PublicKey(address).toBytes()
      );
    } catch {
      return jsonResponse({ error: 'Invalid signature format' }, 400);
    }

    if (!isVerified) {
      return jsonResponse({ error: 'Signature verification failed' }, 401);
    }

    console.log(`[IDEATOR-CLAIM] Signature verified for ${address}`);

    // ── Step 2: Load idea and validate ideator ──
    const db = ctx.env.DB;
    const ideaRow = await db
      .prepare("SELECT id, data FROM ideas WHERE id = ?")
      .bind(ideaId)
      .first<{ id: string; data: string }>();

    if (!ideaRow) {
      return jsonResponse({ error: `Idea not found: ${ideaId}` }, 404);
    }

    const idea = JSON.parse(ideaRow.data);

    if (!idea.ideator_wallet) {
      return jsonResponse({ error: 'Ideator wallet not configured for this idea. Contact admin.' }, 400);
    }

    // Verify the claiming wallet matches the registered ideator wallet
    if (idea.ideator_wallet !== address) {
      console.log(`[IDEATOR-CLAIM] Wallet mismatch: expected ${idea.ideator_wallet}, got ${address}`);
      return jsonResponse({ error: 'Wallet does not match the registered ideator wallet' }, 403);
    }

    // ── Step 3: Calculate available amount ──
    const available = (idea.ideator_fees_available || 0) - (idea.ideator_fees_claimed || 0);

    if (available <= 0) {
      return jsonResponse({
        success: true,
        message: 'No fees available to claim',
        available: 0,
        totalEarned: idea.ideator_fees_available || 0,
        totalClaimed: idea.ideator_fees_claimed || 0,
      });
    }

    console.log(`[IDEATOR-CLAIM] Available: ${available} USDG (earned: ${idea.ideator_fees_available}, claimed: ${idea.ideator_fees_claimed})`);

    // ── Step 4: Transfer from fee wallet to ideator ──
    const network = ctx.env.VITE_SOLANA_NETWORK || 'devnet';
    const rpcUrl = getRpcUrlForCluster(ctx.env.RPC_URL, network);
    const connection = new Connection(rpcUrl, 'confirmed');
    const adminSecretKey = bs58.decode(ctx.env.PRIVATE_KEY);
    const adminWallet = Keypair.fromSecretKey(adminSecretKey);
    const ideatorFeeKeypair = await deriveProjectIdeatorFeeKeypair(adminSecretKey, ideaId);
    const ideatorPubkey = new PublicKey(address);

    // Check ideator fee wallet USDG balance
    const ideatorFeeAta = await getAssociatedTokenAddress(USDG_MINT, ideatorFeeKeypair.publicKey, true, TOKEN_2022_PROGRAM_ID);
    let feeWalletBalance = 0;
    try {
      const acct = await getAccount(connection, ideatorFeeAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
      feeWalletBalance = Number(acct.amount) / 10 ** USDC_DECIMALS;
    } catch {
      return jsonResponse({ error: 'Ideator fee wallet has no USDG account. Fees may not have been distributed yet.' }, 400);
    }

    // Ensure we don't try to transfer more than what's in the wallet
    const claimAmount = Math.min(available, feeWalletBalance);
    if (claimAmount <= 0) {
      return jsonResponse({
        error: 'Fee wallet has insufficient USDC balance',
        feeWalletBalance,
        availableInDb: available,
      }, 400);
    }

    const claimAmountRaw = Math.floor(claimAmount * 10 ** USDC_DECIMALS);

    // Build transfer transaction
    const tx = new Transaction();
    const ideatorUsdgAta = await getAssociatedTokenAddress(USDG_MINT, ideatorPubkey, false, TOKEN_2022_PROGRAM_ID);

    // Create ideator USDG ATA if needed
    try {
      await getAccount(connection, ideatorUsdgAta, 'confirmed', TOKEN_2022_PROGRAM_ID);
    } catch {
      tx.add(
        createAssociatedTokenAccountInstruction(
          adminWallet.publicKey, ideatorUsdgAta, ideatorPubkey, USDG_MINT, TOKEN_2022_PROGRAM_ID
        )
      );
    }

    tx.add(
      createTransferCheckedInstruction(
        ideatorFeeAta, USDG_MINT, ideatorUsdgAta,
        ideatorFeeKeypair.publicKey, BigInt(claimAmountRaw), USDC_DECIMALS,
        [], TOKEN_2022_PROGRAM_ID
      )
    );

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = adminWallet.publicKey;       // Admin pays tx fee
    tx.sign(adminWallet, ideatorFeeKeypair);   // Ideator fee wallet signs the transfer

    const txSignature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await confirmTx(connection, txSignature);

    console.log(`[IDEATOR-CLAIM] Transferred ${claimAmount} USDG to ideator: ${txSignature}`);

    // ── Step 5: Update DB ──
    // Update idea's ideator_fees_claimed
    await db
      .prepare(`
        UPDATE ideas SET data = json_set(data,
          '$.ideator_fees_claimed', COALESCE(json_extract(data, '$.ideator_fees_claimed'), 0) + ?
        ) WHERE id = ?
      `)
      .bind(claimAmount, ideaId)
      .run();

    // Insert ideator_claims record
    await db
      .prepare(`
        INSERT INTO ideator_claims (id, idea_id, ideator_wallet, amount_usdc, tx_signature)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(uuidv4(), ideaId, address, claimAmount, txSignature)
      .run();

    return jsonResponse({
      success: true,
      claimed: claimAmount,
      txSignature,
      remaining: available - claimAmount,
      totalEarned: idea.ideator_fees_available || 0,
      totalClaimed: (idea.ideator_fees_claimed || 0) + claimAmount,
    });
  } catch (error) {
    console.error('[IDEATOR-CLAIM] Error:', error);
    await reportError(ctx.env.DB, error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
};
