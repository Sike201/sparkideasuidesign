import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { SparkRedemptionVault } from "../target/types/spark_redemption_vault";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  getMint,
} from "@solana/spl-token";

/** USDG is Token-2022 — all USDG ATAs / mint reads must use this program id. */
const USDG_TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID;
import { createHash } from "crypto";

/**
 * Initialize + deposit USDG into a redemption vault for a failed Idea.
 *
 * Usage:
 *   npx ts-node scripts/redemption-init.ts \
 *     <idea_id> <token_mint> <rate_num> <rate_den> <deposit_amount_base_units> \
 *     [--cluster devnet|mainnet|localnet]
 *
 * Example:
 *   npx ts-node scripts/redemption-init.ts \
 *     failed-idea-001 9xQe...LoserMint 500 1000000000 500000000 --cluster devnet
 *
 *   → creates the vault for `failed-idea-001`, with rate = 500/1_000_000_000
 *   (1 token of 9 decimals → 0.0005 USDG), seeds it with 500 USDG (6 decimals).
 *
 * The signer wallet (ANCHOR_WALLET or ~/.config/solana/id.json) becomes the vault's
 * authority — only it can call reclaim_remainder after 30 days.
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
    } else if (argv[i] === "--usdg") {
      (process as any)._usdg_override = argv[i + 1];
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
      "Usage: npx ts-node scripts/redemption-init.ts <idea_id> <token_mint> <rate_num> <rate_den> <deposit_amount> [--cluster devnet|mainnet|localnet] [--usdg <mint>]"
    );
    process.exit(0);
  }

  const { positional, cluster } = parseArgs(args);
  if (positional.length < 5) {
    console.error("Missing arguments. Run with --help for usage.");
    process.exit(1);
  }

  const [ideaId, tokenMintStr, rateNumStr, rateDenStr, depositStr] = positional;
  const tokenMint = new PublicKey(tokenMintStr);
  const rateNum = new BN(rateNumStr);
  const rateDen = new BN(rateDenStr);
  const depositAmount = new BN(depositStr);

  const usdgOverride = (process as any)._usdg_override as string | undefined;
  const usdgMint = usdgOverride
    ? new PublicKey(usdgOverride)
    : cluster === "mainnet"
    ? USDG_MAINNET
    : USDG_DEVNET;

  const rpcUrl =
    cluster === "mainnet"
      ? "https://api.mainnet-beta.solana.com"
      : cluster === "localnet"
      ? "http://127.0.0.1:8899"
      : "https://api.devnet.solana.com";

  console.log("-- Redemption Vault — initialize + deposit --");
  console.log(`Cluster:        ${cluster}`);
  console.log(`Idea ID:        ${ideaId}`);
  console.log(`Loser token:    ${tokenMint.toBase58()}`);
  console.log(`USDG mint:      ${usdgMint.toBase58()}`);
  console.log(`Rate:           ${rateNum.toString()} / ${rateDen.toString()}`);
  console.log(`Deposit amount: ${depositAmount.toString()} (raw USDG units)`);

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

  console.log(`Authority:      ${authority.toBase58()}`);

  // Derive vault PDA = seeds ["redemption", sha256(idea_id)]
  const vaultSeed = createHash("sha256").update(ideaId).digest();
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("redemption"), vaultSeed],
    program.programId
  );
  const vaultUsdgAta = await getAssociatedTokenAddress(
    usdgMint,
    vaultPda,
    true,
    USDG_TOKEN_PROGRAM_ID
  );

  console.log(`Vault PDA:      ${vaultPda.toBase58()}`);
  console.log(`Vault USDG ATA: ${vaultUsdgAta.toBase58()}`);

  // Authority USDG ATA (source of the pot)
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
  const authorityUsdgBalance = Number(
    (await getAccount(connection, authorityUsdg.address, "confirmed", USDG_TOKEN_PROGRAM_ID)).amount
  );
  const usdgDecimals = (await getMint(connection, usdgMint, "confirmed", USDG_TOKEN_PROGRAM_ID)).decimals;
  console.log(
    `Authority USDG: ${authorityUsdg.address.toBase58()} (${(
      authorityUsdgBalance /
      10 ** usdgDecimals
    ).toFixed(usdgDecimals)} USDG)`
  );

  if (authorityUsdgBalance < depositAmount.toNumber()) {
    console.error(
      `Authority has ${authorityUsdgBalance} raw USDG, need ${depositAmount.toString()}.`
    );
    process.exit(1);
  }

  console.log("");
  console.log("Sending initialize_and_deposit...");

  const tx = await program.methods
    .initializeAndDeposit(ideaId, Array.from(vaultSeed), rateNum, rateDen, depositAmount)
    .accountsPartial({
      authority,
      vault: vaultPda,
      tokenMint,
      usdgMint,
      authorityUsdgAccount: authorityUsdg.address,
      vaultUsdgAta,
      systemProgram: SystemProgram.programId,
      usdgTokenProgram: USDG_TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log(`Tx:             ${tx}`);
  console.log(
    `Explorer:       https://explorer.solana.com/tx/${tx}?cluster=${
      cluster === "mainnet" ? "mainnet-beta" : cluster
    }`
  );

  const vault = await program.account.redemptionVault.fetch(vaultPda);
  console.log("");
  console.log("-- Vault state --");
  console.log(`  authority:             ${vault.authority.toBase58()}`);
  console.log(`  total_usdg_deposited:  ${vault.totalUsdgDeposited.toString()}`);
  console.log(`  rate:                  ${vault.rateNum.toString()} / ${vault.rateDen.toString()}`);
  console.log(`  deadline:              ${new Date(vault.deadline.toNumber() * 1000).toISOString()}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
