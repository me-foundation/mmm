use anchor_lang::prelude::*;
use solana_program::{account_info::AccountInfo, pubkey::Pubkey};
use spl_token_2022::{
    extension::{
        group_member_pointer::GroupMemberPointer, metadata_pointer::MetadataPointer,
        BaseStateWithExtensions, StateWithExtensions,
    },
    state::Mint as Token22Mint,
};
use spl_token_group_interface::state::TokenGroupMember;
use spl_token_metadata_interface::state::TokenMetadata;

use crate::{errors::MMMErrorCode, state::*};

pub fn check_allowlists_for_mint_ext(
    allowlists: &[Allowlist],
    token_mint: &AccountInfo,
    allowlist_aux: Option<String>,
) -> Result<TokenMetadata> {
    if token_mint.owner != &spl_token_2022::ID || token_mint.data_is_empty() {
        return Err(MMMErrorCode::InvalidTokenMint.into());
    }
    let borrowed_data = token_mint.data.borrow();
    let mint_deserialized = StateWithExtensions::<Token22Mint>::unpack(&borrowed_data)?;
    if !mint_deserialized.base.is_initialized {
        return Err(MMMErrorCode::InvalidTokenMint.into());
    }

    // verify metadata extension
    if let Ok(metadata_ptr) = mint_deserialized.get_extension::<MetadataPointer>() {
        if Option::<Pubkey>::from(metadata_ptr.metadata_address) != Some(*token_mint.key) {
            return Err(MMMErrorCode::InValidTokenExtension.into());
        }
    }
    let parsed_metadata = mint_deserialized
        .get_variable_len_extension::<TokenMetadata>()
        .unwrap();

    if allowlists
        .iter()
        .any(|&val| val.kind == ALLOWLIST_KIND_METADATA)
    {
        // If allowlist_aux is not passed in, do not validate URI.
        if let Some(ref aux_key) = allowlist_aux {
            // Handle URI padding.
            if !parsed_metadata.uri.trim().starts_with(aux_key) {
                msg!(
                    "Failed metadata validation. Expected URI: |{}| but got |{}|",
                    *aux_key,
                    parsed_metadata.uri
                );
                return Err(MMMErrorCode::UnexpectedMetadataUri.into());
            }
        }
    }

    // verify group member extension
    if let Ok(group_member_ptr) = mint_deserialized.get_extension::<GroupMemberPointer>() {
        if Some(*token_mint.key) != Option::<Pubkey>::from(group_member_ptr.member_address) {
            return Err(MMMErrorCode::InValidTokenExtension.into());
        }
    }
    if let Ok(group_member) = mint_deserialized.get_extension::<TokenGroupMember>() {
        let group_allowlist = allowlists
            .iter()
            .find(|allowlist| allowlist.kind == ALLOWLIST_KIND_GROUP);
        if Some(group_member.group) != group_allowlist.map(|allowlist| allowlist.value) {
            return Err(MMMErrorCode::InValidTokenExtension.into());
        }
        // counter spoof check
        if Some(group_member.mint) != Some(*token_mint.key) {
            return Err(MMMErrorCode::InValidTokenExtension.into());
        }

    } else {
        return Err(MMMErrorCode::InValidTokenExtension.into());
    }

    for allowlist_val in allowlists.iter() {
        match allowlist_val.kind {
            ALLOWLIST_KIND_EMPTY => {}
            ALLOWLIST_KIND_ANY => {
                // any is a special case, we don't need to check anything else
                return Ok(parsed_metadata);
            }
            ALLOWLIST_KIND_FVCA => {
                return Err(MMMErrorCode::InvalidAllowLists.into());
            }
            ALLOWLIST_KIND_MINT => {
                if token_mint.key() == allowlist_val.value {
                    return Ok(parsed_metadata);
                }
            }
            ALLOWLIST_KIND_MCC => {
                return Err(MMMErrorCode::InvalidAllowLists.into());
            }
            ALLOWLIST_KIND_METADATA | ALLOWLIST_KIND_GROUP => {
                // Do not validate URI here, as we already did it above.
                // Group is validated in a separate function.
                // These checks are separate since allowlist values are unioned together.
                continue;
            }
            _ => {
                return Err(MMMErrorCode::InvalidAllowLists.into());
            }
        }
    }

    // at the end, we didn't find a match, thus return err
    Err(MMMErrorCode::InvalidAllowLists.into())
}
