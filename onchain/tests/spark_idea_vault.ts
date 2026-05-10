import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SparkIdeaVault } from "../target/types/spark_idea_vault";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  mintTo,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import BN from "bn.js";
import { createHash } from "crypto";

describe("spark_idea_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SparkIdeaVault as Program<SparkIdeaVault>;
  const connection = provider.connection;

  // Test accounts
  let mint: PublicKey;
  let mintAuthority: Keypair;
  let user: Keypair;
  let userTokenAccount: PublicKey;

  // Test data
  const ideaId = "test-idea-001";
  const vaultSeed = createHash("sha256").update(ideaId).digest();
  const depositAmount = new BN(1_000_000); // 1 USDC (6 decimals)
  const withdrawAmount = new BN(500_000); // 0.5 USDC

  // PDAs
  let adminConfigPda: PublicKey;
  let vaultPda: PublicKey;
  let vaultBump: number;
  let vaultAta: PublicKey;
  let userDepositPda: PublicKey;

  before(async () => {
    // Derive admin config PDA
    [adminConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("admin_config")],
      program.programId
    );

    // Create mint authority
    mintAuthority = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      mintAuthority.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig);

    // Create user
    user = Keypair.generate();
    const userAirdropSig = await connection.requestAirdrop(
      user.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(userAirdropSig);

    // Create mock USDC mint (6 decimals like real USDC)
    mint = await createMint(
      connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      6
    );

    console.log("Mock USDC Mint:", mint.toBase58());

    // Create user's token account
    userTokenAccount = await createAssociatedTokenAccount(
      connection,
      user,
      mint,
      user.publicKey
    );

    // Mint some tokens to user (10 USDC)
    await mintTo(
      connection,
      mintAuthority,
      mint,
      userTokenAccount,
      mintAuthority,
      10_000_000
    );

    // Derive PDAs
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), vaultSeed],
      program.programId
    );

    vaultAta = await getAssociatedTokenAddress(mint, vaultPda, true);

    [userDepositPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), vaultPda.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    console.log("Admin Config PDA:", adminConfigPda.toBase58());
    console.log("Vault PDA:", vaultPda.toBase58());
    console.log("Vault ATA:", vaultAta.toBase58());
    console.log("User Deposit PDA:", userDepositPda.toBase58());
  });

  describe("initialize_admin_config", () => {
    it("should initialize the admin config", async () => {
      const tx = await program.methods
        .initializeAdminConfig()
        .accounts({
          admin: provider.wallet.publicKey,
          adminConfig: adminConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("Initialize admin config tx:", tx);

      const adminConfig = await program.account.adminConfig.fetch(adminConfigPda);
      expect(adminConfig.admin.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
      expect(adminConfig.isPaused).to.equal(false);
    });

    it("should fail to initialize admin config a second time", async () => {
      try {
        await program.methods
          .initializeAdminConfig()
          .accounts({
            admin: provider.wallet.publicKey,
            adminConfig: adminConfigPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        // Account already exists — init will fail
        expect(err).to.exist;
      }
    });
  });

  describe("toggle_pause", () => {
    it("should pause the protocol", async () => {
      await program.methods
        .togglePause()
        .accounts({
          admin: provider.wallet.publicKey,
          adminConfig: adminConfigPda,
        })
        .rpc();

      const adminConfig = await program.account.adminConfig.fetch(adminConfigPda);
      expect(adminConfig.isPaused).to.equal(true);
    });

    it("should unpause the protocol", async () => {
      await program.methods
        .togglePause()
        .accounts({
          admin: provider.wallet.publicKey,
          adminConfig: adminConfigPda,
        })
        .rpc();

      const adminConfig = await program.account.adminConfig.fetch(adminConfigPda);
      expect(adminConfig.isPaused).to.equal(false);
    });

    it("should fail when called by non-admin", async () => {
      const fakeAdmin = Keypair.generate();
      const airdropSig = await connection.requestAirdrop(
        fakeAdmin.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdropSig);

      try {
        await program.methods
          .togglePause()
          .accounts({
            admin: fakeAdmin.publicKey,
            adminConfig: adminConfigPda,
          })
          .signers([fakeAdmin])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
    });
  });

  describe("initialize_vault", () => {
    it("should initialize a new vault for an idea", async () => {
      const tx = await program.methods
        .initializeVault(ideaId, Array.from(vaultSeed))
        .accounts({
          payer: provider.wallet.publicKey,
          adminConfig: adminConfigPda,
          vault: vaultPda,
          mint: mint,
          vaultAta: vaultAta,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();

      console.log("Initialize vault tx:", tx);

      const vaultAccount = await program.account.ideaVault.fetch(vaultPda);

      expect(vaultAccount.ideaId).to.equal(ideaId);
      expect(vaultAccount.bump).to.equal(vaultBump);
      expect(vaultAccount.mint.toBase58()).to.equal(mint.toBase58());
      expect(vaultAccount.vaultAta.toBase58()).to.equal(vaultAta.toBase58());
      expect(vaultAccount.totalDeposited.toNumber()).to.equal(0);
    });

    it("should fail to initialize vault with idea_id > 64 chars", async () => {
      const longIdeaId = "a".repeat(65);
      const longVaultSeed = createHash("sha256").update(longIdeaId).digest();

      const [longVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), longVaultSeed],
        program.programId
      );

      const longVaultAta = await getAssociatedTokenAddress(
        mint,
        longVaultPda,
        true
      );

      try {
        await program.methods
          .initializeVault(longIdeaId, Array.from(longVaultSeed))
          .accounts({
            payer: provider.wallet.publicKey,
            adminConfig: adminConfigPda,
            vault: longVaultPda,
            mint: mint,
            vaultAta: longVaultAta,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("IdeaIdTooLong");
      }
    });

    it("should fail to initialize vault when paused", async () => {
      // Pause
      await program.methods
        .togglePause()
        .accounts({
          admin: provider.wallet.publicKey,
          adminConfig: adminConfigPda,
        })
        .rpc();

      const pausedIdeaId = "paused-idea";
      const pausedSeed = createHash("sha256").update(pausedIdeaId).digest();
      const [pausedVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), pausedSeed],
        program.programId
      );
      const pausedVaultAta = await getAssociatedTokenAddress(mint, pausedVaultPda, true);

      try {
        await program.methods
          .initializeVault(pausedIdeaId, Array.from(pausedSeed))
          .accounts({
            payer: provider.wallet.publicKey,
            adminConfig: adminConfigPda,
            vault: pausedVaultPda,
            mint: mint,
            vaultAta: pausedVaultAta,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("ProtocolPaused");
      }

      // Unpause for next tests
      await program.methods
        .togglePause()
        .accounts({
          admin: provider.wallet.publicKey,
          adminConfig: adminConfigPda,
        })
        .rpc();
    });
  });

  describe("deposit", () => {
    it("should allow user to deposit tokens", async () => {
      const initialUserBalance = await getAccount(connection, userTokenAccount);
      const initialVaultBalance = await getAccount(connection, vaultAta);

      const tx = await program.methods
        .deposit(depositAmount)
        .accounts({
          user: user.publicKey,
          adminConfig: adminConfigPda,
          vault: vaultPda,
          userTokenAccount: userTokenAccount,
          vaultAta: vaultAta,
          userDeposit: userDepositPda,
          mint: mint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      console.log("Deposit tx:", tx);

      const finalUserBalance = await getAccount(connection, userTokenAccount);
      const finalVaultBalance = await getAccount(connection, vaultAta);

      expect(Number(finalUserBalance.amount)).to.equal(
        Number(initialUserBalance.amount) - depositAmount.toNumber()
      );
      expect(Number(finalVaultBalance.amount)).to.equal(
        Number(initialVaultBalance.amount) + depositAmount.toNumber()
      );

      const userDepositAccount = await program.account.userDeposit.fetch(
        userDepositPda
      );
      expect(userDepositAccount.amount.toNumber()).to.equal(
        depositAmount.toNumber()
      );
      expect(userDepositAccount.vault.toBase58()).to.equal(vaultPda.toBase58());
      expect(userDepositAccount.user.toBase58()).to.equal(
        user.publicKey.toBase58()
      );

      const vaultAccount = await program.account.ideaVault.fetch(vaultPda);
      expect(vaultAccount.totalDeposited.toNumber()).to.equal(
        depositAmount.toNumber()
      );
    });

    it("should allow multiple deposits", async () => {
      const secondDeposit = new BN(500_000);

      const initialUserDeposit = await program.account.userDeposit.fetch(
        userDepositPda
      );

      await program.methods
        .deposit(secondDeposit)
        .accounts({
          user: user.publicKey,
          adminConfig: adminConfigPda,
          vault: vaultPda,
          userTokenAccount: userTokenAccount,
          vaultAta: vaultAta,
          userDeposit: userDepositPda,
          mint: mint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const finalUserDeposit = await program.account.userDeposit.fetch(
        userDepositPda
      );
      expect(finalUserDeposit.amount.toNumber()).to.equal(
        initialUserDeposit.amount.toNumber() + secondDeposit.toNumber()
      );
    });

    it("should fail to deposit zero amount", async () => {
      try {
        await program.methods
          .deposit(new BN(0))
          .accounts({
            user: user.publicKey,
            adminConfig: adminConfigPda,
            vault: vaultPda,
            userTokenAccount: userTokenAccount,
            vaultAta: vaultAta,
            userDeposit: userDepositPda,
            mint: mint,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("InvalidAmount");
      }
    });

    it("should fail to deposit dust amount", async () => {
      try {
        await program.methods
          .deposit(new BN(999))
          .accounts({
            user: user.publicKey,
            adminConfig: adminConfigPda,
            vault: vaultPda,
            userTokenAccount: userTokenAccount,
            vaultAta: vaultAta,
            userDeposit: userDepositPda,
            mint: mint,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("AmountTooSmall");
      }
    });
  });

  describe("withdraw", () => {
    it("should allow user to withdraw tokens", async () => {
      const initialUserDeposit = await program.account.userDeposit.fetch(
        userDepositPda
      );
      const initialVaultBalance = await getAccount(connection, vaultAta);
      const initialUserBalance = await getAccount(connection, userTokenAccount);

      const tx = await program.methods
        .withdraw(withdrawAmount)
        .accounts({
          user: user.publicKey,
          adminConfig: adminConfigPda,
          vault: vaultPda,
          userDeposit: userDepositPda,
          userTokenAccount: userTokenAccount,
          vaultAta: vaultAta,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      console.log("Withdraw tx:", tx);

      const finalUserDeposit = await program.account.userDeposit.fetch(
        userDepositPda
      );
      expect(finalUserDeposit.amount.toNumber()).to.equal(
        initialUserDeposit.amount.toNumber() - withdrawAmount.toNumber()
      );

      const finalVaultBalance = await getAccount(connection, vaultAta);
      const finalUserBalance = await getAccount(connection, userTokenAccount);

      expect(Number(finalVaultBalance.amount)).to.equal(
        Number(initialVaultBalance.amount) - withdrawAmount.toNumber()
      );
      expect(Number(finalUserBalance.amount)).to.equal(
        Number(initialUserBalance.amount) + withdrawAmount.toNumber()
      );
    });

    it("should fail to withdraw more than deposited", async () => {
      const userDeposit = await program.account.userDeposit.fetch(
        userDepositPda
      );
      const excessiveAmount = new BN(
        userDeposit.amount.toNumber() + 1_000_000
      );

      try {
        await program.methods
          .withdraw(excessiveAmount)
          .accounts({
            user: user.publicKey,
            adminConfig: adminConfigPda,
            vault: vaultPda,
            userDeposit: userDepositPda,
            userTokenAccount: userTokenAccount,
            vaultAta: vaultAta,
            mint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("InsufficientDeposit");
      }
    });

    it("should fail to withdraw zero amount", async () => {
      try {
        await program.methods
          .withdraw(new BN(0))
          .accounts({
            user: user.publicKey,
            adminConfig: adminConfigPda,
            vault: vaultPda,
            userDeposit: userDepositPda,
            userTokenAccount: userTokenAccount,
            vaultAta: vaultAta,
            mint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("InvalidAmount");
      }
    });

    it("should allow full withdrawal", async () => {
      const userDeposit = await program.account.userDeposit.fetch(
        userDepositPda
      );
      const remainingAmount = userDeposit.amount;

      await program.methods
        .withdraw(remainingAmount)
        .accounts({
          user: user.publicKey,
          adminConfig: adminConfigPda,
          vault: vaultPda,
          userDeposit: userDepositPda,
          userTokenAccount: userTokenAccount,
          vaultAta: vaultAta,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      const finalUserDeposit = await program.account.userDeposit.fetch(
        userDepositPda
      );
      expect(finalUserDeposit.amount.toNumber()).to.equal(0);
    });
  });

  describe("admin_withdraw", () => {
    before(async () => {
      // Deposit some funds so there's something to withdraw
      const topUp = new BN(3_000_000); // 3 USDC
      await program.methods
        .deposit(topUp)
        .accounts({
          user: user.publicKey,
          adminConfig: adminConfigPda,
          vault: vaultPda,
          userTokenAccount: userTokenAccount,
          vaultAta: vaultAta,
          userDeposit: userDepositPda,
          mint: mint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();
    });

    it("should fail when called by non-admin", async () => {
      const fakeAdmin = Keypair.generate();
      const fakeAirdropSig = await connection.requestAirdrop(
        fakeAdmin.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(fakeAirdropSig);

      const fakeAdminTokenAccount = await createAssociatedTokenAccount(
        connection,
        fakeAdmin,
        mint,
        fakeAdmin.publicKey
      );

      try {
        await program.methods
          .adminWithdraw()
          .accounts({
            admin: fakeAdmin.publicKey,
            adminConfig: adminConfigPda,
            vault: vaultPda,
            vaultAta: vaultAta,
            adminTokenAccount: fakeAdminTokenAccount,
            mint: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([fakeAdmin])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
    });

    it("should allow admin to withdraw all funds", async () => {
      // The provider wallet IS the admin (set in initialize_admin_config)
      const adminTokenAccount = await createAssociatedTokenAccount(
        connection,
        // Use mintAuthority to pay for ATA creation (provider wallet may not have enough SOL)
        mintAuthority,
        mint,
        provider.wallet.publicKey
      );

      const vaultBalanceBefore = await getAccount(connection, vaultAta);
      expect(Number(vaultBalanceBefore.amount)).to.be.greaterThan(0);

      await program.methods
        .adminWithdraw()
        .accounts({
          admin: provider.wallet.publicKey,
          adminConfig: adminConfigPda,
          vault: vaultPda,
          vaultAta: vaultAta,
          adminTokenAccount: adminTokenAccount,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const vaultBalanceAfter = await getAccount(connection, vaultAta);
      expect(Number(vaultBalanceAfter.amount)).to.equal(0);

      const vaultAccount = await program.account.ideaVault.fetch(vaultPda);
      expect(vaultAccount.totalDeposited.toNumber()).to.equal(0);
    });
  });

  describe("update_admin", () => {
    it("should allow admin to transfer admin role", async () => {
      const newAdmin = Keypair.generate();

      await program.methods
        .updateAdmin(newAdmin.publicKey)
        .accounts({
          admin: provider.wallet.publicKey,
          adminConfig: adminConfigPda,
        })
        .rpc();

      const adminConfig = await program.account.adminConfig.fetch(adminConfigPda);
      expect(adminConfig.admin.toBase58()).to.equal(newAdmin.publicKey.toBase58());

      // Transfer back for other tests
      const airdropSig = await connection.requestAirdrop(
        newAdmin.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdropSig);

      await program.methods
        .updateAdmin(provider.wallet.publicKey)
        .accounts({
          admin: newAdmin.publicKey,
          adminConfig: adminConfigPda,
        })
        .signers([newAdmin])
        .rpc();

      const adminConfigAfter = await program.account.adminConfig.fetch(adminConfigPda);
      expect(adminConfigAfter.admin.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    });

    it("should fail when called by non-admin", async () => {
      const fakeAdmin = Keypair.generate();
      const airdropSig = await connection.requestAirdrop(
        fakeAdmin.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdropSig);

      try {
        await program.methods
          .updateAdmin(fakeAdmin.publicKey)
          .accounts({
            admin: fakeAdmin.publicKey,
            adminConfig: adminConfigPda,
          })
          .signers([fakeAdmin])
          .rpc();

        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("Unauthorized");
      }
    });
  });

  describe("multiple users", () => {
    let user2: Keypair;
    let user2TokenAccount: PublicKey;
    let user2DepositPda: PublicKey;

    before(async () => {
      user2 = Keypair.generate();
      const user2AirdropSig = await connection.requestAirdrop(
        user2.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(user2AirdropSig);

      user2TokenAccount = await createAssociatedTokenAccount(
        connection,
        user2,
        mint,
        user2.publicKey
      );

      await mintTo(
        connection,
        mintAuthority,
        mint,
        user2TokenAccount,
        mintAuthority,
        5_000_000
      );

      [user2DepositPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("deposit"),
          vaultPda.toBuffer(),
          user2.publicKey.toBuffer(),
        ],
        program.programId
      );
    });

    it("should allow multiple users to deposit in the same vault", async () => {
      const user2DepositAmount = new BN(2_000_000);

      await program.methods
        .deposit(user2DepositAmount)
        .accounts({
          user: user2.publicKey,
          adminConfig: adminConfigPda,
          vault: vaultPda,
          userTokenAccount: user2TokenAccount,
          vaultAta: vaultAta,
          userDeposit: user2DepositPda,
          mint: mint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([user2])
        .rpc();

      const user2Deposit = await program.account.userDeposit.fetch(
        user2DepositPda
      );
      expect(user2Deposit.amount.toNumber()).to.equal(
        user2DepositAmount.toNumber()
      );
      expect(user2Deposit.user.toBase58()).to.equal(user2.publicKey.toBase58());
    });

    it("should allow user2 to withdraw their own funds", async () => {
      const user2Deposit = await program.account.userDeposit.fetch(
        user2DepositPda
      );

      await program.methods
        .withdraw(user2Deposit.amount)
        .accounts({
          user: user2.publicKey,
          adminConfig: adminConfigPda,
          vault: vaultPda,
          userDeposit: user2DepositPda,
          userTokenAccount: user2TokenAccount,
          vaultAta: vaultAta,
          mint: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user2])
        .rpc();

      const finalUser2Deposit = await program.account.userDeposit.fetch(
        user2DepositPda
      );
      expect(finalUser2Deposit.amount.toNumber()).to.equal(0);
    });
  });
});
