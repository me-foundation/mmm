use crate::errors::MMMErrorCode;
use anchor_lang::prelude::*;
use spl_associated_token_account::{get_associated_token_address_with_program_id, instruction};
use spl_token_2022::{
    extension::{BaseState, StateWithExtensions},
    state::Account as TokenAccount,
};

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

fn assert_is_ata(
    ata: &AccountInfo,
    wallet: &Pubkey,
    mint: &Pubkey,
    optional_owner: &Pubkey,
    token_program_id: &Pubkey,
) -> Result<TokenAccount> {
    assert_owned_by(ata, &anchor_spl::token::ID)
        .or(assert_owned_by(ata, &anchor_spl::token_2022::ID))?;
    let ata_account = unpack_initialized::<TokenAccount>(&ata.try_borrow_data()?)?;
    if ata_account.owner != *optional_owner {
        assert_keys_equal(ata_account.owner, *wallet)?;
    }
    assert_keys_equal(ata_account.mint, *mint)?;
    assert_keys_equal(
        get_associated_token_address_with_program_id(wallet, mint, token_program_id),
        *ata.key,
    )?;
    Ok(ata_account)
}

#[inline(always)]
pub fn unpack<S: BaseState>(account_data: &[u8]) -> Result<S> {
    Ok(StateWithExtensions::<S>::unpack(account_data)?.base)
}

pub fn unpack_initialized<S: BaseState>(account_data: &[u8]) -> Result<S> {
    let unpacked = unpack::<S>(account_data)?;

    if unpacked.is_initialized() {
        Ok(unpacked)
    } else {
        Err(MMMErrorCode::UninitializedAccount.into())
    }
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
) -> Result<spl_token_2022::state::Account> {
    let token_program_id = token_program.key();

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
                token_program,
            ],
        )?;
    }
    assert_is_ata(
        &ata,
        &authority.key(),
        &mint.key(),
        &authority.key(),
        &token_program_id,
    )
}

#[allow(clippy::too_many_arguments)]
#[inline]
pub fn init_if_needed_ocp_ata<'a>(
    ocp_program: AccountInfo<'a>,
    opc_context: open_creator_protocol::cpi::accounts::InitAccountCtx<'a>,
    token_program_id: &Pubkey,
) -> Result<spl_token_2022::state::Account> {
    let ata = opc_context.from_account.to_account_info();
    let authority_key = opc_context.from.key();
    let mint_key = opc_context.mint.key();
    if opc_context.from_account.data_is_empty() {
        open_creator_protocol::cpi::init_account(CpiContext::new(
            ocp_program.to_account_info(),
            opc_context,
        ))?;
    }
    assert_is_ata(
        &ata,
        &authority_key,
        &mint_key,
        &authority_key,
        token_program_id,
    )
}
