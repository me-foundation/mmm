use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    errors::MMMErrorCode,
    state::Pool,
    util::{check_allowlists_for_mint, check_cosigner, get_sol_lp_fee, get_sol_total_price},
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
        has_one = owner @ MMMErrorCode::InvalidOwner,
        constraint = pool.payment_mint.eq(&Pubkey::default()) @ MMMErrorCode::InvalidPaymentMint,
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: it's a pda, and the private key is owned by the seeds
    #[account(
        mut,
        seeds = [b"mmm_buyside_sol_escrow_account", pool.key().as_ref()],
        bump,
    )]
    pub buyside_sol_escrow_account: AccountInfo<'info>,
    /// CHECK: we will check the metadata in check_allowlists_for_mint()
    pub asset_metadata: UncheckedAccount<'info>,
    /// CHECK: check_allowlists_for_mint
    pub asset_mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = payer,
    )]
    pub payer_asset_account: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = pool,
    )]
    pub sellside_escrow_token_account: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<FulfillBuy>, args: FulfillBuyArgs) -> Result<()> {
    let token_program = &ctx.accounts.token_program;
    let system_program = &ctx.accounts.system_program;
    let cosigner = &ctx.accounts.cosigner;
    let pool = &mut ctx.accounts.pool;
    let owner = &ctx.accounts.owner;
    let owner_token_account = &ctx.accounts.owner_token_account;

    let payer = &ctx.accounts.payer;
    let payer_asset_account = &ctx.accounts.payer_asset_account;
    let payer_asset_mint = &ctx.accounts.asset_mint;
    let payer_asset_metadata = &ctx.accounts.asset_metadata;

    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;

    check_cosigner(pool, cosigner)?;
    check_allowlists_for_mint(&pool.allowlists, payer_asset_mint, payer_asset_metadata)?;

    let total_price = get_sol_total_price(pool, args.asset_amount, true)?;
    if total_price < args.min_payment_amount {
        return Err(MMMErrorCode::InvalidRequestedPrice.into());
    }
    let lp_fee = get_sol_lp_fee(pool, buyside_sol_escrow_account.lamports(), total_price)?;

    let transfer_asset_to = if pool.reinvest {
        sellside_escrow_token_account.to_account_info()
    } else {
        owner_token_account.to_account_info()
    };

    anchor_spl::token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: payer_asset_account.to_account_info(),
                to: transfer_asset_to,
                authority: payer.to_account_info(),
            },
        ),
        args.asset_amount,
    )?;

    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::transfer(
            buyside_sol_escrow_account.key,
            payer.key,
            total_price
                .checked_sub(lp_fee)
                .ok_or(MMMErrorCode::NumericOverflow)?,
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

    if lp_fee > 0 {
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                buyside_sol_escrow_account.key,
                owner.key,
                lp_fee,
            ),
            &[
                buyside_sol_escrow_account.to_account_info(),
                owner.to_account_info(),
                system_program.to_account_info(),
            ],
            // seeds should be the PDA of 'buyside_sol_escrow_account'
            &[&[
                b"mmm_buyside_sol_escrow_account",
                pool.key().as_ref(),
                &[*ctx.bumps.get("buyside_sol_escrow_account").unwrap()],
            ]],
        )?;
    }

    pool.sellside_orders_count += args.asset_amount;
    pool.lp_fee_earned += lp_fee;

    Ok(())
}
