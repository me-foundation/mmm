use anchor_lang::{prelude::*, AnchorDeserialize};
use mpl_core::{instructions::TransferV1Builder, types::UpdateAuthority};
use solana_program::program::invoke_signed;
use std::convert::TryFrom;

use crate::{
    assert_valid_core_plugins,
    constants::*,
    deserialize_collection_asset,
    errors::MMMErrorCode,
    get_royalties_from_plugin,
    instructions::{
        check_allowlists_for_mpl_core, create_core_metadata_core, get_sell_fulfill_pool_price_info,
        PoolPriceInfo,
    },
    state::{Pool, SellState},
    util::{
        get_metadata_royalty_bp, log_pool, pay_creator_fees_in_sol, try_close_pool,
        try_close_sell_state,
    },
    AssetInterface, IndexableAsset, SolFulfillSellArgs,
};

#[derive(Accounts)]
#[instruction(args:SolFulfillSellArgs)]
pub struct MplCoreFulfillSell<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: we will check the owner field that matches the pool owner
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,
    pub cosigner: Signer<'info>,
    /// CHECK: we will check that the referral matches the pool's referral
    #[account(mut)]
    pub referral: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
        has_one = owner @ MMMErrorCode::InvalidOwner,
        has_one = referral @ MMMErrorCode::InvalidReferral,
        has_one = cosigner @ MMMErrorCode::InvalidCosigner,
        constraint = pool.payment_mint.eq(&Pubkey::default()) @ MMMErrorCode::InvalidPaymentMint,
        constraint = pool.expiry == 0 || pool.expiry > Clock::get().unwrap().unix_timestamp @ MMMErrorCode::Expired,
        constraint = args.buyside_creator_royalty_bp <= 10000 @ MMMErrorCode::InvalidBP,
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
    #[account(
        mut,
        constraint = asset.to_account_info().owner == asset_program.key,
    )]
    pub asset: Box<Account<'info, IndexableAsset>>,
    #[account(
        mut,
        seeds = [
            SELL_STATE_PREFIX.as_bytes(),
            pool.key().as_ref(),
            asset.key().as_ref(),
        ],
        bump
    )]
    pub sell_state: Account<'info, SellState>,
    /// CHECK: check collection later
    collection: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub asset_program: Interface<'info, AssetInterface>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, MplCoreFulfillSell<'info>>,
    args: SolFulfillSellArgs,
) -> Result<()> {
    let system_program = &ctx.accounts.system_program;
    let owner = &ctx.accounts.owner;
    let referral = &ctx.accounts.referral;
    let pool = &mut ctx.accounts.pool;
    let asset = &ctx.accounts.asset;
    let sell_state = &mut ctx.accounts.sell_state;
    let payer = &ctx.accounts.payer;

    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let pool_seeds: &[&[&[u8]]] = &[&[
        POOL_PREFIX.as_bytes(),
        pool.owner.as_ref(),
        pool.uuid.as_ref(),
        &[ctx.bumps.pool],
    ]];
    let collection = &ctx.accounts.collection;

    assert_valid_core_plugins(asset)?;
    let _ = check_allowlists_for_mpl_core(&pool.allowlists, asset, args.allowlist_aux)?;

    let PoolPriceInfo {
        total_price,
        next_price,
        lp_fee,
        maker_fee,
        taker_fee,
        referral_fee,
        transfer_sol_to,
    } = get_sell_fulfill_pool_price_info(
        pool,
        owner,
        buyside_sol_escrow_account,
        args.asset_amount,
        args.maker_fee_bp,
        args.taker_fee_bp,
    )?;

    // TODO: make sure that the lp fee is paid with the correct amount
    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            payer.key,
            transfer_sol_to.key,
            u64::try_from(
                i64::try_from(total_price)
                    .map_err(|_| MMMErrorCode::NumericOverflow)?
                    .checked_sub(maker_fee)
                    .ok_or(MMMErrorCode::NumericOverflow)?,
            )
            .map_err(|_| MMMErrorCode::NumericOverflow)?,
        ),
        &[
            payer.to_account_info(),
            transfer_sol_to,
            system_program.to_account_info(),
        ],
    )?;

    let transfer_asset_builder = TransferV1Builder::new()
        .asset(asset.key())
        .payer(payer.key())
        .authority(Some(pool.key()))
        .collection(
            if let UpdateAuthority::Collection(collection_address) = asset.update_authority {
                Some(collection_address)
            } else {
                None
            },
        )
        .new_owner(payer.key())
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

    invoke_signed(
        &transfer_asset_builder,
        account_infos.as_slice(),
        pool_seeds,
    )?;

    if lp_fee > 0 {
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                payer.key, owner.key, lp_fee,
            ),
            &[payer.to_account_info(), owner.to_account_info()],
        )?;
    }

    if referral_fee > 0 {
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                payer.key,
                referral.key,
                referral_fee,
            ),
            &[payer.to_account_info(), referral.to_account_info()],
        )?;
    }

    pool.spot_price = next_price;
    pool.sellside_asset_amount = pool
        .sellside_asset_amount
        .checked_sub(args.asset_amount)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    pool.lp_fee_earned = pool
        .lp_fee_earned
        .checked_add(lp_fee)
        .ok_or(MMMErrorCode::NumericOverflow)?;

    let collection_asset = deserialize_collection_asset(collection)?;
    let royalty_paid =
        if let Some(royalties) = get_royalties_from_plugin(asset, collection_asset.as_ref()) {
            let metadata = create_core_metadata_core(&royalties);
            let royalty_bp = get_metadata_royalty_bp(total_price, &metadata, None);
            pay_creator_fees_in_sol(
                args.buyside_creator_royalty_bp,
                total_price,
                &metadata,
                ctx.remaining_accounts,
                payer.to_account_info(),
                royalty_bp,
                &[&[&[]]],
                system_program.to_account_info(),
            )?
        } else {
            0
        };

    // prevent frontrun by pool config changes
    let payment_amount = total_price
        .checked_add(lp_fee)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_add(taker_fee as u64)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_add(royalty_paid)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    if payment_amount > args.max_payment_amount {
        return Err(MMMErrorCode::InvalidRequestedPrice.into());
    }

    sell_state.asset_amount = sell_state
        .asset_amount
        .checked_sub(args.asset_amount)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    try_close_sell_state(sell_state, owner.to_account_info())?;

    pool.buyside_payment_amount = buyside_sol_escrow_account.lamports();
    log_pool("post_mpl_core_fulfill_sell", pool)?;
    try_close_pool(pool, owner.to_account_info())?;

    msg!(
        "{{\"lp_fee\":{},\"royalty_paid\":{},\"total_price\":{}}}",
        lp_fee,
        royalty_paid,
        total_price,
    );

    Ok(())
}
