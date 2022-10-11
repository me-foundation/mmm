use anchor_lang::prelude::*;

use crate::{constants::*, errors::MMMErrorCode, state::Pool};

#[derive(Accounts)]
pub struct SolClosePool<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub cosigner: Signer<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
        constraint = pool.payment_mint.eq(&Pubkey::default()) @ MMMErrorCode::InvalidPaymentMint,
        constraint = pool.sellside_asset_amount == 0 @ MMMErrorCode::NotEmptySellsideAssetAmount,
        bump,
        has_one = owner @ MMMErrorCode::InvalidOwner,
        has_one = cosigner @ MMMErrorCode::InvalidCosigner,
        close = owner
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: it's a pda, and the private key is owned by the seeds
    #[account(
        seeds = [BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(), pool.key().as_ref()],
        constraint = buyside_sol_escrow_account.lamports() == 0 @ MMMErrorCode::NotEmptyEscrowAccount,
        bump,
    )]
    pub buyside_sol_escrow_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<SolClosePool>) -> Result<()> {
    Ok(())
}
