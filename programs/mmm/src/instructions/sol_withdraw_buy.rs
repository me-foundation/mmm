use crate::{constants::*, errors::MMMErrorCode, state::Pool};
use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SolWithdrawBuyArgs {
    payment_amount: u64,
}

#[derive(Accounts)]
#[instruction(args:SolWithdrawBuyArgs)]
pub struct SolWithdrawBuy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub cosigner: Signer<'info>,
    #[account(
        seeds = [b"mmm_pool", owner.key().as_ref(), pool.uuid.as_ref()],
        has_one = owner @ MMMErrorCode::InvalidOwner,
        constraint = pool.payment_mint.eq(&Pubkey::default()) @ MMMErrorCode::InvalidPaymentMint,
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: it's a pda, and the private key is owned by the seeds
    #[account(
        mut,
        seeds = [BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(), pool.key().as_ref()],
        bump,
    )]
    pub buyside_sol_escrow_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<SolWithdrawBuy>, args: SolWithdrawBuyArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let system_program = &ctx.accounts.system_program;
    let pool = &ctx.accounts.pool;

    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::transfer(
            buyside_sol_escrow_account.key,
            owner.key,
            args.payment_amount,
        ),
        &[
            buyside_sol_escrow_account.to_account_info(),
            owner.to_account_info(),
            system_program.to_account_info(),
        ],
        // seeds should be the PDA of 'buyside_sol_escrow_account'
        &[&[
            BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(),
            pool.key().as_ref(),
            &[*ctx.bumps.get("buyside_sol_escrow_account").unwrap()],
        ]],
    )?;

    Ok(())
}
