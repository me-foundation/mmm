use anchor_lang::{prelude::*};

#[account]
#[derive(Default)]
pub struct Pool {
    // mutable
    pub spot_price: u64,
    pub curve_type: u8,
    pub curve_delta: u64,
    pub sellside_orders_count: u64,

    // immutable
    pub owner: Pubkey,
    pub payment_mint: Pubkey,
    pub cosigner: Pubkey,
    pub maker_referral: Pubkey,
    pub lp_fee_bp: u16,
    pub uuid: String,
    pub allowlist_type: u8,
    pub allowlist_value: Pubkey,
}

impl Pool {
    pub const LEN: usize = 8 +
        8 * 3 + // u64
        1 * 2 +  // u8
        2 * 1 +  // u16
        32 * 5 +  // Pubkey
        (4 + 32) * 1 + // uuid
        400; // padding
}
