use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{errors::MMMErrorCode, state::Pool, util::check_cosigner};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawSellArgs {
    asset_amount: u64,
}

#[derive(Accounts)]
#[instruction(args:WithdrawSellArgs)]
pub struct WithdrawSell<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: we will check cosigner when cosign field is on
    pub cosigner: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_ref()],
        has_one = owner @ MMMErrorCode::InvalidOwner,
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,
    pub asset_mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = asset_mint,
        associated_token::authority = owner,
    )]
    pub asset_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = pool,
    )]
    pub sellside_escrow_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<WithdrawSell>, args: WithdrawSellArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let asset_token_account = &ctx.accounts.asset_token_account;
    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let token_program = &ctx.accounts.token_program;
    let cosigner = &ctx.accounts.cosigner;
    let pool = &mut ctx.accounts.pool;

    check_cosigner(pool, cosigner)?;

    // Note that check_allowlists_for_mint is optional for withdraw_sell
    // because sometimes the nft or sft might be moved out of the collection
    // and we'd still like to enable the withdraw of those items for the pool owner.
    // check_allowlists_for_mint(&pool.allowlists, asset_mint, asset_metadata)?;

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: sellside_escrow_token_account.to_account_info(),
                to: asset_token_account.to_account_info(),
                authority: pool.to_account_info(),
            },
            // seeds should be the PDA of 'pool'
            &[&[
                b"mmm_pool",
                owner.key().as_ref(),
                pool.uuid.key().as_ref(),
                &[*ctx.bumps.get("pool").unwrap()],
            ]],
        ),
        args.asset_amount,
    )?;
    // we can close the sellside_escrow_token_account if no amount left
    if sellside_escrow_token_account.amount == args.asset_amount {
        anchor_spl::token::close_account(CpiContext::new_with_signer(
            token_program.to_account_info(),
            anchor_spl::token::CloseAccount {
                account: sellside_escrow_token_account.to_account_info(),
                destination: owner.to_account_info(),
                authority: pool.to_account_info(),
            },
            // seeds should be the PDA of 'pool'
            &[&[
                b"mmm_pool",
                owner.key().as_ref(),
                pool.uuid.key().as_ref(),
                &[*ctx.bumps.get("pool").unwrap()],
            ]],
        ))?;
    }

    pool.sellside_orders_count -= args.asset_amount;
    Ok(())
}
