use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{
    constants::*,
    errors::MMMErrorCode,
    state::{Allowlist, Pool},
    util::*,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreatePoolArgs {
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

    // immutable
    pub uuid: Pubkey, // randomly generated keypair
    pub payment_mint: Pubkey,
    pub allowlists: [Allowlist; ALLOWLIST_MAX_LEN],
}

#[derive(Accounts)]
#[instruction(args:CreatePoolArgs)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: the cosigner can be set as owner if you want optional cosigner
    pub cosigner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), args.uuid.as_ref()],
        bump,
        space = Pool::LEN,
        constraint = args.lp_fee_bp <= MAX_LP_FEE_BP @ MMMErrorCode::InvalidBP,
        constraint = args.buyside_creator_royalty_bp <= 10000 @ MMMErrorCode::InvalidBP,
        constraint = args.spot_price > 0 @ MMMErrorCode::InvalidSpotPrice,
        constraint = pool.payment_mint.eq(&Pubkey::default()) @ MMMErrorCode::InvalidPaymentMint, // remove this when we have spl token support
        constraint = args.referral.ne(owner.key) @ MMMErrorCode::InvalidReferral,
    )]
    pub pool: Box<Account<'info, Pool>>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreatePool>, args: CreatePoolArgs) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let owner = &ctx.accounts.owner;
    let cosigner = &ctx.accounts.cosigner;

    check_allowlists(&args.allowlists)?;
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

    // state variables
    pool.sellside_asset_amount = 0; // always equal to the number of NFTs in the pool
    pool.buyside_payment_amount = 0;
    pool.lp_fee_earned = 0;

    // immutable
    pool.owner = owner.key();
    pool.cosigner = cosigner.key();
    pool.uuid = args.uuid;
    pool.payment_mint = args.payment_mint;
    pool.allowlists = args.allowlists;

    log_pool("post_create_pool", pool)?;

    Ok(())
}
