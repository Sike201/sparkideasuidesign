import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SparkRedemptionVault } from "../target/types/spark_redemption_vault";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
} from "@solana/spl-token";

const USDG_TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID;
import { createHash } from "crypto";

/**
 * Read-only inspection of a redemption vault.
 *
 * Usage:
 *   npx ts-node scripts/redemption-view.ts <idea_id> [--cluster devnet|mainnet|localnet]
 */

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
  if (args.length === 0 || args[0] === "--help") {
    console.log(
      "Usage: npx ts-node scripts/redemption-view.ts <idea_id> [--cluster devnet|mainnet|localnet]"
    );
    process.exit(0);
  }

  const { positional, cluster } = parseArgs(args);
  const [ideaId] = positional;
  const rpcUrl =
    cluster === "mainnet"
      ? "https://api.mainnet-beta.solana.com"
      : cluster === "localnet"
      ? "http://127.0.0.1:8899"
      : "https://api.devnet.solana.com";

  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  // Read-only — a throwaway keypair is fine since we never sign.
  const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const idl = JSON.parse(
    require("fs").readFileSync("target/idl/spark_redemption_vault.json", "utf-8")
  );
  const program = new Program<SparkRedemptionVault>(idl, provider);

  const vaultSeed = createHash("sha256").update(ideaId).digest();
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("redemption"), vaultSeed],
    program.programId
  );

  const vault = await program.account.redemptionVault.fetch(vaultPda);
  const vaultUsdgAta = await getAssociatedTokenAddress(
    vault.usdgMint,
    vaultPda,
    true,
    USDG_TOKEN_PROGRAM_ID
  );
  const balance = Number(
    (await getAccount(connection, vaultUsdgAta, "confirmed", USDG_TOKEN_PROGRAM_ID)).amount
  );
  const usdgDecimals = (await getMint(connection, vault.usdgMint, "confirmed", USDG_TOKEN_PROGRAM_ID))
    .decimals;

  const now = Math.floor(Date.now() / 1000);
  const deadline = vault.deadline.toNumber();
  const secondsLeft = deadline - now;

  console.log("-- Redemption Vault --");
  console.log(`Cluster:               ${cluster}`);
  console.log(`Idea ID:               ${vault.ideaId}`);
  console.log(`Vault PDA:             ${vaultPda.toBase58()}`);
  console.log(`Authority:             ${vault.authority.toBase58()}`);
  console.log(`Token mint (loser):    ${vault.tokenMint.toBase58()}`);
  console.log(`USDG mint:             ${vault.usdgMint.toBase58()}`);
  console.log(`Rate:                  ${vault.rateNum.toString()} / ${vault.rateDen.toString()}`);
  console.log(`Deposited (raw):       ${vault.totalUsdgDeposited.toString()}`);
  console.log(`Claimed (raw):         ${vault.totalUsdgClaimed.toString()}`);
  console.log(`Tokens burned (raw):   ${vault.totalTokensBurned.toString()}`);
  console.log(
    `Remaining USDG:        ${(balance / 10 ** usdgDecimals).toFixed(usdgDecimals)} USDG`
  );
  console.log(`Deadline (UTC):        ${new Date(deadline * 1000).toISOString()}`);
  console.log(`Seconds left:          ${secondsLeft > 0 ? secondsLeft : 0} (elapsed: ${-secondsLeft > 0 ? -secondsLeft : 0})`);
  console.log(`Closed:                ${vault.closed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
