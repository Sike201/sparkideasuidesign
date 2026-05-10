import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SparkRedemptionVault } from "../target/types/spark_redemption_vault";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  getMint,
} from "@solana/spl-token";

const USDG_TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID;
import { createHash } from "crypto";

/**
 * Reclaim the remaining USDG from a redemption vault after its 30-day deadline.
 * Only the vault's authority can call this, and only after `vault.deadline`.
 *
 * Usage:
 *   npx ts-node scripts/redemption-reclaim.ts <idea_id> [--cluster devnet|mainnet|localnet]
 */

const USDG_DEVNET = new PublicKey("4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7");
const USDG_MAINNET = new PublicKey("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH");

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let cluster = "devnet";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--cluster") {
      cluster = argv[i + 1];
      i++;
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, cluster };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(
      "Usage: npx ts-node scripts/redemption-reclaim.ts <idea_id> [--cluster devnet|mainnet|localnet]"
    );
    process.exit(0);
  }

  const { positional, cluster } = parseArgs(args);
  if (positional.length < 1) {
    console.error("Missing idea_id.");
    process.exit(1);
  }

  const [ideaId] = positional;
  const usdgMint = cluster === "mainnet" ? USDG_MAINNET : USDG_DEVNET;
  const rpcUrl =
    cluster === "mainnet"
      ? "https://api.mainnet-beta.solana.com"
      : cluster === "localnet"
      ? "http://127.0.0.1:8899"
      : "https://api.devnet.solana.com";

  console.log("-- Redemption Vault — reclaim remainder --");
  console.log(`Cluster:  ${cluster}`);
  console.log(`Idea ID:  ${ideaId}`);

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
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    require("fs").readFileSync("target/idl/spark_redemption_vault.json", "utf-8")
  );
  const program = new Program<SparkRedemptionVault>(idl, provider);
  const authority = provider.wallet.publicKey;

  const vaultSeed = createHash("sha256").update(ideaId).digest();
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("redemption"), vaultSeed],
    program.programId
  );

  const vault = await program.account.redemptionVault.fetch(vaultPda);
  const now = Math.floor(Date.now() / 1000);
  console.log(`Authority:      ${authority.toBase58()}`);
  console.log(`Vault:          ${vaultPda.toBase58()}`);
  console.log(`Vault authority:${vault.authority.toBase58()}`);
  console.log(`Deadline (UTC): ${new Date(vault.deadline.toNumber() * 1000).toISOString()}`);
  console.log(`Now      (UTC): ${new Date(now * 1000).toISOString()}`);

  if (!vault.authority.equals(authority)) {
    console.error("Signer is not the vault authority — cannot reclaim.");
    process.exit(1);
  }
  if (now <= vault.deadline.toNumber()) {
    console.error(
      `Deadline not reached. Remaining: ${vault.deadline.toNumber() - now} seconds.`
    );
    process.exit(1);
  }
  if (vault.closed) {
    console.error("Vault is already closed.");
    process.exit(1);
  }

  const vaultUsdgAta = await getAssociatedTokenAddress(
    usdgMint,
    vaultPda,
    true,
    USDG_TOKEN_PROGRAM_ID
  );
  const balance = Number(
    (await getAccount(connection, vaultUsdgAta, "confirmed", USDG_TOKEN_PROGRAM_ID)).amount
  );
  const usdgDecimals = (await getMint(connection, usdgMint, "confirmed", USDG_TOKEN_PROGRAM_ID))
    .decimals;
  console.log(`Vault USDG:     ${(balance / 10 ** usdgDecimals).toFixed(usdgDecimals)} USDG`);

  if (balance === 0) {
    console.error("Vault is empty — nothing to reclaim.");
    process.exit(1);
  }

  const authorityUsdg = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    usdgMint,
    authority,
    false,
    "confirmed",
    undefined,
    USDG_TOKEN_PROGRAM_ID
  );

  console.log("");
  console.log("Sending reclaim_remainder...");

  const tx = await program.methods
    .reclaimRemainder()
    .accountsPartial({
      authority,
      vault: vaultPda,
      usdgMint,
      vaultUsdgAta,
      authorityUsdgAccount: authorityUsdg.address,
      usdgTokenProgram: USDG_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log(`Tx: ${tx}`);
  console.log(
    `Explorer: https://explorer.solana.com/tx/${tx}?cluster=${
      cluster === "mainnet" ? "mainnet-beta" : cluster
    }`
  );
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
