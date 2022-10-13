use crate::{errors::MMMErrorCode, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

pub fn check_cosigner(pool: &Account<Pool>, cosigner: &UncheckedAccount) -> Result<()> {
    if pool.cosigner.eq(&Pubkey::default()) {
        return Ok(());
    }

    if pool.cosigner.ne(cosigner.key) {
        return Err(MMMErrorCode::InvalidCosigner.into());
    }

    if !cosigner.is_signer {
        return Err(MMMErrorCode::InvalidCosigner.into());
    }

    Ok(())
}

pub fn check_allowlists(allowlists: &[Allowlist]) -> Result<()> {
    for allowlist in allowlists.iter() {
        if !allowlist.valid() {
            msg!("InvalidAllowLists: invalid entry");
            return Err(MMMErrorCode::InvalidAllowLists.into());
        }
    }

    Ok(())
}

pub fn check_allowlists_for_mint(
    allowlists: &[Allowlist],
    mint: &Account<Mint>,
    metadata: &AccountInfo,
) -> Result<()> {
    // TODO: we need to check the following validation rules
    // 1. make sure the metadata is correctly derived from the metadata pda with the mint
    // 2. make sure mint+metadata(e.g. first verified creator address) can match one of the allowlist
    // 3. note that the allowlist is unioned together, not intersection
    // 4. skip if the allowlist.is_empty()
    Ok(())
}

pub fn check_curve(curve_type: u8, curve_delta: u64) -> Result<()> {
    // So far we only allow linear and exponential curves
    // 0: linear
    // 1: exp
    if curve_type > 1 {
        return Err(MMMErrorCode::InvalidCurveType.into());
    }

    // If the curve type is exp, then the curve_delta should follow bp format,
    // which is less than 10000
    if curve_type == 1 && curve_delta > 10000 {
        return Err(MMMErrorCode::InvalidCurveDelta.into());
    }

    Ok(())
}

pub fn get_sol_lp_fee(
    pool: &Pool,
    buyside_sol_escrow_balance: u64,
    total_sol_price: u64,
) -> Result<u64> {
    if pool.sellside_orders_count < 1 {
        return Ok(0);
    }

    if buyside_sol_escrow_balance < pool.spot_price {
        return Ok(0);
    }

    Ok(((total_sol_price as u128)
        .checked_mul(pool.lp_fee_bp as u128)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_div(10000)
        .ok_or(MMMErrorCode::NumericOverflow)?) as u64)
}

pub fn get_sol_total_price(pool: &Pool, n: u64, fulfill_buy: bool) -> Result<u64> {
    // the price needs to go down
    let p = pool.spot_price;
    let delta = pool.curve_delta;
    match fulfill_buy {
        true => {
            match pool.curve_type {
                CURVE_KIND_LINEAR => {
                    // n*(2*p-(n-1)*delta)/2
                    Ok(0)
                }
                CURVE_KIND_EXP => {
                    // r = 1 / (1 + delta/10000)
                    // p * (1-(1+r^n)/(1-r))
                    Ok(0)
                }
                _ => Err(MMMErrorCode::InvalidCurveType.into()),
            }
        }
        false => {
            match pool.curve_type {
                CURVE_KIND_LINEAR => {
                    // n*(2*p+(n-1)*delta)/2
                    Ok(0)
                }
                CURVE_KIND_EXP => {
                    // r = (1 + delta/10000)
                    // p * (1-(1+r^n)/(1-r))
                    Ok(0)
                }
                _ => Err(MMMErrorCode::InvalidCurveType.into()),
            }
        }
    }
}
