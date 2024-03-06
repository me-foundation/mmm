use solana_program::{account_info::AccountInfo, pubkey::Pubkey};
use spl_token_2022::{
    extension::{
        group_member_pointer::GroupMemberPointer, BaseStateWithExtensions, StateWithExtensions,
    },
    state::Mint as Token22Mint,
};
use spl_token_group_interface::state::TokenGroupMember;

use crate::state::{Allowlist, ALLOWLIST_KIND_GROUP};

use {crate::errors::MMMErrorCode, anchor_lang::prelude::*};

pub fn check_group_ext_for_mint(token_mint: &AccountInfo, allowlists: &[Allowlist]) -> Result<()> {
    if token_mint.data_is_empty() {
        return Err(MMMErrorCode::InvalidTokenMint.into());
    }
    let borrowed_data = token_mint.data.borrow();
    let mint_deserialized = StateWithExtensions::<Token22Mint>::unpack(&borrowed_data)?;
    if !mint_deserialized.base.is_initialized {
        return Err(MMMErrorCode::InvalidTokenMint.into());
    }
    if let Ok(group_member_ptr) = mint_deserialized.get_extension::<GroupMemberPointer>() {
        if Some(*token_mint.key) != Option::<Pubkey>::from(group_member_ptr.member_address) {
            return Err(MMMErrorCode::InValidTokenExtension.into());
        }
    }
    if let Ok(group_member) = mint_deserialized.get_extension::<TokenGroupMember>() {
        let group_address = allowlists
            .iter()
            .find(|allowlist| allowlist.kind == ALLOWLIST_KIND_GROUP)
            .map(|allowlist| allowlist.value);
        if Some(group_member.group) != group_address {
            return Err(MMMErrorCode::InValidTokenExtension.into());
        }
    } else {
        return Err(MMMErrorCode::InValidTokenExtension.into());
    }

    Ok(())
}
