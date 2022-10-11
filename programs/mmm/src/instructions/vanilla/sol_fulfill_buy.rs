use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    ata::init_if_needed_ata,
    constants::*,
    errors::MMMErrorCode,
    state::{Pool, SellState},
    util::{
        check_allowlists_for_mint, get_sol_fee, get_sol_lp_fee, get_sol_total_price_and_next_price,
        log_pool, pay_creator_fees_in_sol, try_close_escrow, try_close_pool, try_close_sell_state,
    },
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SolFulfillBuyArgs {
    pub asset_amount: u64,
    pub min_payment_amount: u64,
    pub allowlist_aux: Option<String>, // TODO: use it for future allowlist_aux
    pub maker_fee_bp: u16,             // will be checked by cosigner
    pub taker_fee_bp: u16,             // will be checked by cosigner
}

// FulfillBuy means a seller wants to sell NFT/SFT into the pool
// where the pool has some buyside payment liquidity. Therefore,
// the seller expects a min_payment_amount that goes back to the
// seller's wallet for the asset_amount that the seller wants to sell.
#[derive(Accounts)]
#[instruction(args:SolFulfillBuyArgs)]
pub struct SolFulfillBuy<'info> {
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
    /// CHECK: we will check the metadata in check_allowlists_for_mint()
    pub asset_metadata: UncheckedAccount<'info>,
    /// CHECK: we will check the master_edtion in check_allowlists_for_mint()
    pub asset_master_edition: UncheckedAccount<'info>,
    /// CHECK: check_allowlists_for_mint
    pub asset_mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = payer,
    )]
    pub payer_asset_account: Box<Account<'info, TokenAccount>>,
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
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, SolFulfillBuy<'info>>,
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
    let payer_asset_metadata = &ctx.accounts.asset_metadata;
    let asset_master_edition = &ctx.accounts.asset_master_edition;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let pool_key = pool.key();
    let buyside_sol_escrow_account_seeds: &[&[&[u8]]] = &[&[
        BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(),
        pool_key.as_ref(),
        &[*ctx.bumps.get("buyside_sol_escrow_account").unwrap()],
    ]];

    check_allowlists_for_mint(
        &pool.allowlists,
        asset_mint,
        payer_asset_metadata,
        Some(asset_master_edition),
    )?;

    let (total_price, next_price) =
        get_sol_total_price_and_next_price(pool, args.asset_amount, true)?;
    let lp_fee = get_sol_lp_fee(pool, buyside_sol_escrow_account.lamports(), total_price)?;

    if args
        .maker_fee_bp
        .checked_add(args.taker_fee_bp)
        .ok_or(MMMErrorCode::NumericOverflow)?
        > MAX_REFERRAL_FEE_BP
    {
        return Err(MMMErrorCode::InvalidMakerOrTakerFeeBP.into());
    }
    let maker_fee = get_sol_fee(total_price, args.maker_fee_bp)?;
    let taker_fee = get_sol_fee(total_price, args.taker_fee_bp)?;
    let referral_fee = maker_fee
        .checked_add(taker_fee)
        .ok_or(MMMErrorCode::NumericOverflow)?;

    if pool.reinvest_fulfill_buy {
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
        anchor_spl::token::transfer(
            CpiContext::new(
                token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: payer_asset_account.to_account_info(),
                    to: sellside_escrow_token_account.to_account_info(),
                    authority: payer.to_account_info(),
                },
            ),
            args.asset_amount,
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
        anchor_spl::token::transfer(
            CpiContext::new(
                token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: payer_asset_account.to_account_info(),
                    to: owner_token_account.to_account_info(),
                    authority: payer.to_account_info(),
                },
            ),
            args.asset_amount,
        )?;
    }

    // we can close the payer_asset_account if no amount left
    if payer_asset_account.amount == args.asset_amount {
        anchor_spl::token::close_account(CpiContext::new(
            token_program.to_account_info(),
            anchor_spl::token::CloseAccount {
                account: payer_asset_account.to_account_info(),
                destination: payer.to_account_info(),
                authority: payer.to_account_info(),
            },
        ))?;
    }

    // pool owner as buyer is going to pay the royalties
    let royalty_paid = pay_creator_fees_in_sol(
        pool.buyside_creator_royalty_bp,
        total_price,
        payer_asset_metadata.to_account_info(),
        ctx.remaining_accounts,
        buyside_sol_escrow_account.to_account_info(),
        None,
        buyside_sol_escrow_account_seeds,
        system_program.to_account_info(),
    )?;

    // prevent frontrun by pool config changes
    // the royalties are paid by the buyer, but the seller will see the price
    // after adjusting the royalties.
    let payment_amount = total_price
        .checked_sub(lp_fee)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_sub(taker_fee)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_sub(royalty_paid)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    if payment_amount < args.min_payment_amount {
        return Err(MMMErrorCode::InvalidRequestedPrice.into());
    }

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
        buyside_sol_escrow_account_seeds,
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
            buyside_sol_escrow_account_seeds,
        )?;
    }
    if referral_fee > 0 {
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                buyside_sol_escrow_account.key,
                referral.key,
                referral_fee,
            ),
            &[
                buyside_sol_escrow_account.to_account_info(),
                referral.to_account_info(),
                system_program.to_account_info(),
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

    pool.buyside_payment_amount = buyside_sol_escrow_account.lamports();
    log_pool("post_sol_fulfill_buy", pool)?;
    try_close_pool(pool, owner.to_account_info())?;

    msg!(
        "{{\"lp_fee\":{},\"royalty_paid\":{},\"total_price\":{}}}",
        lp_fee,
        royalty_paid,
        total_price,
    );

    Ok(())
}
