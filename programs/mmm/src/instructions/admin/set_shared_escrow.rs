use super::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SetSharedEscrowArgs {
    pub shared_escrow_count: u64,
}

#[derive(Accounts)]
#[instruction(args:SetSharedEscrowArgs)]
pub struct SetSharedEscrow<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub cosigner: Signer<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
        bump,
        has_one = owner @ MMMErrorCode::InvalidOwner,
        has_one = cosigner @ MMMErrorCode::InvalidCosigner,
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: it's checked with seeds of M2's PDA seeds, and linked to the owner
    #[account(
        seeds = [
            M2_PREFIX.as_bytes(),
            M2_AUCTION_HOUSE.as_ref(),
            owner.key().as_ref(),
        ],
        bump,
        seeds::program = M2_PROGRAM,
    )]
    pub shared_escrow_account: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<SetSharedEscrow>, args: SetSharedEscrowArgs) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // if there is any buyside payment, we can't set shared escrow
    if pool.buyside_payment_amount > 0 {
        return Err(MMMErrorCode::InvalidAccountState.into());
    }

    // if there is any sellside asset, we can't set shared escrow
    if pool.sellside_asset_amount > 0 {
        return Err(MMMErrorCode::InvalidAccountState.into());
    }

    // not support for reinvest yet, and we will start with collection offers
    // for shared escrow first.
    if pool.reinvest_fulfill_buy || pool.reinvest_fulfill_sell {
        return Err(MMMErrorCode::InvalidAccountState.into());
    }

    pool.shared_escrow_account = ctx.accounts.shared_escrow_account.key();
    pool.shared_escrow_count = args.shared_escrow_count;
    log_pool("post_set_shared_escrow", pool)?;

    Ok(())
}
