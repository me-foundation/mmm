use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke, sysvar},
    AnchorDeserialize,
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use mpl_token_auth_rules::payload::{Payload, PayloadType, SeedsVec};
use mpl_token_metadata::{
    instruction::{builders::TransferBuilder, InstructionBuilder, TransferArgs},
    processor::AuthorizationData,
};
use spl_associated_token_account::get_associated_token_address;

use crate::{
    constants::*,
    errors::MMMErrorCode,
    instructions::vanilla::DepositSellArgs,
    state::{Pool, SellState},
    util::{assert_is_programmable, check_allowlists_for_mint, log_pool},
};

#[derive(Accounts)]
#[instruction(args:DepositSellArgs)]
pub struct Mip1DepositSell<'info> {
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
    /// CHECK: we will check the metadata in check_allowlists_for_mint(), also checked in cpi
    #[account(mut)]
    pub asset_metadata: UncheckedAccount<'info>,
    #[account(
        constraint = asset_mint.supply == 1 && asset_mint.decimals == 0 @ MMMErrorCode::InvalidMip1AssetParams,
    )]
    pub asset_mint: Account<'info, Mint>,
    /// CHECK: will be checked in cpi
    pub asset_master_edition: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = asset_mint,
        token::authority = owner,
        constraint = asset_token_account.amount == 1 @ MMMErrorCode::InvalidMip1AssetParams,
        constraint = args.asset_amount == 1 @ MMMErrorCode::InvalidMip1AssetParams,
    )]
    pub asset_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: will be checked in cpi
    #[account(mut, address = get_associated_token_address(&pool.key(), &asset_mint.key()))]
    pub sellside_escrow_token_account: UncheckedAccount<'info>,
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
    /// CHECK: will be checked in cpi
    #[account(mut)]
    pub owner_token_record: UncheckedAccount<'info>,
    /// CHECK: will be checked in cpi
    #[account(mut)]
    pub destination_token_record: UncheckedAccount<'info>,
    /// CHECK: will be checked in cpi
    pub authorization_rules: UncheckedAccount<'info>,

    /// CHECK: checked by address and in cpi
    #[account(address = mpl_token_metadata::id())]
    pub token_metadata_program: UncheckedAccount<'info>,
    /// CHECK: checked by address and in cpi
    #[account(address = mpl_token_auth_rules::id())]
    pub authorization_rules_program: UncheckedAccount<'info>,
    /// CHECK: checked by address and in cpi
    #[account(address = sysvar::instructions::id())]
    pub instructions: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Mip1DepositSell>, args: DepositSellArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let asset_token_account = &ctx.accounts.asset_token_account;
    let asset_mint = &ctx.accounts.asset_mint;
    let asset_metadata = &ctx.accounts.asset_metadata;
    let token_program = &ctx.accounts.token_program;
    let sellside_escrow_token_account = &ctx.accounts.sellside_escrow_token_account;
    let pool = &mut ctx.accounts.pool;
    let asset_master_edition = &ctx.accounts.asset_master_edition;
    let owner_token_record = &ctx.accounts.owner_token_record;
    let destination_token_record = &ctx.accounts.destination_token_record;
    let sell_state = &mut ctx.accounts.sell_state;
    let system_program = &ctx.accounts.system_program;
    let instructions = &ctx.accounts.instructions;
    let associated_token_program = &ctx.accounts.associated_token_program;
    let authorization_rules = &ctx.accounts.authorization_rules;
    let authorization_rules_program = &ctx.accounts.authorization_rules_program;

    let parsed_metadata = check_allowlists_for_mint(
        &pool.allowlists,
        asset_mint,
        asset_metadata,
        Some(asset_master_edition),
    )?;
    assert_is_programmable(&parsed_metadata)?;

    let payload = Payload::from([(
        "DestinationSeeds".to_owned(),
        PayloadType::Seeds(SeedsVec {
            seeds: vec![
                POOL_PREFIX.as_bytes().to_vec(),
                owner.key().to_bytes().to_vec(),
                pool.uuid.to_bytes().to_vec(),
            ],
        }),
    )]);
    let ins = TransferBuilder::new()
        .token(asset_token_account.key())
        .token_owner(owner.key())
        .destination(sellside_escrow_token_account.key())
        .destination_owner(pool.key())
        .mint(asset_mint.key())
        .metadata(asset_metadata.key())
        .edition(asset_master_edition.key())
        .owner_token_record(owner_token_record.key())
        .destination_token_record(destination_token_record.key())
        .authority(owner.key())
        .payer(owner.key())
        .system_program(system_program.key())
        .sysvar_instructions(instructions.key())
        .spl_token_program(token_program.key())
        .spl_ata_program(associated_token_program.key())
        .authorization_rules(authorization_rules.key())
        .authorization_rules_program(authorization_rules_program.key())
        .build(TransferArgs::V1 {
            authorization_data: Some(AuthorizationData { payload }),
            amount: args.asset_amount,
        })
        .unwrap()
        .instruction();

    invoke(
        &ins,
        &[
            asset_token_account.to_account_info(),
            owner.to_account_info(),
            sellside_escrow_token_account.to_account_info(),
            pool.to_account_info(),
            asset_mint.to_account_info(),
            asset_metadata.to_account_info(),
            asset_master_edition.to_account_info(),
            owner_token_record.to_account_info(),
            destination_token_record.to_account_info(),
            system_program.to_account_info(),
            instructions.to_account_info(),
            token_program.to_account_info(),
            associated_token_program.to_account_info(),
            authorization_rules.to_account_info(),
            authorization_rules_program.to_account_info(),
        ],
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
    log_pool("post_mip1_deposit_sell", pool)?;

    Ok(())
}
