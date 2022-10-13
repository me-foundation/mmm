use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{
    errors::MMMErrorCode,
    state::{Allowlist, Pool, ALLOWLIST_MAX_LEN},
    util::*,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreatePoolArgs {
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

    // immutable
    pub owner: Pubkey,
    pub cosigner: Pubkey,
    pub uuid: Pubkey, // randomly generated keypair
    pub payment_mint: Pubkey,
    pub allowlists: [Allowlist; ALLOWLIST_MAX_LEN],
}

#[derive(Accounts)]
#[instruction(args:CreatePoolArgs)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: we will check cosigner when cosign field is on
    pub cosigner: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        seeds = [b"mmm_pool", owner.key().as_ref(), args.uuid.as_ref()],
        bump,
        space = Pool::LEN,
        constraint = args.lp_fee_bp <= 10000 @ MMMErrorCode::InvalidLPFeeBP,
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
    pool.reinvest = args.reinvest;
    pool.expiry = args.expiry;
    pool.lp_fee_bp = args.lp_fee_bp;
    pool.referral = args.referral;
    pool.referral_bp = args.referral_bp;
    pool.cosigner_annotation = args.cosigner_annotation;

    // state variables
    pool.sellside_orders_count = 0;
    pool.lp_fee_earned = 0;

    // immutable
    pool.owner = owner.key();
    pool.cosigner = args.cosigner;
    pool.uuid = args.uuid;
    pool.payment_mint = args.payment_mint;
    pool.allowlists = args.allowlists;

    check_cosigner(pool, cosigner)?;
    Ok(())
}
