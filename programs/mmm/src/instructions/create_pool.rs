use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::state::Pool;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreatePoolArgs{
    uuid: String
}

#[derive(Accounts)]
#[instruction(args:CreatePoolArgs)]
pub struct CreatePool<'info> {
    #[account(mut)]
    owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        seeds = [b"mmm_pool", owner.key().as_ref(), args.uuid.as_bytes()],
        space = Pool::LEN,
        bump
    )]
    pool: Account<'info, Pool>,
    system_program: Program<'info, System>
}
