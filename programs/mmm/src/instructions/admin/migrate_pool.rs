use super::*;

// These args aren't validated because this is a permissioned handler.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct MigratePoolArgs {
    pub cosigner_annotation: [u8; 32],
    pub owner: Pubkey,
    pub uuid: Pubkey,
    pub allowlists: [Allowlist; ALLOWLIST_MAX_LEN],
}

#[derive(Accounts)]
#[instruction(args: MigratePoolArgs)]
pub struct MigratePool<'info> {
    // Alternate design: use the pool cosigner as the authority.
    // This would allow non-ME pools to be migrated.
    #[account(mut, address = CANCEL_AUTHORITY)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), args.owner.key().as_ref(), args.uuid.as_ref()],
        bump,
    )]
    pub pool: Box<Account<'info, Pool>>,
    #[account(
        seeds = [ALLOWLIST_PREFIX.as_bytes(), authority.key().as_ref(), args.cosigner_annotation.as_ref()],
        bump,
    )]
    pub dynamic_allowlist: Box<Account<'info, DynamicAllowlist>>,
}

pub fn handler(ctx: Context<MigratePool>, _args: MigratePoolArgs) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let dynamic_allowlist = &mut ctx.accounts.dynamic_allowlist;

    // Sanity check that the existing allowlists on the pool are the same
    // as the allowlists on the DynamicAllowlist account.
    if pool.allowlists != dynamic_allowlist.allowlists {
        return Err(MMMErrorCode::InvalidAllowLists.into());
    }

    // Set the pool to an allowlist where the first one is the pointer to the dynamic allowlist pda and the
    // rest are uninitialized.
    pool.allowlists = create_dynamic_allowlist_ptr(dynamic_allowlist.key());

    Ok(())
}
