use anchor_lang::{prelude::*, solana_program::sysvar, AnchorDeserialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::{
    ata::init_if_needed_ocp_ata,
    constants::*,
    errors::MMMErrorCode,
    instructions::vanilla::WithdrawSellArgs,
    state::{Pool, SellState},
    util::{log_pool, try_close_pool, try_close_sell_state},
};

#[derive(Accounts)]
#[instruction(args:WithdrawSellArgs)]
pub struct OcpWithdrawSell<'info> {
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
        constraint = asset_mint.supply == 1 && asset_mint.decimals == 0 @ MMMErrorCode::InvalidOcpAssetParams,
    )]
    pub asset_mint: Account<'info, Mint>,
    /// CHECK: will be checked in cpi
    pub asset_metadata: UncheckedAccount<'info>,
    /// CHECK: checked in init_if_needed_ocp_ata
    #[account(mut)]
    pub asset_token_account: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = pool,
        constraint = sellside_escrow_token_account.amount == 1 @ MMMErrorCode::InvalidOcpAssetParams,
        constraint = args.asset_amount == 1 @ MMMErrorCode::InvalidOcpAssetParams,
    )]
    pub sellside_escrow_token_account: Box<Account<'info, TokenAccount>>,
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

    /// CHECK: check in cpi
    #[account(mut)]
    pub ocp_mint_state: UncheckedAccount<'info>,
    /// CHECK: check in cpi
    pub ocp_policy: UncheckedAccount<'info>,
    /// CHECK: check in cpi
    pub ocp_freeze_authority: UncheckedAccount<'info>,
    /// CHECK: check in cpi
    #[account(address = open_creator_protocol::id())]
    pub ocp_program: UncheckedAccount<'info>,
    /// CHECK: check in cpi
    #[account(address = community_managed_token::id())]
    pub cmt_program: UncheckedAccount<'info>,
    /// CHECK: check in cpi
    #[account(address = sysvar::instructions::id())]
    pub instructions: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<OcpWithdrawSell>, args: WithdrawSellArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let asset_token_account = &ctx.accounts.asset_token_account;
    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let token_program = &ctx.accounts.token_program;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;
    let asset_mint = &ctx.accounts.asset_mint;
    let asset_metadata = &ctx.accounts.asset_metadata;

    let pool_seeds: &[&[&[u8]]] = &[&[
        POOL_PREFIX.as_bytes(),
        pool.owner.as_ref(),
        pool.uuid.as_ref(),
        &[*ctx.bumps.get("pool").unwrap()],
    ]];

    // Note that check_allowlists_for_mint is optional for withdraw_sell
    // because sometimes the nft or sft might be moved out of the collection
    // and we'd still like to enable the withdraw of those items for the pool owner.
    // check_allowlists_for_mint(&pool.allowlists, asset_mint, asset_metadata)?;

    init_if_needed_ocp_ata(
        ctx.accounts.ocp_program.to_account_info(),
        open_creator_protocol::cpi::accounts::InitAccountCtx {
            policy: ctx.accounts.ocp_policy.to_account_info(),
            mint: asset_mint.to_account_info(),
            metadata: asset_metadata.to_account_info(),
            mint_state: ctx.accounts.ocp_mint_state.to_account_info(),
            from: owner.to_account_info(),
            from_account: asset_token_account.to_account_info(),
            cmt_program: ctx.accounts.cmt_program.to_account_info(),
            instructions: ctx.accounts.instructions.to_account_info(),
            freeze_authority: ctx.accounts.ocp_freeze_authority.to_account_info(),
            token_program: token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            payer: owner.to_account_info(),
        },
    )?;

    open_creator_protocol::cpi::transfer(CpiContext::new_with_signer(
        ctx.accounts.ocp_program.to_account_info(),
        open_creator_protocol::cpi::accounts::TransferCtx {
            policy: ctx.accounts.ocp_policy.to_account_info(),
            mint: asset_mint.to_account_info(),
            metadata: asset_metadata.to_account_info(),
            mint_state: ctx.accounts.ocp_mint_state.to_account_info(),
            from: pool.to_account_info(),
            from_account: sellside_escrow_token_account.to_account_info(),
            cmt_program: ctx.accounts.cmt_program.to_account_info(),
            instructions: ctx.accounts.instructions.to_account_info(),
            freeze_authority: ctx.accounts.ocp_freeze_authority.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            to: owner.to_account_info(),
            to_account: asset_token_account.to_account_info(),
        },
        pool_seeds,
    ))?;

    // we can close the sellside_escrow_token_account if no amount left
    if sellside_escrow_token_account.amount == args.asset_amount {
        open_creator_protocol::cpi::close(CpiContext::new_with_signer(
            ctx.accounts.cmt_program.to_account_info(),
            open_creator_protocol::cpi::accounts::CloseCtx {
                policy: ctx.accounts.ocp_policy.to_account_info(),
                freeze_authority: ctx.accounts.ocp_freeze_authority.to_account_info(),
                mint: asset_mint.to_account_info(),
                metadata: asset_metadata.to_account_info(),
                mint_state: ctx.accounts.ocp_mint_state.to_account_info(),
                from: pool.to_account_info(),
                from_account: sellside_escrow_token_account.to_account_info(),
                token_program: token_program.to_account_info(),
                cmt_program: ctx.accounts.cmt_program.to_account_info(),
                instructions: ctx.accounts.instructions.to_account_info(),
                destination: owner.to_account_info(),
            },
            pool_seeds,
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
    log_pool("post_ocp_withdraw_sell", pool)?;
    try_close_pool(pool, owner.to_account_info())?;

    Ok(())
}
