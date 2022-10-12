use crate::{errors::MMMErrorCode, state::Pool};
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
