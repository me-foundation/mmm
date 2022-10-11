use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::state::Pool;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ChangeLPFeeArgs{
    lp_fee_bp: u16
}

#[derive(Accounts)]
#[instruction(args:ChangeLPFeeArgs)]
pub struct ChangeLPFee<'info> {
    #[account(mut)]
    owner: Signer<'info>,
    /// CHECK: we will check cosigner when cosign field is on
    cosigner: UncheckedAccount<'info>,
    #[account(
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_bytes()],
        bump
    )]
    pool: Account<'info, Pool>,
}
