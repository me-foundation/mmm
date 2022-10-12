use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::state::Pool;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ChangeCurveArgs {
    curve_type: u8,
    curve_delta: u64,
}

#[derive(Accounts)]
#[instruction(args:ChangeCurveArgs)]
pub struct ChangeCurve<'info> {
    #[account(mut)]
    owner: Signer<'info>,
    /// CHECK: we will check cosigner when cosign field is on
    cosigner: UncheckedAccount<'info>,
    #[account(
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_ref()],
        bump
    )]
    pool: Account<'info, Pool>,
}
