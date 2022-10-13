use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{
    errors::MMMErrorCode,
    state::{Allowlist, Pool},
    util::*,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreatePoolArgs {
    pub spot_price: u64,
    pub curve_type: u8,
    pub curve_delta: u64,
    pub reinvest: bool,
    pub expiry: i64,
    pub lp_fee_bp: u16,

    pub cosigner: Pubkey,
    pub uuid: Pubkey, // randomly generated keypair
    pub payment_mint: Pubkey,
    pub maker_referral: Pubkey,
    pub allowlists: Vec<Allowlist>,
}

#[derive(Accounts)]
#[instruction(args:CreatePoolArgs)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        seeds = [b"mmm_pool", owner.key().as_ref(), args.uuid.as_ref()],
        bump,
        space = Pool::LEN,
        constraint = args.lp_fee_bp <= 10000 @ MMMErrorCode::InvalidLPFeeBP,
    )]
    pub pool: Account<'info, Pool>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreatePool>, args: CreatePoolArgs) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let owner = &ctx.accounts.owner;

    check_allowlists(&args.allowlists)?;
    check_curve(args.curve_type, args.curve_delta)?;

    pool.owner = owner.key();
    pool.sellside_orders_count = 0;
    pool.spot_price = args.spot_price;
    pool.curve_type = args.curve_type;
    pool.curve_delta = args.curve_delta;
    pool.reinvest = args.reinvest;
    pool.expiry = args.expiry;
    pool.lp_fee_bp = args.lp_fee_bp;

    pool.cosigner = args.cosigner;
    pool.uuid = args.uuid;
    pool.payment_mint = args.payment_mint;
    pool.maker_referral = args.maker_referral;
    pool.allowlists = args.allowlists;

    Ok(())
}