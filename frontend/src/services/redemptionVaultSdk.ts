/**
 * SDK helpers for the `spark_redemption_vault` Anchor program.
 *
 * These helpers build + send transactions directly from the browser using the
 * connected wallet (Phantom / Backpack / Solflare / Jupiter).
 */

import { Connection, PublicKey, Transaction, VersionedTransaction, SystemProgram } from "@solana/web3.js"
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor"
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from "@solana/spl-token"

/** USDG is a Token-2022 mint — all USDG ATAs must be derived with this program id. */
const USDG_TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID

import idl from "@/data/idl/spark_redemption_vault.json"
import type { SparkRedemptionVault } from "@/data/idl/spark_redemption_vault"

/**
 * RPC routing — the redemption vault SDK uses dedicated env vars so it never
 * hits the public Solana endpoints (which 403 on mainnet without auth), and
 * never reuses a generic RPC that might point to the wrong cluster.
 *
 *   VITE_REDEMPTION_MAINNET_RPC_URL → used when cluster === "mainnet"
 *   VITE_REDEMPTION_DEVNET_RPC_URL  → used when cluster === "devnet"
 *
 * If a var is missing, we fall back to the matching public endpoint — fine on
 * devnet, 403-prone on mainnet, so set the mainnet one before going live.
 */
const PUBLIC_MAINNET = "https://api.mainnet-beta.solana.com"
const PUBLIC_DEVNET = "https://api.devnet.solana.com"
const MAINNET_RPC = import.meta.env.VITE_REDEMPTION_MAINNET_RPC_URL || PUBLIC_MAINNET
const DEVNET_RPC = import.meta.env.VITE_REDEMPTION_DEVNET_RPC_URL || PUBLIC_DEVNET

// One-shot dev log so we can see at a glance whether the env vars were picked
// up or whether we silently fell back to the public endpoints (mainnet 403s).
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log("[redemption SDK] RPC routing", {
    mainnetEnv: import.meta.env.VITE_REDEMPTION_MAINNET_RPC_URL ?? "(unset)",
    devnetEnv: import.meta.env.VITE_REDEMPTION_DEVNET_RPC_URL ?? "(unset)",
    mainnetResolved: MAINNET_RPC,
    devnetResolved: DEVNET_RPC,
    usingMainnetFallback: MAINNET_RPC === PUBLIC_MAINNET,
    usingDevnetFallback: DEVNET_RPC === PUBLIC_DEVNET,
  })
}

export type RedemptionCluster = "devnet" | "mainnet"

/** Pick the right RPC for the cluster where the redemption vault program actually lives. */
export function rpcForCluster(cluster?: RedemptionCluster): string {
  if (cluster === "mainnet") return MAINNET_RPC
  return DEVNET_RPC
}

export const REDEMPTION_PROGRAM_ID = new PublicKey(
  "HjxL5eioDknBcoQAymHQkn9VHzWRqZe3CtSyw7U8vRq1"
)

export const USDG_DEVNET = new PublicKey("4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7")
export const USDG_MAINNET = new PublicKey("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH")

type WalletAdapter = {
  publicKey: PublicKey
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>
}

function getConnection(cluster?: RedemptionCluster): Connection {
  return new Connection(rpcForCluster(cluster), "confirmed")
}

function createProvider(wallet: WalletAdapter, cluster?: RedemptionCluster): AnchorProvider {
  return new AnchorProvider(getConnection(cluster), wallet as any, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  })
}

function createReadOnlyProvider(cluster?: RedemptionCluster): AnchorProvider {
  const dummy = {
    publicKey: PublicKey.default,
    signTransaction: async <T,>(tx: T) => tx,
    signAllTransactions: async <T,>(txs: T[]) => txs,
  }
  return new AnchorProvider(getConnection(cluster), dummy as any, { commitment: "confirmed" })
}

function createProgram(provider: AnchorProvider): Program<SparkRedemptionVault> {
  return new Program<SparkRedemptionVault>(idl as any, provider)
}

/** SHA-256 using the browser's Web Crypto API — returns a 32-byte Buffer. */
async function sha256(input: string): Promise<Buffer> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Buffer.from(new Uint8Array(digest))
}

export async function deriveVaultPda(ideaId: string): Promise<{ pda: PublicKey; seed: Buffer }> {
  const seed = await sha256(ideaId)
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("redemption"), seed],
    REDEMPTION_PROGRAM_ID
  )
  return { pda, seed }
}

export type VaultState = {
  pda: string
  authority: string
  ideaId: string
  tokenMint: string
  usdgMint: string
  rateNum: string
  rateDen: string
  totalUsdgDeposited: string
  totalUsdgClaimed: string
  totalTokensBurned: string
  createdAt: number
  deadline: number
  closed: boolean
  remainingUsdgRaw: number
  usdgDecimals: number
  /** Decimals of the loser Ideacoin (auto-detected from the mint, classic SPL or Token-2022). */
  tokenDecimals: number
  /** Token program owning the loser mint — needed by buildRedeem to derive the user's ATA. */
  tokenProgramId: string
}

/** Fetch the vault state + live USDG balance. Returns null if the vault doesn't exist. */
export async function viewVault(
  ideaId: string,
  cluster?: RedemptionCluster
): Promise<VaultState | null> {
  const provider = createReadOnlyProvider(cluster)
  const program = createProgram(provider)
  const { pda } = await deriveVaultPda(ideaId)

  try {
    const vault = await program.account.redemptionVault.fetch(pda)
    const ata = await getAssociatedTokenAddress(vault.usdgMint, pda, true, USDG_TOKEN_PROGRAM_ID)
    let remaining = 0
    try {
      const acct = await getAccount(provider.connection, ata, "confirmed", USDG_TOKEN_PROGRAM_ID)
      remaining = Number(acct.amount)
    } catch {
      // ATA may not exist yet (e.g. right after init failure)
    }
    const usdgMintInfo = await getMint(
      provider.connection,
      vault.usdgMint,
      "confirmed",
      USDG_TOKEN_PROGRAM_ID
    )

    // Detect loser-token decimals + program (classic SPL first, fall back to Token-2022).
    let tokenDecimals = 9
    let tokenProgramId = TOKEN_PROGRAM_ID.toBase58()
    try {
      const m = await getMint(provider.connection, vault.tokenMint, "confirmed", TOKEN_PROGRAM_ID)
      tokenDecimals = m.decimals
    } catch {
      try {
        const m = await getMint(
          provider.connection,
          vault.tokenMint,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        )
        tokenDecimals = m.decimals
        tokenProgramId = TOKEN_2022_PROGRAM_ID.toBase58()
      } catch {
        // leave defaults
      }
    }

    return {
      pda: pda.toBase58(),
      authority: vault.authority.toBase58(),
      ideaId: vault.ideaId,
      tokenMint: vault.tokenMint.toBase58(),
      usdgMint: vault.usdgMint.toBase58(),
      rateNum: vault.rateNum.toString(),
      rateDen: vault.rateDen.toString(),
      totalUsdgDeposited: vault.totalUsdgDeposited.toString(),
      totalUsdgClaimed: vault.totalUsdgClaimed.toString(),
      totalTokensBurned: vault.totalTokensBurned.toString(),
      createdAt: vault.createdAt.toNumber(),
      deadline: vault.deadline.toNumber(),
      closed: vault.closed,
      remainingUsdgRaw: remaining,
      usdgDecimals: usdgMintInfo.decimals,
      tokenDecimals,
      tokenProgramId,
    }
  } catch {
    return null
  }
}

/** Same as viewVault but retries a few times — useful right after init when the
 *  read RPC hasn't propagated the new account yet. */
export async function viewVaultWithRetry(
  ideaId: string,
  cluster?: RedemptionCluster,
  attempts = 5,
  delayMs = 800
): Promise<VaultState | null> {
  for (let i = 0; i < attempts; i++) {
    const v = await viewVault(ideaId, cluster)
    if (v) return v
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs))
  }
  return null
}

export type InitParams = {
  ideaId: string
  tokenMint: PublicKey
  usdgMint: PublicKey
  rateNum: BN
  rateDen: BN
  depositAmount: BN
}

export async function buildInitializeAndDeposit(
  wallet: WalletAdapter,
  params: InitParams,
  cluster?: RedemptionCluster
): Promise<Transaction> {
  const provider = createProvider(wallet, cluster)
  const program = createProgram(provider)

  const { pda: vaultPda, seed } = await deriveVaultPda(params.ideaId)
  const authority = wallet.publicKey
  const authorityUsdgAta = await getAssociatedTokenAddress(
    params.usdgMint,
    authority,
    false,
    USDG_TOKEN_PROGRAM_ID
  )
  const vaultUsdgAta = await getAssociatedTokenAddress(
    params.usdgMint,
    vaultPda,
    true,
    USDG_TOKEN_PROGRAM_ID
  )

  return program.methods
    .initializeAndDeposit(
      params.ideaId,
      Array.from(seed),
      params.rateNum,
      params.rateDen,
      params.depositAmount
    )
    .accountsPartial({
      authority,
      vault: vaultPda,
      tokenMint: params.tokenMint,
      usdgMint: params.usdgMint,
      authorityUsdgAccount: authorityUsdgAta,
      vaultUsdgAta,
      systemProgram: SystemProgram.programId,
      usdgTokenProgram: USDG_TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .transaction()
}

export type RedeemParams = {
  ideaId: string
  tokensIn: BN
  /** Token program owning the loser Ideacoin — defaults to classic SPL Token. */
  tokenProgram?: PublicKey
}

export async function buildRedeem(
  wallet: WalletAdapter,
  params: RedeemParams,
  cluster?: RedemptionCluster
): Promise<Transaction> {
  const provider = createProvider(wallet, cluster)
  const program = createProgram(provider)

  const { pda: vaultPda } = await deriveVaultPda(params.ideaId)
  const vault = await program.account.redemptionVault.fetch(vaultPda)
  const user = wallet.publicKey
  const tokenProgram = params.tokenProgram ?? TOKEN_PROGRAM_ID

  const userTokenAta = await getAssociatedTokenAddress(
    vault.tokenMint,
    user,
    false,
    tokenProgram
  )
  const userUsdgAta = await getAssociatedTokenAddress(
    vault.usdgMint,
    user,
    false,
    USDG_TOKEN_PROGRAM_ID
  )
  const vaultUsdgAta = await getAssociatedTokenAddress(
    vault.usdgMint,
    vaultPda,
    true,
    USDG_TOKEN_PROGRAM_ID
  )

  return program.methods
    .redeem(params.tokensIn)
    .accountsPartial({
      user,
      vault: vaultPda,
      tokenMint: vault.tokenMint,
      usdgMint: vault.usdgMint,
      userTokenAccount: userTokenAta,
      userUsdgAccount: userUsdgAta,
      vaultUsdgAta,
      systemProgram: SystemProgram.programId,
      tokenProgram,
      usdgTokenProgram: USDG_TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .transaction()
}

export async function buildReclaimRemainder(
  wallet: WalletAdapter,
  ideaId: string,
  cluster?: RedemptionCluster
): Promise<Transaction> {
  const provider = createProvider(wallet, cluster)
  const program = createProgram(provider)

  const { pda: vaultPda } = await deriveVaultPda(ideaId)
  const vault = await program.account.redemptionVault.fetch(vaultPda)
  const authority = wallet.publicKey
  const authorityUsdgAta = await getAssociatedTokenAddress(
    vault.usdgMint,
    authority,
    false,
    USDG_TOKEN_PROGRAM_ID
  )
  const vaultUsdgAta = await getAssociatedTokenAddress(
    vault.usdgMint,
    vaultPda,
    true,
    USDG_TOKEN_PROGRAM_ID
  )

  return program.methods
    .reclaimRemainder()
    .accountsPartial({
      authority,
      vault: vaultPda,
      usdgMint: vault.usdgMint,
      vaultUsdgAta,
      authorityUsdgAccount: authorityUsdgAta,
      usdgTokenProgram: USDG_TOKEN_PROGRAM_ID,
    })
    .transaction()
}

/**
 * Attach a fresh blockhash + feePayer to a transaction built from Anchor's builder,
 * matching the pattern used elsewhere in the app (see combinatorSdk.ts).
 */
export async function prepareForSigning(
  tx: Transaction,
  feePayer: PublicKey,
  cluster?: RedemptionCluster
): Promise<Transaction> {
  const connection = getConnection(cluster)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")

  const fresh = new Transaction()
  fresh.recentBlockhash = blockhash
  fresh.lastValidBlockHeight = lastValidBlockHeight
  fresh.feePayer = feePayer
  for (const ix of tx.instructions) fresh.add(ix)
  return fresh
}

/** Send a signed transaction and wait for confirmation. Returns the tx signature. */
export async function sendAndConfirm(
  signed: Transaction,
  cluster?: RedemptionCluster
): Promise<string> {
  const connection = getConnection(cluster)
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  })
  await connection.confirmTransaction(sig, "confirmed")
  return sig
}
