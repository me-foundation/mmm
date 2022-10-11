use anchor_lang::{prelude::*};

#[error_code]
pub enum MMMErrorCode {
    #[msg("lp fee bp must be between 0 and 10000")]
    InvalidLPFee,
}
