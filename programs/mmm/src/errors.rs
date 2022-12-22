use anchor_lang::prelude::*;

#[error_code]
pub enum MMMErrorCode {
    #[msg("lp fee bp must be between 0 and 10000")]
    InvalidLPFee, // 0x1770
    #[msg("invalid allowlists")]
    InvalidAllowLists, // 0x1771
    #[msg("invalid bp")]
    InvalidBP, // 0x1772
    #[msg("invalid curve type")]
    InvalidCurveType, // 0x1773
    #[msg("invalid curve delta")]
    InvalidCurveDelta, // 0x1774
    #[msg("invalid cosigner")]
    InvalidCosigner, // 0x1775
    #[msg("invalid payment mint")]
    InvalidPaymentMint, // 0x1776
    #[msg("invalid owner")]
    InvalidOwner, // 0x1777
    #[msg("numeric overflow")]
    NumericOverflow, // 0x1778
    #[msg("invalid requested price")]
    InvalidRequestedPrice, // 0x1779
    #[msg("not empty escrow account")]
    NotEmptyEscrowAccount, // 0x177a
    #[msg("not empty sell side asset amount")]
    NotEmptySellsideAssetAmount, // 0x177b
    #[msg("invalid referral")]
    InvalidReferral, // 0x177c
    #[msg("invalid master edition")]
    InvalidMasterEdition, // 0x177d
    #[msg("expired")]
    Expired, // 0x177e
    #[msg("invalid creator address")]
    InvalidCreatorAddress, // 0x177f
    #[msg("not enough balance")]
    NotEnoughBalance, // 0x1780
    #[msg("invalid token owner")]
    InvalidTokenOwner, // 0x1781
    #[msg("pubkey mismatch")]
    PubkeyMismatch, // 0x1782
    #[msg("uninitialized account")]
    UninitializedAccount, // 0x1783
    #[msg("invalid spot_price")]
    InvalidSpotPrice, // 0x1784
    #[msg("invalid metadata creator royalty")]
    InvalidMetadataCreatorRoyalty, // 0x1785
    #[msg("invalid maker or taker bp")]
    InvalidMakerOrTakerFeeBP, // 0x1786
    #[msg("Invalid OCP mint supply constraints")]
    InvalidOcpAssetParams, // 0x1787
    #[msg("Invalid account state")]
    InvalidAccountState, // 0x1788
    #[msg("Invalid token mint")]
    InvalidTokenMint, // 0x1789
}
