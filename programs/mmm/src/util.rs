use crate::{constants::MAX_METADATA_CREATOR_ROYALTY_BP, errors::MMMErrorCode, state::*};
use anchor_lang::{prelude::*, solana_program::log::sol_log_data};
use anchor_spl::token::Mint;
use mpl_token_metadata::{
    id as token_metadata_program_key,
    pda::{find_master_edition_account, find_metadata_account},
    state::{Metadata, TokenMetadataAccount},
};
use open_creator_protocol::state::Policy;

// copied from mpl-token-metadata
fn check_master_edition(master_edition_account_info: &AccountInfo) -> bool {
    let version = master_edition_account_info.data.borrow()[0];
    version == 2 || version == 6
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
    master_edition: Option<&AccountInfo>,
) -> Result<()> {
    // TODO: we need to check the following validation rules
    // 1. make sure the metadata is correctly derived from the metadata pda with the mint
    // 2. make sure mint+metadata(e.g. first verified creator address) can match one of the allowlist
    // 3. note that the allowlist is unioned together, not intersection
    // 4. skip if the allowlist.is_empty()
    // 5. verify that nft either does not have master edition or is master edition

    if *metadata.owner != token_metadata_program_key() {
        return Err(ErrorCode::AccountOwnedByWrongProgram.into());
    }
    if find_metadata_account(&mint.key()).0 != metadata.key() {
        return Err(ErrorCode::ConstraintSeeds.into());
    }
    let parsed_metadata = Metadata::from_account_info(metadata)?;
    if let Some(master_edition) = master_edition {
        if find_master_edition_account(&mint.key()).0 != master_edition.key() {
            return Err(ErrorCode::ConstraintSeeds.into());
        }
        if !master_edition.data_is_empty() {
            if master_edition.owner.ne(&token_metadata_program_key()) {
                return Err(ErrorCode::AccountOwnedByWrongProgram.into());
            }
            if !check_master_edition(master_edition) {
                return Err(MMMErrorCode::InvalidMasterEdition.into());
            }
        }
    }

    for allowlist_val in allowlists.iter() {
        match allowlist_val.kind {
            ALLOWLIST_KIND_EMPTY => {}
            ALLOWLIST_KIND_FVCA => {
                if let Some(ref creators) = parsed_metadata.data.creators {
                    // TODO: can we make sure we only take master_edition here?
                    if !creators.is_empty()
                        && creators[0].address == allowlist_val.value
                        && creators[0].verified
                    {
                        return Ok(());
                    }
                }
            }
            ALLOWLIST_KIND_MINT => {
                if mint.key() == allowlist_val.value {
                    return Ok(());
                }
            }
            ALLOWLIST_KIND_MCC => {
                if let Some(ref collection_data) = parsed_metadata.collection {
                    if collection_data.key == allowlist_val.value && collection_data.verified {
                        return Ok(());
                    }
                }
            }
            _ => {
                return Err(MMMErrorCode::InvalidAllowLists.into());
            }
        }
    }

    // at the end, we didn't find a match, thus return err
    Err(MMMErrorCode::InvalidAllowLists.into())
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
    if pool.sellside_asset_amount < 1 {
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

pub fn get_sol_fee(total_sol_price: u64, fee_bp: u16) -> Result<u64> {
    Ok((total_sol_price as u128)
        .checked_mul(fee_bp as u128)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_div(10000)
        .ok_or(MMMErrorCode::NumericOverflow)? as u64)
}

pub fn get_sol_total_price_and_next_price(
    pool: &Pool,
    n: u64,
    fulfill_buy: bool,
) -> Result<(u64, u64)> {
    // the price needs to go down
    let p = pool.spot_price;
    let delta = pool.curve_delta;
    match fulfill_buy {
        true => {
            match pool.curve_type {
                CURVE_KIND_LINEAR => {
                    // n*(2*p-(n-1)*delta)/2
                    let total_price = n
                        .checked_mul(
                            p.checked_mul(2)
                                .ok_or(MMMErrorCode::NumericOverflow)?
                                .checked_sub(
                                    n.checked_sub(1)
                                        .ok_or(MMMErrorCode::NumericOverflow)?
                                        .checked_mul(delta)
                                        .ok_or(MMMErrorCode::NumericOverflow)?,
                                )
                                .ok_or(MMMErrorCode::NumericOverflow)?,
                        )
                        .ok_or(MMMErrorCode::NumericOverflow)?
                        .checked_div(2)
                        .ok_or(MMMErrorCode::NumericOverflow)?;
                    // p - n * delta
                    let final_price = p
                        .checked_sub(n.checked_mul(delta).ok_or(MMMErrorCode::NumericOverflow)?)
                        .ok_or(MMMErrorCode::NumericOverflow)?;
                    Ok((total_price, final_price))
                }
                CURVE_KIND_EXP => {
                    // for loop to prevent overflow
                    let mut total_price: u64 = 0;
                    let mut curr_price: u128 = p as u128;
                    for _ in 0..n {
                        total_price = total_price
                            .checked_add(curr_price as u64)
                            .ok_or(MMMErrorCode::NumericOverflow)?;
                        curr_price = curr_price
                            .checked_mul(10000)
                            .ok_or(MMMErrorCode::NumericOverflow)?
                            .checked_div(
                                (delta as u128)
                                    .checked_add(10000)
                                    .ok_or(MMMErrorCode::NumericOverflow)?,
                            )
                            .ok_or(MMMErrorCode::NumericOverflow)?;
                    }
                    Ok((total_price, curr_price as u64))
                }
                _ => Err(MMMErrorCode::InvalidCurveType.into()),
            }
        }
        false => {
            // for sales, all prices will be one "step" away from the spot price to prevent pool drain
            match pool.curve_type {
                CURVE_KIND_LINEAR => {
                    // n*(2*p+(n+1)*delta)/2
                    let total_price = n
                        .checked_mul(
                            p.checked_mul(2)
                                .ok_or(MMMErrorCode::NumericOverflow)?
                                .checked_add(
                                    n.checked_add(1)
                                        .ok_or(MMMErrorCode::NumericOverflow)?
                                        .checked_mul(delta)
                                        .ok_or(MMMErrorCode::NumericOverflow)?,
                                )
                                .ok_or(MMMErrorCode::NumericOverflow)?,
                        )
                        .ok_or(MMMErrorCode::NumericOverflow)?
                        .checked_div(2)
                        .ok_or(MMMErrorCode::NumericOverflow)?;
                    // p - n * delta
                    let final_price = p
                        .checked_add(n.checked_mul(delta).ok_or(MMMErrorCode::NumericOverflow)?)
                        .ok_or(MMMErrorCode::NumericOverflow)?;
                    Ok((total_price, final_price))
                }
                CURVE_KIND_EXP => {
                    let mut total_price: u64 = 0;
                    let mut curr_price: u128 = p as u128;
                    for _ in 0..n {
                        curr_price = curr_price
                            .checked_mul(
                                (delta as u128)
                                    .checked_add(10000)
                                    .ok_or(MMMErrorCode::NumericOverflow)?,
                            )
                            .ok_or(MMMErrorCode::NumericOverflow)?
                            .checked_div(10000)
                            .ok_or(MMMErrorCode::NumericOverflow)?;
                        total_price = total_price
                            .checked_add(curr_price as u64)
                            .ok_or(MMMErrorCode::NumericOverflow)?;
                    }
                    Ok((total_price, curr_price as u64))
                }
                _ => Err(MMMErrorCode::InvalidCurveType.into()),
            }
        }
    }
}

pub fn try_close_pool<'info>(pool: &Account<'info, Pool>, owner: AccountInfo<'info>) -> Result<()> {
    if pool.sellside_asset_amount != 0 {
        return Ok(());
    }

    if pool.buyside_payment_amount != 0 {
        return Ok(());
    }

    pool.to_account_info()
        .data
        .borrow_mut()
        .copy_from_slice(&[0; Pool::LEN]);

    let curr_lamports = pool.to_account_info().lamports();
    **pool.to_account_info().lamports.borrow_mut() = 0;
    **owner.lamports.borrow_mut() = owner.lamports().checked_add(curr_lamports).unwrap();
    Ok(())
}

pub fn try_close_escrow<'info>(
    escrow: &AccountInfo<'info>,
    pool: &Account<'info, Pool>,
    system_program: &Program<'info, System>,
    escrow_seeds: &[&[&[u8]]],
) -> Result<()> {
    let min_rent = Rent::get()?.minimum_balance(0);
    let escrow_lamports = escrow.lamports();
    if escrow_lamports == 0 || escrow_lamports > min_rent {
        Ok(())
    } else {
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                escrow.key,
                &pool.key(),
                escrow_lamports,
            ),
            &[
                escrow.clone(),
                pool.to_account_info(),
                system_program.to_account_info(),
            ],
            escrow_seeds,
        )?;
        Ok(())
    }
}

pub fn try_close_sell_state<'info>(
    sell_state: &Account<'info, SellState>,
    owner: AccountInfo<'info>,
) -> Result<()> {
    if sell_state.asset_amount != 0 {
        return Ok(());
    }

    sell_state
        .to_account_info()
        .data
        .borrow_mut()
        .copy_from_slice(&[0; SellState::LEN]);

    let curr_lamports = sell_state.to_account_info().lamports();
    **sell_state.to_account_info().lamports.borrow_mut() = 0;
    **owner.lamports.borrow_mut() = owner.lamports().checked_add(curr_lamports).unwrap();
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn pay_creator_fees_in_sol<'info>(
    buyside_creator_royalty_bp: u16,
    total_price: u64,
    metadata_info: AccountInfo<'info>,
    creator_accounts: &[AccountInfo<'info>],
    payer: AccountInfo<'info>,
    policy: Option<&Account<'info, Policy>>,
    payer_seeds: &[&[&[u8]]],
    system_program: AccountInfo<'info>,
) -> Result<u64> {
    let metadata = Metadata::from_account_info(&metadata_info)?;
    let royalty_bp = match policy {
        None => metadata.data.seller_fee_basis_points,
        Some(p) => match &p.dynamic_royalty {
            None => metadata.data.seller_fee_basis_points,
            Some(dynamic_royalty) => {
                dynamic_royalty.get_royalty_bp(total_price, metadata.data.seller_fee_basis_points)
            }
        },
    };

    // total royalty paid by the buyer, it's one of the following
    //   - buyside_sol_escrow_account (when fulfill buy)
    //   - payer                      (when fulfill sell)
    // returns the total royalty paid
    //   royalty = spot_price * (royalty_bp / 10000) * (buyside_creator_royalty_bp / 10000)
    let royalty = ((total_price as u128)
        .checked_mul(royalty_bp as u128)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_div(10000)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_mul(buyside_creator_royalty_bp as u128)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_div(10000)
        .ok_or(MMMErrorCode::NumericOverflow)?) as u64;

    if royalty == 0 {
        return Ok(0);
    }

    let creators = if let Some(creators) = metadata.data.creators {
        creators
    } else {
        return Ok(0);
    };

    if payer.lamports() < royalty {
        return Err(MMMErrorCode::NotEnoughBalance.into());
    }

    // hardcoded the max threshold for InvalidMetadataCreatorRoyalty
    if metadata.data.seller_fee_basis_points > MAX_METADATA_CREATOR_ROYALTY_BP {
        return Err(MMMErrorCode::InvalidMetadataCreatorRoyalty.into());
    }
    let min_rent = Rent::get()?.minimum_balance(0);
    let mut total_royalty: u64 = 0;

    let creator_accounts_iter = &mut creator_accounts.iter();
    for creator in creators {
        let creator_fee = (royalty as u128)
            .checked_mul(creator.share as u128)
            .ok_or(MMMErrorCode::NumericOverflow)?
            .checked_div(100)
            .ok_or(MMMErrorCode::NumericOverflow)? as u64;
        let current_creator_info = next_account_info(creator_accounts_iter)?;
        if creator.address.ne(current_creator_info.key) {
            return Err(MMMErrorCode::InvalidCreatorAddress.into());
        }
        let current_creator_lamports = current_creator_info.lamports();
        if creator_fee > 0
            && current_creator_lamports
                .checked_add(creator_fee)
                .ok_or(MMMErrorCode::NumericOverflow)?
                > min_rent
        {
            anchor_lang::solana_program::program::invoke_signed(
                &anchor_lang::solana_program::system_instruction::transfer(
                    payer.key,
                    current_creator_info.key,
                    creator_fee,
                ),
                &[
                    payer.to_account_info(),
                    current_creator_info.to_account_info(),
                    system_program.to_account_info(),
                ],
                payer_seeds,
            )?;
            total_royalty = total_royalty
                .checked_add(creator_fee)
                .ok_or(MMMErrorCode::NumericOverflow)?;
        }
    }
    Ok(total_royalty)
}

pub fn log_pool(prefix: &str, pool: &Pool) -> Result<()> {
    msg!(prefix);
    sol_log_data(&[&pool.try_to_vec()?]);
    Ok(())
}
