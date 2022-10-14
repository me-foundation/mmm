use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    constants::*,
    errors::MMMErrorCode,
    state::Pool,
    util::{
        check_allowlists_for_mint, get_sol_lp_fee, get_sol_referral_fee,
        get_sol_total_price_and_next_price,
    },
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SolFulfillSellArgs {
    asset_amount: u64,
    max_payment_amount: u64,
}

// FulfillSell means a buyer wants to buy NFT/SFT from the pool
// where the pool has some sellside asset liquidity. Therefore,
// the buyer expects to pay a max_payment_amount for the asset_amount
// that the buyer wants to buy.
#[derive(Accounts)]
#[instruction(args:SolFulfillSellArgs)]
pub struct SolFulfillSell<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: we will check the owner field that matches the pool owner
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,
    #[account(mut)]
    pub cosigner: Signer<'info>,
    /// CHECK: we will check that the referral matches the pool's referral
    pub referral: UncheckedAccount<'info>,
    #[account(
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_ref()],
        has_one = owner @ MMMErrorCode::InvalidOwner,
        has_one = referral @ MMMErrorCode::InvalidReferral,
        has_one = cosigner @ MMMErrorCode::InvalidCosigner,
        constraint = pool.payment_mint.eq(&Pubkey::default()) @ MMMErrorCode::InvalidPaymentMint,
        constraint = pool.expiry == 0 || pool.expiry > Clock::get().unwrap().unix_timestamp @ MMMErrorCode::Expired,
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: it's a pda, and the private key is owned by the seeds
    #[account(
        mut,
        seeds = [BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(), pool.key().as_ref()],
        bump,
    )]
    pub buyside_sol_escrow_account: AccountInfo<'info>,
    /// CHECK: we will check the metadata in check_allowlists_for_mint()
    pub asset_metadata: UncheckedAccount<'info>,
    /// CHECK: we will check the master_edtion in check_allowlists_for_mint()
    pub asset_master_edition: UncheckedAccount<'info>,
    /// CHECK: check_allowlists_for_mint
    pub asset_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = pool,
    )]
    pub sellside_escrow_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = payer,
    )]
    pub payer_asset_account: Box<Account<'info, TokenAccount>>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<SolFulfillSell>, args: SolFulfillSellArgs) -> Result<()> {
    let token_program = &ctx.accounts.token_program;
    let system_program = &ctx.accounts.system_program;
    let pool = &mut ctx.accounts.pool;
    let owner = &ctx.accounts.owner;
    let referral = &ctx.accounts.referral;

    let payer = &ctx.accounts.payer;
    let payer_asset_account = &ctx.accounts.payer_asset_account;
    let asset_mint = &ctx.accounts.asset_mint;
    let payer_asset_metadata = &ctx.accounts.asset_metadata;
    let asset_master_edition = &ctx.accounts.asset_master_edition;

    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;

    check_allowlists_for_mint(
        &pool.allowlists,
        asset_mint,
        payer_asset_metadata,
        asset_master_edition,
    )?;

    let (total_price, next_price) =
        get_sol_total_price_and_next_price(pool, args.asset_amount, false)?;
    if total_price > args.max_payment_amount {
        return Err(MMMErrorCode::InvalidRequestedPrice.into());
    }
    let lp_fee = get_sol_lp_fee(pool, buyside_sol_escrow_account.lamports(), total_price)?;
    let referral_fee = get_sol_referral_fee(pool, total_price)?;

    let transfer_sol_to = if pool.reinvest {
        buyside_sol_escrow_account.to_account_info()
    } else {
        owner.to_account_info()
    };

    // TODO: make sure that the lp fee is paid with the correct amount
    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            payer.key,
            transfer_sol_to.key,
            total_price,
        ),
        &[
            payer.to_account_info(),
            transfer_sol_to,
            system_program.to_account_info(),
        ],
    )?;

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: sellside_escrow_token_account.to_account_info(),
                to: payer_asset_account.to_account_info(),
                authority: pool.to_account_info(),
            },
            // seeds should be the PDA of 'pool'
            &[&[
                b"mmm_pool",
                owner.key().as_ref(),
                pool.uuid.key().as_ref(),
                &[*ctx.bumps.get("pool").unwrap()],
            ]],
        ),
        args.asset_amount,
    )?;
    // we can close the sellside_escrow_token_account if no amount left
    if sellside_escrow_token_account.amount == args.asset_amount {
        anchor_spl::token::close_account(CpiContext::new_with_signer(
            token_program.to_account_info(),
            anchor_spl::token::CloseAccount {
                account: sellside_escrow_token_account.to_account_info(),
                destination: owner.to_account_info(),
                authority: pool.to_account_info(),
            },
            // seeds should be the PDA of 'pool'
            &[&[
                b"mmm_pool",
                owner.key().as_ref(),
                pool.uuid.key().as_ref(),
                &[*ctx.bumps.get("pool").unwrap()],
            ]],
        ))?;
    }

    if lp_fee > 0 {
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                payer.key, owner.key, lp_fee,
            ),
            &[
                payer.to_account_info(),
                owner.to_account_info(),
                system_program.to_account_info(),
            ],
        )?;
    }

    if referral_fee > 0 {
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                payer.key,
                referral.key,
                referral_fee,
            ),
            &[
                payer.to_account_info(),
                referral.to_account_info(),
                system_program.to_account_info(),
            ],
        )?;
    }

    pool.spot_price = next_price;
    pool.sellside_orders_count = pool
        .sellside_orders_count
        .checked_sub(args.asset_amount)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    pool.lp_fee_earned += lp_fee;

    msg!(
        "SELL {} of {} to {} for {} lamports",
        args.asset_amount,
        asset_mint.key(),
        payer.key(),
        total_price
    );

    Ok(())
}
