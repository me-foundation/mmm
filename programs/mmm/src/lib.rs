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

    pub fn withdraw_lp_fee(ctx: Context<WithdrawLPFee>, args: WithdrawLPFeeArgs) -> Result<()> {
        Ok(())
    }

    pub fn fulfill_buy(ctx: Context<FulfillBuy>, args: FulfillBuyArgs) -> Result<()> {
        Ok(())
    }

    pub fn fulfill_sell(ctx: Context<FulfillSell>, args: FulfillSellArgs) -> Result<()> {
        Ok(())
    }

    pub fn change_spot_price(
        ctx: Context<ChangeSpotPrice>,
        args: ChangeSpotPriceArgs,
    ) -> Result<()> {
        Ok(())
    }

    pub fn change_curve(ctx: Context<ChangeCurve>, args: ChangeCurveArgs) -> Result<()> {
        Ok(())
    }

    pub fn change_lp_fee(ctx: Context<ChangeLPFee>, args: ChangeLPFeeArgs) -> Result<()> {
        Ok(())
    }
}
