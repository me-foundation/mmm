use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{constants::*, errors::MMMErrorCode, state::Pool, util::*};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdatePoolArgs {
    // mutable
    pub spot_price: u64,
    pub curve_type: u8,
    pub curve_delta: u64,
    pub reinvest_fulfill_buy: bool,
    pub reinvest_fulfill_sell: bool,
    pub expiry: i64,
    pub lp_fee_bp: u16,
    pub referral: Pubkey,
    pub cosigner_annotation: [u8; 32],
    pub buyside_creator_royalty_bp: u16,
}

#[derive(Accounts)]
#[instruction(args:UpdatePoolArgs)]
pub struct UpdatePool<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub cosigner: Signer<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
        bump,
        has_one = owner @ MMMErrorCode::InvalidOwner,
        has_one = cosigner @ MMMErrorCode::InvalidCosigner,
        constraint = args.lp_fee_bp <= MAX_LP_FEE_BP @ MMMErrorCode::InvalidBP,
        constraint = args.buyside_creator_royalty_bp <= 10000 @ MMMErrorCode::InvalidBP,
        constraint = args.spot_price > 0 @ MMMErrorCode::InvalidSpotPrice,
        constraint = args.referral.ne(owner.key) @ MMMErrorCode::InvalidReferral,
    )]
    pub pool: Box<Account<'info, Pool>>,
}

pub fn handler(ctx: Context<UpdatePool>, args: UpdatePoolArgs) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    check_curve(args.curve_type, args.curve_delta)?;

    // mutable
    pool.spot_price = args.spot_price;
    pool.curve_type = args.curve_type;
    pool.curve_delta = args.curve_delta;
    pool.reinvest_fulfill_buy = args.reinvest_fulfill_buy;
    pool.reinvest_fulfill_sell = args.reinvest_fulfill_sell;
    pool.expiry = args.expiry;
    pool.lp_fee_bp = args.lp_fee_bp;
    pool.referral = args.referral;
    pool.cosigner_annotation = args.cosigner_annotation;
    pool.buyside_creator_royalty_bp = args.buyside_creator_royalty_bp;
    log_pool("post_update_pool", pool)?;

    Ok(())
}
