use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::state::Pool;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct FulfillSellArgs{
    asset_amount: u64,
    max_payment_amount: u64,
}

// FulfillSell means a buyer wants to buy NFT/SFT from the pool
// where the pool has some sellside asset liquidity. Therefore,
// the buyer expects to pay a max_payment_amount for the asset_amount
// that the buyer wants to buy.
#[derive(Accounts)]
#[instruction(args:FulfillSellArgs)]
pub struct FulfillSell<'info> {
    #[account(mut)]
    owner: Signer<'info>,
    /// CHECK: we will check cosigner when cosign field is on
    cosigner: UncheckedAccount<'info>,
    #[account(
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_bytes()],
        bump
    )]
    pool: Account<'info, Pool>,
    system_program: Program<'info, System>
}
