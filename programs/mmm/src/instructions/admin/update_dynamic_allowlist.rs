use super::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateDynamicAllowlistArgs {
    pub cosigner_annotation: [u8; 32],
    pub allowlists: [Allowlist; ALLOWLIST_MAX_LEN],
}

#[derive(Accounts)]
#[instruction(args:UpdateDynamicAllowlistArgs)]
pub struct UpdateDynamicAllowlist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [ALLOWLIST_PREFIX.as_bytes(), args.cosigner_annotation.as_ref()],
        bump,
        has_one = authority @ MMMErrorCode::InvalidOwner,
    )]
    pub dynamic_allowlist: Box<Account<'info, DynamicAllowlist>>,
}

pub fn handler(
    ctx: Context<UpdateDynamicAllowlist>,
    args: UpdateDynamicAllowlistArgs,
) -> Result<()> {
    let dynamic_allowlist = &mut ctx.accounts.dynamic_allowlist;

    check_allowlists(&args.allowlists)?;

    dynamic_allowlist.allowlists = args.allowlists;

    Ok(())
}
