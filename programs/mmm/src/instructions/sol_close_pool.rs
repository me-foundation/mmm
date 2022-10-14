use anchor_lang::prelude::*;

use crate::{errors::MMMErrorCode, state::Pool};

#[derive(Accounts)]
pub struct SolClosePool<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub cosigner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_ref()],
        constraint = pool.payment_mint.eq(&Pubkey::default()) @ MMMErrorCode::InvalidPaymentMint,
        constraint = pool.sellside_orders_count == 0 @ MMMErrorCode::NotEmptySellSideOrdersCount,
        bump,
        has_one = owner @ MMMErrorCode::InvalidOwner,
        has_one = cosigner @ MMMErrorCode::InvalidCosigner,
        close = owner
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: it's a pda, and the private key is owned by the seeds
    #[account(
        seeds = [b"mmm_buyside_sol_escrow_account", pool.key().as_ref()],
        constraint = buyside_sol_escrow_account.lamports() == 0 @ MMMErrorCode::NotEmptyEscrowAccount,
        bump,
    )]
    pub buyside_sol_escrow_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<SolClosePool>) -> Result<()> {
    Ok(())
}
