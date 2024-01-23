use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;
pub const BUYER_TRADE_STATE_ACCOUNT_DISCM: [u8; 8] = [200, 164, 153, 187, 118, 60, 200, 51];
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct BuyerTradeState {
    pub auction_house_key: Pubkey,
    pub buyer: Pubkey,
    pub buyer_referral: Pubkey,
    pub buyer_price: u64,
    pub token_mint: Pubkey,
    pub token_size: u64,
    pub bump: u8,
    pub expiry: i64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct BuyerTradeStateAccount(pub BuyerTradeState);
impl BuyerTradeStateAccount {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        use std::io::Read;
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != BUYER_TRADE_STATE_ACCOUNT_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    BUYER_TRADE_STATE_ACCOUNT_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(BuyerTradeState::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&BUYER_TRADE_STATE_ACCOUNT_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub const SELLER_TRADE_STATE_ACCOUNT_DISCM: [u8; 8] = [1, 238, 72, 137, 138, 21, 254, 249];
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SellerTradeState {
    pub auction_house_key: Pubkey,
    pub seller: Pubkey,
    pub seller_referral: Pubkey,
    pub buyer_price: u64,
    pub token_mint: Pubkey,
    pub token_account: Pubkey,
    pub token_size: u64,
    pub bump: u8,
    pub expiry: i64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct SellerTradeStateAccount(pub SellerTradeState);
impl SellerTradeStateAccount {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        use std::io::Read;
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != SELLER_TRADE_STATE_ACCOUNT_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    SELLER_TRADE_STATE_ACCOUNT_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(SellerTradeState::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&SELLER_TRADE_STATE_ACCOUNT_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub const SELLER_TRADE_STATE_V2_ACCOUNT_DISCM: [u8; 8] = [164, 14, 92, 100, 123, 57, 234, 204];
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SellerTradeStateV2 {
    pub auction_house_key: Pubkey,
    pub seller: Pubkey,
    pub seller_referral: Pubkey,
    pub buyer_price: u64,
    pub token_mint: Pubkey,
    pub token_account: Pubkey,
    pub token_size: u64,
    pub bump: u8,
    pub expiry: i64,
    pub payment_mint: Pubkey,
}
#[derive(Clone, Debug, PartialEq)]
pub struct SellerTradeStateV2Account(pub SellerTradeStateV2);
impl SellerTradeStateV2Account {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        use std::io::Read;
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != SELLER_TRADE_STATE_V2_ACCOUNT_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    SELLER_TRADE_STATE_V2_ACCOUNT_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(SellerTradeStateV2::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&SELLER_TRADE_STATE_V2_ACCOUNT_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub const AUCTION_HOUSE_ACCOUNT_DISCM: [u8; 8] = [40, 108, 215, 107, 213, 85, 245, 48];
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct AuctionHouse {
    pub auction_house_treasury: Pubkey,
    pub treasury_withdrawal_destination: Pubkey,
    pub authority: Pubkey,
    pub creator: Pubkey,
    pub notary: Pubkey,
    pub bump: u8,
    pub treasury_bump: u8,
    pub seller_fee_basis_points: u16,
    pub buyer_referral_bp: u16,
    pub seller_referral_bp: u16,
    pub requires_notary: bool,
    pub nprob: u8,
}
#[derive(Clone, Debug, PartialEq)]
pub struct AuctionHouseAccount(pub AuctionHouse);
impl AuctionHouseAccount {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        use std::io::Read;
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != AUCTION_HOUSE_ACCOUNT_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    AUCTION_HOUSE_ACCOUNT_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(AuctionHouse::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&AUCTION_HOUSE_ACCOUNT_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub const BUYER_TRADE_STATE_V2_ACCOUNT_DISCM: [u8; 8] = [195, 55, 46, 41, 54, 7, 225, 155];
#[derive(Clone, Debug, BorshDeserialize, BorshSerialize, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct BuyerTradeStateV2 {
    pub auction_house_key: Pubkey,
    pub buyer: Pubkey,
    pub buyer_referral: Pubkey,
    pub buyer_price: u64,
    pub token_mint: Pubkey,
    pub token_size: u64,
    pub bump: u8,
    pub expiry: i64,
    pub buyer_creator_royalty_bp: u16,
    pub payment_mint: Pubkey,
}
#[derive(Clone, Debug, PartialEq)]
pub struct BuyerTradeStateV2Account(pub BuyerTradeStateV2);
impl BuyerTradeStateV2Account {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        use std::io::Read;
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != BUYER_TRADE_STATE_V2_ACCOUNT_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    BUYER_TRADE_STATE_V2_ACCOUNT_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(BuyerTradeStateV2::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&BUYER_TRADE_STATE_V2_ACCOUNT_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
