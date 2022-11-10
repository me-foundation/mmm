use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{constants::*, errors::MMMErrorCode, state::Pool, util::log_pool};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SolDepositBuyArgs {
    payment_amount: u64,
}

// This is targeting the deposit of native payment_mint: SOL
#[derive(Accounts)]
#[instruction(args:SolDepositBuyArgs)]
pub struct SolDepositBuy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub cosigner: Signer<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
        has_one = owner @ MMMErrorCode::InvalidOwner,
        has_one = cosigner @ MMMErrorCode::InvalidCosigner,
        constraint = pool.payment_mint.eq(&Pubkey::default()) @ MMMErrorCode::InvalidPaymentMint,
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: it's a pda, and the private key is owned by the seeds
    #[account(
        mut,
        seeds = [BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(), pool.key().as_ref()],
        bump,
    )]
    pub buyside_sol_escrow_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SolDepositBuy>, args: SolDepositBuyArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let system_program = &ctx.accounts.system_program;
    let pool = &mut ctx.accounts.pool;

    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            owner.key,
            buyside_sol_escrow_account.key,
            args.payment_amount,
        ),
        &[
            owner.to_account_info(),
            buyside_sol_escrow_account.to_account_info(),
            system_program.to_account_info(),
        ],
    )?;

    pool.buyside_payment_amount = buyside_sol_escrow_account.lamports();
    log_pool("post_sol_deposit_buy", pool)?;
    Ok(())
}
