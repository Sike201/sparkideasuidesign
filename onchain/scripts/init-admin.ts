import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SparkIdeaVault } from "../target/types/spark_idea_vault";
import { PublicKey, SystemProgram } from "@solana/web3.js";

async function main() {
  const cluster = process.env.CLUSTER || "devnet";
  const rpcUrl = cluster === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";

  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");

  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(
        require("fs").readFileSync(
          process.env.ANCHOR_WALLET ||
          "./target/deploy/spark_admin.json",
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

  const idl = JSON.parse(
    require("fs").readFileSync("target/idl/spark_idea_vault.json", "utf-8")
  );
  const program = new Program<SparkIdeaVault>(idl, provider);

  const [adminConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("admin_config")],
    program.programId
  );

  console.log(`Admin wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`Admin Config PDA: ${adminConfigPda.toBase58()}`);
  console.log(`Program ID: ${program.programId.toBase58()}`);
  console.log("");
  console.log("Calling initialize_admin_config...");

  const tx = await program.methods
    .initializeAdminConfig()
    .accountsPartial({
      admin: wallet.publicKey,
      adminConfig: adminConfigPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`Transaction: ${tx}`);
  console.log(
    `Explorer: https://explorer.solana.com/tx/${tx}${cluster === "mainnet" ? "" : "?cluster=devnet"}`
  );

  const adminConfig = await program.account.adminConfig.fetch(adminConfigPda);
  console.log(`Admin set to: ${adminConfig.admin.toBase58()}`);
  console.log(`Is paused: ${adminConfig.isPaused}`);
  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
