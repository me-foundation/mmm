use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{
    errors::MMMErrorCode,
    state::{AllowList, Pool, ALLOWLIST_MAX_LEN},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreatePoolArgs {
    pub spot_price: u64,
    pub curve_type: u8,
    pub curve_delta: u64,
    pub reinvest: bool,

    pub cosigner: Pubkey,
    pub uuid: Pubkey, // randomly generated keypair
    pub payment_mint: Pubkey,
    pub maker_referral: Pubkey,
    pub lp_fee_bp: u16,
    pub allowlists: Vec<AllowList>,
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
    pool.cosigner = args.cosigner;
    pool.uuid = args.uuid;
    pool.payment_mint = args.payment_mint;
    pool.maker_referral = args.maker_referral;
    pool.lp_fee_bp = args.lp_fee_bp;
    pool.allowlists = args.allowlists;

    Ok(())
}

fn check_allowlists(allowlists: &Vec<AllowList>) -> Result<()> {
    if allowlists.len() > ALLOWLIST_MAX_LEN {
        msg!("InvalidAllowLists: more entries than allowed");
        return Err(MMMErrorCode::InvalidAllowLists.into());
    }

    if allowlists.len() == 0 {
        msg!("InvalidAllowLists: 0 entries");
        return Err(MMMErrorCode::InvalidAllowLists.into());
    }

    for allowlist in allowlists.iter() {
        if !allowlist.valid() {
            msg!("InvalidAllowLists: invalid entry");
            return Err(MMMErrorCode::InvalidAllowLists.into());
        }
    }

    Ok(())
}

fn check_curve(curve_type: u8, curve_delta: u64) -> Result<()> {
    // So far we only allow linear and exponential curves
    // 0: linear
    // 1: exp
    if curve_type > 1{
        return Err(MMMErrorCode::InvalidCurveType.into());
    }

    // If the curve type is exp, then the curve_delta should follow bp format,
    // which is less than 10000
    if curve_type == 1 && curve_delta > 10000 {
        return Err(MMMErrorCode::InvalidCurveDelta.into());
    }

    Ok(())
}