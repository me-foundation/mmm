use solana_program::{pubkey, pubkey::Pubkey};

pub const BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX: &str = "mmm_buyside_sol_escrow_account";
pub const POOL_PREFIX: &str = "mmm_pool";
pub const SELL_STATE_PREFIX: &str = "mmm_sell_state";

pub const MAX_TOTAL_PRICE: u64 = 8_000_000 * 1_000_000_000; // 8_000_000 SOL
pub const MAX_METADATA_CREATOR_ROYALTY_BP: u16 = 3000;
pub const MAX_REFERRAL_FEE_BP: i16 = 500;
pub const MAX_LP_FEE_BP: u16 = 1000;
pub const ALLOWLIST_MAX_LEN: usize = 6;
pub const MIN_SOL_ESCROW_BALANCE_BP: u16 = 100;

pub const CANCEL_AUTHORITY: Pubkey = pubkey!("CNTuB1JiQD8Xh5SoRcEmF61yivN9F7uzdSaGnRex36wi");