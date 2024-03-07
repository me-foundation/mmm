use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use solana_program::program::invoke;
use spl_token_2022::onchain::invoke_transfer_checked;

use crate::{
    constants::*,
    errors::MMMErrorCode,
    ext_util::{check_allowlists_for_mint_ext, check_group_ext_for_mint},
    instructions::check_allowlists_for_mint,
    state::{Pool, SellState},
    util::log_pool,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ExtDepositeSellArgs {
    pub asset_amount: u64,
    pub allowlist_aux: Option<String>,
}

#[derive(Accounts)]
#[instruction(args: ExtDepositeSellArgs)]
pub struct ExtDepositeSell<'info> {
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
        mint::token_program = token_program,
        constraint = asset_mint.supply == 1 && asset_mint.decimals == 0 @ MMMErrorCode::InvalidTokenMint,
    )]
    pub asset_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = owner,
        associated_token::token_program = token_program,
    )]
    pub asset_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = asset_mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program,
    )]
    pub sellside_escrow_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = owner,
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
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ExtDepositeSell<'info>>,
    args: ExtDepositeSellArgs,
) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let asset_token_account = &ctx.accounts.asset_token_account;
    let asset_mint = &ctx.accounts.asset_mint;
    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let token_program = &ctx.accounts.token_program;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;

    if pool.using_shared_escrow() {
        return Err(MMMErrorCode::InvalidAccountState.into());
    }

    check_allowlists_for_mint_ext(
        &pool.allowlists,
        &asset_mint.to_account_info(),
        args.allowlist_aux,
    )?;
    check_group_ext_for_mint(&asset_mint.to_account_info(), &pool.allowlists)?;

    invoke_transfer_checked(
        token_program.key,
        asset_token_account.to_account_info(),
        asset_mint.to_account_info(),
        sellside_escrow_token_account.to_account_info(),
        owner.to_account_info(),
        ctx.remaining_accounts,
        args.asset_amount,
        0,
        &[],
    )?;

    if asset_token_account.amount == args.asset_amount {
        invoke(
            &spl_token_2022::instruction::close_account(
                token_program.key,
                &asset_token_account.key(),
                &owner.key(),
                &owner.key(),
                &[],
            )?,
            &[
                asset_token_account.to_account_info(),
                owner.to_account_info(),
            ],
        )?;
    }

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
    log_pool("post_deposit_sell", pool)?;

    Ok(())
}
