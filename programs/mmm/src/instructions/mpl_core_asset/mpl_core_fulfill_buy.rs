use anchor_lang::{prelude::*, AnchorDeserialize};
use mpl_core::{instructions::TransferV1Builder, types::UpdateAuthority};
use solana_program::program::invoke;
use std::convert::TryFrom;

use crate::{
    constants::*,
    deserialize_collection_asset,
    errors::MMMErrorCode,
    get_royalties_from_plugin, index_ra,
    instructions::{
        check_allowlists_for_mpl_core, check_remaining_accounts_for_m2, create_core_metadata_core,
        withdraw_m2,
    },
    state::{Pool, SellState},
    util::{
        assert_valid_fees_bp, get_buyside_seller_receives, get_lp_fee_bp, get_metadata_royalty_bp,
        get_sol_fee, get_sol_lp_fee, get_sol_total_price_and_next_price, log_pool,
        pay_creator_fees_in_sol, try_close_escrow, try_close_pool, try_close_sell_state,
    },
    AssetInterface, IndexableAsset, SolFulfillBuyArgs,
};

// FulfillBuy means a seller wants to sell NFT/SFT into the pool
// where the pool has some buyside payment liquidity. Therefore,
// the seller expects a min_payment_amount that goes back to the
// seller's wallet for the asset_amount that the seller wants to sell.
#[derive(Accounts)]
#[instruction(args:SolFulfillBuyArgs)]
pub struct MplCoreFulfillBuy<'info> {
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
        mut,
        constraint = asset.to_account_info().owner == asset_program.key,
    )]
    pub asset: Box<Account<'info, IndexableAsset>>,
    #[account(
        init_if_needed,
        payer = payer,
        seeds = [
            SELL_STATE_PREFIX.as_bytes(),
            pool.key().as_ref(),
            asset.key().as_ref(),
        ],
        space = SellState::LEN,
        bump
    )]
    pub sell_state: Account<'info, SellState>,
    /// CHECK: check collection later
    collection: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub asset_program: Interface<'info, AssetInterface>,
    // Remaining accounts
    // Branch: using shared escrow accounts
    //   0: m2_program
    //   1: shared_escrow_account
    //   2+: creator accounts
    // Branch: not using shared escrow accounts
    //   0+: creator accounts
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, MplCoreFulfillBuy<'info>>,
    args: SolFulfillBuyArgs,
) -> Result<()> {
    let system_program = &ctx.accounts.system_program;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;
    let owner = &ctx.accounts.owner;
    let referral = &ctx.accounts.referral;
    let payer = &ctx.accounts.payer;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let pool_key = pool.key();
    let buyside_sol_escrow_account_seeds: &[&[&[u8]]] = &[&[
        BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(),
        pool_key.as_ref(),
        &[ctx.bumps.buyside_sol_escrow_account],
    ]];
    let asset = &ctx.accounts.asset;
    let collection = &ctx.accounts.collection;
    let remaining_accounts = ctx.remaining_accounts;

    let _ = check_allowlists_for_mpl_core(&pool.allowlists, asset, args.allowlist_aux)?;

    let (total_price, next_price) =
        get_sol_total_price_and_next_price(pool, args.asset_amount, true)?;

    let collection_asset = deserialize_collection_asset(collection)?;
    let (royalty_bp, metadata) =
        if let Some(royalties) = get_royalties_from_plugin(asset, collection_asset.as_ref()) {
            let metadata = create_core_metadata_core(&royalties);
            (
                get_metadata_royalty_bp(total_price, &metadata, None),
                Some(metadata),
            )
        } else {
            (0, None)
        };
    // TODO: update lp_fee_bp when shared escrow for both side is enabled
    let seller_receives = {
        let lp_fee_bp = get_lp_fee_bp(pool, buyside_sol_escrow_account.lamports());
        get_buyside_seller_receives(
            total_price,
            lp_fee_bp,
            royalty_bp,
            pool.buyside_creator_royalty_bp,
        )
    }?;

    // TODO: update lp_fee when shared escrow for both side is enabled
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

    // check creator_accounts and verify the remaining accounts
    let creator_accounts = if pool.using_shared_escrow() {
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

        let transfer_asset_builder = TransferV1Builder::new()
            .asset(asset.key())
            .payer(payer.key())
            .collection(
                if let UpdateAuthority::Collection(collection_address) = asset.update_authority {
                    Some(collection_address)
                } else {
                    None
                },
            )
            .new_owner(pool.key())
            .instruction();

        let mut account_infos = vec![
            asset.to_account_info(),
            pool.to_account_info(),
            payer.to_account_info(),
        ];
        if collection.key != &Pubkey::default() {
            if UpdateAuthority::Collection(collection.key()) != asset.update_authority {
                return Err(MMMErrorCode::InvalidAssetCollection.into());
            }
            account_infos.push(collection.to_account_info());
        }

        invoke(&transfer_asset_builder, account_infos.as_slice())?;

        pool.sellside_asset_amount = pool
            .sellside_asset_amount
            .checked_add(args.asset_amount)
            .ok_or(MMMErrorCode::NumericOverflow)?;
        sell_state.pool = pool.key();
        sell_state.pool_owner = owner.key();
        sell_state.asset_mint = asset.key();
        sell_state.cosigner_annotation = pool.cosigner_annotation;
        sell_state.asset_amount = sell_state
            .asset_amount
            .checked_add(args.asset_amount)
            .ok_or(MMMErrorCode::NumericOverflow)?;
    } else {
        let transfer_asset_builder = TransferV1Builder::new()
            .asset(asset.key())
            .payer(payer.key())
            .collection(
                if let UpdateAuthority::Collection(collection_address) = asset.update_authority {
                    Some(collection_address)
                } else {
                    None
                },
            )
            .new_owner(owner.key())
            .instruction();

        let mut account_infos = vec![
            asset.to_account_info(),
            owner.to_account_info(),
            payer.to_account_info(),
        ];
        if collection.key != &Pubkey::default() {
            if UpdateAuthority::Collection(collection.key()) != asset.update_authority {
                return Err(MMMErrorCode::InvalidAssetCollection.into());
            }
            account_infos.push(collection.to_account_info());
        }

        invoke(&transfer_asset_builder, account_infos.as_slice())?;
    }

    // pool owner as buyer is going to pay the royalties
    let royalty_paid = if let Some(metadata) = &metadata {
        pay_creator_fees_in_sol(
            pool.buyside_creator_royalty_bp,
            seller_receives,
            metadata,
            creator_accounts,
            buyside_sol_escrow_account.to_account_info(),
            royalty_bp,
            buyside_sol_escrow_account_seeds,
            system_program.to_account_info(),
        )?
    } else {
        // Handle the case when metadata is None
        0
    };

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

    // return the remaining per pool escrow balance to the shared escrow account
    if pool.using_shared_escrow() {
        let min_rent = Rent::get()?.minimum_balance(0);
        let shared_escrow_account = index_ra!(remaining_accounts, 1).to_account_info();
        if shared_escrow_account.lamports() + buyside_sol_escrow_account.lamports() > min_rent
            && buyside_sol_escrow_account.lamports() > 0
        {
            anchor_lang::solana_program::program::invoke_signed(
                &anchor_lang::solana_program::system_instruction::transfer(
                    buyside_sol_escrow_account.key,
                    shared_escrow_account.key,
                    buyside_sol_escrow_account.lamports(),
                ),
                &[
                    buyside_sol_escrow_account.to_account_info(),
                    shared_escrow_account,
                    system_program.to_account_info(),
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

    log_pool("post_mpl_core_fulfill_buy", pool)?;
    try_close_pool(pool, owner.to_account_info())?;

    msg!(
        "{{\"lp_fee\":{},\"royalty_paid\":{},\"total_price\":{}}}",
        lp_fee,
        royalty_paid,
        total_price,
    );

    Ok(())
}
