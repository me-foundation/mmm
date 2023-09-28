use super::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateDynamicAllowlistArgs {
    pub cosigner_annotation: [u8; 32],
    pub allowlists: [Allowlist; ALLOWLIST_MAX_LEN],
}

#[derive(Accounts)]
#[instruction(args: CreateDynamicAllowlistArgs)]
pub struct CreateDynamicAllowlist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        seeds = [ALLOWLIST_PREFIX.as_bytes(), authority.key().as_ref(), args.cosigner_annotation.as_ref()],
        bump,
        space = DynamicAllowlist::LEN,
    )]
    pub dynamic_allowlist: Box<Account<'info, DynamicAllowlist>>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateDynamicAllowlist>,
    args: CreateDynamicAllowlistArgs,
) -> Result<()> {
    let dynamic_allowlist = &mut ctx.accounts.dynamic_allowlist;

    check_allowlists(&args.allowlists)?;

    dynamic_allowlist.authority = ctx.accounts.authority.key();
    dynamic_allowlist.cosigner_annotation = args.cosigner_annotation;
    dynamic_allowlist.allowlists = args.allowlists;

    Ok(())
}
