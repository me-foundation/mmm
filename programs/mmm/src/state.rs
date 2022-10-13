use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

pub const ALLOWLIST_MAX_LEN: usize = 6;
pub const CURVE_KIND_LINEAR: u8 = 0;
pub const CURVE_KIND_EXP: u8 = 1;

#[derive(Default, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Allowlist {
    pub kind: u8,
    pub value: Pubkey,
}

impl Allowlist {
    // kind == 0: empty
    // kind == 1: first verified creator address (FVCA)
    // kind == 2: single mint, useful for SFT
    // kind == 3,4 will be supported in the future
    pub fn valid(&self) -> bool {
        self.kind <= 2
    }

    pub fn is_empty(&self) -> bool {
        self.kind == 0
    }
}

#[account]
#[derive(Default)]
pub struct Pool {
    // mutable configurable
    pub spot_price: u64,
    pub curve_type: u8,
    pub curve_delta: u64,
    pub reinvest: bool,
    pub expiry: i64,
    pub lp_fee_bp: u16,
    pub referral: Pubkey,
    pub referral_bp: u16,

    // usually annotation set by the cosigner, could be the hash of the certain
    // free form of content, like collection_symbol, SFT name, and traits name
    // and etc. Needs to be carefully verified by the specific cosigner
    pub cosigner_annotation: [u8; 32],

    // mutable state data
    pub sellside_orders_count: u64,
    pub lp_fee_earned: u64,

    // immutable
    pub owner: Pubkey,
    pub cosigner: Pubkey,
    pub uuid: Pubkey, // randomly generated keypair
    pub payment_mint: Pubkey,
    pub allowlists: [Allowlist; ALLOWLIST_MAX_LEN],
}

impl Pool {
    pub const LEN: usize = 8 +
        8 * 4 + // u64
        8 + // i64
        1 +  // u8
        2 * 2 +  // u16
        32 * 5 +  // Pubkey
        1 + // bool
        32 + // [u8; 32]
        4 + (1+ 32) * ALLOWLIST_MAX_LEN + // Allowlist
        400; // padding
}
