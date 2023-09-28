use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::constants::*;

pub const CURVE_KIND_LINEAR: u8 = 0;
pub const CURVE_KIND_EXP: u8 = 1;

pub const ALLOWLIST_KIND_EMPTY: u8 = 0;
pub const ALLOWLIST_KIND_FVCA: u8 = 1;
pub const ALLOWLIST_KIND_MINT: u8 = 2;
pub const ALLOWLIST_KIND_MCC: u8 = 3;
pub const ALLOWLIST_KIND_METADATA: u8 = 4;
pub const ALLOWLIST_KIND_DYNAMIC: u8 = 5;

#[derive(Default, Copy, Clone, AnchorSerialize, AnchorDeserialize, Eq, PartialEq)]
pub struct Allowlist {
    pub kind: u8,
    pub value: Pubkey,
}

impl Allowlist {
    // kind == 0: empty
    // kind == 1: first verified creator address (FVCA)
    // kind == 2: single mint, useful for SFT
    // kind == 3: verified MCC
    // kind == 4: verified metadata
    // kind == 5: dynamic allowlist singleton for a specific collection
    // kind == 6,... will be supported in the future
    pub fn valid(&self) -> bool {
        // Don't allow nested dynamic allowlist. Allowlists passed in from the user
        // should always be types 0-4.
        if self.kind > ALLOWLIST_KIND_METADATA {
            return false;
        }
        if self.kind != ALLOWLIST_KIND_EMPTY {
            return self.value.ne(&Pubkey::default());
        }
        true
    }

    pub fn is_empty(&self) -> bool {
        self.kind == ALLOWLIST_KIND_EMPTY
    }
}

// seeds = [
//     ALLOWLIST_PREFIX.as_bytes(),
//     owner.key().as_ref(),
//     cosigner_annotation.as_bytes()
// ]
#[account]
#[derive(Default)]
pub struct DynamicAllowlist {
    pub cosigner_annotation: [u8; 32],
    pub authority: Pubkey,
    pub allowlists: [Allowlist; ALLOWLIST_MAX_LEN],
}

impl DynamicAllowlist {
    pub const LEN: usize = 8 +    // Anchor discriminator
    32 +                          // Cosigner annotation
    32 +                          // Authority
    (1 + 32) * ALLOWLIST_MAX_LEN; // Allowlists
}

// seeds = [
//    POOL_PREFIX.as_bytes(),
//    owner.key().as_ref(),
//    pool.uuid.as_ref(),
// ]
#[account]
#[derive(Default)]
pub struct Pool {
    // mutable configurable
    pub spot_price: u64,
    pub curve_type: u8,
    pub curve_delta: u64,
    pub reinvest_fulfill_buy: bool,
    pub reinvest_fulfill_sell: bool,
    pub expiry: i64,
    pub lp_fee_bp: u16,
    pub referral: Pubkey,
    pub referral_bp: u16, // deprecated
    pub buyside_creator_royalty_bp: u16,

    // cosigner_annotation: it's set by the cosigner, could be the hash of the certain
    // free form of content, like collection_symbol, SFT name, and traits name
    // and etc. Needs to be carefully verified by the specific cosigner
    pub cosigner_annotation: [u8; 32],

    // mutable state data
    pub sellside_asset_amount: u64,
    pub lp_fee_earned: u64,

    // immutable
    pub owner: Pubkey,
    pub cosigner: Pubkey,
    pub uuid: Pubkey, // randomly generated keypair
    pub payment_mint: Pubkey,
    pub allowlists: [Allowlist; ALLOWLIST_MAX_LEN],
    pub buyside_payment_amount: u64,
}

impl Pool {
    pub const LEN: usize = 8 +
        8 * 5 + // u64
        8 + // i64
        1 +  // u8
        2 * 2 +  // u16
        32 * 5 + // Pubkey
        2 + // bool
        32 + // [u8; 32]
        4 + (1 + 32) * ALLOWLIST_MAX_LEN + // Allowlist
        392; // padding
}

// seeds = [
//     SELL_STATE_PREFIX.as_bytes(),
//     pool.key().as_ref(),
//     asset_mint.key().as_ref(),
// ]
#[account]
#[derive(Default)]
pub struct SellState {
    // we are trying to normalize the info as much as possible
    // which means for indexing the SellState, we might need to
    // query the pool, but for convenience purpose, we added
    // cosigner_annotation here.
    //
    // we can add more fields for better indexing later.
    pub pool: Pubkey,
    pub pool_owner: Pubkey,
    pub asset_mint: Pubkey,
    pub asset_amount: u64,
    pub cosigner_annotation: [u8; 32],
}

impl SellState {
    pub const LEN: usize = 8 +
        8 + // u64
        32 * 3 + // Pubkey
        32 + // [u8; 32]
        200; // padding
}
