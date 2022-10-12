use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{state::Pool, util::check_cosigner};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositSellArgs {
    asset_amount: u64,
}

#[derive(Accounts)]
#[instruction(args:DepositSellArgs)]
pub struct DepositSell<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: we will check cosigner when cosign field is on
    pub cosigner: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    pub asset_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = owner,
    )]
    pub asset_token_account: Account<'info, TokenAccount>,
    // pub asset_metadata: Account<'info, Token>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = asset_mint,
        associated_token::authority = pool,
    )]
    pub sellside_escrow_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<DepositSell>, args: DepositSellArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let asset_token_account = &ctx.accounts.asset_token_account;
    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let token_program = &ctx.accounts.token_program;
    let cosigner = &ctx.accounts.cosigner;
    let pool = &mut ctx.accounts.pool;

    check_cosigner(pool, cosigner)?;

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

    pool.sellside_orders_count += args.asset_amount;
    Ok(())
}
