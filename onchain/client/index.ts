/**
 * Spark Idea Vault - Client Library
 *
 * Utilitaires pour interagir avec le smart contract Spark Idea Vault
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import BN from "bn.js";

// IDL sera importé après le build
import type { SparkIdeaVault } from "../target/types/spark_idea_vault";

// Configuration
export const PROGRAM_ID = new PublicKey(
  "8u9AUqFv25xUpXqVwE83EiQ91YkvJbmsa5BheTVb3xvZ"
);

// USDC Mints
export const USDC_MINT = {
  devnet: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
  mainnet: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
};

export type Network = "devnet" | "mainnet-beta" | "localnet";

/**
 * Client pour interagir avec le programme Spark Idea Vault
 */
export class SparkIdeaVaultClient {
  public program: Program<SparkIdeaVault>;
  public provider: AnchorProvider;
  public connection: Connection;
  public usdcMint: PublicKey;

  constructor(
    connection: Connection,
    wallet: Wallet,
    usdcMint: PublicKey,
    idl: any
  ) {
    this.connection = connection;
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    this.program = new Program<SparkIdeaVault>(idl, this.provider);
    this.usdcMint = usdcMint;
  }

  /**
   * Crée un client pour un réseau spécifique
   */
  static async create(
    network: Network,
    wallet: Wallet,
    idl: any
  ): Promise<SparkIdeaVaultClient> {
    const connection = new Connection(
      network === "localnet" ? "http://localhost:8899" : clusterApiUrl(network),
      "confirmed"
    );

    const usdcMint =
      network === "mainnet-beta" ? USDC_MINT.mainnet : USDC_MINT.devnet;

    return new SparkIdeaVaultClient(connection, wallet, usdcMint, idl);
  }

  /**
   * Dérive l'adresse PDA du vault pour une idée
   */
  getVaultPda(ideaId: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), Buffer.from(ideaId)],
      PROGRAM_ID
    );
  }

  /**
   * Dérive l'adresse PDA du dépôt utilisateur
   */
  getUserDepositPda(vaultPda: PublicKey, user: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), vaultPda.toBuffer(), user.toBuffer()],
      PROGRAM_ID
    );
  }

  /**
   * Obtient l'ATA du vault
   */
  async getVaultAta(vaultPda: PublicKey): Promise<PublicKey> {
    return getAssociatedTokenAddress(this.usdcMint, vaultPda, true);
  }

  /**
   * Initialise un nouveau vault pour une idée
   */
  async initializeVault(ideaId: string): Promise<string> {
    const [vaultPda] = this.getVaultPda(ideaId);
    const vaultAta = await this.getVaultAta(vaultPda);

    const tx = await this.program.methods
      .initializeVault(ideaId)
      .accounts({
        payer: this.provider.wallet.publicKey,
        vault: vaultPda,
        mint: this.usdcMint,
        vaultAta: vaultAta,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    return tx;
  }

  /**
   * Dépose des tokens dans le vault
   * @param ideaId - ID de l'idée
   * @param amount - Montant en unités de base (6 décimales pour USDC)
   */
  async deposit(ideaId: string, amount: number | BN): Promise<string> {
    const [vaultPda] = this.getVaultPda(ideaId);
    const vaultAta = await this.getVaultAta(vaultPda);
    const user = this.provider.wallet.publicKey;
    const [userDepositPda] = this.getUserDepositPda(vaultPda, user);
    const userTokenAccount = await getAssociatedTokenAddress(
      this.usdcMint,
      user
    );

    const tx = await this.program.methods
      .deposit(new BN(amount))
      .accounts({
        user: user,
        vault: vaultPda,
        userTokenAccount: userTokenAccount,
        vaultAta: vaultAta,
        userDeposit: userDepositPda,
        mint: this.usdcMint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    return tx;
  }

  /**
   * Retire des tokens du vault
   * @param ideaId - ID de l'idée
   * @param amount - Montant en unités de base (6 décimales pour USDC)
   */
  async withdraw(ideaId: string, amount: number | BN): Promise<string> {
    const [vaultPda] = this.getVaultPda(ideaId);
    const vaultAta = await this.getVaultAta(vaultPda);
    const user = this.provider.wallet.publicKey;
    const [userDepositPda] = this.getUserDepositPda(vaultPda, user);
    const userTokenAccount = await getAssociatedTokenAddress(
      this.usdcMint,
      user
    );

    const tx = await this.program.methods
      .withdraw(new BN(amount))
      .accounts({
        user: user,
        vault: vaultPda,
        userDeposit: userDepositPda,
        userTokenAccount: userTokenAccount,
        vaultAta: vaultAta,
        mint: this.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return tx;
  }

  /**
   * Récupère les informations d'un vault
   */
  async getVault(ideaId: string) {
    const [vaultPda] = this.getVaultPda(ideaId);
    try {
      return await this.program.account.ideaVault.fetch(vaultPda);
    } catch {
      return null;
    }
  }

  /**
   * Récupère le dépôt d'un utilisateur pour une idée
   */
  async getUserDeposit(ideaId: string, user?: PublicKey) {
    const [vaultPda] = this.getVaultPda(ideaId);
    const userKey = user || this.provider.wallet.publicKey;
    const [userDepositPda] = this.getUserDepositPda(vaultPda, userKey);

    try {
      return await this.program.account.userDeposit.fetch(userDepositPda);
    } catch {
      return null;
    }
  }

  /**
   * Récupère le solde du vault en tokens
   */
  async getVaultBalance(ideaId: string): Promise<bigint> {
    const [vaultPda] = this.getVaultPda(ideaId);
    const vaultAta = await this.getVaultAta(vaultPda);

    try {
      const account = await getAccount(this.connection, vaultAta);
      return account.amount;
    } catch {
      return BigInt(0);
    }
  }

  /**
   * Vérifie si un vault existe pour une idée
   */
  async vaultExists(ideaId: string): Promise<boolean> {
    const vault = await this.getVault(ideaId);
    return vault !== null;
  }
}

/**
 * Utilitaires de conversion
 */
export const utils = {
  /**
   * Convertit un montant USDC en unités de base (6 décimales)
   */
  usdcToBaseUnits(amount: number): BN {
    return new BN(Math.floor(amount * 1_000_000));
  },

  /**
   * Convertit des unités de base en USDC
   */
  baseUnitsToUsdc(amount: BN | bigint | number): number {
    const num =
      typeof amount === "bigint"
        ? Number(amount)
        : amount instanceof BN
          ? amount.toNumber()
          : amount;
    return num / 1_000_000;
  },

  /**
   * Formate un montant USDC pour l'affichage
   */
  formatUsdc(amount: BN | bigint | number): string {
    return `${utils.baseUnitsToUsdc(amount).toFixed(2)} USDC`;
  },
};

export default SparkIdeaVaultClient;
