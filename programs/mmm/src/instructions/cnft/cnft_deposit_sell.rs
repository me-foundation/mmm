use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{
    constants::*,
    errors::MMMErrorCode,
    state::{Pool, SellState},
    util::{check_allowlists_for_mint, log_pool},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CnftDepositSellArgs {
    pub asset_amount: u64,
    pub allowlist_aux: Option<String>, // TODO: use it for future allowlist_aux
}

#[derive(Accounts)]
#[instruction(args:CnftDepositSellArgs)]
pub struct CnftDepositSell<'info> {
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

    // TODO: Add CNFT specific accounts
    pub sell_state: Account<'info, SellState>,
    /// CHECK: will be used for allowlist checks
    pub allowlist_aux_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CnftDepositSell>, args: CnftDepositSellArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;

    if pool.using_shared_escrow() {
        return Err(MMMErrorCode::InvalidAccountState.into());
    }

    // Need to do check allowlist against cnft metadata args
    // check_allowlists_for_mint(
    //     &pool.allowlists,
    //     asset_mint,
    //     asset_metadata,
    //     Some(asset_master_edition),
    //     args.allowlist_aux,
    // )?;

    // Do Cnft transfer logic here

    pool.sellside_asset_amount = pool
        .sellside_asset_amount
        .checked_add(args.asset_amount)
        .ok_or(MMMErrorCode::NumericOverflow)?;

    sell_state.pool = pool.key();
    sell_state.pool_owner = owner.key();
    // TODO: asset_mint can be get from tree.
    // sell_state.asset_mint = asset_mint.key();
    sell_state.cosigner_annotation = pool.cosigner_annotation;
    sell_state.asset_amount = sell_state
        .asset_amount
        .checked_add(args.asset_amount)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    log_pool("post_cnft_deposit_sell", pool)?;

    Ok(())
}
