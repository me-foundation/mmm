use anchor_lang::prelude::*;
use mpl_core::instructions::TransferV1Builder;
use mpl_core::types::UpdateAuthority;
use solana_program::program::invoke;

use crate::{
    constants::*,
    errors::MMMErrorCode,
    state::{Pool, SellState},
    util::{check_allowlists_for_mpl_core, log_pool},
    AssetInterface, DepositSellArgs, IndexableAsset,
};

#[derive(Accounts)]
#[instruction(args:DepositSellArgs)]
pub struct MplCoreDepositSell<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub cosigner: Signer<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
        has_one = owner @ MMMErrorCode::InvalidOwner,
        has_one = cosigner @ MMMErrorCode::InvalidCosigner,
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        constraint = asset.to_account_info().owner == asset_program.key,
    )]    
    pub asset: Box<Account<'info, IndexableAsset>>,
    #[account(
        init_if_needed,
        payer = owner,
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
}

pub fn handler(ctx: Context<MplCoreDepositSell>, args: DepositSellArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let asset = &ctx.accounts.asset;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;
    let collection = &ctx.accounts.collection;

    if pool.using_shared_escrow() {
        return Err(MMMErrorCode::InvalidAccountState.into());
    }

    let _ = check_allowlists_for_mpl_core(&pool.allowlists, asset, args.allowlist_aux)?;

    let transfer_asset_builder = TransferV1Builder::new()
        .asset(asset.key())
        .payer(owner.key())
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
        owner.to_account_info(),
        pool.to_account_info(),
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
    log_pool("post_mpl_core_deposit_sell", pool)?;

    Ok(())
}
