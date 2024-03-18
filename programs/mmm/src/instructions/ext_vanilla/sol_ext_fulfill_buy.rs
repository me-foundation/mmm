use anchor_lang::{prelude::*, AnchorDeserialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::close_account,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use solana_program::{program::invoke_signed, system_instruction};
use spl_token_2022::onchain::invoke_transfer_checked;
use std::convert::TryFrom;

use crate::{
    ata::init_if_needed_ata,
    constants::*,
    errors::MMMErrorCode,
    index_ra,
    instructions::{check_remaining_accounts_for_m2, log_pool, try_close_pool, withdraw_m2},
    state::{Pool, SellState},
    util::{
        assert_valid_fees_bp, check_allowlists_for_mint_ext, get_buyside_seller_receives,
        get_lp_fee_bp, get_sol_fee, get_sol_lp_fee, get_sol_total_price_and_next_price,
        try_close_escrow, try_close_sell_state,
    },
    SolFulfillBuyArgs,
};

// ExtSolFulfillBuy means a seller wants to sell NFT into the pool
// where the pool has some buyside payment liquidity. Therefore,
// the seller expects a min_payment_amount that goes back to the
// seller's wallet for the asset_amount that the seller wants to sell.
// This is mainly used for Token22 extension
#[derive(Accounts)]
#[instruction(args:SolFulfillBuyArgs)]
pub struct ExtSolFulfillBuy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: we will check the owner field that matches the pool owner
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,
    pub cosigner: Signer<'info>,
    #[account(mut)]
    /// CHECK: we will check that the referral matches the pool's referral
    pub referral: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
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
    pub buyside_sol_escrow_account: UncheckedAccount<'info>,
    #[account(
        mint::token_program = token_program,
        constraint = asset_mint.supply == 1 && asset_mint.decimals == 0 @ MMMErrorCode::InvalidTokenMint,
    )]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = payer,
        token::token_program = token_program,
    )]
    pub payer_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: check in init_if_needed_ata
    #[account(mut)]
    pub sellside_escrow_token_account: UncheckedAccount<'info>,
    /// CHECK: check in init_if_needed_ata
    #[account(mut)]
    pub owner_token_account: UncheckedAccount<'info>,
    /// CHECK: will be used for allowlist checks
    pub allowlist_aux_account: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        seeds = [
            SELL_STATE_PREFIX.as_bytes(),
            pool.key().as_ref(),
            asset_mint.key().as_ref(),
        ],
        space = SellState::LEN,
        bump
    )]
    pub sell_state: Account<'info, SellState>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
    // Remaining accounts
    // Branch: using shared escrow accounts
    //   0: m2_program
    //   1: shared_escrow_account
    //   2+: transfer hook accounts
    // Branch: not using shared escrow accounts
    //   0+: transfer hook accounts
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ExtSolFulfillBuy<'info>>,
    args: SolFulfillBuyArgs,
) -> Result<()> {
    let token_program = &ctx.accounts.token_program;
    let system_program = &ctx.accounts.system_program;
    let associated_token_program = &ctx.accounts.associated_token_program;
    let rent = &ctx.accounts.rent;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;
    let owner = &ctx.accounts.owner;
    let referral = &ctx.accounts.referral;
    let payer = &ctx.accounts.payer;
    let payer_asset_account = &ctx.accounts.payer_asset_account;
    let asset_mint = &ctx.accounts.asset_mint;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let pool_key = pool.key();
    let buyside_sol_escrow_account_seeds: &[&[&[u8]]] = &[&[
        BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(),
        pool_key.as_ref(),
        &[ctx.bumps.buyside_sol_escrow_account],
    ]];
    let remaining_accounts = ctx.remaining_accounts;

    check_allowlists_for_mint_ext(
        &pool.allowlists,
        &asset_mint.to_account_info(),
        args.allowlist_aux,
    )?;

    let (total_price, next_price) =
        get_sol_total_price_and_next_price(pool, args.asset_amount, true)?;
    let seller_receives = {
        let lp_fee_bp = get_lp_fee_bp(pool, buyside_sol_escrow_account.lamports());
        get_buyside_seller_receives(
            total_price,
            lp_fee_bp,
            0, // metadata_royalty_bp
            0, // buyside_creator_royalty_bp,
        )
    }?;

    assert_valid_fees_bp(args.maker_fee_bp, args.taker_fee_bp)?;
    let maker_fee = get_sol_fee(seller_receives, args.maker_fee_bp)?;
    let taker_fee = get_sol_fee(seller_receives, args.taker_fee_bp)?;
    let referral_fee = u64::try_from(
        maker_fee
            .checked_add(taker_fee)
            .ok_or(MMMErrorCode::NumericOverflow)?,
    )
    .map_err(|_| MMMErrorCode::NumericOverflow)?;

    let lp_fee = get_sol_lp_fee(pool, buyside_sol_escrow_account.lamports(), seller_receives)?;

    // withdraw sol from M2 first if shared escrow is enabled
    let remaining_account_without_m2 = if pool.using_shared_escrow() {
        check_remaining_accounts_for_m2(remaining_accounts, &pool.owner.key())?;

        let amount: u64 = (total_price as i64 + maker_fee) as u64;
        withdraw_m2(
            pool,
            ctx.bumps.pool,
            buyside_sol_escrow_account,
            index_ra!(remaining_accounts, 1),
            system_program,
            index_ra!(remaining_accounts, 0),
            pool.owner,
            amount,
        )?;
        pool.shared_escrow_count = pool
            .shared_escrow_count
            .checked_sub(args.asset_amount)
            .ok_or(MMMErrorCode::NumericOverflow)?;
        &remaining_accounts[2..]
    } else {
        remaining_accounts
    };

    if pool.reinvest_fulfill_buy {
        if pool.using_shared_escrow() {
            return Err(MMMErrorCode::InvalidAccountState.into());
        }
        let sellside_escrow_token_account =
            ctx.accounts.sellside_escrow_token_account.to_account_info();
        init_if_needed_ata(
            sellside_escrow_token_account.to_account_info(),
            payer.to_account_info(),
            pool.to_account_info(),
            asset_mint.to_account_info(),
            associated_token_program.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            rent.to_account_info(),
        )?;
        invoke_transfer_checked(
            token_program.key,
            payer_asset_account.to_account_info(),
            asset_mint.to_account_info(),
            sellside_escrow_token_account.to_account_info(),
            payer.to_account_info(),
            remaining_account_without_m2,
            args.asset_amount,
            0,   // decimals
            &[], // seeds
        )?;

        pool.sellside_asset_amount = pool
            .sellside_asset_amount
            .checked_add(args.asset_amount)
            .ok_or(MMMErrorCode::NumericOverflow)?;
        sell_state.pool = pool.key();
        sell_state.pool_owner = owner.key();
        sell_state.asset_mint = asset_mint.key();
        sell_state.cosigner_annotation = pool.cosigner_annotation;
        sell_state.asset_amount = sell_state
            .asset_amount
            .checked_add(args.asset_amount)
            .ok_or(MMMErrorCode::NumericOverflow)?;
    } else {
        let owner_token_account = ctx.accounts.owner_token_account.to_account_info();
        init_if_needed_ata(
            owner_token_account.to_account_info(),
            payer.to_account_info(),
            owner.to_account_info(),
            asset_mint.to_account_info(),
            associated_token_program.to_account_info(),
            token_program.to_account_info(),
            system_program.to_account_info(),
            rent.to_account_info(),
        )?;

        invoke_transfer_checked(
            token_program.key,
            payer_asset_account.to_account_info(),
            asset_mint.to_account_info(),
            owner_token_account.to_account_info(),
            payer.to_account_info(),
            remaining_account_without_m2,
            args.asset_amount,
            0,   // decimals
            &[], // seeds
        )?;
    }

    // we can close the payer_asset_account if no amount left
    if payer_asset_account.amount == args.asset_amount {
        close_account(CpiContext::new(
            token_program.to_account_info(),
            anchor_spl::token_2022::CloseAccount {
                account: payer_asset_account.to_account_info(),
                destination: payer.to_account_info(),
                authority: payer.to_account_info(),
            },
        ))?;
    }

    // prevent frontrun by pool config changes
    let payment_amount = total_price
        .checked_sub(lp_fee)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_sub(taker_fee as u64)
        .ok_or(MMMErrorCode::NumericOverflow)?;

    if payment_amount < args.min_payment_amount {
        return Err(MMMErrorCode::InvalidRequestedPrice.into());
    }

    invoke_signed(
        &system_instruction::transfer(buyside_sol_escrow_account.key, payer.key, payment_amount),
        &[
            buyside_sol_escrow_account.to_account_info(),
            payer.to_account_info(),
        ],
        buyside_sol_escrow_account_seeds,
    )?;

    if lp_fee > 0 {
        invoke_signed(
            &system_instruction::transfer(buyside_sol_escrow_account.key, owner.key, lp_fee),
            &[
                buyside_sol_escrow_account.to_account_info(),
                owner.to_account_info(),
            ],
            buyside_sol_escrow_account_seeds,
        )?;
    }
    if referral_fee > 0 {
        invoke_signed(
            &system_instruction::transfer(
                buyside_sol_escrow_account.key,
                referral.key,
                referral_fee,
            ),
            &[
                buyside_sol_escrow_account.to_account_info(),
                referral.to_account_info(),
            ],
            buyside_sol_escrow_account_seeds,
        )?;
    }

    pool.lp_fee_earned = pool
        .lp_fee_earned
        .checked_add(lp_fee)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    pool.spot_price = next_price;

    try_close_escrow(
        &buyside_sol_escrow_account.to_account_info(),
        pool,
        system_program,
        buyside_sol_escrow_account_seeds,
    )?;
    try_close_sell_state(sell_state, payer.to_account_info())?;

    // return the remaining per pool escrow balance to the shared escrow account
    if pool.using_shared_escrow() {
        let min_rent = Rent::get()?.minimum_balance(0);
        let shared_escrow_account = index_ra!(remaining_accounts, 1).to_account_info();
        if shared_escrow_account.lamports() + buyside_sol_escrow_account.lamports() > min_rent
            && buyside_sol_escrow_account.lamports() > 0
        {
            invoke_signed(
                &system_instruction::transfer(
                    buyside_sol_escrow_account.key,
                    shared_escrow_account.key,
                    buyside_sol_escrow_account.lamports(),
                ),
                &[
                    buyside_sol_escrow_account.to_account_info(),
                    shared_escrow_account,
                ],
                buyside_sol_escrow_account_seeds,
            )?;
        } else {
            try_close_escrow(
                buyside_sol_escrow_account,
                pool,
                system_program,
                buyside_sol_escrow_account_seeds,
            )?;
        }
    }
    pool.buyside_payment_amount = buyside_sol_escrow_account.lamports();

    log_pool("post_ext_sol_fulfill_buy", pool)?;
    try_close_pool(pool, owner.to_account_info())?;

    msg!("{{\"lp_fee\":{},\"total_price\":{}}}", lp_fee, total_price,);

    Ok(())
}
