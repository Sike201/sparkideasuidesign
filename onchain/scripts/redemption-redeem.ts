import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { SparkRedemptionVault } from "../target/types/spark_redemption_vault";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  getMint,
} from "@solana/spl-token";

/** USDG is Token-2022 — the loser Ideacoin defaults to classic SPL Token. */
const USDG_TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID;
import { createHash } from "crypto";

/**
 * Redeem loser Ideacoin tokens against USDG from the redemption vault.
 * Burns `tokens_in` from the signer's ATA and transfers USDG out at the fixed rate.
 *
 * Usage:
 *   npx ts-node scripts/redemption-redeem.ts <idea_id> <tokens_in_base_units> \
 *     [--cluster devnet|mainnet|localnet] [--token-program token|token2022]
 *
 * Example:
 *   npx ts-node scripts/redemption-redeem.ts failed-idea-001 1000000000 --cluster devnet
 *     → burns 1 token (9 decimals) → receives `1e9 * rate_num / rate_den` raw USDG.
 */

const USDG_DEVNET = new PublicKey("4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7");
const USDG_MAINNET = new PublicKey("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH");

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let cluster = "devnet";
  let tokenProgramFlag: "token" | "token2022" = "token";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--cluster") {
      cluster = argv[i + 1];
      i++;
    } else if (argv[i] === "--token-program") {
      tokenProgramFlag = argv[i + 1] as "token" | "token2022";
      i++;
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, cluster, tokenProgramFlag };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(
      "Usage: npx ts-node scripts/redemption-redeem.ts <idea_id> <tokens_in> [--cluster devnet|mainnet|localnet] [--token-program token|token2022]"
    );
    process.exit(0);
  }

  const { positional, cluster, tokenProgramFlag } = parseArgs(args);
  if (positional.length < 2) {
    console.error("Missing arguments. Run with --help for usage.");
    process.exit(1);
  }

  const [ideaId, tokensInStr] = positional;
  const tokensIn = new BN(tokensInStr);

  const usdgMint = cluster === "mainnet" ? USDG_MAINNET : USDG_DEVNET;
  const tokenProgram =
    tokenProgramFlag === "token2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

  const rpcUrl =
    cluster === "mainnet"
      ? "https://api.mainnet-beta.solana.com"
      : cluster === "localnet"
      ? "http://127.0.0.1:8899"
      : "https://api.devnet.solana.com";

  console.log("-- Redemption Vault — redeem --");
  console.log(`Cluster:     ${cluster}`);
  console.log(`Idea ID:     ${ideaId}`);
  console.log(`Tokens in:   ${tokensIn.toString()} (raw)`);
  console.log(`Token prog:  ${tokenProgram.toBase58()}`);

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
  const user = provider.wallet.publicKey;

  const vaultSeed = createHash("sha256").update(ideaId).digest();
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("redemption"), vaultSeed],
    program.programId
  );

  const vault = await program.account.redemptionVault.fetch(vaultPda);
  const tokenMint = vault.tokenMint;

  console.log(`User:        ${user.toBase58()}`);
  console.log(`Vault PDA:   ${vaultPda.toBase58()}`);
  console.log(`Token mint:  ${tokenMint.toBase58()}`);

  const userTokenAta = await getAssociatedTokenAddress(tokenMint, user, false, tokenProgram);
  const userUsdgAta = await getAssociatedTokenAddress(usdgMint, user, false, USDG_TOKEN_PROGRAM_ID);
  const vaultUsdgAta = await getAssociatedTokenAddress(
    usdgMint,
    vaultPda,
    true,
    USDG_TOKEN_PROGRAM_ID
  );

  try {
    const balance = Number((await getAccount(connection, userTokenAta, "confirmed", tokenProgram)).amount);
    console.log(`User token bal: ${balance}`);
    if (balance < tokensIn.toNumber()) {
      console.error(`User has ${balance} raw tokens, need ${tokensIn.toString()}.`);
      process.exit(1);
    }
  } catch {
    console.error("User token ATA not found or empty.");
    process.exit(1);
  }

  console.log("");
  console.log("Sending redeem...");

  const tx = await program.methods
    .redeem(tokensIn)
    .accountsPartial({
      user,
      vault: vaultPda,
      tokenMint,
      usdgMint,
      userTokenAccount: userTokenAta,
      userUsdgAccount: userUsdgAta,
      vaultUsdgAta,
      systemProgram: SystemProgram.programId,
      tokenProgram,
      usdgTokenProgram: USDG_TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log(`Tx: ${tx}`);
  console.log(
    `Explorer: https://explorer.solana.com/tx/${tx}?cluster=${
      cluster === "mainnet" ? "mainnet-beta" : cluster
    }`
  );

  const vaultAfter = await program.account.redemptionVault.fetch(vaultPda);
  const usdgDecimals = (await getMint(connection, usdgMint, "confirmed", USDG_TOKEN_PROGRAM_ID)).decimals;
  const userUsdgBalance = Number(
    (await getAccount(connection, userUsdgAta, "confirmed", USDG_TOKEN_PROGRAM_ID)).amount
  );
  console.log("");
  console.log("-- After --");
  console.log(`  total_tokens_burned:  ${vaultAfter.totalTokensBurned.toString()}`);
  console.log(`  total_usdg_claimed:   ${vaultAfter.totalUsdgClaimed.toString()}`);
  console.log(`  user USDG balance:    ${(userUsdgBalance / 10 ** usdgDecimals).toFixed(usdgDecimals)} USDG`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
