import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SparkIdeaVault } from "../target/types/spark_idea_vault";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import { createHash } from "crypto";

/**
 * Admin withdraw script — withdraws ALL USDC from a vault.
 *
 * Usage:
 *   npx ts-node scripts/admin-withdraw.ts <idea_id> [--cluster devnet|mainnet]
 *
 * The wallet used must be the admin address stored in the AdminConfig PDA.
 *
 * Set it via:
 *   solana config set --keypair /path/to/admin-keypair.json
 *   or set ANCHOR_WALLET=/path/to/admin-keypair.json
 */

const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const USDC_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help") {
    console.log("Usage: npx ts-node scripts/admin-withdraw.ts <idea_id> [--cluster devnet|mainnet]");
    console.log("");
    console.log("Examples:");
    console.log("  npx ts-node scripts/admin-withdraw.ts my-idea-001 --cluster devnet");
    console.log("  npx ts-node scripts/admin-withdraw.ts my-idea-001 --cluster mainnet");
    process.exit(0);
  }

  const ideaId = args[0];
  const clusterIdx = args.indexOf("--cluster");
  const cluster = clusterIdx !== -1 ? args[clusterIdx + 1] : "devnet";

  const usdcMint = cluster === "mainnet" ? USDC_MAINNET : USDC_DEVNET;

  console.log(`Cluster:  ${cluster}`);
  console.log(`Idea ID:  ${ideaId}`);
  console.log(`USDC Mint: ${usdcMint.toBase58()}`);
  console.log("");

  // Setup provider
  const rpcUrl = cluster === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";

  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(
        require("fs").readFileSync(
          process.env.ANCHOR_WALLET || require("os").homedir() + "/.config/solana/id.json",
          "utf-8"
        )
      )
    )
  );
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load IDL
  const idl = JSON.parse(
    require("fs").readFileSync("target/idl/spark_idea_vault.json", "utf-8")
  );
  const program = new Program<SparkIdeaVault>(idl, provider);
  const admin = provider.wallet.publicKey;

  console.log(`Admin wallet: ${admin.toBase58()}`);

  // Derive admin config PDA
  const [adminConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_config")],
    program.programId
  );

  console.log(`Admin Config PDA: ${adminConfigPda.toBase58()}`);

  // Derive vault PDA using SHA256(idea_id)
  const vaultSeed = createHash("sha256").update(ideaId).digest();

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vaultSeed],
    program.programId
  );

  const vaultAta = await getAssociatedTokenAddress(usdcMint, vaultPda, true);

  // Create admin ATA if it doesn't exist
  console.log("Ensuring admin token account exists...");
  const adminAtaAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    usdcMint,
    admin
  );
  const adminTokenAccount = adminAtaAccount.address;

  console.log(`Vault PDA: ${vaultPda.toBase58()}`);
  console.log(`Vault ATA: ${vaultAta.toBase58()}`);
  console.log(`Admin ATA: ${adminTokenAccount.toBase58()}`);
  console.log("");

  // Check vault balance
  try {
    const vaultBalance = await getAccount(connection, vaultAta);
    console.log(`Vault balance: ${Number(vaultBalance.amount) / 1_000_000} USDC`);

    if (Number(vaultBalance.amount) === 0) {
      console.log("Vault is empty, nothing to withdraw.");
      process.exit(0);
    }
  } catch (e) {
    console.error("Could not read vault ATA. Does this vault exist?");
    process.exit(1);
  }

  // Call admin_withdraw
  console.log("Calling admin_withdraw...");

  const tx = await program.methods
    .adminWithdraw()
    .accountsPartial({
      admin: admin,
      adminConfig: adminConfigPda,
      vault: vaultPda,
      vaultAta: vaultAta,
      adminTokenAccount: adminTokenAccount,
      mint: usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log(`Transaction: ${tx}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${tx}?cluster=${cluster}`);

  // Verify
  const adminBalance = await getAccount(connection, adminTokenAccount);
  console.log(`Admin balance after: ${Number(adminBalance.amount) / 1_000_000} USDC`);
  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
