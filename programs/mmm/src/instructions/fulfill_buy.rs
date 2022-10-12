use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    state::Pool,
    util::{check_allowlists_for_mint, check_cosigner},
    errors::MMMErrorCode,
};

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
    pub payer: Signer<'info>,
    /// CHECK: we will check the owner field that matches the pool owner
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,
    /// CHECK: we will check cosigner when cosign field is on
    pub cosigner: UncheckedAccount<'info>,
    #[account(
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_ref()],
        has_one = owner,
        constraint = pool.payment_mint.eq(&Pubkey::default()) @ MMMErrorCode::InvalidPaymentMint,
        bump
    )]
    pub pool: Account<'info, Pool>,
    /// CHECK: it's a pda, and the private key is owned by the seeds
    #[account(
        mut,
        seeds = [b"mmm_buyside_sol_escrow_account", pool.key().as_ref()],
        bump,
    )]
    pub buyside_sol_escrow_account: AccountInfo<'info>,
    /// CHECK: we will check the metadata in check_allowlists_for_mint()
    pub asset_metadata: AccountInfo<'info>,
    pub asset_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = payer,
    )]
    pub asset_token_account: Account<'info, TokenAccount>,
    // pub asset_metadata: Account<'info, Token>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = pool,
    )]
    pub sellside_escrow_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<FulfillBuy>, args: FulfillBuyArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let token_program = &ctx.accounts.token_program;
    let system_program = &ctx.accounts.system_program;
    let cosigner = &ctx.accounts.cosigner;
    let pool = &mut ctx.accounts.pool;

    let payer = &ctx.accounts.payer;
    let payer_asset_token_account = &ctx.accounts.asset_token_account;
    let payer_asset_mint = &ctx.accounts.asset_mint;
    let payer_asset_metadata = &ctx.accounts.asset_metadata;

    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;

    check_cosigner(pool, cosigner)?;
    check_allowlists_for_mint(&pool.allowlists, payer_asset_mint, payer_asset_metadata)?;

    // TODO: need to check a few things before exchange
    // 1. check if we need to pay the lp fee
    // 2. check how much we need to pay according to the curve
    // 3. check if calculation out of bound
    let payment_amount = pool.spot_price.checked_mul(args.asset_amount).unwrap();

    anchor_spl::token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: payer_asset_token_account.to_account_info(),
                to: sellside_escrow_token_account.to_account_info(),
                authority: owner.to_account_info(),
            },
        ),
        args.asset_amount,
    )?;

    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::transfer(
            buyside_sol_escrow_account.key,
            payer.key,
            payment_amount,
        ),
        &[
            buyside_sol_escrow_account.to_account_info(),
            payer.to_account_info(),
            system_program.to_account_info(),
        ],
        // seeds should be the PDA of 'buyside_sol_escrow_account'
        &[&[
            b"mmm_buyside_sol_escrow_account",
            pool.key().as_ref(),
            &[*ctx.bumps.get("buyside_sol_escrow_account").unwrap()],
        ]],
    )?;

    // TODO:
    // 1. pay the lp fee
    // 2. log the lp_fee_earned

    pool.sellside_orders_count += args.asset_amount;
    Ok(())
}
