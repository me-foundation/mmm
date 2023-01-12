#![allow(clippy::result_large_err)]

use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

declare_id!("mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc");

mod ata;
mod constants;
mod errors;
mod instructions;
mod state;
mod util;

use instructions::*;

#[program]
pub mod mmm {
    use super::*;

    pub fn create_pool(ctx: Context<CreatePool>, args: CreatePoolArgs) -> Result<()> {
        instructions::create_pool::handler(ctx, args)
    }

    pub fn update_pool(ctx: Context<UpdatePool>, args: UpdatePoolArgs) -> Result<()> {
        instructions::update_pool::handler(ctx, args)
    }

    pub fn sol_close_pool(ctx: Context<SolClosePool>) -> Result<()> {
        instructions::sol_close_pool::handler(ctx)
    }

    pub fn sol_deposit_buy(ctx: Context<SolDepositBuy>, args: SolDepositBuyArgs) -> Result<()> {
        instructions::sol_deposit_buy::handler(ctx, args)
    }

    pub fn sol_withdraw_buy(ctx: Context<SolWithdrawBuy>, args: SolWithdrawBuyArgs) -> Result<()> {
        instructions::sol_withdraw_buy::handler(ctx, args)
    }

    pub fn sol_fulfill_buy<'info>(
        ctx: Context<'_, '_, '_, 'info, SolFulfillBuy<'info>>,
        args: SolFulfillBuyArgs,
    ) -> Result<()> {
        instructions::sol_fulfill_buy::handler(ctx, args)
    }

    pub fn sol_fulfill_sell<'info>(
        ctx: Context<'_, '_, '_, 'info, SolFulfillSell<'info>>,
        args: SolFulfillSellArgs,
    ) -> Result<()> {
        instructions::sol_fulfill_sell::handler(ctx, args)
    }

    pub fn withdraw_sell(ctx: Context<WithdrawSell>, args: WithdrawSellArgs) -> Result<()> {
        instructions::withdraw_sell::handler(ctx, args)
    }

    pub fn deposit_sell(ctx: Context<DepositSell>, args: DepositSellArgs) -> Result<()> {
        instructions::deposit_sell::handler(ctx, args)
    }

    pub fn ocp_deposit_sell(ctx: Context<OcpDepositSell>, args: DepositSellArgs) -> Result<()> {
        instructions::ocp_deposit_sell::handler(ctx, args)
    }

    pub fn sol_ocp_fulfill_buy<'info>(
        ctx: Context<'_, '_, '_, 'info, SolOcpFulfillBuy<'info>>,
        args: SolFulfillBuyArgs,
    ) -> Result<()> {
        instructions::sol_ocp_fulfill_buy::handler(ctx, args)
    }

    pub fn sol_ocp_fulfill_sell<'info>(
        ctx: Context<'_, '_, '_, 'info, SolOcpFulfillSell<'info>>,
        args: SolOcpFulfillSellArgs,
    ) -> Result<()> {
        instructions::sol_ocp_fulfill_sell::handler(ctx, args)
    }

    pub fn ocp_withdraw_sell(ctx: Context<OcpWithdrawSell>, args: WithdrawSellArgs) -> Result<()> {
        instructions::ocp_withdraw_sell::handler(ctx, args)
    }
}
