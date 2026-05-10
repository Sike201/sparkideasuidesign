/**
 * Spark Idea Vault - Smart Contract Service
 *
 * Service pour interagir avec le smart contract Spark Idea Vault sur Solana.
 * Permet de creer des vaults, deposer et retirer des tokens USDC.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import * as borsh from "borsh";

// Program ID du smart contract deploye sur devnet
export const SPARK_VAULT_PROGRAM_ID = new PublicKey(
  "8u9AUqFv25xUpXqVwE83EiQ91YkvJbmsa5BheTVb3xvZ"
);

// Sysvar Instructions — required to prevent atomic deposit+withdraw exploits
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

// Supported token types
export type TokenType = "USDC" | "USDG";

// Mint addresses per token
export const USDC_MINT = {
  devnet: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
  mainnet: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
};

export const USDG_MINT = {
  devnet: new PublicKey("4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7"),
  mainnet: new PublicKey("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH"),
};

export const TOKEN_DECIMALS = 6; // Both USDC and USDG use 6 decimals
export const USDC_DECIMALS = 6; // Keep for backward compat

/**
 * Get the mint address for a token type on a given network
 */
export function getMintAddress(network: Network, tokenType: TokenType = "USDC"): PublicKey {
  const mints = tokenType === "USDG" ? USDG_MINT : USDC_MINT;
  return mints[network];
}

/**
 * Get the token program ID for a token type.
 * USDC uses the classic Token Program, USDG uses Token 2022.
 */
export function getTokenProgramId(tokenType: TokenType = "USDC"): PublicKey {
  return tokenType === "USDG" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

/**
 * Get the vault idea_id used for PDA derivation.
 * USDC vaults use the raw ideaId, USDG vaults use ideaId + ":USDG"
 */
export function getVaultIdeaId(ideaId: string, tokenType: TokenType = "USDC"): string {
  return tokenType === "USDG" ? `${ideaId}:USDG` : ideaId;
}

// RPC URLs — mainnet goes through the same resolver as the rest of the app
// so `VITE_RPC_URL=/api/rpc` (proxy mode) is promoted to an absolute URL
// rather than crashing `new Connection()` with "must start with http:".
import { getRpcUrl } from "@/utils/rpc";
export const RPC_URLS = {
  devnet: "https://api.devnet.solana.com",
  mainnet: getRpcUrl(),
};

export type Network = "devnet" | "mainnet";

// Discriminateurs pour les instructions (premiers 8 bytes du hash SHA256)
const INSTRUCTION_DISCRIMINATORS = {
  initializeVault: Buffer.from([48, 191, 163, 44, 71, 129, 63, 164]),
  deposit: Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]),
  withdraw: Buffer.from([183, 18, 70, 156, 148, 109, 161, 34]),
  adminWithdraw: Buffer.from([160, 166, 147, 222, 46, 220, 75, 224]),
};

/**
 * Derive l'adresse PDA de l'admin config (singleton)
 */
export function getAdminConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("admin_config")],
    SPARK_VAULT_PROGRAM_ID
  );
}

// Account discriminateurs
const ACCOUNT_DISCRIMINATORS = {
  ideaVault: Buffer.from([56, 77, 82, 142, 145, 174, 154, 42]),
  userDeposit: Buffer.from([69, 238, 23, 217, 255, 137, 185, 35]),
};

/**
 * Interface pour les donnees du vault
 */
export interface IdeaVaultData {
  ideaId: string;
  bump: number;
  mint: PublicKey;
  vaultAta: PublicKey;
  totalDeposited: bigint;
}

/**
 * Interface pour les donnees du depot utilisateur
 */
export interface UserDepositData {
  vault: PublicKey;
  user: PublicKey;
  amount: bigint;
}

/**
 * Vault PDA seed: SHA256(vaultIdeaId) so the seed is always 32 bytes (Solana limit).
 * For USDC: SHA256(ideaId), for USDG: SHA256(ideaId + ":USDG")
 */
export async function getVaultSeed(ideaId: string, tokenType: TokenType = "USDC"): Promise<Buffer> {
  const vaultIdeaId = getVaultIdeaId(ideaId, tokenType);
  const data = new TextEncoder().encode(vaultIdeaId);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hash);
}

/**
 * Derive l'adresse PDA du vault pour une idee.
 * USDC: seed = SHA256(ideaId), USDG: seed = SHA256(ideaId + ":USDG")
 */
export async function getVaultPda(ideaId: string, tokenType: TokenType = "USDC"): Promise<[PublicKey, number]> {
  const seed = await getVaultSeed(ideaId, tokenType);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), seed],
    SPARK_VAULT_PROGRAM_ID
  );
}

/**
 * Derive l'adresse PDA du depot utilisateur
 */
export function getUserDepositPda(
  vaultPda: PublicKey,
  userPublicKey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("deposit"), vaultPda.toBuffer(), userPublicKey.toBuffer()],
    SPARK_VAULT_PROGRAM_ID
  );
}

/**
 * Obtient l'adresse ATA du vault
 */
export async function getVaultAta(
  vaultPda: PublicKey,
  mint: PublicKey,
  tokenType: TokenType = "USDC"
): Promise<PublicKey> {
  const tokenProgramId = getTokenProgramId(tokenType);
  return getAssociatedTokenAddress(mint, vaultPda, true, tokenProgramId);
}

/**
 * Verifie si un vault existe pour une idee
 */
export async function vaultExists(
  connection: Connection,
  ideaId: string,
  tokenType: TokenType = "USDC"
): Promise<boolean> {
  const [vaultPda] = await getVaultPda(ideaId, tokenType);
  const accountInfo = await connection.getAccountInfo(vaultPda);
  return accountInfo !== null;
}

/**
 * Recupere les donnees du vault
 */
export async function getVaultData(
  connection: Connection,
  ideaId: string,
  tokenType: TokenType = "USDC"
): Promise<IdeaVaultData | null> {
  const [vaultPda] = await getVaultPda(ideaId, tokenType);
  const accountInfo = await connection.getAccountInfo(vaultPda);

  if (!accountInfo) return null;

  // Decode les donnees du compte
  const data = accountInfo.data;

  // Verifier le discriminateur
  const discriminator = data.slice(0, 8);
  if (!discriminator.equals(ACCOUNT_DISCRIMINATORS.ideaVault)) {
    throw new Error("Invalid account discriminator for IdeaVault");
  }

  // Decoder manuellement (structure: discriminator + string length + string + vault_seed[32] + bump + pubkey + pubkey + u64)
  let offset = 8;

  // Lire la longueur de la string (u32 little endian)
  const stringLen = data.readUInt32LE(offset);
  offset += 4;

  // Lire la string
  const ideaIdBytes = data.slice(offset, offset + stringLen);
  const decodedIdeaId = ideaIdBytes.toString("utf8");
  offset += stringLen;

  // Lire vault_seed (32 bytes) - skip, not needed for return
  offset += 32;

  // Lire le bump (u8)
  const bump = data.readUInt8(offset);
  offset += 1;

  // Lire le mint (32 bytes)
  const mint = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // Lire le vault_ata (32 bytes)
  const vaultAta = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // Lire total_deposited (u64 little endian)
  const totalDeposited = data.readBigUInt64LE(offset);

  return {
    ideaId: decodedIdeaId,
    bump,
    mint,
    vaultAta,
    totalDeposited,
  };
}

/**
 * Recupere les donnees du depot utilisateur
 */
export async function getUserDepositData(
  connection: Connection,
  ideaId: string,
  userPublicKey: PublicKey,
  tokenType: TokenType = "USDC"
): Promise<UserDepositData | null> {
  const [vaultPda] = await getVaultPda(ideaId, tokenType);
  const [userDepositPda] = getUserDepositPda(vaultPda, userPublicKey);
  const accountInfo = await connection.getAccountInfo(userDepositPda);

  if (!accountInfo) return null;

  const data = accountInfo.data;

  // Verifier le discriminateur
  const discriminator = data.slice(0, 8);
  if (!discriminator.equals(ACCOUNT_DISCRIMINATORS.userDeposit)) {
    throw new Error("Invalid account discriminator for UserDeposit");
  }

  let offset = 8;

  // Lire vault (32 bytes)
  const vault = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // Lire user (32 bytes)
  const user = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // Lire amount (u64)
  const amount = data.readBigUInt64LE(offset);

  return { vault, user, amount };
}

/**
 * Cree une transaction pour initialiser un vault
 * Instruction: initialize_vault(idea_id: String, vault_seed: [u8; 32]) avec vault_seed = SHA256(idea_id)
 */
export async function createInitializeVaultTransaction(
  connection: Connection,
  payerPublicKey: PublicKey,
  ideaId: string,
  network: Network = "devnet",
  tokenType: TokenType = "USDC"
): Promise<Transaction> {
  const mint = getMintAddress(network, tokenType);
  const tokenProgramId = getTokenProgramId(tokenType);
  const [vaultPda] = await getVaultPda(ideaId, tokenType);
  const vaultAta = await getVaultAta(vaultPda, mint, tokenType);
  const vaultSeed = await getVaultSeed(ideaId, tokenType);

  // The idea_id sent on-chain includes the token suffix for USDG
  const vaultIdeaId = getVaultIdeaId(ideaId, tokenType);

  // Encoder l'instruction data: discriminator + idea_id (u32 len + bytes) + vault_seed (32 bytes)
  const ideaIdBytes = Buffer.from(vaultIdeaId, "utf8");
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32LE(ideaIdBytes.length, 0);
  const instructionData = Buffer.concat([
    INSTRUCTION_DISCRIMINATORS.initializeVault,
    lenBuf,
    ideaIdBytes,
    vaultSeed,
  ]);

  const [adminConfigPda] = getAdminConfigPda();

  const keys = [
    { pubkey: payerPublicKey, isSigner: true, isWritable: true },
    { pubkey: adminConfigPda, isSigner: false, isWritable: false },
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: vaultAta, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const instruction = new TransactionInstruction({
    keys,
    programId: SPARK_VAULT_PROGRAM_ID,
    data: instructionData,
  });

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = payerPublicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return transaction;
}

/**
 * Cree une transaction pour deposer des tokens
 */
export async function createDepositTransaction(
  connection: Connection,
  userPublicKey: PublicKey,
  ideaId: string,
  amount: bigint,
  network: Network = "devnet",
  tokenType: TokenType = "USDC"
): Promise<Transaction> {
  const mint = getMintAddress(network, tokenType);
  const tokenProgramId = getTokenProgramId(tokenType);
  const [vaultPda] = await getVaultPda(ideaId, tokenType);
  const vaultAta = await getVaultAta(vaultPda, mint, tokenType);
  const [userDepositPda] = getUserDepositPda(vaultPda, userPublicKey);
  const userTokenAccount = await getAssociatedTokenAddress(mint, userPublicKey, true, tokenProgramId);

  // Encoder l'instruction data (discriminator + u64 amount)
  const instructionData = Buffer.alloc(16);
  INSTRUCTION_DISCRIMINATORS.deposit.copy(instructionData, 0);
  instructionData.writeBigUInt64LE(amount, 8);

  const [adminConfigPda] = getAdminConfigPda();

  const keys = [
    { pubkey: userPublicKey, isSigner: true, isWritable: true },
    { pubkey: adminConfigPda, isSigner: false, isWritable: false },
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: vaultAta, isSigner: false, isWritable: true },
    { pubkey: userDepositPda, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
  ];

  const instruction = new TransactionInstruction({
    keys,
    programId: SPARK_VAULT_PROGRAM_ID,
    data: instructionData,
  });

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = userPublicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return transaction;
}

/**
 * Cree une transaction pour retirer des tokens
 */
export async function createWithdrawTransaction(
  connection: Connection,
  userPublicKey: PublicKey,
  ideaId: string,
  amount: bigint,
  network: Network = "devnet",
  tokenType: TokenType = "USDC"
): Promise<Transaction> {
  const mint = getMintAddress(network, tokenType);
  const tokenProgramId = getTokenProgramId(tokenType);
  const [vaultPda] = await getVaultPda(ideaId, tokenType);
  const vaultAta = await getVaultAta(vaultPda, mint, tokenType);
  const [userDepositPda] = getUserDepositPda(vaultPda, userPublicKey);
  const userTokenAccount = await getAssociatedTokenAddress(mint, userPublicKey, true, tokenProgramId);

  // Encoder l'instruction data (discriminator + u64 amount)
  const instructionData = Buffer.alloc(16);
  INSTRUCTION_DISCRIMINATORS.withdraw.copy(instructionData, 0);
  instructionData.writeBigUInt64LE(amount, 8);

  const [adminConfigPda] = getAdminConfigPda();

  const keys = [
    { pubkey: userPublicKey, isSigner: true, isWritable: true },
    { pubkey: adminConfigPda, isSigner: false, isWritable: false },
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: userDepositPda, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: vaultAta, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
  ];

  const instruction = new TransactionInstruction({
    keys,
    programId: SPARK_VAULT_PROGRAM_ID,
    data: instructionData,
  });

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = userPublicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return transaction;
}

/**
 * Cree une transaction pour le admin_withdraw
 */
export async function createAdminWithdrawTransaction(
  connection: Connection,
  adminPublicKey: PublicKey,
  ideaId: string,
  network: Network = "mainnet",
  tokenType: TokenType = "USDC"
): Promise<Transaction> {
  const mint = getMintAddress(network, tokenType);
  const tokenProgramId = getTokenProgramId(tokenType);
  const [vaultPda] = await getVaultPda(ideaId, tokenType);
  const vaultAta = await getVaultAta(vaultPda, mint, tokenType);
  const adminTokenAccount = await getAssociatedTokenAddress(mint, adminPublicKey, true, tokenProgramId);
  const [adminConfigPda] = getAdminConfigPda();

  // admin_withdraw n'a pas d'arguments, juste le discriminateur
  const instructionData = Buffer.from(INSTRUCTION_DISCRIMINATORS.adminWithdraw);

  const keys = [
    { pubkey: adminPublicKey, isSigner: true, isWritable: true },
    { pubkey: adminConfigPda, isSigner: false, isWritable: false },
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: vaultAta, isSigner: false, isWritable: true },
    { pubkey: adminTokenAccount, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: tokenProgramId, isSigner: false, isWritable: false },
  ];

  const instruction = new TransactionInstruction({
    keys,
    programId: SPARK_VAULT_PROGRAM_ID,
    data: instructionData,
  });

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = adminPublicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return transaction;
}

/**
 * Recupere le solde d'un token (USDC ou USDG) d'un wallet
 */
export async function getTokenBalance(
  connection: Connection,
  walletPublicKey: PublicKey,
  network: Network = "devnet",
  tokenType: TokenType = "USDC"
): Promise<{ balance: number; error?: string }> {
  const mint = getMintAddress(network, tokenType);
  const tokenProgramId = getTokenProgramId(tokenType);

  try {
    const tokenAccount = await getAssociatedTokenAddress(mint, walletPublicKey, true, tokenProgramId);
    // console.log(`[getTokenBalance] ${tokenType} on ${network} — mint: ${mint.toBase58()}, ATA: ${tokenAccount.toBase58()}`);
    const accountInfo = await getAccount(connection, tokenAccount, "confirmed", tokenProgramId);
    const balance = Number(accountInfo.amount / BigInt(Math.pow(10, TOKEN_DECIMALS - 2))) / 100;
    return { balance };
  } catch (error: unknown) {
    // TokenAccountNotFoundError from @solana/spl-token has empty message
    // Also handle RPC "could not find account" errors
    const name = error instanceof Error ? error.name : "";
    const msg = error instanceof Error ? error.message : String(error);
    if (
      name.includes("TokenAccountNotFound") ||
      msg.includes("could not find account") ||
      msg.includes("TokenAccountNotFound") ||
      msg === ""
    ) {
      return { balance: 0 };
    }
    console.error(`Error fetching ${tokenType} balance:`, msg || name || error);
    return { balance: 0, error: msg || name };
  }
}

/**
 * Recupere le solde d'un token quelconque (par mint address) dans un wallet.
 * Lit les decimals directement depuis le mint account on-chain.
 */
export async function getCustomTokenBalance(
  connection: Connection,
  walletPublicKey: PublicKey,
  mintAddress: PublicKey,
  tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
): Promise<{ balance: number; error?: string }> {
  try {
    const mintInfo = await getMint(connection, mintAddress, "confirmed", tokenProgramId);
    const tokenAccount = await getAssociatedTokenAddress(mintAddress, walletPublicKey, true, tokenProgramId);
    const accountInfo = await getAccount(connection, tokenAccount, "confirmed", tokenProgramId);
    const balance = Number(accountInfo.amount) / Math.pow(10, mintInfo.decimals);
    return { balance };
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : "";
    const msg = error instanceof Error ? error.message : String(error);
    if (
      name.includes("TokenAccountNotFound") ||
      msg.includes("could not find account") ||
      msg.includes("TokenAccountNotFound") ||
      msg === ""
    ) {
      return { balance: 0 };
    }
    console.error(`Error fetching custom token balance:`, msg || name || error);
    return { balance: 0, error: msg || name };
  }
}

/** @deprecated Use getTokenBalance instead */
export async function getUsdcBalance(
  connection: Connection,
  walletPublicKey: PublicKey,
  network: Network = "devnet"
): Promise<{ balance: number; error?: string }> {
  return getTokenBalance(connection, walletPublicKey, network, "USDC");
}

/**
 * Recupere le solde total du vault
 */
export async function getVaultBalance(
  connection: Connection,
  ideaId: string,
  network: Network = "devnet",
  tokenType: TokenType = "USDC"
): Promise<number> {
  const mint = getMintAddress(network, tokenType);
  const tokenProgramId = getTokenProgramId(tokenType);
  const [vaultPda] = await getVaultPda(ideaId, tokenType);
  const vaultAta = await getVaultAta(vaultPda, mint, tokenType);

  try {
    const accountInfo = await getAccount(connection, vaultAta, "confirmed", tokenProgramId);
    return Number(accountInfo.amount) / Math.pow(10, TOKEN_DECIMALS);
  } catch {
    return 0;
  }
}

/**
 * Utilitaires de conversion
 * SECURITY: Uses string-based parsing to avoid floating-point precision issues
 */
export const utils = {
  /**
   * Convertit un montant USDC en unites de base (6 decimales)
   * Uses string manipulation to avoid floating-point precision issues
   * Example: 1.23 -> 1230000n
   */
  usdcToBaseUnits(amount: number | string): bigint {
    // Convert to string to avoid floating-point issues
    const amountStr = typeof amount === "number" ? amount.toString() : amount;

    // Split on decimal point
    const parts = amountStr.split(".");
    const wholePart = parts[0] || "0";
    let decimalPart = parts[1] || "";

    // Pad or truncate decimal part to exactly USDC_DECIMALS digits
    if (decimalPart.length > USDC_DECIMALS) {
      decimalPart = decimalPart.slice(0, USDC_DECIMALS);
    } else {
      decimalPart = decimalPart.padEnd(USDC_DECIMALS, "0");
    }

    // Combine and convert to BigInt
    const combined = wholePart + decimalPart;
    // Remove leading zeros but keep at least one digit
    const cleaned = combined.replace(/^0+/, "") || "0";
    return BigInt(cleaned);
  },

  /**
   * Convertit des unites de base en USDC
   * Returns a number for display purposes
   */
  baseUnitsToUsdc(amount: bigint): number {
    // Use BigInt division for the integer part
    const scale = BigInt(Math.pow(10, USDC_DECIMALS));
    const wholePart = amount / scale;
    const remainder = amount % scale;
    // Convert remainder to decimal
    const decimalPart = Number(remainder) / Number(scale);
    return Number(wholePart) + decimalPart;
  },

  /**
   * Formate un montant USDC pour l'affichage
   */
  formatUsdc(amount: number | bigint): string {
    const num =
      typeof amount === "bigint"
        ? utils.baseUnitsToUsdc(amount)
        : amount;
    return `${num.toFixed(2)} USDC`;
  },

  /**
   * Validates a USDC amount string
   * Returns true if valid, false otherwise
   */
  isValidUsdcAmount(amount: string): boolean {
    if (!amount || amount.trim() === "") return false;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) return false;
    // Check for reasonable precision (max 6 decimals)
    const parts = amount.split(".");
    if (parts[1] && parts[1].length > USDC_DECIMALS) return false;
    // Check for reasonable max (prevent overflow)
    if (parsed > 1_000_000_000) return false; // 1 billion USDC max
    return true;
  },
};
