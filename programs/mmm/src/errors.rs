use anchor_lang::prelude::*;

#[error_code]
pub enum MMMErrorCode {
    #[msg("lp fee bp must be between 0 and 10000")]
    InvalidLPFee,
    #[msg("invalid allowlists")]
    InvalidAllowLists,
    #[msg("invalid lp fee bp")]
    InvalidLPFeeBP,
    #[msg("invalid curve type")]
    InvalidCurveType,
    #[msg("invalid curve delta")]
    InvalidCurveDelta,
    #[msg("invalid cosigner")]
    InvalidCosigner,
    #[msg("invalid payment mint")]
    InvalidPaymentMint,
}
