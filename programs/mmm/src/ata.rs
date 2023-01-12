use crate::errors::MMMErrorCode;
use anchor_lang::{
    prelude::*,
    solana_program::program_pack::{IsInitialized, Pack},
};
use anchor_spl::associated_token::get_associated_token_address;
use spl_associated_token_account::instruction;

fn assert_owned_by(account: &AccountInfo, owner: &Pubkey) -> Result<()> {
    if account.owner != owner {
        Err(MMMErrorCode::InvalidTokenOwner.into())
    } else {
        Ok(())
    }
}
fn assert_keys_equal(key1: Pubkey, key2: Pubkey) -> Result<()> {
    if key1 != key2 {
        Err(MMMErrorCode::PubkeyMismatch.into())
    } else {
        Ok(())
    }
}

fn assert_initialized<T: Pack + IsInitialized>(account_info: &AccountInfo) -> Result<T> {
    let account: T = T::unpack_unchecked(&account_info.data.borrow())?;
    if !account.is_initialized() {
        Err(MMMErrorCode::UninitializedAccount.into())
    } else {
        Ok(account)
    }
}

fn assert_is_ata(
    ata: &AccountInfo,
    wallet: &Pubkey,
    mint: &Pubkey,
    optional_owner: &Pubkey,
) -> Result<spl_token::state::Account> {
    assert_owned_by(ata, &anchor_spl::token::ID)?;
    let ata_account: spl_token::state::Account = assert_initialized(ata)?;
    if ata_account.owner != *optional_owner {
        assert_keys_equal(ata_account.owner, *wallet)?;
    }
    assert_keys_equal(ata_account.mint, *mint)?;
    assert_keys_equal(get_associated_token_address(wallet, mint), *ata.key)?;
    Ok(ata_account)
}

// init_if_needed_ata asserts and checks if the ata is matching
// the owner/mint/program, and then init it if the data is empty
#[allow(clippy::too_many_arguments)]
pub fn init_if_needed_ata<'a>(
    ata: AccountInfo<'a>,
    payer: AccountInfo<'a>,
    authority: AccountInfo<'a>,
    mint: AccountInfo<'a>,
    associated_token: AccountInfo<'a>,
    token_program: AccountInfo<'a>,
    system_program: AccountInfo<'a>,
    rent: AccountInfo<'a>,
) -> Result<spl_token::state::Account> {
    if ata.data.borrow().is_empty() {
        anchor_lang::solana_program::program::invoke(
            &instruction::create_associated_token_account(
                payer.key,
                authority.key,
                mint.key,
                token_program.key,
            ),
            &[
                payer,
                ata.to_account_info(),
                authority.to_account_info(),
                mint.to_account_info(),
                associated_token,
                system_program,
                rent,
                token_program,
            ],
        )?;
    }

    assert_is_ata(&ata, &authority.key(), &mint.key(), &authority.key())
}

#[allow(clippy::too_many_arguments)]
#[inline]
pub fn init_if_needed_ocp_ata<'a>(
    ocp_program: AccountInfo<'a>,
    opc_context: open_creator_protocol::cpi::accounts::InitAccountCtx<'a>,
) -> Result<spl_token::state::Account> {
    let ata = opc_context.from_account.to_account_info();
    let authority_key = opc_context.from.key();
    let mint_key = opc_context.mint.key();
    if opc_context.from_account.data_is_empty() {
        open_creator_protocol::cpi::init_account(CpiContext::new(
            ocp_program.to_account_info(),
            opc_context,
        ))?;
    }
    assert_is_ata(&ata, &authority_key, &mint_key, &authority_key)
}
