use anchor_lang::prelude::*;
use mpl_core::{instructions::TransferV1Builder, types::UpdateAuthority};
use solana_program::program::invoke_signed;

use crate::{
    constants::*,
    errors::MMMErrorCode,
    state::{Pool, SellState},
    util::{log_pool, try_close_pool, try_close_sell_state},
    AssetInterface, IndexableAsset,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct MplCoreWithdrawSellArgs {
    pub compression_proof: Option<Vec<u8>>,
}

#[derive(Accounts)]
pub struct MplCoreWithdrawSell<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(constraint = owner.key() != cosigner.key() @ MMMErrorCode::InvalidCosigner)]
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
    /// CHECK: it's a pda, and the private key is owned by the seeds
    #[account(
        mut,
        seeds = [BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(), pool.key().as_ref()],
        bump,
    )]
    pub buyside_sol_escrow_account: UncheckedAccount<'info>,
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

pub fn handler(ctx: Context<MplCoreWithdrawSell>, args: MplCoreWithdrawSellArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let asset = &ctx.accounts.asset;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;
    let collection = &ctx.accounts.collection;

    let transfer_asset_builder = TransferV1Builder::new()
        .asset(asset.key())
        .payer(owner.key())
        .authority(Some(pool.key()))
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
        pool.to_account_info(),
    ];
    if collection.key != &Pubkey::default() {
        if UpdateAuthority::Collection(collection.key()) != asset.update_authority {
            return Err(MMMErrorCode::InvalidAssetCollection.into());
        }
        account_infos.push(collection.to_account_info());
    }

    let pool_seeds: &[&[&[u8]]] = &[&[
        POOL_PREFIX.as_bytes(),
        pool.owner.as_ref(),
        pool.uuid.as_ref(),
        &[ctx.bumps.pool],
    ]];

    invoke_signed(
        &transfer_asset_builder,
        account_infos.as_slice(),
        pool_seeds,
    )?;

    pool.sellside_asset_amount = pool
        .sellside_asset_amount
        .checked_sub(1)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    sell_state.asset_amount = sell_state
        .asset_amount
        .checked_sub(1)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    try_close_sell_state(sell_state, owner.to_account_info())?;

    pool.buyside_payment_amount = buyside_sol_escrow_account.lamports();
    log_pool("post_mpl_core_withdraw_sell", pool)?;
    try_close_pool(pool, owner.to_account_info())?;

    Ok(())
}
