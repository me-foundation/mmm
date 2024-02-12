use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct WithdrawByMMMArgs {
    pub wallet: Pubkey,
    pub auction_house: Pubkey,
    pub amount: u64,
    pub mmm_pool_uuid: Pubkey,
}
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct MIP1ExecuteSaleV2Args {
    pub price: u64,
    pub maker_fee_bp: i16,
    pub taker_fee_bp: u16,
}
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct MIP1SellArgs {
    pub price: u64,
    pub expiry: i64,
}
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct OCPExecuteSaleV2Args {
    pub price: u64,
    pub maker_fee_bp: i16,
    pub taker_fee_bp: u16,
}
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct OCPSellArgs {
    pub price: u64,
    pub expiry: i64,
}
