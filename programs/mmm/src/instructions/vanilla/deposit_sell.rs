use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    constants::*,
    errors::MMMErrorCode,
    state::{Pool, SellState},
    util::{check_allowlists_for_mint, log_pool},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositSellArgs {
    pub asset_amount: u64,
    pub allowlist_aux: Option<String>, // TODO: use it for future allowlist_aux
}

#[derive(Accounts)]
#[instruction(args:DepositSellArgs)]
pub struct DepositSell<'info> {
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
    /// CHECK: we will check the metadata in check_allowlists_for_mint()
    pub asset_metadata: UncheckedAccount<'info>,
    /// CHECK: we will check the master_edition in check_allowlists_for_mint()
    pub asset_master_edition: UncheckedAccount<'info>,
    pub asset_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = owner,
    )]
    pub asset_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = asset_mint,
        associated_token::authority = pool,
    )]
    pub sellside_escrow_token_account: Box<Account<'info, TokenAccount>>,
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
    /// CHECK: will be used for allowlist checks
    pub allowlist_aux_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<DepositSell>, args: DepositSellArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let asset_token_account = &ctx.accounts.asset_token_account;
    let asset_mint = &ctx.accounts.asset_mint;
    let asset_metadata = &ctx.accounts.asset_metadata;
    let asset_master_edition = &ctx.accounts.asset_master_edition;
    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let token_program = &ctx.accounts.token_program;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;

    check_allowlists_for_mint(
        &pool.allowlists,
        asset_mint,
        asset_metadata,
        Some(asset_master_edition),
    )?;

    anchor_spl::token::transfer(
        CpiContext::new(
            token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: asset_token_account.to_account_info(),
                to: sellside_escrow_token_account.to_account_info(),
                authority: owner.to_account_info(),
            },
        ),
        args.asset_amount,
    )?;

    if asset_token_account.amount == args.asset_amount {
        anchor_spl::token::close_account(CpiContext::new(
            token_program.to_account_info(),
            anchor_spl::token::CloseAccount {
                account: asset_token_account.to_account_info(),
                destination: owner.to_account_info(),
                authority: owner.to_account_info(),
            },
        ))?;
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
