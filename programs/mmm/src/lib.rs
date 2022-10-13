use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

declare_id!("mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc");

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

    pub fn close_pool(ctx: Context<ClosePool>) -> Result<()> {
        instructions::close_pool::handler(ctx)
    }

    pub fn deposit_buy(ctx: Context<DepositBuy>, args: DepositBuyArgs) -> Result<()> {
        instructions::deposit_buy::handler(ctx, args)
    }

    pub fn deposit_sell(ctx: Context<DepositSell>, args: DepositSellArgs) -> Result<()> {
        instructions::deposit_sell::handler(ctx, args)
    }

    pub fn withdraw_buy(ctx: Context<WithdrawBuy>, args: WithdrawBuyArgs) -> Result<()> {
        instructions::withdraw_buy::handler(ctx, args)
    }

    pub fn withdraw_sell(ctx: Context<WithdrawSell>, args: WithdrawSellArgs) -> Result<()> {
        instructions::withdraw_sell::handler(ctx, args)
    }

    pub fn fulfill_buy(ctx: Context<FulfillBuy>, args: FulfillBuyArgs) -> Result<()> {
        instructions::fulfill_buy::handler(ctx, args)
    }

    pub fn fulfill_sell(ctx: Context<FulfillSell>, args: FulfillSellArgs) -> Result<()> {
        instructions::fulfill_sell::handler(ctx, args)
    }
}
