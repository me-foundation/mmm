use crate::{
    errors::MMMErrorCode,
    state::{Allowlist, Pool, ALLOWLIST_MAX_LEN},
};
use anchor_lang::prelude::*;

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

pub fn is_native_mint(mint: Pubkey) -> bool {
    mint.eq(&Pubkey::default())
}

pub fn check_allowlists(allowlists: &Vec<Allowlist>) -> Result<()> {
    if allowlists.len() > ALLOWLIST_MAX_LEN {
        msg!("InvalidAllowLists: more entries than allowed");
        return Err(MMMErrorCode::InvalidAllowLists.into());
    }

    if allowlists.is_empty() {
        msg!("InvalidAllowLists: 0 entries");
        return Err(MMMErrorCode::InvalidAllowLists.into());
    }

    for allowlist in allowlists.iter() {
        if !allowlist.valid() {
            msg!("InvalidAllowLists: invalid entry");
            return Err(MMMErrorCode::InvalidAllowLists.into());
        }
    }

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
