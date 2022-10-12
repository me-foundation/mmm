use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::state::Pool;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct FulfillBuyArgs {
    asset_amount: u64,
    min_payment_amount: u64,
}

// FulfillBuy means a seller wants to sell NFT/SFT into the pool
// where the pool has some buyside payment liquidity. Therefore,
// the seller expects a min_payment_amount for the asset_amount that
// the seller wants to sell.
#[derive(Accounts)]
#[instruction(args:FulfillBuyArgs)]
pub struct FulfillBuy<'info> {
    #[account(mut)]
    owner: Signer<'info>,
    /// CHECK: we will check cosigner when cosign field is on
    cosigner: UncheckedAccount<'info>,
    #[account(
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_ref()],
        bump
    )]
    pool: Account<'info, Pool>,
    system_program: Program<'info, System>,
}
