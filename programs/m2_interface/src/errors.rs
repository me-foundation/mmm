use solana_program::{
    decode_error::DecodeError,
    msg,
    program_error::{PrintProgramError, ProgramError},
};
use thiserror::Error;
#[derive(Clone, Copy, Debug, Eq, Error, num_derive::FromPrimitive, PartialEq)]
pub enum M2Error {
    #[error("PublicKeyMismatch")]
    PublicKeyMismatch = 6000,
    #[error("InvalidMintAuthority")]
    InvalidMintAuthority = 6001,
    #[error("UninitializedAccount")]
    UninitializedAccount = 6002,
    #[error("IncorrectOwner")]
    IncorrectOwner = 6003,
    #[error("PublicKeysShouldBeUnique")]
    PublicKeysShouldBeUnique = 6004,
    #[error("StatementFalse")]
    StatementFalse = 6005,
    #[error("NotRentExempt")]
    NotRentExempt = 6006,
    #[error("NumericalOverflow")]
    NumericalOverflow = 6007,
    #[error("Expected a sol account but got an spl token account instead")]
    ExpectedSolAccount = 6008,
    #[error("Cannot exchange sol for sol")]
    CannotExchangeSolForSol = 6009,
    #[error("If paying with sol, sol wallet must be signer")]
    SolWalletMustSign = 6010,
    #[error("Cannot take this action without auction house signing too")]
    CannotTakeThisActionWithoutAuctionHouseSignOff = 6011,
    #[error("No payer present on this txn")]
    NoPayerPresent = 6012,
    #[error("Derived key invalid")]
    DerivedKeyInvalid = 6013,
    #[error("Metadata doesn't exist")]
    MetadataDoesntExist = 6014,
    #[error("Invalid token amount")]
    InvalidTokenAmount = 6015,
    #[error("Both parties need to agree to this sale")]
    BothPartiesNeedToAgreeToSale = 6016,
    #[error("Cannot match free sales unless the auction house or seller signs off")]
    CannotMatchFreeSalesWithoutAuctionHouseOrSellerSignoff = 6017,
    #[error("This sale requires a signer")]
    SaleRequiresSigner = 6018,
    #[error("Old seller not initialized")]
    OldSellerNotInitialized = 6019,
    #[error("Seller ata cannot have a delegate set")]
    SellerAtaCannotHaveDelegate = 6020,
    #[error("Buyer ata cannot have a delegate set")]
    BuyerAtaCannotHaveDelegate = 6021,
    #[error("No valid signer present")]
    NoValidSignerPresent = 6022,
    #[error("Invalid BP")]
    InvalidBasisPoints = 6023,
    #[error("Invalid notary")]
    InvalidNotary = 6024,
    #[error("Empty trade state")]
    EmptyTradeState = 6025,
    #[error("Invalid expiry")]
    InvalidExpiry = 6026,
    #[error("Invalid price")]
    InvalidPrice = 6027,
    #[error("Invalid remainning accounts without program_as_signer")]
    InvalidRemainingAccountsWithoutProgramAsSigner = 6028,
    #[error("Invalid bump")]
    InvalidBump = 6029,
    #[error("Invalid create auction house nonce")]
    InvalidCreateAuctionHouseNonce = 6030,
    #[error("Invalid account state")]
    InvalidAccountState = 6031,
    #[error("Invalid discriminator")]
    InvalidDiscriminator = 6032,
    #[error("Invalid platform fee bp")]
    InvalidPlatformFeeBp = 6033,
    #[error("Invalid token mint")]
    InvalidTokenMint = 6034,
    #[error("Invalid token standard")]
    InvalidTokenStandard = 6035,
    #[error("Deprecated")]
    Deprecated = 6036,
    #[error("Missing remaining account")]
    MissingRemainingAccount = 6037,
    #[error("Invalid trusted program or pda")]
    InvalidTrustedProgramOrPda = 6038,
}
impl From<M2Error> for ProgramError {
    fn from(e: M2Error) -> Self {
        ProgramError::Custom(e as u32)
    }
}
impl<T> DecodeError<T> for M2Error {
    fn type_of() -> &'static str {
        "M2Error"
    }
}
impl PrintProgramError for M2Error {
    fn print<E>(&self)
    where
        E: 'static
            + std::error::Error
            + DecodeError<E>
            + PrintProgramError
            + num_traits::FromPrimitive,
    {
        msg!(&self.to_string());
    }
}
