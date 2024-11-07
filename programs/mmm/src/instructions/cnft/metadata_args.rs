use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

// Define the TokenStandard enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq, PartialOrd, Hash)]
pub enum TokenStandard {
    NonFungible,
    FungibleAsset,
    Fungible,
    NonFungibleEdition,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq)]
pub struct Collection {
    pub verified: bool,
    pub key: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq, PartialOrd, Hash)]
pub enum UseMethod {
    Burn,
    Multiple,
    Single,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq)]
pub struct Uses {
    pub use_method: UseMethod,
    pub remaining: u64,
    pub total: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq, PartialOrd, Hash)]
pub enum TokenProgramVersion {
    Original,
    Token2022,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq)]
pub struct Creator {
    pub address: Pubkey,
    pub verified: bool,
    /// The percentage share.
    ///
    /// The value is a percentage, not basis points.
    pub share: u8,
}

// Define the MetadataArgs struct
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MetadataArgs {
    pub name: String,
    pub symbol: String, // Changed from Option<String> to String
    pub uri: String,
    pub seller_fee_basis_points: u16,
    pub primary_sale_happened: bool, // Changed from Option<bool> to bool
    pub is_mutable: bool,            // Changed from Option<bool> to bool
    pub edition_nonce: Option<u8>,
    pub token_standard: Option<TokenStandard>, // Changed from Option<u8> to Option<TokenStandard>
    pub collection: Option<Collection>,
    pub uses: Option<Uses>,
    pub token_program_version: TokenProgramVersion, // Assuming TokenProgramVersion is a simple u8
    pub creators: Vec<Creator>,
}
