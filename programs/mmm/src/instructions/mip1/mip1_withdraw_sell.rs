use std::collections::HashMap;

use anchor_lang::{prelude::*, solana_program::sysvar, AnchorDeserialize};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use mpl_token_metadata::{
    accounts::Metadata,
    instructions::TransferCpiBuilder,
    types::{AuthorizationData, Payload, PayloadType, SeedsVec, TransferArgs},
};

use crate::{
    constants::*,
    errors::MMMErrorCode,
    instructions::vanilla::WithdrawSellArgs,
    pool_event::PoolEvent,
    state::{Pool, SellState},
    util::{assert_is_programmable, try_close_pool, try_close_sell_state},
};

#[event_cpi]
#[derive(Accounts)]
#[instruction(args:WithdrawSellArgs)]
pub struct Mip1WithdrawSell<'info> {
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
        constraint = asset_mint.supply == 1 && asset_mint.decimals == 0 @ MMMErrorCode::InvalidMip1AssetParams,
    )]
    pub asset_mint: Account<'info, Mint>,
    /// CHECK: will be checked in cpi
    asset_master_edition: UncheckedAccount<'info>,
    /// CHECK: will be checked in cpi
    #[account(mut,
    seeds = [
        "metadata".as_bytes(),
        mpl_token_metadata::ID.as_ref(),
        asset_mint.key().as_ref(),
    ],
    bump,
    seeds::program = mpl_token_metadata::ID,
    )]
    pub asset_metadata: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        associated_token::mint = asset_mint,
        associated_token::authority = owner,
        payer = owner
    )]
    pub asset_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = pool,
        constraint = sellside_escrow_token_account.amount == 1 @ MMMErrorCode::InvalidMip1AssetParams,
        constraint = args.asset_amount == 1 @ MMMErrorCode::InvalidMip1AssetParams,
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
    /// CHECK: will be checked in cpi
    #[account(mut)]
    pub owner_token_record: UncheckedAccount<'info>,
    /// CHECK: will be checked in cpi
    #[account(mut)]
    pub destination_token_record: UncheckedAccount<'info>,
    /// CHECK: will be checked in cpi
    pub authorization_rules: UncheckedAccount<'info>,

    /// CHECK: checked by address and in cpi
    #[account(address = mpl_token_metadata::ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
    /// CHECK: checked by address and in cpi
    #[account(address = MPL_TOKEN_AUTH_RULES)]
    pub authorization_rules_program: UncheckedAccount<'info>,
    /// CHECK: checked by address and in cpi
    #[account(address = sysvar::instructions::id())]
    pub instructions: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Mip1WithdrawSell>, args: WithdrawSellArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let asset_token_account = &ctx.accounts.asset_token_account;
    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let token_program = &ctx.accounts.token_program;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;
    let asset_mint = &ctx.accounts.asset_mint;
    let asset_metadata = &ctx.accounts.asset_metadata;
    let asset_master_edition = &ctx.accounts.asset_master_edition;
    let owner_token_record = &ctx.accounts.owner_token_record;
    let destination_token_record = &ctx.accounts.destination_token_record;
    let system_program = &ctx.accounts.system_program;
    let instructions = &ctx.accounts.instructions;
    let associated_token_program = &ctx.accounts.associated_token_program;
    let authorization_rules = &ctx.accounts.authorization_rules;
    let authorization_rules_program = &ctx.accounts.authorization_rules_program;
    let token_metadata_program_ai = &ctx.accounts.token_metadata_program.to_account_info();

    let pool_seeds: &[&[&[u8]]] = &[&[
        POOL_PREFIX.as_bytes(),
        pool.owner.as_ref(),
        pool.uuid.as_ref(),
        &[ctx.bumps.pool],
    ]];

    assert_is_programmable(&Metadata::safe_deserialize(&asset_metadata.data.borrow())?)?;

    let payload = Payload {
        map: HashMap::from([(
            "SourceSeeds".to_owned(),
            PayloadType::Seeds(SeedsVec {
                seeds: pool_seeds[0][0..3].iter().map(|v| v.to_vec()).collect(),
            }),
        )]),
    };

    let transfer_args = TransferArgs::V1 {
        authorization_data: Some(AuthorizationData { payload }),
        amount: args.asset_amount,
    };

    let mut transfer_cpi = TransferCpiBuilder::new(token_metadata_program_ai);
    transfer_cpi
        .token(&sellside_escrow_token_account.to_account_info())
        .token_owner(&pool.to_account_info())
        .destination_token(&asset_token_account.to_account_info())
        .destination_owner(&owner.to_account_info())
        .mint(&asset_mint.to_account_info())
        .metadata(&asset_metadata.to_account_info())
        .edition(Some(&asset_master_edition.to_account_info()))
        .token_record(Some(&owner_token_record.to_account_info()))
        .destination_token_record(Some(&destination_token_record.to_account_info()))
        .authority(&pool.to_account_info())
        .payer(&owner.to_account_info())
        .system_program(&system_program.to_account_info())
        .sysvar_instructions(&instructions.to_account_info())
        .spl_token_program(&token_program.to_account_info())
        .spl_ata_program(&associated_token_program.to_account_info())
        .authorization_rules(Some(&authorization_rules.to_account_info()))
        .authorization_rules_program(Some(&authorization_rules_program.to_account_info()))
        .transfer_args(transfer_args)
        .invoke_signed(pool_seeds)?;

    if sellside_escrow_token_account.amount == args.asset_amount {
        anchor_spl::token::close_account(CpiContext::new_with_signer(
            token_program.to_account_info(),
            anchor_spl::token::CloseAccount {
                account: sellside_escrow_token_account.to_account_info(),
                destination: owner.to_account_info(),
                authority: pool.to_account_info(),
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

    emit_cpi!(PoolEvent {
        prefix: "post_mip1_withdraw_sell".to_string(),
        pool_state: pool.to_account_info().try_borrow_data()?.to_vec(),
    });
    try_close_pool(pool, owner.to_account_info())?;

    Ok(())
}
