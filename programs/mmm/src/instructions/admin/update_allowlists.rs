use crate::pool_event::PoolEvent;

use super::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateAllowlistsArgs {
    pub allowlists: [Allowlist; ALLOWLIST_MAX_LEN],
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(args:UpdateAllowlistsArgs)]
pub struct UpdateAllowlists<'info> {
    #[account(mut)]
    pub cosigner: Signer<'info>,
    /// CHECK: Owner is only used for seed derivation. Cosigner has_one constraint is checked in the pool account.
    pub owner: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
        bump,
        has_one = cosigner @ MMMErrorCode::InvalidCosigner,
    )]
    pub pool: Box<Account<'info, Pool>>,
}

pub fn handler(ctx: Context<UpdateAllowlists>, args: UpdateAllowlistsArgs) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    check_allowlists(&args.allowlists)?;

    pool.allowlists = args.allowlists;

    emit_cpi!(PoolEvent {
        prefix: "Allowlists updated".to_string(),
        pool_state: pool.to_account_info().try_borrow_data()?.to_vec(),
    });

    Ok(())
}
