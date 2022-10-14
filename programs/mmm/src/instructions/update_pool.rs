use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{errors::MMMErrorCode, state::Pool, util::*};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdatePoolArgs {
    // mutable
    pub spot_price: u64,
    pub curve_type: u8,
    pub curve_delta: u64,
    pub reinvest: bool,
    pub expiry: i64,
    pub lp_fee_bp: u16,
    pub referral: Pubkey,
    pub referral_bp: u16,
    pub cosigner_annotation: [u8; 32],
}

#[derive(Accounts)]
#[instruction(args:UpdatePoolArgs)]
pub struct UpdatePool<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub cosigner: Signer<'info>,
    #[account(
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_ref()],
        bump,
        has_one = owner @ MMMErrorCode::InvalidOwner,
        constraint = args.lp_fee_bp <= 10000 @ MMMErrorCode::InvalidLPFeeBP,
    )]
    pub pool: Box<Account<'info, Pool>>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdatePool>, args: UpdatePoolArgs) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    check_curve(args.curve_type, args.curve_delta)?;

    // mutable
    pool.spot_price = args.spot_price;
    pool.curve_type = args.curve_type;
    pool.curve_delta = args.curve_delta;
    pool.reinvest = args.reinvest;
    pool.expiry = args.expiry;
    pool.lp_fee_bp = args.lp_fee_bp;
    pool.referral = args.referral;
    pool.referral_bp = args.referral_bp;
    pool.cosigner_annotation = args.cosigner_annotation;

    Ok(())
}
