use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{state::Pool, util::{check_cosigner, is_native_mint}, errors::MMMErrorCode};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositBuyArgs {
    payment_amount: u64,
}

// This is targeting the deposit of native payment_mint: SOL
#[derive(Accounts)]
#[instruction(args:DepositBuyArgs)]
pub struct DepositBuy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: we will check cosigner when cosign field is on
    pub cosigner: UncheckedAccount<'info>,
    #[account(
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    /// CHECK: it's a pda, and the private key is owned by the seeds
    #[account(
        mut,
        seeds = [b"mmm_buyside_sol_escrow_account", pool.key().as_ref()],
        bump,
    )]
    pub buyside_sol_escrow_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositBuy>, args: DepositBuyArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let system_program = &ctx.accounts.system_program;
    let cosigner = &ctx.accounts.cosigner;
    let pool = &ctx.accounts.pool;

    check_cosigner(pool, cosigner)?;

    // make sure that this only works for native payment mint
    if !is_native_mint(pool.payment_mint) {
        msg!("only the native Pubkey::default() payment mint is supported");
        return Err(MMMErrorCode::InvalidPaymentMint.into());
    }

    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            owner.key,
            buyside_sol_escrow_account.key,
            args.payment_amount,
        ),
        &[
            owner.to_account_info(),
            buyside_sol_escrow_account.to_account_info(),
            system_program.to_account_info(),
        ],
    )?;

    Ok(())
}
