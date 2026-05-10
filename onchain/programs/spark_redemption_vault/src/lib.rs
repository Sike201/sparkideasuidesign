use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::{Burn, TransferChecked};
use anchor_spl::token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface};

declare_id!("HjxL5eioDknBcoQAymHQkn9VHzWRqZe3CtSyw7U8vRq1");

/// 30 days in seconds — admin can reclaim the remainder after this delay.
pub const CLAIM_DEADLINE_SECONDS: i64 = 30 * 24 * 60 * 60;

/// Only this wallet can create vaults — prevents PDA squatting / parameter griefing.
/// Must match the value used in the main Spark programs (see `spark_idea_vault::INITIAL_ADMIN`).
pub const INITIAL_ADMIN: Pubkey = pubkey!("autcjMrQkVBV2cuwjjdmGaimfYVJSyTHzKtq51GShmh");

/// Whitelisted USDG mints (only payout token supported).
pub mod allowed_mints {
    use anchor_lang::prelude::*;

    pub const USDG_DEVNET: Pubkey = pubkey!("4F6PM96JJxngmHnZLBh9n58RH4aTVNWvDs2nuwrT5BP7");
    pub const USDG_MAINNET: Pubkey = pubkey!("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH");

    pub fn is_allowed(mint: &Pubkey) -> bool {
        *mint == USDG_DEVNET || *mint == USDG_MAINNET
    }
}

#[program]
pub mod spark_redemption_vault {
    use super::*;

    /// Initialize the redemption vault for an idea AND deposit the full USDG pot in one tx.
    ///
    /// * `idea_id`       — human-readable idea identifier (≤ 64 chars, display only)
    /// * `vault_seed`    — SHA256(idea_id), used as the PDA seed (32-byte cap)
    /// * `rate_num`      — numerator of the fixed redemption rate
    /// * `rate_den`      — denominator of the fixed redemption rate
    ///                     → `usdg_out = floor(tokens_in * rate_num / rate_den)`
    /// * `deposit_amount`— amount of USDG (base units) the admin seeds the vault with
    pub fn initialize_and_deposit(
        ctx: Context<InitializeAndDeposit>,
        idea_id: String,
        vault_seed: [u8; 32],
        rate_num: u64,
        rate_den: u64,
        deposit_amount: u64,
    ) -> Result<()> {
        require!(!idea_id.is_empty(), ErrorCode::IdeaIdEmpty);
        require!(idea_id.len() <= 64, ErrorCode::IdeaIdTooLong);
        require!(
            hash(idea_id.as_bytes()).to_bytes() == vault_seed,
            ErrorCode::InvalidVaultSeed
        );
        require!(rate_num > 0, ErrorCode::InvalidRate);
        require!(rate_den > 0, ErrorCode::InvalidRate);
        require!(deposit_amount > 0, ErrorCode::InvalidAmount);

        // Only allow real USDG in prod; any mint in localnet for tests.
        #[cfg(not(feature = "localnet"))]
        require!(
            allowed_mints::is_allowed(&ctx.accounts.usdg_mint.key()),
            ErrorCode::UnauthorizedMint
        );

        let now = Clock::get()?.unix_timestamp;

        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.idea_id = idea_id.clone();
        vault.vault_seed = vault_seed;
        vault.bump = ctx.bumps.vault;
        vault.token_mint = ctx.accounts.token_mint.key();
        vault.usdg_mint = ctx.accounts.usdg_mint.key();
        vault.vault_usdg_ata = ctx.accounts.vault_usdg_ata.key();
        vault.rate_num = rate_num;
        vault.rate_den = rate_den;
        vault.total_usdg_deposited = deposit_amount;
        vault.total_usdg_claimed = 0;
        vault.total_tokens_burned = 0;
        vault.created_at = now;
        vault.deadline = now
            .checked_add(CLAIM_DEADLINE_SECONDS)
            .ok_or(ErrorCode::Overflow)?;
        vault.closed = false;

        // Pull the USDG pot from the authority into the vault ATA.
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.authority_usdg_account.to_account_info(),
            to: ctx.accounts.vault_usdg_ata.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            mint: ctx.accounts.usdg_mint.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.usdg_token_program.to_account_info(), cpi_accounts),
            deposit_amount,
            ctx.accounts.usdg_mint.decimals,
        )?;

        emit!(RedemptionInitialized {
            vault: vault.key(),
            idea_id,
            authority: vault.authority,
            token_mint: vault.token_mint,
            usdg_mint: vault.usdg_mint,
            rate_num,
            rate_den,
            deposit_amount,
            deadline: vault.deadline,
        });

        Ok(())
    }

    /// User burns `tokens_in` of the loser Ideacoin and receives USDG at the fixed rate.
    /// Callable until `vault.deadline`.
    pub fn redeem(ctx: Context<Redeem>, tokens_in: u64) -> Result<()> {
        require!(!ctx.accounts.vault.closed, ErrorCode::VaultClosed);
        require!(tokens_in > 0, ErrorCode::InvalidAmount);

        let now = Clock::get()?.unix_timestamp;
        require!(now <= ctx.accounts.vault.deadline, ErrorCode::DeadlinePassed);

        // Compute payout: floor(tokens_in * rate_num / rate_den).
        // u128 to safely multiply two u64s before dividing.
        let usdg_out: u64 = (tokens_in as u128)
            .checked_mul(ctx.accounts.vault.rate_num as u128)
            .ok_or(ErrorCode::Overflow)?
            .checked_div(ctx.accounts.vault.rate_den as u128)
            .ok_or(ErrorCode::Overflow)?
            .try_into()
            .map_err(|_| ErrorCode::Overflow)?;

        require!(usdg_out > 0, ErrorCode::PayoutTooSmall);
        require!(
            usdg_out <= ctx.accounts.vault_usdg_ata.amount,
            ErrorCode::InsufficientVaultBalance
        );

        // Snapshot PDA signing values before mutable borrow.
        let vault_seed = ctx.accounts.vault.vault_seed;
        let vault_bump = ctx.accounts.vault.bump;
        let vault_key = ctx.accounts.vault.key();
        let usdg_decimals = ctx.accounts.usdg_mint.decimals;
        let token_decimals = ctx.accounts.token_mint.decimals;

        // === EFFECTS ===
        let vault = &mut ctx.accounts.vault;
        vault.total_usdg_claimed = vault
            .total_usdg_claimed
            .checked_add(usdg_out)
            .ok_or(ErrorCode::Overflow)?;
        vault.total_tokens_burned = vault
            .total_tokens_burned
            .checked_add(tokens_in)
            .ok_or(ErrorCode::Overflow)?;

        // === INTERACTIONS ===
        // 1) Burn the user's loser tokens.
        let burn_accounts = Burn {
            mint: ctx.accounts.token_mint.to_account_info(),
            from: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        token_interface::burn(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), burn_accounts),
            tokens_in,
        )?;

        // Sanity: ensure burn respected the mint's decimals (optional — `burn` does not enforce it,
        // but we keep `token_decimals` usable for event logging / future checks).
        let _ = token_decimals;

        // 2) Pay USDG out to the user from the vault ATA (vault PDA signs).
        let vault_seeds = &[b"redemption".as_ref(), vault_seed.as_ref(), &[vault_bump]];
        let signer_seeds = &[&vault_seeds[..]];

        let transfer_accounts = TransferChecked {
            from: ctx.accounts.vault_usdg_ata.to_account_info(),
            to: ctx.accounts.user_usdg_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.usdg_mint.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.usdg_token_program.to_account_info(),
                transfer_accounts,
                signer_seeds,
            ),
            usdg_out,
            usdg_decimals,
        )?;

        emit!(UserRedeemed {
            vault: vault_key,
            user: ctx.accounts.user.key(),
            tokens_burned: tokens_in,
            usdg_out,
            total_tokens_burned: ctx.accounts.vault.total_tokens_burned,
            total_usdg_claimed: ctx.accounts.vault.total_usdg_claimed,
        });

        Ok(())
    }

    /// After the deadline, the authority can sweep the remaining USDG, close the vault USDG ATA,
    /// and close the vault account itself — refunding the rent to the authority.
    pub fn reclaim_remainder(ctx: Context<ReclaimRemainder>) -> Result<()> {
        require!(!ctx.accounts.vault.closed, ErrorCode::VaultClosed);

        let now = Clock::get()?.unix_timestamp;
        require!(now > ctx.accounts.vault.deadline, ErrorCode::DeadlineNotReached);

        let vault_seed = ctx.accounts.vault.vault_seed;
        let vault_bump = ctx.accounts.vault.bump;
        let vault_key = ctx.accounts.vault.key();
        let usdg_decimals = ctx.accounts.usdg_mint.decimals;
        let remainder = ctx.accounts.vault_usdg_ata.amount;

        // === EFFECTS ===
        let vault = &mut ctx.accounts.vault;
        vault.closed = true;

        // === INTERACTIONS ===
        let vault_seeds = &[b"redemption".as_ref(), vault_seed.as_ref(), &[vault_bump]];
        let signer_seeds = &[&vault_seeds[..]];

        // 1) If any USDG remains, transfer it to the authority (zero-remainder is allowed —
        //    we still want to recover the ATA rent).
        if remainder > 0 {
            let transfer_accounts = TransferChecked {
                from: ctx.accounts.vault_usdg_ata.to_account_info(),
                to: ctx.accounts.authority_usdg_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.usdg_mint.to_account_info(),
            };
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.usdg_token_program.to_account_info(),
                    transfer_accounts,
                    signer_seeds,
                ),
                remainder,
                usdg_decimals,
            )?;
        }

        // 2) Close the vault USDG ATA — refund its SOL rent to the authority.
        let close_accounts = CloseAccount {
            account: ctx.accounts.vault_usdg_ata.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        token_interface::close_account(CpiContext::new_with_signer(
            ctx.accounts.usdg_token_program.to_account_info(),
            close_accounts,
            signer_seeds,
        ))?;

        // The vault account itself is closed by Anchor via `close = authority` on the struct.

        emit!(RemainderReclaimed {
            vault: vault_key,
            authority: ctx.accounts.authority.key(),
            amount: remainder,
        });

        Ok(())
    }
}

// ============== Accounts ==============

#[account]
pub struct RedemptionVault {
    pub authority: Pubkey,            // admin who initialized + can reclaim
    pub idea_id: String,              // ≤ 64 chars, display only
    pub vault_seed: [u8; 32],         // SHA256(idea_id), used as PDA seed
    pub bump: u8,
    pub token_mint: Pubkey,           // loser Ideacoin
    pub usdg_mint: Pubkey,
    pub vault_usdg_ata: Pubkey,
    pub rate_num: u64,                // usdg_out = floor(tokens_in * rate_num / rate_den)
    pub rate_den: u64,
    pub total_usdg_deposited: u64,
    pub total_usdg_claimed: u64,
    pub total_tokens_burned: u64,
    pub created_at: i64,
    pub deadline: i64,
    pub closed: bool,
}

impl RedemptionVault {
    // discriminator(8) + authority(32) + (4 + 64 idea_id) + vault_seed(32) + bump(1)
    // + token_mint(32) + usdg_mint(32) + vault_usdg_ata(32)
    // + rate_num(8) + rate_den(8) + 3×u64(24) + 2×i64(16) + closed(1)
    pub const SPACE: usize = 8 + 32 + (4 + 64) + 32 + 1 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1;
}

// ============== Events ==============

#[event]
pub struct RedemptionInitialized {
    pub vault: Pubkey,
    pub idea_id: String,
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub usdg_mint: Pubkey,
    pub rate_num: u64,
    pub rate_den: u64,
    pub deposit_amount: u64,
    pub deadline: i64,
}

#[event]
pub struct UserRedeemed {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub tokens_burned: u64,
    pub usdg_out: u64,
    pub total_tokens_burned: u64,
    pub total_usdg_claimed: u64,
}

#[event]
pub struct RemainderReclaimed {
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
}

// ============== Errors ==============

#[error_code]
pub enum ErrorCode {
    #[msg("Idea id cannot be empty")]
    IdeaIdEmpty,
    #[msg("Idea id must be 64 characters or less")]
    IdeaIdTooLong,
    #[msg("Vault seed must be SHA256(idea_id)")]
    InvalidVaultSeed,
    #[msg("Rate numerator and denominator must be > 0")]
    InvalidRate,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Payout rounds to zero — increase amount redeemed")]
    PayoutTooSmall,
    #[msg("Vault USDG balance is insufficient for this redemption")]
    InsufficientVaultBalance,
    #[msg("Unauthorized USDG mint")]
    UnauthorizedMint,
    #[msg("Vault is closed")]
    VaultClosed,
    #[msg("Redemption deadline has passed")]
    DeadlinePassed,
    #[msg("Redemption deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Nothing to reclaim — vault is empty")]
    NothingToReclaim,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Signer is not authorized to perform this action")]
    Unauthorized,
}

// ============== InitializeAndDeposit ==============

#[derive(Accounts)]
#[instruction(idea_id: String, vault_seed: [u8; 32])]
pub struct InitializeAndDeposit<'info> {
    /// Only the hard-coded INITIAL_ADMIN can create vaults.
    /// Prevents third parties from squatting a PDA with bogus rate/deposit params.
    #[account(
        mut,
        constraint = authority.key() == INITIAL_ADMIN @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// One vault per idea_id. Seed = SHA256(idea_id) to stay within Solana's 32-byte limit.
    #[account(
        init,
        payer = authority,
        space = RedemptionVault::SPACE,
        seeds = [b"redemption", vault_seed.as_ref()],
        bump
    )]
    pub vault: Account<'info, RedemptionVault>,

    /// The loser Ideacoin mint. Decimals are read for event logging; the burn itself
    /// is checked against this mint.
    pub token_mint: InterfaceAccount<'info, Mint>,

    /// USDG mint used as the payout token.
    pub usdg_mint: InterfaceAccount<'info, Mint>,

    /// Authority's USDG source account — the pot is pulled from here.
    #[account(
        mut,
        associated_token::mint = usdg_mint,
        associated_token::authority = authority,
        associated_token::token_program = usdg_token_program
    )]
    pub authority_usdg_account: InterfaceAccount<'info, TokenAccount>,

    /// Vault's USDG ATA. Authority is the vault PDA so the program can sign transfers.
    #[account(
        init,
        payer = authority,
        associated_token::mint = usdg_mint,
        associated_token::authority = vault,
        associated_token::token_program = usdg_token_program
    )]
    pub vault_usdg_ata: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub usdg_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

// ============== Redeem ==============

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"redemption", vault.vault_seed.as_ref()],
        bump = vault.bump,
        constraint = vault.token_mint == token_mint.key() @ ErrorCode::UnauthorizedMint,
        constraint = vault.usdg_mint == usdg_mint.key() @ ErrorCode::UnauthorizedMint,
        constraint = vault.vault_usdg_ata == vault_usdg_ata.key() @ ErrorCode::UnauthorizedMint,
    )]
    pub vault: Account<'info, RedemptionVault>,

    /// Loser Ideacoin mint — MUST be writable because `burn` decreases the mint's supply.
    #[account(mut)]
    pub token_mint: InterfaceAccount<'info, Mint>,
    pub usdg_mint: InterfaceAccount<'info, Mint>,

    /// User's loser-token account — tokens are burned from here.
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    /// User's USDG destination account — created if it doesn't exist.
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = usdg_mint,
        associated_token::authority = user,
        associated_token::token_program = usdg_token_program
    )]
    pub user_usdg_account: InterfaceAccount<'info, TokenAccount>,

    /// Vault's USDG ATA (source for the payout).
    #[account(
        mut,
        associated_token::mint = usdg_mint,
        associated_token::authority = vault,
        associated_token::token_program = usdg_token_program
    )]
    pub vault_usdg_ata: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    /// Token program for the loser Ideacoin (may be Token or Token-2022).
    pub token_program: Interface<'info, TokenInterface>,
    /// Token program for USDG (mainnet USDG is classic SPL Token).
    pub usdg_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

// ============== ReclaimRemainder ==============

#[derive(Accounts)]
pub struct ReclaimRemainder<'info> {
    #[account(
        mut,
        constraint = authority.key() == vault.authority @ ErrorCode::Unauthorized
    )]
    pub authority: Signer<'info>,

    /// Closed at the end of the ix — rent refunded to `authority`.
    #[account(
        mut,
        seeds = [b"redemption", vault.vault_seed.as_ref()],
        bump = vault.bump,
        constraint = vault.usdg_mint == usdg_mint.key() @ ErrorCode::UnauthorizedMint,
        constraint = vault.vault_usdg_ata == vault_usdg_ata.key() @ ErrorCode::UnauthorizedMint,
        close = authority,
    )]
    pub vault: Account<'info, RedemptionVault>,

    pub usdg_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = usdg_mint,
        associated_token::authority = vault,
        associated_token::token_program = usdg_token_program
    )]
    pub vault_usdg_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdg_mint,
        associated_token::authority = authority,
        associated_token::token_program = usdg_token_program
    )]
    pub authority_usdg_account: InterfaceAccount<'info, TokenAccount>,

    pub usdg_token_program: Interface<'info, TokenInterface>,
}
