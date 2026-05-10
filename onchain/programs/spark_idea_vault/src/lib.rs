use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::TransferChecked;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

/// SECURITY: Ensures this is the only instruction from our program in the transaction.
/// Prevents atomic deposit+withdraw exploits where an attacker deposits and withdraws
/// in a single transaction while the API records the deposit as a real investment.
fn assert_single_program_instruction(instructions_sysvar: &AccountInfo) -> Result<()> {
    let current_index = ix_sysvar::load_current_index_checked(instructions_sysvar)
        .map_err(|_| ErrorCode::AtomicTransactionNotAllowed)? as usize;

    let mut idx: usize = 0;
    loop {
        match ix_sysvar::load_instruction_at_checked(idx, instructions_sysvar) {
            Ok(ix) => {
                if idx != current_index && ix.program_id == crate::ID {
                    return Err(ErrorCode::AtomicTransactionNotAllowed.into());
                }
                idx += 1;
            }
            Err(_) => break,
        }
    }

    Ok(())
}

declare_id!("8u9AUqFv25xUpXqVwE83EiQ91YkvJbmsa5BheTVb3xvZ");

/// Authorized initial admin — only this wallet can call initialize_admin_config
pub const INITIAL_ADMIN: Pubkey = pubkey!("autcjMrQkVBV2cuwjjdmGaimfYVJSyTHzKtq51GShmh");

/// Whitelisted mint addresses (USDC + USDG)
pub mod allowed_mints {
    use anchor_lang::prelude::*;

    /// USDC on Devnet
    pub const USDC_DEVNET: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    /// USDC on Mainnet
    pub const USDC_MAINNET: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    /// USDG on Devnet
    pub const USDG_DEVNET: Pubkey = pubkey!("4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7");
    /// USDG on Mainnet
    pub const USDG_MAINNET: Pubkey = pubkey!("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH");

    /// Check if a mint is in the whitelist
    pub fn is_allowed(mint: &Pubkey) -> bool {
        *mint == USDC_DEVNET || *mint == USDC_MAINNET || *mint == USDG_DEVNET || *mint == USDG_MAINNET
    }
}

#[program]
pub mod spark_idea_vault {
    use super::*;

    /// Initialize the admin config. Can only be called once (PDA is unique).
    /// The initial admin is the signer.
    pub fn initialize_admin_config(ctx: Context<InitializeAdminConfig>) -> Result<()> {
        let admin_config = &mut ctx.accounts.admin_config;
        admin_config.admin = ctx.accounts.admin.key();
        admin_config.is_paused = false;
        admin_config.bump = ctx.bumps.admin_config;

        emit!(AdminConfigInitialized {
            admin: admin_config.admin,
        });

        Ok(())
    }

    /// Transfer admin role to a new address. Only the current admin can call this.
    pub fn update_admin(ctx: Context<UpdateAdmin>, new_admin: Pubkey) -> Result<()> {
        require!(new_admin != Pubkey::default(), ErrorCode::InvalidAdmin);

        let old_admin = ctx.accounts.admin_config.admin;
        let admin_config = &mut ctx.accounts.admin_config;
        admin_config.admin = new_admin;

        emit!(AdminUpdated {
            old_admin,
            new_admin,
        });

        Ok(())
    }

    /// Pause or unpause the protocol. Only the admin can call this.
    pub fn toggle_pause(ctx: Context<TogglePause>) -> Result<()> {
        let admin_config = &mut ctx.accounts.admin_config;
        admin_config.is_paused = !admin_config.is_paused;

        emit!(PauseToggled {
            is_paused: admin_config.is_paused,
            admin: ctx.accounts.admin.key(),
        });

        Ok(())
    }

    /// Initialize a vault for an idea. One vault per idea_id.
    /// vault_seed must be SHA256(idea_id) so the PDA seed stays within Solana's 32-byte limit.
    /// SECURITY: Only whitelisted mints (USDC) are allowed.
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        idea_id: String,
        vault_seed: [u8; 32],
    ) -> Result<()> {
        require!(!ctx.accounts.admin_config.is_paused, ErrorCode::ProtocolPaused);
        require!(idea_id.len() <= 64, ErrorCode::IdeaIdTooLong);
        require!(!idea_id.is_empty(), ErrorCode::IdeaIdEmpty);
        require!(
            hash(idea_id.as_bytes()).to_bytes() == vault_seed,
            ErrorCode::InvalidVaultSeed
        );

        // SECURITY: Only allow whitelisted mints (USDC/USDG devnet/mainnet)
        // Bypassed on localnet for testing with mock mints
        #[cfg(not(feature = "localnet"))]
        require!(
            allowed_mints::is_allowed(&ctx.accounts.mint.key()),
            ErrorCode::UnauthorizedMint
        );

        let vault = &mut ctx.accounts.vault;
        vault.idea_id = idea_id.clone();
        vault.vault_seed = vault_seed;
        vault.bump = ctx.bumps.vault;
        vault.mint = ctx.accounts.mint.key();
        vault.vault_ata = ctx.accounts.vault_ata.key();
        vault.total_deposited = 0;

        emit!(VaultInitialized {
            vault: vault.key(),
            idea_id,
            mint: vault.mint,
            initialized_by: ctx.accounts.payer.key(),
        });

        Ok(())
    }

    /// User deposits USDC into the idea vault. Records their share for later withdraw.
    /// SECURITY: Minimum deposit of 1000 base units (0.001 USDC) to prevent dust attacks.
    /// SECURITY: State updated before CPI transfer (check-effects-interactions).
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // SECURITY: Prevent atomic deposit+withdraw in same transaction
        assert_single_program_instruction(&ctx.accounts.instructions_sysvar)?;

        require!(!ctx.accounts.admin_config.is_paused, ErrorCode::ProtocolPaused);
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(amount >= 1000, ErrorCode::AmountTooSmall);

        // === EFFECTS: Update state BEFORE external call (check-effects-interactions) ===
        let user_deposit = &mut ctx.accounts.user_deposit;
        user_deposit.amount = user_deposit.amount.checked_add(amount).ok_or(ErrorCode::Overflow)?;
        user_deposit.vault = ctx.accounts.vault.key();
        user_deposit.user = ctx.accounts.user.key();

        let vault = &mut ctx.accounts.vault;
        vault.total_deposited = vault.total_deposited.checked_add(amount).ok_or(ErrorCode::Overflow)?;

        let user_total = user_deposit.amount;
        let vault_total = vault.total_deposited;

        // === INTERACTIONS: CPI transfer after state update ===
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_ata.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token_interface::transfer_checked(CpiContext::new(cpi_program, cpi_accounts), amount, ctx.accounts.mint.decimals)?;

        emit!(UserDeposited {
            vault: ctx.accounts.vault.key(),
            user: ctx.accounts.user.key(),
            amount,
            user_total,
            vault_total,
        });

        Ok(())
    }

    /// User withdraws USDC from the idea vault, up to their deposited amount.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        // SECURITY: Prevent atomic deposit+withdraw in same transaction
        assert_single_program_instruction(&ctx.accounts.instructions_sysvar)?;

        require!(!ctx.accounts.admin_config.is_paused, ErrorCode::ProtocolPaused);
        require!(amount > 0, ErrorCode::InvalidAmount);

        // Extract values for PDA signing before mutable borrows
        let vault_seed = ctx.accounts.vault.vault_seed;
        let vault_bump = ctx.accounts.vault.bump;
        let vault_key = ctx.accounts.vault.key();
        let decimals = ctx.accounts.mint.decimals;

        // === EFFECTS: Update state before CPI ===
        let user_deposit = &mut ctx.accounts.user_deposit;
        require!(user_deposit.amount >= amount, ErrorCode::InsufficientDeposit);
        user_deposit.amount = user_deposit.amount.checked_sub(amount).ok_or(ErrorCode::Overflow)?;
        let user_remaining = user_deposit.amount;

        let vault = &mut ctx.accounts.vault;
        vault.total_deposited = vault.total_deposited.checked_sub(amount).ok_or(ErrorCode::Overflow)?;
        let vault_total = vault.total_deposited;

        // === INTERACTIONS: Vault PDA signs the transfer ===
        let vault_seeds = &[
            b"vault".as_ref(),
            vault_seed.as_ref(),
            &[vault_bump],
        ];
        let signer_seeds = &[&vault_seeds[..]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault_ata.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token_interface::transfer_checked(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds),
            amount,
            decimals,
        )?;

        emit!(UserWithdrawn {
            vault: vault_key,
            user: ctx.accounts.user.key(),
            amount,
            user_remaining,
            vault_total,
        });

        Ok(())
    }

    /// Admin withdraws all USDC from a vault. Only the admin from AdminConfig can call this.
    pub fn admin_withdraw(ctx: Context<AdminWithdraw>) -> Result<()> {
        let vault_seed = ctx.accounts.vault.vault_seed;
        let vault_bump = ctx.accounts.vault.bump;
        let vault_key = ctx.accounts.vault.key();
        let decimals = ctx.accounts.mint.decimals;

        let amount = ctx.accounts.vault_ata.amount;
        require!(amount > 0, ErrorCode::InvalidAmount);

        // === EFFECTS ===
        let vault = &mut ctx.accounts.vault;
        vault.total_deposited = 0;

        // === INTERACTIONS ===
        let vault_seeds = &[
            b"vault".as_ref(),
            vault_seed.as_ref(),
            &[vault_bump],
        ];
        let signer_seeds = &[&vault_seeds[..]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault_ata.to_account_info(),
            to: ctx.accounts.admin_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token_interface::transfer_checked(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds),
            amount,
            decimals,
        )?;

        emit!(AdminWithdrawn {
            vault: vault_key,
            admin: ctx.accounts.admin.key(),
            amount,
        });

        Ok(())
    }
}

// ============== Accounts ==============

#[account]
pub struct AdminConfig {
    pub admin: Pubkey,
    pub is_paused: bool,
    pub bump: u8,
}

#[account]
#[derive(Default)]
pub struct IdeaVault {
    pub idea_id: String,       // max 64 chars (display only; PDA uses vault_seed)
    pub vault_seed: [u8; 32],  // SHA256(idea_id) for PDA seed (max 32 bytes per seed)
    pub bump: u8,
    pub mint: Pubkey,
    pub vault_ata: Pubkey,
    pub total_deposited: u64,
}

#[account]
#[derive(Default)]
pub struct UserDeposit {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}

// ============== Events ==============

#[event]
pub struct AdminConfigInitialized {
    pub admin: Pubkey,
}

#[event]
pub struct AdminUpdated {
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct PauseToggled {
    pub is_paused: bool,
    pub admin: Pubkey,
}

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub idea_id: String,
    pub mint: Pubkey,
    pub initialized_by: Pubkey,
}

#[event]
pub struct UserDeposited {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub user_total: u64,
    pub vault_total: u64,
}

#[event]
pub struct UserWithdrawn {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub user_remaining: u64,
    pub vault_total: u64,
}

#[event]
pub struct AdminWithdrawn {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub amount: u64,
}

// ============== Errors ==============

#[error_code]
pub enum ErrorCode {
    #[msg("Idea id must be 64 characters or less")]
    IdeaIdTooLong,
    #[msg("Idea id cannot be empty")]
    IdeaIdEmpty,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Amount too small - minimum deposit is 0.001 USDC")]
    AmountTooSmall,
    #[msg("Insufficient deposit to withdraw")]
    InsufficientDeposit,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Unauthorized mint - only USDC and USDG are allowed")]
    UnauthorizedMint,
    #[msg("Invalid vault ATA")]
    InvalidVaultAta,
    #[msg("Vault seed must be SHA256(idea_id)")]
    InvalidVaultSeed,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Invalid admin address")]
    InvalidAdmin,
    #[msg("Transaction cannot contain multiple program instructions")]
    AtomicTransactionNotAllowed,
}

// ============== InitializeAdminConfig ==============

#[derive(Accounts)]
pub struct InitializeAdminConfig<'info> {
    #[account(
        mut,
        constraint = admin.key() == INITIAL_ADMIN @ ErrorCode::Unauthorized
    )]
    pub admin: Signer<'info>,

    /// AdminConfig PDA: singleton, seeds = ["admin_config"]
    /// Space: 8 (discriminator) + 32 (admin) + 1 (is_paused) + 1 (bump)
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 1 + 1,
        seeds = [b"admin_config"],
        bump
    )]
    pub admin_config: Account<'info, AdminConfig>,

    pub system_program: Program<'info, System>,
}

// ============== UpdateAdmin ==============

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    #[account(
        constraint = admin.key() == admin_config.admin @ ErrorCode::Unauthorized
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"admin_config"],
        bump = admin_config.bump
    )]
    pub admin_config: Account<'info, AdminConfig>,
}

// ============== TogglePause ==============

#[derive(Accounts)]
pub struct TogglePause<'info> {
    #[account(
        constraint = admin.key() == admin_config.admin @ ErrorCode::Unauthorized
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"admin_config"],
        bump = admin_config.bump
    )]
    pub admin_config: Account<'info, AdminConfig>,
}

// ============== InitializeVault ==============

#[derive(Accounts)]
#[instruction(idea_id: String, vault_seed: [u8; 32])]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [b"admin_config"],
        bump = admin_config.bump
    )]
    pub admin_config: Account<'info, AdminConfig>,

    /// Vault PDA: one per idea_id (seed = SHA256(idea_id) to stay within 32-byte limit).
    /// Space: 8 + 4+64 (idea_id) + 32 (vault_seed) + 1 + 32 + 32 + 8
    #[account(
        init,
        payer = payer,
        space = 8 + 4 + 64 + 32 + 1 + 32 + 32 + 8,
        seeds = [b"vault".as_ref(), vault_seed.as_ref()],
        bump
    )]
    pub vault: Account<'info, IdeaVault>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// Vault's token account (ATA). Authority is the vault PDA so the program can sign withdrawals.
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program
    )]
    pub vault_ata: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

// ============== Deposit ==============

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"admin_config"],
        bump = admin_config.bump
    )]
    pub admin_config: Account<'info, AdminConfig>,

    #[account(
        mut,
        seeds = [b"vault", vault.vault_seed.as_ref()],
        bump = vault.bump,
        constraint = vault.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = vault.vault_ata == vault_ata.key() @ ErrorCode::InvalidVaultAta
    )]
    pub vault: Account<'info, IdeaVault>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program
    )]
    pub vault_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 32 + 8,
        seeds = [b"deposit", vault.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_deposit: Account<'info, UserDeposit>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// CHECK: Instructions sysvar — prevents atomic multi-instruction exploits
    #[account(address = ix_sysvar::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
}

// ============== Withdraw ==============

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"admin_config"],
        bump = admin_config.bump
    )]
    pub admin_config: Account<'info, AdminConfig>,

    #[account(
        mut,
        seeds = [b"vault", vault.vault_seed.as_ref()],
        bump = vault.bump,
        constraint = vault.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = vault.vault_ata == vault_ata.key() @ ErrorCode::InvalidVaultAta
    )]
    pub vault: Account<'info, IdeaVault>,

    #[account(
        mut,
        seeds = [b"deposit", vault.key().as_ref(), user.key().as_ref()],
        bump,
        constraint = user_deposit.user == user.key() @ ErrorCode::Unauthorized
    )]
    pub user_deposit: Account<'info, UserDeposit>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program
    )]
    pub vault_ata: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,

    /// CHECK: Instructions sysvar — prevents atomic multi-instruction exploits
    #[account(address = ix_sysvar::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
}

// ============== AdminWithdraw ==============

#[derive(Accounts)]
pub struct AdminWithdraw<'info> {
    #[account(
        mut,
        constraint = admin.key() == admin_config.admin @ ErrorCode::Unauthorized
    )]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"admin_config"],
        bump = admin_config.bump
    )]
    pub admin_config: Account<'info, AdminConfig>,

    #[account(
        mut,
        seeds = [b"vault", vault.vault_seed.as_ref()],
        bump = vault.bump,
        constraint = vault.mint == mint.key() @ ErrorCode::InvalidMint,
        constraint = vault.vault_ata == vault_ata.key() @ ErrorCode::InvalidVaultAta
    )]
    pub vault: Account<'info, IdeaVault>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program
    )]
    pub vault_ata: InterfaceAccount<'info, TokenAccount>,

    /// Admin's token account to receive the funds
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = admin,
        associated_token::token_program = token_program
    )]
    pub admin_token_account: InterfaceAccount<'info, TokenAccount>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}
