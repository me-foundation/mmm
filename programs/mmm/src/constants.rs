use solana_program::{pubkey, pubkey::Pubkey};
use spl_token_2022::extension::ExtensionType;

pub const BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX: &str = "mmm_buyside_sol_escrow_account";
pub const POOL_PREFIX: &str = "mmm_pool";
pub const SELL_STATE_PREFIX: &str = "mmm_sell_state";

pub const MAX_TOTAL_PRICE: u64 = 8_000_000 * 1_000_000_000; // 8_000_000 SOL
pub const MAX_METADATA_CREATOR_ROYALTY_BP: u16 = 3000;
pub const MAX_REFERRAL_FEE_BP: i16 = 500;
pub const MAX_LP_FEE_BP: u16 = 2_000;
pub const ALLOWLIST_MAX_LEN: usize = 6;
pub const MIN_SOL_ESCROW_BALANCE_BP: u16 = 100;

pub const CANCEL_AUTHORITY: Pubkey = if cfg!(feature = "anchor-test") {
    pubkey!("testZY18qdvfWNn1mTn7PvywdLdwWWsgqLXvvztKAtD")
} else {
    pubkey!("CNTuB1JiQD8Xh5SoRcEmF61yivN9F7uzdSaGnRex36wi")
};
pub const MPL_TOKEN_AUTH_RULES: Pubkey = pubkey!("auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg");

pub const M2_PROGRAM: Pubkey = pubkey!("M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K");
pub const M2_PREFIX: &str = "m2";
pub const M2_AUCTION_HOUSE: Pubkey = pubkey!("E8cU1WiRWjanGxmn96ewBgk9vPTcL6AEZ1t6F6fkgUWe");

pub const LIBREPLEX_ROYALTY_ENFORCEMENT_PROGRAM_ID: Pubkey =
    pubkey!("CZ1rQoAHSqWBoAEfqGsiLhgbM59dDrCWk3rnG5FXaoRV");

pub const T22_EXTENSION_ALLOW_LIST: [spl_token_2022::extension::ExtensionType; 5] = [
    ExtensionType::GroupMemberPointer,
    ExtensionType::MetadataPointer,
    ExtensionType::TokenMetadata,
    ExtensionType::TokenGroupMember,
    ExtensionType::TransferHook,
];
