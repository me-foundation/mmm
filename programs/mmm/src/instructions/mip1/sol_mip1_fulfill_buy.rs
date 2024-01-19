use anchor_lang::{prelude::*, solana_program::sysvar, AnchorDeserialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use mpl_token_metadata::{
    instructions::TransferCpiBuilder,
    types::{AuthorizationData, Payload, PayloadType, SeedsVec, TransferArgs},
};
use std::{collections::HashMap, convert::TryFrom};

use crate::{
    ata::init_if_needed_ata,
    constants::*,
    errors::MMMErrorCode,
    instructions::sol_fulfill_buy::SolFulfillBuyArgs,
    state::{Pool, SellState},
    util::{
        assert_is_programmable, assert_valid_fees_bp, check_allowlists_for_mint,
        get_buyside_seller_receives, get_lp_fee_bp, get_metadata_royalty_bp, get_sol_fee,
        get_sol_lp_fee, get_sol_total_price_and_next_price, log_pool, pay_creator_fees_in_sol,
        try_close_escrow, try_close_pool, try_close_sell_state,
    },
};

// FulfillBuy means a seller wants to sell NFT/SFT into the pool
// where the pool has some buyside payment liquidity. Therefore,
// the seller expects a min_payment_amount that goes back to the
// seller's wallet for the asset_amount that the seller wants to sell.
#[derive(Accounts)]
#[instruction(args:SolFulfillBuyArgs)]
pub struct SolMip1FulfillBuy<'info> {
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
    #[account(mut,
    seeds = [
        "metadata".as_bytes(),
        mpl_token_metadata::ID.as_ref(),
        asset_mint.key().as_ref(),
    ],
    bump,
    seeds::program = mpl_token_metadata::ID,
    )]
    pub asset_metadata: UncheckedAccount<'info>,
    #[account(
        constraint = asset_mint.supply == 1 && asset_mint.decimals == 0 @ MMMErrorCode::InvalidMip1AssetParams,
    )]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: will be checked in cpi
    pub asset_master_edition: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = payer,
        constraint = payer_asset_account.amount == 1 @ MMMErrorCode::InvalidMip1AssetParams,
        constraint = args.asset_amount == 1 @ MMMErrorCode::InvalidMip1AssetParams,
    )]
    pub payer_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        associated_token::mint = asset_mint,
        associated_token::authority = pool,
        payer = payer,
    )]
    pub sellside_escrow_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
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
    pub sell_state: Box<Account<'info, SellState>>,
    /// CHECK: will be checked in cpi
    /// This is the token record for the seller
    #[account(mut)]
    pub token_owner_token_record: UncheckedAccount<'info>,
    /// CHECK: will be checked in cpi
    /// This is the token record for the pool - will always be required
    #[account(mut)]
    pub pool_token_record: UncheckedAccount<'info>,
    /// CHECK: will be checked in cpi
    /// This is the token record for the pool owner - will be required if reinvest = true
    #[account(mut)]
    pub pool_owner_token_record: UncheckedAccount<'info>,

    /// CHECK: checked by address and in CPI
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
    /// CHECK: checked by address and in cpi
    #[account(address = MPL_TOKEN_AUTH_RULES)]
    pub authorization_rules_program: UncheckedAccount<'info>,
    /// CHECK: will be checked in cpi
    pub authorization_rules: UncheckedAccount<'info>,
    /// CHECK: will be checked in cpi
    #[account(address = sysvar::instructions::id())]
    pub instructions: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, SolMip1FulfillBuy<'info>>,
    args: SolFulfillBuyArgs,
) -> Result<()> {
    let token_program = &ctx.accounts.token_program;
    let system_program = &ctx.accounts.system_program;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;
    let owner = &ctx.accounts.owner;
    let referral = &ctx.accounts.referral;
    let payer = &ctx.accounts.payer;
    let payer_asset_account = &ctx.accounts.payer_asset_account;
    let asset_mint = &ctx.accounts.asset_mint;
    let asset_master_edition = &ctx.accounts.asset_master_edition;
    let asset_metadata = &ctx.accounts.asset_metadata;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let owner_token_account = &ctx.accounts.owner_token_account;
    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let token_owner_token_record = &ctx.accounts.token_owner_token_record;
    let pool_token_record = &ctx.accounts.pool_token_record;
    let pool_owner_token_record = &ctx.accounts.pool_owner_token_record;
    let instructions = &ctx.accounts.instructions;
    let associated_token_program = &ctx.accounts.associated_token_program;
    let authorization_rules = &ctx.accounts.authorization_rules;
    let authorization_rules_program = &ctx.accounts.authorization_rules_program;
    let token_metadata_program_ai = &ctx.accounts.token_metadata_program.to_account_info();

    let rent = &ctx.accounts.rent;
    let pool_key = pool.key();
    let buyside_sol_escrow_account_seeds: &[&[&[u8]]] = &[&[
        BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(),
        pool_key.as_ref(),
        &[ctx.bumps.buyside_sol_escrow_account],
    ]];
    let pool_seeds: &[&[&[u8]]] = &[&[
        POOL_PREFIX.as_bytes(),
        pool.owner.as_ref(),
        pool.uuid.as_ref(),
        &[ctx.bumps.pool],
    ]];

    let parsed_metadata = check_allowlists_for_mint(
        &pool.allowlists,
        asset_mint,
        asset_metadata,
        Some(asset_master_edition),
        args.allowlist_aux,
    )?;
    assert_is_programmable(&parsed_metadata)?;

    let (total_price, next_price) =
        get_sol_total_price_and_next_price(pool, args.asset_amount, true)?;
    let metadata_royalty_bp = get_metadata_royalty_bp(total_price, &parsed_metadata, None);
    let seller_receives = {
        let lp_fee_bp = get_lp_fee_bp(pool, buyside_sol_escrow_account.lamports());
        get_buyside_seller_receives(total_price, lp_fee_bp, metadata_royalty_bp, 10000)
    }?;
    let lp_fee = get_sol_lp_fee(pool, buyside_sol_escrow_account.lamports(), seller_receives)?;

    assert_valid_fees_bp(args.maker_fee_bp, args.taker_fee_bp)?;
    let maker_fee = get_sol_fee(seller_receives, args.maker_fee_bp)?;
    let taker_fee = get_sol_fee(seller_receives, args.taker_fee_bp)?;
    let referral_fee = u64::try_from(
        maker_fee
            .checked_add(taker_fee)
            .ok_or(MMMErrorCode::NumericOverflow)?,
    )
    .map_err(|_| MMMErrorCode::NumericOverflow)?;

    // transfer to token account owned by pool
    let payload = Payload {
        map: HashMap::from([(
            "DestinationSeeds".to_owned(),
            PayloadType::Seeds(SeedsVec {
                seeds: pool_seeds[0][0..3].iter().map(|v| v.to_vec()).collect(),
            }),
        )]),
    };

    let transfer_args = TransferArgs::V1 {
        authorization_data: Some(AuthorizationData { payload }),
        amount: args.asset_amount,
    };

    let mut transfer_cpi = TransferCpiBuilder::new(token_metadata_program_ai);

    transfer_cpi
        .token(&payer_asset_account.to_account_info())
        .token_owner(&payer.to_account_info())
        .destination_token(&sellside_escrow_token_account.to_account_info())
        .destination_owner(&pool.to_account_info())
        .mint(&asset_mint.to_account_info())
        .metadata(&asset_metadata.to_account_info())
        .edition(Some(&asset_master_edition.to_account_info()))
        .token_record(Some(&token_owner_token_record.to_account_info()))
        .destination_token_record(Some(&pool_token_record.to_account_info()))
        .authority(&payer.to_account_info())
        .payer(&payer.to_account_info())
        .system_program(&system_program.to_account_info())
        .sysvar_instructions(&instructions.to_account_info())
        .spl_token_program(&token_program.to_account_info())
        .spl_ata_program(&associated_token_program.to_account_info())
        .authorization_rules(Some(&authorization_rules.to_account_info()))
        .authorization_rules_program(Some(&authorization_rules_program.to_account_info()))
        .transfer_args(transfer_args)
        .invoke()?;

    if pool.reinvest_fulfill_buy {
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
        // transfer to token account owned by owner from pool token account
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

        let payload = Payload {
            map: HashMap::from([(
                "SourceSeeds".to_owned(),
                PayloadType::Seeds(SeedsVec {
                    seeds: pool_seeds[0][0..3].iter().map(|v| v.to_vec()).collect(),
                }),
            )]),
        };

        let transfer_args = TransferArgs::V1 {
            authorization_data: Some(AuthorizationData { payload }),
            amount: args.asset_amount,
        };

        let mut transfer_cpi = TransferCpiBuilder::new(token_metadata_program_ai);

        transfer_cpi
            .token(&sellside_escrow_token_account.to_account_info())
            .token_owner(&pool.to_account_info())
            .destination_token(&owner_token_account.to_account_info())
            .destination_owner(&owner.to_account_info())
            .mint(&asset_mint.to_account_info())
            .metadata(&asset_metadata.to_account_info())
            .edition(Some(&asset_master_edition.to_account_info()))
            .token_record(Some(&pool_token_record.to_account_info()))
            .destination_token_record(Some(&pool_owner_token_record.to_account_info()))
            .authority(&pool.to_account_info())
            .payer(&payer.to_account_info())
            .system_program(&system_program.to_account_info())
            .sysvar_instructions(&instructions.to_account_info())
            .spl_token_program(&token_program.to_account_info())
            .spl_ata_program(&associated_token_program.to_account_info())
            .authorization_rules(Some(&authorization_rules.to_account_info()))
            .authorization_rules_program(Some(&authorization_rules_program.to_account_info()))
            .transfer_args(transfer_args)
            .invoke_signed(pool_seeds)?;

        anchor_spl::token_2022::close_account(CpiContext::new_with_signer(
            token_program.to_account_info(),
            anchor_spl::token_2022::CloseAccount {
                account: sellside_escrow_token_account.to_account_info(),
                destination: payer.to_account_info(),
                authority: pool.to_account_info(),
            },
            pool_seeds,
        ))?;
    }

    // we can close the payer_asset_account if no amount left
    if payer_asset_account.amount == args.asset_amount {
        anchor_spl::token_2022::close_account(CpiContext::new(
            token_program.to_account_info(),
            anchor_spl::token_2022::CloseAccount {
                account: payer_asset_account.to_account_info(),
                destination: payer.to_account_info(),
                authority: payer.to_account_info(),
            },
        ))?;
    }

    // pool owner as buyer is going to pay the royalties
    let royalty_paid = pay_creator_fees_in_sol(
        10000,
        seller_receives,
        &parsed_metadata,
        ctx.remaining_accounts,
        buyside_sol_escrow_account.to_account_info(),
        metadata_royalty_bp,
        buyside_sol_escrow_account_seeds,
        system_program.to_account_info(),
    )?;

    // prevent frontrun by pool config changes
    // the royalties are paid by the buyer, but the seller will see the price
    // after adjusting the royalties.
    let payment_amount = total_price
        .checked_sub(lp_fee)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_sub(taker_fee as u64)
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
                payer.to_account_info(),
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
    log_pool("post_sol_mip1_fulfill_buy", pool)?;
    try_close_pool(pool, owner.to_account_info())?;

    msg!(
        "{{\"lp_fee\":{},\"royalty_paid\":{},\"total_price\":{}}}",
        lp_fee,
        royalty_paid,
        total_price,
    );

    Ok(())
}
