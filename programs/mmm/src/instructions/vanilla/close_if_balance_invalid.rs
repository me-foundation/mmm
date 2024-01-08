use anchor_lang::prelude::*;

use crate::{
    constants::{BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX, CANCEL_AUTHORITY, POOL_PREFIX},
    errors::MMMErrorCode,
    state::Pool,
    util::{try_close_escrow, try_close_pool},
};

#[derive(Accounts)]
pub struct CloseIfBalanceInvalid<'info> {
    #[account(address = CANCEL_AUTHORITY)]
    pub authority: Signer<'info>,
    /// CHECK: checked in pool owner constraint
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
        has_one = owner @ MMMErrorCode::InvalidOwner,
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

pub fn handler(ctx: Context<CloseIfBalanceInvalid>) -> Result<()> {
    // automatically close pools that have low escrow balance and no way of increase escrow balance
    let pool_key = ctx.accounts.pool.key();
    let buyside_sol_escrow_account_seeds: &[&[&[u8]]] = &[&[
        BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(),
        pool_key.as_ref(),
        &[ctx.bumps.buyside_sol_escrow_account],
    ]];
    try_close_escrow(
        &ctx.accounts.buyside_sol_escrow_account,
        &ctx.accounts.pool,
        &ctx.accounts.system_program,
        buyside_sol_escrow_account_seeds,
    )?;
    ctx.accounts.pool.buyside_payment_amount = ctx.accounts.buyside_sol_escrow_account.lamports();
    try_close_pool(&ctx.accounts.pool, ctx.accounts.owner.to_account_info())
}
