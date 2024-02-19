use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    constants::*,
    errors::MMMErrorCode,
    pool_event::PoolEvent,
    state::{Pool, SellState},
    util::{try_close_pool, try_close_sell_state},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawSellArgs {
    pub asset_amount: u64,
    pub allowlist_aux: Option<String>, // TODO: use it for future allowlist_aux
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(args:WithdrawSellArgs)]
pub struct WithdrawSell<'info> {
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
    pub asset_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = asset_mint,
        associated_token::authority = owner,
        associated_token::token_program = token_program
    )]
    pub asset_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program
    )]
    pub sellside_escrow_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: it's a pda, and the private key is owned by the seeds
    #[account(
        mut,
        seeds = [BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(), pool.key().as_ref()],
        bump,
    )]
    pub buyside_sol_escrow_account: UncheckedAccount<'info>,
    /// CHECK: will be used for allowlist checks
    pub allowlist_aux_account: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [
            SELL_STATE_PREFIX.as_bytes(),
            pool.key().as_ref(),
            asset_mint.key().as_ref(),
        ],
        bump
    )]
    pub sell_state: Account<'info, SellState>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<WithdrawSell>, args: WithdrawSellArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let asset_token_account = &ctx.accounts.asset_token_account;
    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let token_program = &ctx.accounts.token_program;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;

    // Note that check_allowlists_for_mint is optional for withdraw_sell
    // because sometimes the nft or sft might be moved out of the collection
    // and we'd still like to enable the withdraw of those items for the pool owner.
    // check_allowlists_for_mint(&pool.allowlists, asset_mint, asset_metadata)?;

    #[allow(deprecated)]
    anchor_spl::token_2022::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            anchor_spl::token_2022::Transfer {
                from: sellside_escrow_token_account.to_account_info(),
                to: asset_token_account.to_account_info(),
                authority: pool.to_account_info(),
            },
            // seeds should be the PDA of 'pool'
            &[&[
                POOL_PREFIX.as_bytes(),
                owner.key().as_ref(),
                pool.uuid.key().as_ref(),
                &[ctx.bumps.pool],
            ]],
        ),
        args.asset_amount,
    )?;
    // we can close the sellside_escrow_token_account if no amount left
    if sellside_escrow_token_account.amount == args.asset_amount {
        anchor_spl::token_2022::close_account(CpiContext::new_with_signer(
            token_program.to_account_info(),
            anchor_spl::token_2022::CloseAccount {
                account: sellside_escrow_token_account.to_account_info(),
                destination: owner.to_account_info(),
                authority: pool.to_account_info(),
            },
            // seeds should be the PDA of 'pool'
            &[&[
                POOL_PREFIX.as_bytes(),
                owner.key().as_ref(),
                pool.uuid.key().as_ref(),
                &[ctx.bumps.pool],
            ]],
        ))?;
    }

    pool.sellside_asset_amount = pool
        .sellside_asset_amount
        .checked_sub(args.asset_amount)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    sell_state.asset_amount = sell_state
        .asset_amount
        .checked_sub(args.asset_amount)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    try_close_sell_state(sell_state, owner.to_account_info())?;

    pool.buyside_payment_amount = buyside_sol_escrow_account.lamports();
    emit_cpi!(PoolEvent {
        prefix: "post_withdraw_sell".to_string(),
        pool_state: pool.to_account_info().try_borrow_data()?.to_vec(),
    });
    try_close_pool(pool, owner.to_account_info())?;

    Ok(())
}
