use super::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateAllowlistsArgs {
    pub allowlists: [Allowlist; ALLOWLIST_MAX_LEN],
}

#[derive(Accounts)]
#[instruction(args:UpdateAllowlistsArgs)]
pub struct UpdateAllowlists<'info> {
    #[account(mut, address = CANCEL_AUTHORITY)]
    pub authority: Signer<'info>,
    /// CHECK: Owner is not validated because this is a permissioned handler
    pub owner: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
        bump,
        has_one = owner @ MMMErrorCode::InvalidOwner,
    )]
    pub pool: Box<Account<'info, Pool>>,
}

pub fn handler(ctx: Context<UpdateAllowlists>, args: UpdateAllowlistsArgs) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    check_allowlists(&args.allowlists)?;

    pool.allowlists = args.allowlists;

    Ok(())
}
