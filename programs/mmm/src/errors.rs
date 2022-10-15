use anchor_lang::prelude::*;

#[error_code]
pub enum MMMErrorCode {
    #[msg("lp fee bp must be between 0 and 10000")]
    InvalidLPFee,
    #[msg("invalid allowlists")]
    InvalidAllowLists,
    #[msg("invalid bp")]
    InvalidBP,
    #[msg("invalid curve type")]
    InvalidCurveType,
    #[msg("invalid curve delta")]
    InvalidCurveDelta,
    #[msg("invalid cosigner")]
    InvalidCosigner,
    #[msg("invalid payment mint")]
    InvalidPaymentMint,
    #[msg("invalid owner")]
    InvalidOwner,
    #[msg("numeric overflow")]
    NumericOverflow,
    #[msg("invalid requested price")]
    InvalidRequestedPrice,
    #[msg("not empty escrow account")]
    NotEmptyEscrowAccount,
    #[msg("not empty sell side orders count")]
    NotEmptySellSideOrdersCount,
    #[msg("invalid referral")]
    InvalidReferral,
    #[msg("invalid master edition")]
    InvalidMasterEdition,
    #[msg("expired")]
    Expired,
}
