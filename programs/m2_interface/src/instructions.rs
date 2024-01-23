use crate::*;
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
};
use std::io::Read;
#[derive(Clone, Debug, PartialEq)]
pub enum M2ProgramIx {
    WithdrawFromTreasury(WithdrawFromTreasuryIxArgs),
    UpdateAuctionHouse(UpdateAuctionHouseIxArgs),
    CreateAuctionHouse(CreateAuctionHouseIxArgs),
    Withdraw(WithdrawIxArgs),
    Deposit(DepositIxArgs),
    Sell(SellIxArgs),
    CancelSell(CancelSellIxArgs),
    Buy(BuyIxArgs),
    BuyV2(BuyV2IxArgs),
    CancelBuy(CancelBuyIxArgs),
    OcpSell(OcpSellIxArgs),
    OcpCancelSell,
    OcpExecuteSaleV2(OcpExecuteSaleV2IxArgs),
    ExecuteSaleV2(ExecuteSaleV2IxArgs),
    Mip1Sell(Mip1SellIxArgs),
    Mip1ExecuteSaleV2(Mip1ExecuteSaleV2IxArgs),
    Mip1CancelSell,
    WithdrawByMmm(WithdrawByMmmIxArgs),
}
impl M2ProgramIx {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        match maybe_discm {
            WITHDRAW_FROM_TREASURY_IX_DISCM => Ok(Self::WithdrawFromTreasury(
                WithdrawFromTreasuryIxArgs::deserialize(&mut reader)?,
            )),
            UPDATE_AUCTION_HOUSE_IX_DISCM => Ok(Self::UpdateAuctionHouse(
                UpdateAuctionHouseIxArgs::deserialize(&mut reader)?,
            )),
            CREATE_AUCTION_HOUSE_IX_DISCM => Ok(Self::CreateAuctionHouse(
                CreateAuctionHouseIxArgs::deserialize(&mut reader)?,
            )),
            WITHDRAW_IX_DISCM => Ok(Self::Withdraw(WithdrawIxArgs::deserialize(&mut reader)?)),
            DEPOSIT_IX_DISCM => Ok(Self::Deposit(DepositIxArgs::deserialize(&mut reader)?)),
            SELL_IX_DISCM => Ok(Self::Sell(SellIxArgs::deserialize(&mut reader)?)),
            CANCEL_SELL_IX_DISCM => Ok(Self::CancelSell(CancelSellIxArgs::deserialize(
                &mut reader,
            )?)),
            BUY_IX_DISCM => Ok(Self::Buy(BuyIxArgs::deserialize(&mut reader)?)),
            BUY_V2_IX_DISCM => Ok(Self::BuyV2(BuyV2IxArgs::deserialize(&mut reader)?)),
            CANCEL_BUY_IX_DISCM => Ok(Self::CancelBuy(CancelBuyIxArgs::deserialize(&mut reader)?)),
            OCP_SELL_IX_DISCM => Ok(Self::OcpSell(OcpSellIxArgs::deserialize(&mut reader)?)),
            OCP_CANCEL_SELL_IX_DISCM => Ok(Self::OcpCancelSell),
            OCP_EXECUTE_SALE_V2_IX_DISCM => Ok(Self::OcpExecuteSaleV2(
                OcpExecuteSaleV2IxArgs::deserialize(&mut reader)?,
            )),
            EXECUTE_SALE_V2_IX_DISCM => Ok(Self::ExecuteSaleV2(ExecuteSaleV2IxArgs::deserialize(
                &mut reader,
            )?)),
            MIP1_SELL_IX_DISCM => Ok(Self::Mip1Sell(Mip1SellIxArgs::deserialize(&mut reader)?)),
            MIP1_EXECUTE_SALE_V2_IX_DISCM => Ok(Self::Mip1ExecuteSaleV2(
                Mip1ExecuteSaleV2IxArgs::deserialize(&mut reader)?,
            )),
            MIP1_CANCEL_SELL_IX_DISCM => Ok(Self::Mip1CancelSell),
            WITHDRAW_BY_MMM_IX_DISCM => Ok(Self::WithdrawByMmm(WithdrawByMmmIxArgs::deserialize(
                &mut reader,
            )?)),
            _ => Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("discm {:?} not found", maybe_discm),
            )),
        }
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        match self {
            Self::WithdrawFromTreasury(args) => {
                writer.write_all(&WITHDRAW_FROM_TREASURY_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::UpdateAuctionHouse(args) => {
                writer.write_all(&UPDATE_AUCTION_HOUSE_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::CreateAuctionHouse(args) => {
                writer.write_all(&CREATE_AUCTION_HOUSE_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::Withdraw(args) => {
                writer.write_all(&WITHDRAW_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::Deposit(args) => {
                writer.write_all(&DEPOSIT_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::Sell(args) => {
                writer.write_all(&SELL_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::CancelSell(args) => {
                writer.write_all(&CANCEL_SELL_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::Buy(args) => {
                writer.write_all(&BUY_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::BuyV2(args) => {
                writer.write_all(&BUY_V2_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::CancelBuy(args) => {
                writer.write_all(&CANCEL_BUY_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::OcpSell(args) => {
                writer.write_all(&OCP_SELL_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::OcpCancelSell => writer.write_all(&OCP_CANCEL_SELL_IX_DISCM),
            Self::OcpExecuteSaleV2(args) => {
                writer.write_all(&OCP_EXECUTE_SALE_V2_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::ExecuteSaleV2(args) => {
                writer.write_all(&EXECUTE_SALE_V2_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::Mip1Sell(args) => {
                writer.write_all(&MIP1_SELL_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::Mip1ExecuteSaleV2(args) => {
                writer.write_all(&MIP1_EXECUTE_SALE_V2_IX_DISCM)?;
                args.serialize(&mut writer)
            }
            Self::Mip1CancelSell => writer.write_all(&MIP1_CANCEL_SELL_IX_DISCM),
            Self::WithdrawByMmm(args) => {
                writer.write_all(&WITHDRAW_BY_MMM_IX_DISCM)?;
                args.serialize(&mut writer)
            }
        }
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
fn invoke_instruction<'info, A: Into<[AccountInfo<'info>; N]>, const N: usize>(
    ix: &Instruction,
    accounts: A,
) -> ProgramResult {
    let account_info: [AccountInfo<'info>; N] = accounts.into();
    invoke(ix, &account_info)
}
fn invoke_instruction_signed<'info, A: Into<[AccountInfo<'info>; N]>, const N: usize>(
    ix: &Instruction,
    accounts: A,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let account_info: [AccountInfo<'info>; N] = accounts.into();
    invoke_signed(ix, &account_info, seeds)
}
pub const WITHDRAW_FROM_TREASURY_IX_ACCOUNTS_LEN: usize = 4;
#[derive(Copy, Clone, Debug)]
pub struct WithdrawFromTreasuryAccounts<'me, 'info> {
    pub treasury_withdrawal_destination: &'me AccountInfo<'info>,
    pub auction_house_treasury: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct WithdrawFromTreasuryKeys {
    pub treasury_withdrawal_destination: Pubkey,
    pub auction_house_treasury: Pubkey,
    pub auction_house: Pubkey,
    pub system_program: Pubkey,
}
impl From<WithdrawFromTreasuryAccounts<'_, '_>> for WithdrawFromTreasuryKeys {
    fn from(accounts: WithdrawFromTreasuryAccounts) -> Self {
        Self {
            treasury_withdrawal_destination: *accounts.treasury_withdrawal_destination.key,
            auction_house_treasury: *accounts.auction_house_treasury.key,
            auction_house: *accounts.auction_house.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<WithdrawFromTreasuryKeys> for [AccountMeta; WITHDRAW_FROM_TREASURY_IX_ACCOUNTS_LEN] {
    fn from(keys: WithdrawFromTreasuryKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.treasury_withdrawal_destination,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.auction_house_treasury,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; WITHDRAW_FROM_TREASURY_IX_ACCOUNTS_LEN]> for WithdrawFromTreasuryKeys {
    fn from(pubkeys: [Pubkey; WITHDRAW_FROM_TREASURY_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            treasury_withdrawal_destination: pubkeys[0],
            auction_house_treasury: pubkeys[1],
            auction_house: pubkeys[2],
            system_program: pubkeys[3],
        }
    }
}
impl<'info> From<WithdrawFromTreasuryAccounts<'_, 'info>>
    for [AccountInfo<'info>; WITHDRAW_FROM_TREASURY_IX_ACCOUNTS_LEN]
{
    fn from(accounts: WithdrawFromTreasuryAccounts<'_, 'info>) -> Self {
        [
            accounts.treasury_withdrawal_destination.clone(),
            accounts.auction_house_treasury.clone(),
            accounts.auction_house.clone(),
            accounts.system_program.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; WITHDRAW_FROM_TREASURY_IX_ACCOUNTS_LEN]>
    for WithdrawFromTreasuryAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; WITHDRAW_FROM_TREASURY_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            treasury_withdrawal_destination: &arr[0],
            auction_house_treasury: &arr[1],
            auction_house: &arr[2],
            system_program: &arr[3],
        }
    }
}
pub const WITHDRAW_FROM_TREASURY_IX_DISCM: [u8; 8] = [0, 164, 86, 76, 56, 72, 12, 170];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct WithdrawFromTreasuryIxArgs {
    pub amount: u64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct WithdrawFromTreasuryIxData(pub WithdrawFromTreasuryIxArgs);
impl From<WithdrawFromTreasuryIxArgs> for WithdrawFromTreasuryIxData {
    fn from(args: WithdrawFromTreasuryIxArgs) -> Self {
        Self(args)
    }
}
impl WithdrawFromTreasuryIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != WITHDRAW_FROM_TREASURY_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    WITHDRAW_FROM_TREASURY_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(WithdrawFromTreasuryIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&WITHDRAW_FROM_TREASURY_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn withdraw_from_treasury_ix_with_program_id(
    program_id: Pubkey,
    keys: WithdrawFromTreasuryKeys,
    args: WithdrawFromTreasuryIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; WITHDRAW_FROM_TREASURY_IX_ACCOUNTS_LEN] = keys.into();
    let data: WithdrawFromTreasuryIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn withdraw_from_treasury_ix(
    keys: WithdrawFromTreasuryKeys,
    args: WithdrawFromTreasuryIxArgs,
) -> std::io::Result<Instruction> {
    withdraw_from_treasury_ix_with_program_id(crate::ID, keys, args)
}
pub fn withdraw_from_treasury_invoke_with_program_id(
    program_id: Pubkey,
    accounts: WithdrawFromTreasuryAccounts<'_, '_>,
    args: WithdrawFromTreasuryIxArgs,
) -> ProgramResult {
    let keys: WithdrawFromTreasuryKeys = accounts.into();
    let ix = withdraw_from_treasury_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn withdraw_from_treasury_invoke(
    accounts: WithdrawFromTreasuryAccounts<'_, '_>,
    args: WithdrawFromTreasuryIxArgs,
) -> ProgramResult {
    withdraw_from_treasury_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn withdraw_from_treasury_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: WithdrawFromTreasuryAccounts<'_, '_>,
    args: WithdrawFromTreasuryIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: WithdrawFromTreasuryKeys = accounts.into();
    let ix = withdraw_from_treasury_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn withdraw_from_treasury_invoke_signed(
    accounts: WithdrawFromTreasuryAccounts<'_, '_>,
    args: WithdrawFromTreasuryIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    withdraw_from_treasury_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn withdraw_from_treasury_verify_account_keys(
    accounts: WithdrawFromTreasuryAccounts<'_, '_>,
    keys: WithdrawFromTreasuryKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (
            *accounts.treasury_withdrawal_destination.key,
            keys.treasury_withdrawal_destination,
        ),
        (
            *accounts.auction_house_treasury.key,
            keys.auction_house_treasury,
        ),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.system_program.key, keys.system_program),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn withdraw_from_treasury_verify_writable_privileges<'me, 'info>(
    accounts: WithdrawFromTreasuryAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.treasury_withdrawal_destination,
        accounts.auction_house_treasury,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn withdraw_from_treasury_verify_account_privileges<'me, 'info>(
    accounts: WithdrawFromTreasuryAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    withdraw_from_treasury_verify_writable_privileges(accounts)?;
    Ok(())
}
pub const UPDATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN: usize = 7;
#[derive(Copy, Clone, Debug)]
pub struct UpdateAuctionHouseAccounts<'me, 'info> {
    pub payer: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub authority: &'me AccountInfo<'info>,
    pub new_authority: &'me AccountInfo<'info>,
    pub treasury_withdrawal_destination: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct UpdateAuctionHouseKeys {
    pub payer: Pubkey,
    pub notary: Pubkey,
    pub authority: Pubkey,
    pub new_authority: Pubkey,
    pub treasury_withdrawal_destination: Pubkey,
    pub auction_house: Pubkey,
    pub system_program: Pubkey,
}
impl From<UpdateAuctionHouseAccounts<'_, '_>> for UpdateAuctionHouseKeys {
    fn from(accounts: UpdateAuctionHouseAccounts) -> Self {
        Self {
            payer: *accounts.payer.key,
            notary: *accounts.notary.key,
            authority: *accounts.authority.key,
            new_authority: *accounts.new_authority.key,
            treasury_withdrawal_destination: *accounts.treasury_withdrawal_destination.key,
            auction_house: *accounts.auction_house.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<UpdateAuctionHouseKeys> for [AccountMeta; UPDATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN] {
    fn from(keys: UpdateAuctionHouseKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.payer,
                is_signer: true,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.authority,
                is_signer: true,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.new_authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.treasury_withdrawal_destination,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; UPDATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN]> for UpdateAuctionHouseKeys {
    fn from(pubkeys: [Pubkey; UPDATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            payer: pubkeys[0],
            notary: pubkeys[1],
            authority: pubkeys[2],
            new_authority: pubkeys[3],
            treasury_withdrawal_destination: pubkeys[4],
            auction_house: pubkeys[5],
            system_program: pubkeys[6],
        }
    }
}
impl<'info> From<UpdateAuctionHouseAccounts<'_, 'info>>
    for [AccountInfo<'info>; UPDATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN]
{
    fn from(accounts: UpdateAuctionHouseAccounts<'_, 'info>) -> Self {
        [
            accounts.payer.clone(),
            accounts.notary.clone(),
            accounts.authority.clone(),
            accounts.new_authority.clone(),
            accounts.treasury_withdrawal_destination.clone(),
            accounts.auction_house.clone(),
            accounts.system_program.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; UPDATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN]>
    for UpdateAuctionHouseAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; UPDATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            payer: &arr[0],
            notary: &arr[1],
            authority: &arr[2],
            new_authority: &arr[3],
            treasury_withdrawal_destination: &arr[4],
            auction_house: &arr[5],
            system_program: &arr[6],
        }
    }
}
pub const UPDATE_AUCTION_HOUSE_IX_DISCM: [u8; 8] = [84, 215, 2, 172, 241, 0, 245, 219];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct UpdateAuctionHouseIxArgs {
    pub seller_fee_basis_points: Option<u16>,
    pub buyer_referral_bp: Option<u16>,
    pub seller_referral_bp: Option<u16>,
    pub requires_notary: Option<bool>,
    pub nprob: Option<u8>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct UpdateAuctionHouseIxData(pub UpdateAuctionHouseIxArgs);
impl From<UpdateAuctionHouseIxArgs> for UpdateAuctionHouseIxData {
    fn from(args: UpdateAuctionHouseIxArgs) -> Self {
        Self(args)
    }
}
impl UpdateAuctionHouseIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != UPDATE_AUCTION_HOUSE_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    UPDATE_AUCTION_HOUSE_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(UpdateAuctionHouseIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&UPDATE_AUCTION_HOUSE_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn update_auction_house_ix_with_program_id(
    program_id: Pubkey,
    keys: UpdateAuctionHouseKeys,
    args: UpdateAuctionHouseIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; UPDATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN] = keys.into();
    let data: UpdateAuctionHouseIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn update_auction_house_ix(
    keys: UpdateAuctionHouseKeys,
    args: UpdateAuctionHouseIxArgs,
) -> std::io::Result<Instruction> {
    update_auction_house_ix_with_program_id(crate::ID, keys, args)
}
pub fn update_auction_house_invoke_with_program_id(
    program_id: Pubkey,
    accounts: UpdateAuctionHouseAccounts<'_, '_>,
    args: UpdateAuctionHouseIxArgs,
) -> ProgramResult {
    let keys: UpdateAuctionHouseKeys = accounts.into();
    let ix = update_auction_house_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn update_auction_house_invoke(
    accounts: UpdateAuctionHouseAccounts<'_, '_>,
    args: UpdateAuctionHouseIxArgs,
) -> ProgramResult {
    update_auction_house_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn update_auction_house_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: UpdateAuctionHouseAccounts<'_, '_>,
    args: UpdateAuctionHouseIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: UpdateAuctionHouseKeys = accounts.into();
    let ix = update_auction_house_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn update_auction_house_invoke_signed(
    accounts: UpdateAuctionHouseAccounts<'_, '_>,
    args: UpdateAuctionHouseIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    update_auction_house_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn update_auction_house_verify_account_keys(
    accounts: UpdateAuctionHouseAccounts<'_, '_>,
    keys: UpdateAuctionHouseKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.payer.key, keys.payer),
        (*accounts.notary.key, keys.notary),
        (*accounts.authority.key, keys.authority),
        (*accounts.new_authority.key, keys.new_authority),
        (
            *accounts.treasury_withdrawal_destination.key,
            keys.treasury_withdrawal_destination,
        ),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.system_program.key, keys.system_program),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn update_auction_house_verify_writable_privileges<'me, 'info>(
    accounts: UpdateAuctionHouseAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.treasury_withdrawal_destination,
        accounts.auction_house,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn update_auction_house_verify_signer_privileges<'me, 'info>(
    accounts: UpdateAuctionHouseAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.payer, accounts.authority] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn update_auction_house_verify_account_privileges<'me, 'info>(
    accounts: UpdateAuctionHouseAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    update_auction_house_verify_writable_privileges(accounts)?;
    update_auction_house_verify_signer_privileges(accounts)?;
    Ok(())
}
pub const CREATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN: usize = 7;
#[derive(Copy, Clone, Debug)]
pub struct CreateAuctionHouseAccounts<'me, 'info> {
    pub payer: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub authority: &'me AccountInfo<'info>,
    pub treasury_withdrawal_destination: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub auction_house_treasury: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct CreateAuctionHouseKeys {
    pub payer: Pubkey,
    pub notary: Pubkey,
    pub authority: Pubkey,
    pub treasury_withdrawal_destination: Pubkey,
    pub auction_house: Pubkey,
    pub auction_house_treasury: Pubkey,
    pub system_program: Pubkey,
}
impl From<CreateAuctionHouseAccounts<'_, '_>> for CreateAuctionHouseKeys {
    fn from(accounts: CreateAuctionHouseAccounts) -> Self {
        Self {
            payer: *accounts.payer.key,
            notary: *accounts.notary.key,
            authority: *accounts.authority.key,
            treasury_withdrawal_destination: *accounts.treasury_withdrawal_destination.key,
            auction_house: *accounts.auction_house.key,
            auction_house_treasury: *accounts.auction_house_treasury.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<CreateAuctionHouseKeys> for [AccountMeta; CREATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN] {
    fn from(keys: CreateAuctionHouseKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.payer,
                is_signer: true,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.treasury_withdrawal_destination,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.auction_house_treasury,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; CREATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN]> for CreateAuctionHouseKeys {
    fn from(pubkeys: [Pubkey; CREATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            payer: pubkeys[0],
            notary: pubkeys[1],
            authority: pubkeys[2],
            treasury_withdrawal_destination: pubkeys[3],
            auction_house: pubkeys[4],
            auction_house_treasury: pubkeys[5],
            system_program: pubkeys[6],
        }
    }
}
impl<'info> From<CreateAuctionHouseAccounts<'_, 'info>>
    for [AccountInfo<'info>; CREATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN]
{
    fn from(accounts: CreateAuctionHouseAccounts<'_, 'info>) -> Self {
        [
            accounts.payer.clone(),
            accounts.notary.clone(),
            accounts.authority.clone(),
            accounts.treasury_withdrawal_destination.clone(),
            accounts.auction_house.clone(),
            accounts.auction_house_treasury.clone(),
            accounts.system_program.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; CREATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN]>
    for CreateAuctionHouseAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; CREATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            payer: &arr[0],
            notary: &arr[1],
            authority: &arr[2],
            treasury_withdrawal_destination: &arr[3],
            auction_house: &arr[4],
            auction_house_treasury: &arr[5],
            system_program: &arr[6],
        }
    }
}
pub const CREATE_AUCTION_HOUSE_IX_DISCM: [u8; 8] = [221, 66, 242, 159, 249, 206, 134, 241];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct CreateAuctionHouseIxArgs {
    pub bump: u8,
    pub treasury_bump: u8,
    pub seller_fee_basis_points: u16,
    pub buyer_referral_bp: u16,
    pub seller_referral_bp: u16,
    pub requires_notary: bool,
    pub create_auction_house_nonce: u64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct CreateAuctionHouseIxData(pub CreateAuctionHouseIxArgs);
impl From<CreateAuctionHouseIxArgs> for CreateAuctionHouseIxData {
    fn from(args: CreateAuctionHouseIxArgs) -> Self {
        Self(args)
    }
}
impl CreateAuctionHouseIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != CREATE_AUCTION_HOUSE_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    CREATE_AUCTION_HOUSE_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(CreateAuctionHouseIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&CREATE_AUCTION_HOUSE_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn create_auction_house_ix_with_program_id(
    program_id: Pubkey,
    keys: CreateAuctionHouseKeys,
    args: CreateAuctionHouseIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; CREATE_AUCTION_HOUSE_IX_ACCOUNTS_LEN] = keys.into();
    let data: CreateAuctionHouseIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn create_auction_house_ix(
    keys: CreateAuctionHouseKeys,
    args: CreateAuctionHouseIxArgs,
) -> std::io::Result<Instruction> {
    create_auction_house_ix_with_program_id(crate::ID, keys, args)
}
pub fn create_auction_house_invoke_with_program_id(
    program_id: Pubkey,
    accounts: CreateAuctionHouseAccounts<'_, '_>,
    args: CreateAuctionHouseIxArgs,
) -> ProgramResult {
    let keys: CreateAuctionHouseKeys = accounts.into();
    let ix = create_auction_house_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn create_auction_house_invoke(
    accounts: CreateAuctionHouseAccounts<'_, '_>,
    args: CreateAuctionHouseIxArgs,
) -> ProgramResult {
    create_auction_house_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn create_auction_house_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: CreateAuctionHouseAccounts<'_, '_>,
    args: CreateAuctionHouseIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: CreateAuctionHouseKeys = accounts.into();
    let ix = create_auction_house_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn create_auction_house_invoke_signed(
    accounts: CreateAuctionHouseAccounts<'_, '_>,
    args: CreateAuctionHouseIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    create_auction_house_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn create_auction_house_verify_account_keys(
    accounts: CreateAuctionHouseAccounts<'_, '_>,
    keys: CreateAuctionHouseKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.payer.key, keys.payer),
        (*accounts.notary.key, keys.notary),
        (*accounts.authority.key, keys.authority),
        (
            *accounts.treasury_withdrawal_destination.key,
            keys.treasury_withdrawal_destination,
        ),
        (*accounts.auction_house.key, keys.auction_house),
        (
            *accounts.auction_house_treasury.key,
            keys.auction_house_treasury,
        ),
        (*accounts.system_program.key, keys.system_program),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn create_auction_house_verify_writable_privileges<'me, 'info>(
    accounts: CreateAuctionHouseAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.payer,
        accounts.treasury_withdrawal_destination,
        accounts.auction_house,
        accounts.auction_house_treasury,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn create_auction_house_verify_signer_privileges<'me, 'info>(
    accounts: CreateAuctionHouseAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.payer] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn create_auction_house_verify_account_privileges<'me, 'info>(
    accounts: CreateAuctionHouseAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    create_auction_house_verify_writable_privileges(accounts)?;
    create_auction_house_verify_signer_privileges(accounts)?;
    Ok(())
}
pub const WITHDRAW_IX_ACCOUNTS_LEN: usize = 6;
#[derive(Copy, Clone, Debug)]
pub struct WithdrawAccounts<'me, 'info> {
    pub wallet: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub escrow_payment_account: &'me AccountInfo<'info>,
    pub authority: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct WithdrawKeys {
    pub wallet: Pubkey,
    pub notary: Pubkey,
    pub escrow_payment_account: Pubkey,
    pub authority: Pubkey,
    pub auction_house: Pubkey,
    pub system_program: Pubkey,
}
impl From<WithdrawAccounts<'_, '_>> for WithdrawKeys {
    fn from(accounts: WithdrawAccounts) -> Self {
        Self {
            wallet: *accounts.wallet.key,
            notary: *accounts.notary.key,
            escrow_payment_account: *accounts.escrow_payment_account.key,
            authority: *accounts.authority.key,
            auction_house: *accounts.auction_house.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<WithdrawKeys> for [AccountMeta; WITHDRAW_IX_ACCOUNTS_LEN] {
    fn from(keys: WithdrawKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.wallet,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.escrow_payment_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; WITHDRAW_IX_ACCOUNTS_LEN]> for WithdrawKeys {
    fn from(pubkeys: [Pubkey; WITHDRAW_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: pubkeys[0],
            notary: pubkeys[1],
            escrow_payment_account: pubkeys[2],
            authority: pubkeys[3],
            auction_house: pubkeys[4],
            system_program: pubkeys[5],
        }
    }
}
impl<'info> From<WithdrawAccounts<'_, 'info>> for [AccountInfo<'info>; WITHDRAW_IX_ACCOUNTS_LEN] {
    fn from(accounts: WithdrawAccounts<'_, 'info>) -> Self {
        [
            accounts.wallet.clone(),
            accounts.notary.clone(),
            accounts.escrow_payment_account.clone(),
            accounts.authority.clone(),
            accounts.auction_house.clone(),
            accounts.system_program.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; WITHDRAW_IX_ACCOUNTS_LEN]>
    for WithdrawAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; WITHDRAW_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: &arr[0],
            notary: &arr[1],
            escrow_payment_account: &arr[2],
            authority: &arr[3],
            auction_house: &arr[4],
            system_program: &arr[5],
        }
    }
}
pub const WITHDRAW_IX_DISCM: [u8; 8] = [183, 18, 70, 156, 148, 109, 161, 34];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct WithdrawIxArgs {
    pub escrow_payment_bump: u8,
    pub amount: u64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct WithdrawIxData(pub WithdrawIxArgs);
impl From<WithdrawIxArgs> for WithdrawIxData {
    fn from(args: WithdrawIxArgs) -> Self {
        Self(args)
    }
}
impl WithdrawIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != WITHDRAW_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    WITHDRAW_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(WithdrawIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&WITHDRAW_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn withdraw_ix_with_program_id(
    program_id: Pubkey,
    keys: WithdrawKeys,
    args: WithdrawIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; WITHDRAW_IX_ACCOUNTS_LEN] = keys.into();
    let data: WithdrawIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn withdraw_ix(keys: WithdrawKeys, args: WithdrawIxArgs) -> std::io::Result<Instruction> {
    withdraw_ix_with_program_id(crate::ID, keys, args)
}
pub fn withdraw_invoke_with_program_id(
    program_id: Pubkey,
    accounts: WithdrawAccounts<'_, '_>,
    args: WithdrawIxArgs,
) -> ProgramResult {
    let keys: WithdrawKeys = accounts.into();
    let ix = withdraw_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn withdraw_invoke(accounts: WithdrawAccounts<'_, '_>, args: WithdrawIxArgs) -> ProgramResult {
    withdraw_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn withdraw_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: WithdrawAccounts<'_, '_>,
    args: WithdrawIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: WithdrawKeys = accounts.into();
    let ix = withdraw_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn withdraw_invoke_signed(
    accounts: WithdrawAccounts<'_, '_>,
    args: WithdrawIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    withdraw_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn withdraw_verify_account_keys(
    accounts: WithdrawAccounts<'_, '_>,
    keys: WithdrawKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.wallet.key, keys.wallet),
        (*accounts.notary.key, keys.notary),
        (
            *accounts.escrow_payment_account.key,
            keys.escrow_payment_account,
        ),
        (*accounts.authority.key, keys.authority),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.system_program.key, keys.system_program),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn withdraw_verify_writable_privileges<'me, 'info>(
    accounts: WithdrawAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [accounts.wallet, accounts.escrow_payment_account] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn withdraw_verify_account_privileges<'me, 'info>(
    accounts: WithdrawAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    withdraw_verify_writable_privileges(accounts)?;
    Ok(())
}
pub const DEPOSIT_IX_ACCOUNTS_LEN: usize = 6;
#[derive(Copy, Clone, Debug)]
pub struct DepositAccounts<'me, 'info> {
    pub wallet: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub escrow_payment_account: &'me AccountInfo<'info>,
    pub authority: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct DepositKeys {
    pub wallet: Pubkey,
    pub notary: Pubkey,
    pub escrow_payment_account: Pubkey,
    pub authority: Pubkey,
    pub auction_house: Pubkey,
    pub system_program: Pubkey,
}
impl From<DepositAccounts<'_, '_>> for DepositKeys {
    fn from(accounts: DepositAccounts) -> Self {
        Self {
            wallet: *accounts.wallet.key,
            notary: *accounts.notary.key,
            escrow_payment_account: *accounts.escrow_payment_account.key,
            authority: *accounts.authority.key,
            auction_house: *accounts.auction_house.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<DepositKeys> for [AccountMeta; DEPOSIT_IX_ACCOUNTS_LEN] {
    fn from(keys: DepositKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.wallet,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.escrow_payment_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; DEPOSIT_IX_ACCOUNTS_LEN]> for DepositKeys {
    fn from(pubkeys: [Pubkey; DEPOSIT_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: pubkeys[0],
            notary: pubkeys[1],
            escrow_payment_account: pubkeys[2],
            authority: pubkeys[3],
            auction_house: pubkeys[4],
            system_program: pubkeys[5],
        }
    }
}
impl<'info> From<DepositAccounts<'_, 'info>> for [AccountInfo<'info>; DEPOSIT_IX_ACCOUNTS_LEN] {
    fn from(accounts: DepositAccounts<'_, 'info>) -> Self {
        [
            accounts.wallet.clone(),
            accounts.notary.clone(),
            accounts.escrow_payment_account.clone(),
            accounts.authority.clone(),
            accounts.auction_house.clone(),
            accounts.system_program.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; DEPOSIT_IX_ACCOUNTS_LEN]>
    for DepositAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; DEPOSIT_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: &arr[0],
            notary: &arr[1],
            escrow_payment_account: &arr[2],
            authority: &arr[3],
            auction_house: &arr[4],
            system_program: &arr[5],
        }
    }
}
pub const DEPOSIT_IX_DISCM: [u8; 8] = [242, 35, 198, 137, 82, 225, 242, 182];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct DepositIxArgs {
    pub escrow_payment_bump: u8,
    pub amount: u64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct DepositIxData(pub DepositIxArgs);
impl From<DepositIxArgs> for DepositIxData {
    fn from(args: DepositIxArgs) -> Self {
        Self(args)
    }
}
impl DepositIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != DEPOSIT_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    DEPOSIT_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(DepositIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&DEPOSIT_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn deposit_ix_with_program_id(
    program_id: Pubkey,
    keys: DepositKeys,
    args: DepositIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; DEPOSIT_IX_ACCOUNTS_LEN] = keys.into();
    let data: DepositIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn deposit_ix(keys: DepositKeys, args: DepositIxArgs) -> std::io::Result<Instruction> {
    deposit_ix_with_program_id(crate::ID, keys, args)
}
pub fn deposit_invoke_with_program_id(
    program_id: Pubkey,
    accounts: DepositAccounts<'_, '_>,
    args: DepositIxArgs,
) -> ProgramResult {
    let keys: DepositKeys = accounts.into();
    let ix = deposit_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn deposit_invoke(accounts: DepositAccounts<'_, '_>, args: DepositIxArgs) -> ProgramResult {
    deposit_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn deposit_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: DepositAccounts<'_, '_>,
    args: DepositIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: DepositKeys = accounts.into();
    let ix = deposit_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn deposit_invoke_signed(
    accounts: DepositAccounts<'_, '_>,
    args: DepositIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    deposit_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn deposit_verify_account_keys(
    accounts: DepositAccounts<'_, '_>,
    keys: DepositKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.wallet.key, keys.wallet),
        (*accounts.notary.key, keys.notary),
        (
            *accounts.escrow_payment_account.key,
            keys.escrow_payment_account,
        ),
        (*accounts.authority.key, keys.authority),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.system_program.key, keys.system_program),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn deposit_verify_writable_privileges<'me, 'info>(
    accounts: DepositAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [accounts.wallet, accounts.escrow_payment_account] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn deposit_verify_account_privileges<'me, 'info>(
    accounts: DepositAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    deposit_verify_writable_privileges(accounts)?;
    Ok(())
}
pub const SELL_IX_ACCOUNTS_LEN: usize = 15;
#[derive(Copy, Clone, Debug)]
pub struct SellAccounts<'me, 'info> {
    pub wallet: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub token_account: &'me AccountInfo<'info>,
    pub token_ata: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub metadata: &'me AccountInfo<'info>,
    pub authority: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub seller_trade_state: &'me AccountInfo<'info>,
    pub seller_referral: &'me AccountInfo<'info>,
    pub token_program: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
    pub ata_program: &'me AccountInfo<'info>,
    pub program_as_signer: &'me AccountInfo<'info>,
    pub rent: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct SellKeys {
    pub wallet: Pubkey,
    pub notary: Pubkey,
    pub token_account: Pubkey,
    pub token_ata: Pubkey,
    pub token_mint: Pubkey,
    pub metadata: Pubkey,
    pub authority: Pubkey,
    pub auction_house: Pubkey,
    pub seller_trade_state: Pubkey,
    pub seller_referral: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
    pub ata_program: Pubkey,
    pub program_as_signer: Pubkey,
    pub rent: Pubkey,
}
impl From<SellAccounts<'_, '_>> for SellKeys {
    fn from(accounts: SellAccounts) -> Self {
        Self {
            wallet: *accounts.wallet.key,
            notary: *accounts.notary.key,
            token_account: *accounts.token_account.key,
            token_ata: *accounts.token_ata.key,
            token_mint: *accounts.token_mint.key,
            metadata: *accounts.metadata.key,
            authority: *accounts.authority.key,
            auction_house: *accounts.auction_house.key,
            seller_trade_state: *accounts.seller_trade_state.key,
            seller_referral: *accounts.seller_referral.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
            ata_program: *accounts.ata_program.key,
            program_as_signer: *accounts.program_as_signer.key,
            rent: *accounts.rent.key,
        }
    }
}
impl From<SellKeys> for [AccountMeta; SELL_IX_ACCOUNTS_LEN] {
    fn from(keys: SellKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.wallet,
                is_signer: true,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_ata,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.metadata,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.seller_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller_referral,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.ata_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.program_as_signer,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.rent,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; SELL_IX_ACCOUNTS_LEN]> for SellKeys {
    fn from(pubkeys: [Pubkey; SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: pubkeys[0],
            notary: pubkeys[1],
            token_account: pubkeys[2],
            token_ata: pubkeys[3],
            token_mint: pubkeys[4],
            metadata: pubkeys[5],
            authority: pubkeys[6],
            auction_house: pubkeys[7],
            seller_trade_state: pubkeys[8],
            seller_referral: pubkeys[9],
            token_program: pubkeys[10],
            system_program: pubkeys[11],
            ata_program: pubkeys[12],
            program_as_signer: pubkeys[13],
            rent: pubkeys[14],
        }
    }
}
impl<'info> From<SellAccounts<'_, 'info>> for [AccountInfo<'info>; SELL_IX_ACCOUNTS_LEN] {
    fn from(accounts: SellAccounts<'_, 'info>) -> Self {
        [
            accounts.wallet.clone(),
            accounts.notary.clone(),
            accounts.token_account.clone(),
            accounts.token_ata.clone(),
            accounts.token_mint.clone(),
            accounts.metadata.clone(),
            accounts.authority.clone(),
            accounts.auction_house.clone(),
            accounts.seller_trade_state.clone(),
            accounts.seller_referral.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
            accounts.ata_program.clone(),
            accounts.program_as_signer.clone(),
            accounts.rent.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; SELL_IX_ACCOUNTS_LEN]>
    for SellAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: &arr[0],
            notary: &arr[1],
            token_account: &arr[2],
            token_ata: &arr[3],
            token_mint: &arr[4],
            metadata: &arr[5],
            authority: &arr[6],
            auction_house: &arr[7],
            seller_trade_state: &arr[8],
            seller_referral: &arr[9],
            token_program: &arr[10],
            system_program: &arr[11],
            ata_program: &arr[12],
            program_as_signer: &arr[13],
            rent: &arr[14],
        }
    }
}
pub const SELL_IX_DISCM: [u8; 8] = [51, 230, 133, 164, 1, 127, 131, 173];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SellIxArgs {
    pub seller_state_bump: u8,
    pub program_as_signer_bump: u8,
    pub buyer_price: u64,
    pub token_size: u64,
    pub seller_state_expiry: i64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct SellIxData(pub SellIxArgs);
impl From<SellIxArgs> for SellIxData {
    fn from(args: SellIxArgs) -> Self {
        Self(args)
    }
}
impl SellIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != SELL_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    SELL_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(SellIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&SELL_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn sell_ix_with_program_id(
    program_id: Pubkey,
    keys: SellKeys,
    args: SellIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; SELL_IX_ACCOUNTS_LEN] = keys.into();
    let data: SellIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn sell_ix(keys: SellKeys, args: SellIxArgs) -> std::io::Result<Instruction> {
    sell_ix_with_program_id(crate::ID, keys, args)
}
pub fn sell_invoke_with_program_id(
    program_id: Pubkey,
    accounts: SellAccounts<'_, '_>,
    args: SellIxArgs,
) -> ProgramResult {
    let keys: SellKeys = accounts.into();
    let ix = sell_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn sell_invoke(accounts: SellAccounts<'_, '_>, args: SellIxArgs) -> ProgramResult {
    sell_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn sell_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: SellAccounts<'_, '_>,
    args: SellIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: SellKeys = accounts.into();
    let ix = sell_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn sell_invoke_signed(
    accounts: SellAccounts<'_, '_>,
    args: SellIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    sell_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn sell_verify_account_keys(
    accounts: SellAccounts<'_, '_>,
    keys: SellKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.wallet.key, keys.wallet),
        (*accounts.notary.key, keys.notary),
        (*accounts.token_account.key, keys.token_account),
        (*accounts.token_ata.key, keys.token_ata),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.metadata.key, keys.metadata),
        (*accounts.authority.key, keys.authority),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.seller_trade_state.key, keys.seller_trade_state),
        (*accounts.seller_referral.key, keys.seller_referral),
        (*accounts.token_program.key, keys.token_program),
        (*accounts.system_program.key, keys.system_program),
        (*accounts.ata_program.key, keys.ata_program),
        (*accounts.program_as_signer.key, keys.program_as_signer),
        (*accounts.rent.key, keys.rent),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn sell_verify_writable_privileges<'me, 'info>(
    accounts: SellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.wallet,
        accounts.token_account,
        accounts.token_ata,
        accounts.seller_trade_state,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn sell_verify_signer_privileges<'me, 'info>(
    accounts: SellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.wallet] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn sell_verify_account_privileges<'me, 'info>(
    accounts: SellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    sell_verify_writable_privileges(accounts)?;
    sell_verify_signer_privileges(accounts)?;
    Ok(())
}
pub const CANCEL_SELL_IX_ACCOUNTS_LEN: usize = 9;
#[derive(Copy, Clone, Debug)]
pub struct CancelSellAccounts<'me, 'info> {
    pub wallet: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub token_account: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub authority: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub seller_trade_state: &'me AccountInfo<'info>,
    pub seller_referral: &'me AccountInfo<'info>,
    pub token_program: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct CancelSellKeys {
    pub wallet: Pubkey,
    pub notary: Pubkey,
    pub token_account: Pubkey,
    pub token_mint: Pubkey,
    pub authority: Pubkey,
    pub auction_house: Pubkey,
    pub seller_trade_state: Pubkey,
    pub seller_referral: Pubkey,
    pub token_program: Pubkey,
}
impl From<CancelSellAccounts<'_, '_>> for CancelSellKeys {
    fn from(accounts: CancelSellAccounts) -> Self {
        Self {
            wallet: *accounts.wallet.key,
            notary: *accounts.notary.key,
            token_account: *accounts.token_account.key,
            token_mint: *accounts.token_mint.key,
            authority: *accounts.authority.key,
            auction_house: *accounts.auction_house.key,
            seller_trade_state: *accounts.seller_trade_state.key,
            seller_referral: *accounts.seller_referral.key,
            token_program: *accounts.token_program.key,
        }
    }
}
impl From<CancelSellKeys> for [AccountMeta; CANCEL_SELL_IX_ACCOUNTS_LEN] {
    fn from(keys: CancelSellKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.wallet,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.seller_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller_referral,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_program,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; CANCEL_SELL_IX_ACCOUNTS_LEN]> for CancelSellKeys {
    fn from(pubkeys: [Pubkey; CANCEL_SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: pubkeys[0],
            notary: pubkeys[1],
            token_account: pubkeys[2],
            token_mint: pubkeys[3],
            authority: pubkeys[4],
            auction_house: pubkeys[5],
            seller_trade_state: pubkeys[6],
            seller_referral: pubkeys[7],
            token_program: pubkeys[8],
        }
    }
}
impl<'info> From<CancelSellAccounts<'_, 'info>>
    for [AccountInfo<'info>; CANCEL_SELL_IX_ACCOUNTS_LEN]
{
    fn from(accounts: CancelSellAccounts<'_, 'info>) -> Self {
        [
            accounts.wallet.clone(),
            accounts.notary.clone(),
            accounts.token_account.clone(),
            accounts.token_mint.clone(),
            accounts.authority.clone(),
            accounts.auction_house.clone(),
            accounts.seller_trade_state.clone(),
            accounts.seller_referral.clone(),
            accounts.token_program.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; CANCEL_SELL_IX_ACCOUNTS_LEN]>
    for CancelSellAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; CANCEL_SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: &arr[0],
            notary: &arr[1],
            token_account: &arr[2],
            token_mint: &arr[3],
            authority: &arr[4],
            auction_house: &arr[5],
            seller_trade_state: &arr[6],
            seller_referral: &arr[7],
            token_program: &arr[8],
        }
    }
}
pub const CANCEL_SELL_IX_DISCM: [u8; 8] = [198, 198, 130, 203, 163, 95, 175, 75];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct CancelSellIxArgs {
    pub buyer_price: u64,
    pub token_size: u64,
    pub seller_state_expiry: i64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct CancelSellIxData(pub CancelSellIxArgs);
impl From<CancelSellIxArgs> for CancelSellIxData {
    fn from(args: CancelSellIxArgs) -> Self {
        Self(args)
    }
}
impl CancelSellIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != CANCEL_SELL_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    CANCEL_SELL_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(CancelSellIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&CANCEL_SELL_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn cancel_sell_ix_with_program_id(
    program_id: Pubkey,
    keys: CancelSellKeys,
    args: CancelSellIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; CANCEL_SELL_IX_ACCOUNTS_LEN] = keys.into();
    let data: CancelSellIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn cancel_sell_ix(
    keys: CancelSellKeys,
    args: CancelSellIxArgs,
) -> std::io::Result<Instruction> {
    cancel_sell_ix_with_program_id(crate::ID, keys, args)
}
pub fn cancel_sell_invoke_with_program_id(
    program_id: Pubkey,
    accounts: CancelSellAccounts<'_, '_>,
    args: CancelSellIxArgs,
) -> ProgramResult {
    let keys: CancelSellKeys = accounts.into();
    let ix = cancel_sell_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn cancel_sell_invoke(
    accounts: CancelSellAccounts<'_, '_>,
    args: CancelSellIxArgs,
) -> ProgramResult {
    cancel_sell_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn cancel_sell_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: CancelSellAccounts<'_, '_>,
    args: CancelSellIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: CancelSellKeys = accounts.into();
    let ix = cancel_sell_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn cancel_sell_invoke_signed(
    accounts: CancelSellAccounts<'_, '_>,
    args: CancelSellIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    cancel_sell_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn cancel_sell_verify_account_keys(
    accounts: CancelSellAccounts<'_, '_>,
    keys: CancelSellKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.wallet.key, keys.wallet),
        (*accounts.notary.key, keys.notary),
        (*accounts.token_account.key, keys.token_account),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.authority.key, keys.authority),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.seller_trade_state.key, keys.seller_trade_state),
        (*accounts.seller_referral.key, keys.seller_referral),
        (*accounts.token_program.key, keys.token_program),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn cancel_sell_verify_writable_privileges<'me, 'info>(
    accounts: CancelSellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.wallet,
        accounts.token_account,
        accounts.seller_trade_state,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn cancel_sell_verify_account_privileges<'me, 'info>(
    accounts: CancelSellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    cancel_sell_verify_writable_privileges(accounts)?;
    Ok(())
}
pub const BUY_IX_ACCOUNTS_LEN: usize = 12;
#[derive(Copy, Clone, Debug)]
pub struct BuyAccounts<'me, 'info> {
    pub wallet: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub metadata: &'me AccountInfo<'info>,
    pub escrow_payment_account: &'me AccountInfo<'info>,
    pub authority: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub buyer_trade_state: &'me AccountInfo<'info>,
    pub buyer_referral: &'me AccountInfo<'info>,
    pub token_program: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
    pub rent: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct BuyKeys {
    pub wallet: Pubkey,
    pub notary: Pubkey,
    pub token_mint: Pubkey,
    pub metadata: Pubkey,
    pub escrow_payment_account: Pubkey,
    pub authority: Pubkey,
    pub auction_house: Pubkey,
    pub buyer_trade_state: Pubkey,
    pub buyer_referral: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
    pub rent: Pubkey,
}
impl From<BuyAccounts<'_, '_>> for BuyKeys {
    fn from(accounts: BuyAccounts) -> Self {
        Self {
            wallet: *accounts.wallet.key,
            notary: *accounts.notary.key,
            token_mint: *accounts.token_mint.key,
            metadata: *accounts.metadata.key,
            escrow_payment_account: *accounts.escrow_payment_account.key,
            authority: *accounts.authority.key,
            auction_house: *accounts.auction_house.key,
            buyer_trade_state: *accounts.buyer_trade_state.key,
            buyer_referral: *accounts.buyer_referral.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
            rent: *accounts.rent.key,
        }
    }
}
impl From<BuyKeys> for [AccountMeta; BUY_IX_ACCOUNTS_LEN] {
    fn from(keys: BuyKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.wallet,
                is_signer: true,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.metadata,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.escrow_payment_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.buyer_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_referral,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.rent,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; BUY_IX_ACCOUNTS_LEN]> for BuyKeys {
    fn from(pubkeys: [Pubkey; BUY_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: pubkeys[0],
            notary: pubkeys[1],
            token_mint: pubkeys[2],
            metadata: pubkeys[3],
            escrow_payment_account: pubkeys[4],
            authority: pubkeys[5],
            auction_house: pubkeys[6],
            buyer_trade_state: pubkeys[7],
            buyer_referral: pubkeys[8],
            token_program: pubkeys[9],
            system_program: pubkeys[10],
            rent: pubkeys[11],
        }
    }
}
impl<'info> From<BuyAccounts<'_, 'info>> for [AccountInfo<'info>; BUY_IX_ACCOUNTS_LEN] {
    fn from(accounts: BuyAccounts<'_, 'info>) -> Self {
        [
            accounts.wallet.clone(),
            accounts.notary.clone(),
            accounts.token_mint.clone(),
            accounts.metadata.clone(),
            accounts.escrow_payment_account.clone(),
            accounts.authority.clone(),
            accounts.auction_house.clone(),
            accounts.buyer_trade_state.clone(),
            accounts.buyer_referral.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
            accounts.rent.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; BUY_IX_ACCOUNTS_LEN]> for BuyAccounts<'me, 'info> {
    fn from(arr: &'me [AccountInfo<'info>; BUY_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: &arr[0],
            notary: &arr[1],
            token_mint: &arr[2],
            metadata: &arr[3],
            escrow_payment_account: &arr[4],
            authority: &arr[5],
            auction_house: &arr[6],
            buyer_trade_state: &arr[7],
            buyer_referral: &arr[8],
            token_program: &arr[9],
            system_program: &arr[10],
            rent: &arr[11],
        }
    }
}
pub const BUY_IX_DISCM: [u8; 8] = [102, 6, 61, 18, 1, 218, 235, 234];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct BuyIxArgs {
    pub buyer_state_bump: u8,
    pub escrow_payment_bump: u8,
    pub buyer_price: u64,
    pub token_size: u64,
    pub buyer_state_expiry: i64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct BuyIxData(pub BuyIxArgs);
impl From<BuyIxArgs> for BuyIxData {
    fn from(args: BuyIxArgs) -> Self {
        Self(args)
    }
}
impl BuyIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != BUY_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    BUY_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(BuyIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&BUY_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn buy_ix_with_program_id(
    program_id: Pubkey,
    keys: BuyKeys,
    args: BuyIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; BUY_IX_ACCOUNTS_LEN] = keys.into();
    let data: BuyIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn buy_ix(keys: BuyKeys, args: BuyIxArgs) -> std::io::Result<Instruction> {
    buy_ix_with_program_id(crate::ID, keys, args)
}
pub fn buy_invoke_with_program_id(
    program_id: Pubkey,
    accounts: BuyAccounts<'_, '_>,
    args: BuyIxArgs,
) -> ProgramResult {
    let keys: BuyKeys = accounts.into();
    let ix = buy_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn buy_invoke(accounts: BuyAccounts<'_, '_>, args: BuyIxArgs) -> ProgramResult {
    buy_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn buy_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: BuyAccounts<'_, '_>,
    args: BuyIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: BuyKeys = accounts.into();
    let ix = buy_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn buy_invoke_signed(
    accounts: BuyAccounts<'_, '_>,
    args: BuyIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    buy_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn buy_verify_account_keys(
    accounts: BuyAccounts<'_, '_>,
    keys: BuyKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.wallet.key, keys.wallet),
        (*accounts.notary.key, keys.notary),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.metadata.key, keys.metadata),
        (
            *accounts.escrow_payment_account.key,
            keys.escrow_payment_account,
        ),
        (*accounts.authority.key, keys.authority),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.buyer_trade_state.key, keys.buyer_trade_state),
        (*accounts.buyer_referral.key, keys.buyer_referral),
        (*accounts.token_program.key, keys.token_program),
        (*accounts.system_program.key, keys.system_program),
        (*accounts.rent.key, keys.rent),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn buy_verify_writable_privileges<'me, 'info>(
    accounts: BuyAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.wallet,
        accounts.escrow_payment_account,
        accounts.buyer_trade_state,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn buy_verify_signer_privileges<'me, 'info>(
    accounts: BuyAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.wallet] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn buy_verify_account_privileges<'me, 'info>(
    accounts: BuyAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    buy_verify_writable_privileges(accounts)?;
    buy_verify_signer_privileges(accounts)?;
    Ok(())
}
pub const BUY_V2_IX_ACCOUNTS_LEN: usize = 11;
#[derive(Copy, Clone, Debug)]
pub struct BuyV2Accounts<'me, 'info> {
    pub wallet: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub metadata: &'me AccountInfo<'info>,
    pub escrow_payment_account: &'me AccountInfo<'info>,
    pub authority: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub buyer_trade_state: &'me AccountInfo<'info>,
    pub buyer_referral: &'me AccountInfo<'info>,
    pub token_program: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct BuyV2Keys {
    pub wallet: Pubkey,
    pub notary: Pubkey,
    pub token_mint: Pubkey,
    pub metadata: Pubkey,
    pub escrow_payment_account: Pubkey,
    pub authority: Pubkey,
    pub auction_house: Pubkey,
    pub buyer_trade_state: Pubkey,
    pub buyer_referral: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
}
impl From<BuyV2Accounts<'_, '_>> for BuyV2Keys {
    fn from(accounts: BuyV2Accounts) -> Self {
        Self {
            wallet: *accounts.wallet.key,
            notary: *accounts.notary.key,
            token_mint: *accounts.token_mint.key,
            metadata: *accounts.metadata.key,
            escrow_payment_account: *accounts.escrow_payment_account.key,
            authority: *accounts.authority.key,
            auction_house: *accounts.auction_house.key,
            buyer_trade_state: *accounts.buyer_trade_state.key,
            buyer_referral: *accounts.buyer_referral.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<BuyV2Keys> for [AccountMeta; BUY_V2_IX_ACCOUNTS_LEN] {
    fn from(keys: BuyV2Keys) -> Self {
        [
            AccountMeta {
                pubkey: keys.wallet,
                is_signer: true,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.metadata,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.escrow_payment_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.buyer_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_referral,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; BUY_V2_IX_ACCOUNTS_LEN]> for BuyV2Keys {
    fn from(pubkeys: [Pubkey; BUY_V2_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: pubkeys[0],
            notary: pubkeys[1],
            token_mint: pubkeys[2],
            metadata: pubkeys[3],
            escrow_payment_account: pubkeys[4],
            authority: pubkeys[5],
            auction_house: pubkeys[6],
            buyer_trade_state: pubkeys[7],
            buyer_referral: pubkeys[8],
            token_program: pubkeys[9],
            system_program: pubkeys[10],
        }
    }
}
impl<'info> From<BuyV2Accounts<'_, 'info>> for [AccountInfo<'info>; BUY_V2_IX_ACCOUNTS_LEN] {
    fn from(accounts: BuyV2Accounts<'_, 'info>) -> Self {
        [
            accounts.wallet.clone(),
            accounts.notary.clone(),
            accounts.token_mint.clone(),
            accounts.metadata.clone(),
            accounts.escrow_payment_account.clone(),
            accounts.authority.clone(),
            accounts.auction_house.clone(),
            accounts.buyer_trade_state.clone(),
            accounts.buyer_referral.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; BUY_V2_IX_ACCOUNTS_LEN]>
    for BuyV2Accounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; BUY_V2_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: &arr[0],
            notary: &arr[1],
            token_mint: &arr[2],
            metadata: &arr[3],
            escrow_payment_account: &arr[4],
            authority: &arr[5],
            auction_house: &arr[6],
            buyer_trade_state: &arr[7],
            buyer_referral: &arr[8],
            token_program: &arr[9],
            system_program: &arr[10],
        }
    }
}
pub const BUY_V2_IX_DISCM: [u8; 8] = [184, 23, 238, 97, 103, 197, 211, 61];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct BuyV2IxArgs {
    pub buyer_price: u64,
    pub token_size: u64,
    pub buyer_state_expiry: i64,
    pub buyer_creator_royalty_bp: u16,
    pub extra_args: Vec<u8>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct BuyV2IxData(pub BuyV2IxArgs);
impl From<BuyV2IxArgs> for BuyV2IxData {
    fn from(args: BuyV2IxArgs) -> Self {
        Self(args)
    }
}
impl BuyV2IxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != BUY_V2_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    BUY_V2_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(BuyV2IxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&BUY_V2_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn buy_v2_ix_with_program_id(
    program_id: Pubkey,
    keys: BuyV2Keys,
    args: BuyV2IxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; BUY_V2_IX_ACCOUNTS_LEN] = keys.into();
    let data: BuyV2IxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn buy_v2_ix(keys: BuyV2Keys, args: BuyV2IxArgs) -> std::io::Result<Instruction> {
    buy_v2_ix_with_program_id(crate::ID, keys, args)
}
pub fn buy_v2_invoke_with_program_id(
    program_id: Pubkey,
    accounts: BuyV2Accounts<'_, '_>,
    args: BuyV2IxArgs,
) -> ProgramResult {
    let keys: BuyV2Keys = accounts.into();
    let ix = buy_v2_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn buy_v2_invoke(accounts: BuyV2Accounts<'_, '_>, args: BuyV2IxArgs) -> ProgramResult {
    buy_v2_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn buy_v2_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: BuyV2Accounts<'_, '_>,
    args: BuyV2IxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: BuyV2Keys = accounts.into();
    let ix = buy_v2_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn buy_v2_invoke_signed(
    accounts: BuyV2Accounts<'_, '_>,
    args: BuyV2IxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    buy_v2_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn buy_v2_verify_account_keys(
    accounts: BuyV2Accounts<'_, '_>,
    keys: BuyV2Keys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.wallet.key, keys.wallet),
        (*accounts.notary.key, keys.notary),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.metadata.key, keys.metadata),
        (
            *accounts.escrow_payment_account.key,
            keys.escrow_payment_account,
        ),
        (*accounts.authority.key, keys.authority),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.buyer_trade_state.key, keys.buyer_trade_state),
        (*accounts.buyer_referral.key, keys.buyer_referral),
        (*accounts.token_program.key, keys.token_program),
        (*accounts.system_program.key, keys.system_program),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn buy_v2_verify_writable_privileges<'me, 'info>(
    accounts: BuyV2Accounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.wallet,
        accounts.escrow_payment_account,
        accounts.buyer_trade_state,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn buy_v2_verify_signer_privileges<'me, 'info>(
    accounts: BuyV2Accounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.wallet] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn buy_v2_verify_account_privileges<'me, 'info>(
    accounts: BuyV2Accounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    buy_v2_verify_writable_privileges(accounts)?;
    buy_v2_verify_signer_privileges(accounts)?;
    Ok(())
}
pub const CANCEL_BUY_IX_ACCOUNTS_LEN: usize = 7;
#[derive(Copy, Clone, Debug)]
pub struct CancelBuyAccounts<'me, 'info> {
    pub wallet: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub authority: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub buyer_trade_state: &'me AccountInfo<'info>,
    pub buyer_referral: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct CancelBuyKeys {
    pub wallet: Pubkey,
    pub notary: Pubkey,
    pub token_mint: Pubkey,
    pub authority: Pubkey,
    pub auction_house: Pubkey,
    pub buyer_trade_state: Pubkey,
    pub buyer_referral: Pubkey,
}
impl From<CancelBuyAccounts<'_, '_>> for CancelBuyKeys {
    fn from(accounts: CancelBuyAccounts) -> Self {
        Self {
            wallet: *accounts.wallet.key,
            notary: *accounts.notary.key,
            token_mint: *accounts.token_mint.key,
            authority: *accounts.authority.key,
            auction_house: *accounts.auction_house.key,
            buyer_trade_state: *accounts.buyer_trade_state.key,
            buyer_referral: *accounts.buyer_referral.key,
        }
    }
}
impl From<CancelBuyKeys> for [AccountMeta; CANCEL_BUY_IX_ACCOUNTS_LEN] {
    fn from(keys: CancelBuyKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.wallet,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.buyer_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_referral,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; CANCEL_BUY_IX_ACCOUNTS_LEN]> for CancelBuyKeys {
    fn from(pubkeys: [Pubkey; CANCEL_BUY_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: pubkeys[0],
            notary: pubkeys[1],
            token_mint: pubkeys[2],
            authority: pubkeys[3],
            auction_house: pubkeys[4],
            buyer_trade_state: pubkeys[5],
            buyer_referral: pubkeys[6],
        }
    }
}
impl<'info> From<CancelBuyAccounts<'_, 'info>>
    for [AccountInfo<'info>; CANCEL_BUY_IX_ACCOUNTS_LEN]
{
    fn from(accounts: CancelBuyAccounts<'_, 'info>) -> Self {
        [
            accounts.wallet.clone(),
            accounts.notary.clone(),
            accounts.token_mint.clone(),
            accounts.authority.clone(),
            accounts.auction_house.clone(),
            accounts.buyer_trade_state.clone(),
            accounts.buyer_referral.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; CANCEL_BUY_IX_ACCOUNTS_LEN]>
    for CancelBuyAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; CANCEL_BUY_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: &arr[0],
            notary: &arr[1],
            token_mint: &arr[2],
            authority: &arr[3],
            auction_house: &arr[4],
            buyer_trade_state: &arr[5],
            buyer_referral: &arr[6],
        }
    }
}
pub const CANCEL_BUY_IX_DISCM: [u8; 8] = [238, 76, 36, 218, 132, 177, 224, 233];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct CancelBuyIxArgs {
    pub buyer_price: u64,
    pub token_size: u64,
    pub buyer_state_expiry: i64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct CancelBuyIxData(pub CancelBuyIxArgs);
impl From<CancelBuyIxArgs> for CancelBuyIxData {
    fn from(args: CancelBuyIxArgs) -> Self {
        Self(args)
    }
}
impl CancelBuyIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != CANCEL_BUY_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    CANCEL_BUY_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(CancelBuyIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&CANCEL_BUY_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn cancel_buy_ix_with_program_id(
    program_id: Pubkey,
    keys: CancelBuyKeys,
    args: CancelBuyIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; CANCEL_BUY_IX_ACCOUNTS_LEN] = keys.into();
    let data: CancelBuyIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn cancel_buy_ix(keys: CancelBuyKeys, args: CancelBuyIxArgs) -> std::io::Result<Instruction> {
    cancel_buy_ix_with_program_id(crate::ID, keys, args)
}
pub fn cancel_buy_invoke_with_program_id(
    program_id: Pubkey,
    accounts: CancelBuyAccounts<'_, '_>,
    args: CancelBuyIxArgs,
) -> ProgramResult {
    let keys: CancelBuyKeys = accounts.into();
    let ix = cancel_buy_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn cancel_buy_invoke(
    accounts: CancelBuyAccounts<'_, '_>,
    args: CancelBuyIxArgs,
) -> ProgramResult {
    cancel_buy_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn cancel_buy_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: CancelBuyAccounts<'_, '_>,
    args: CancelBuyIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: CancelBuyKeys = accounts.into();
    let ix = cancel_buy_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn cancel_buy_invoke_signed(
    accounts: CancelBuyAccounts<'_, '_>,
    args: CancelBuyIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    cancel_buy_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn cancel_buy_verify_account_keys(
    accounts: CancelBuyAccounts<'_, '_>,
    keys: CancelBuyKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.wallet.key, keys.wallet),
        (*accounts.notary.key, keys.notary),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.authority.key, keys.authority),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.buyer_trade_state.key, keys.buyer_trade_state),
        (*accounts.buyer_referral.key, keys.buyer_referral),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn cancel_buy_verify_writable_privileges<'me, 'info>(
    accounts: CancelBuyAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.wallet,
        accounts.token_mint,
        accounts.buyer_trade_state,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn cancel_buy_verify_account_privileges<'me, 'info>(
    accounts: CancelBuyAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    cancel_buy_verify_writable_privileges(accounts)?;
    Ok(())
}
pub const OCP_SELL_IX_ACCOUNTS_LEN: usize = 18;
#[derive(Copy, Clone, Debug)]
pub struct OcpSellAccounts<'me, 'info> {
    pub wallet: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub program_as_signer: &'me AccountInfo<'info>,
    pub token_ata: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub metadata: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub seller_trade_state: &'me AccountInfo<'info>,
    pub seller_referral: &'me AccountInfo<'info>,
    pub ocp_mint_state: &'me AccountInfo<'info>,
    pub ocp_policy: &'me AccountInfo<'info>,
    pub ocp_freeze_authority: &'me AccountInfo<'info>,
    pub ocp_program: &'me AccountInfo<'info>,
    pub cmt_program: &'me AccountInfo<'info>,
    pub instructions: &'me AccountInfo<'info>,
    pub token_program: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
    pub rent: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct OcpSellKeys {
    pub wallet: Pubkey,
    pub notary: Pubkey,
    pub program_as_signer: Pubkey,
    pub token_ata: Pubkey,
    pub token_mint: Pubkey,
    pub metadata: Pubkey,
    pub auction_house: Pubkey,
    pub seller_trade_state: Pubkey,
    pub seller_referral: Pubkey,
    pub ocp_mint_state: Pubkey,
    pub ocp_policy: Pubkey,
    pub ocp_freeze_authority: Pubkey,
    pub ocp_program: Pubkey,
    pub cmt_program: Pubkey,
    pub instructions: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
    pub rent: Pubkey,
}
impl From<OcpSellAccounts<'_, '_>> for OcpSellKeys {
    fn from(accounts: OcpSellAccounts) -> Self {
        Self {
            wallet: *accounts.wallet.key,
            notary: *accounts.notary.key,
            program_as_signer: *accounts.program_as_signer.key,
            token_ata: *accounts.token_ata.key,
            token_mint: *accounts.token_mint.key,
            metadata: *accounts.metadata.key,
            auction_house: *accounts.auction_house.key,
            seller_trade_state: *accounts.seller_trade_state.key,
            seller_referral: *accounts.seller_referral.key,
            ocp_mint_state: *accounts.ocp_mint_state.key,
            ocp_policy: *accounts.ocp_policy.key,
            ocp_freeze_authority: *accounts.ocp_freeze_authority.key,
            ocp_program: *accounts.ocp_program.key,
            cmt_program: *accounts.cmt_program.key,
            instructions: *accounts.instructions.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
            rent: *accounts.rent.key,
        }
    }
}
impl From<OcpSellKeys> for [AccountMeta; OCP_SELL_IX_ACCOUNTS_LEN] {
    fn from(keys: OcpSellKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.wallet,
                is_signer: true,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.program_as_signer,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_ata,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.metadata,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.seller_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller_referral,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.ocp_mint_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.ocp_policy,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.ocp_freeze_authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.ocp_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.cmt_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.instructions,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.rent,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; OCP_SELL_IX_ACCOUNTS_LEN]> for OcpSellKeys {
    fn from(pubkeys: [Pubkey; OCP_SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: pubkeys[0],
            notary: pubkeys[1],
            program_as_signer: pubkeys[2],
            token_ata: pubkeys[3],
            token_mint: pubkeys[4],
            metadata: pubkeys[5],
            auction_house: pubkeys[6],
            seller_trade_state: pubkeys[7],
            seller_referral: pubkeys[8],
            ocp_mint_state: pubkeys[9],
            ocp_policy: pubkeys[10],
            ocp_freeze_authority: pubkeys[11],
            ocp_program: pubkeys[12],
            cmt_program: pubkeys[13],
            instructions: pubkeys[14],
            token_program: pubkeys[15],
            system_program: pubkeys[16],
            rent: pubkeys[17],
        }
    }
}
impl<'info> From<OcpSellAccounts<'_, 'info>> for [AccountInfo<'info>; OCP_SELL_IX_ACCOUNTS_LEN] {
    fn from(accounts: OcpSellAccounts<'_, 'info>) -> Self {
        [
            accounts.wallet.clone(),
            accounts.notary.clone(),
            accounts.program_as_signer.clone(),
            accounts.token_ata.clone(),
            accounts.token_mint.clone(),
            accounts.metadata.clone(),
            accounts.auction_house.clone(),
            accounts.seller_trade_state.clone(),
            accounts.seller_referral.clone(),
            accounts.ocp_mint_state.clone(),
            accounts.ocp_policy.clone(),
            accounts.ocp_freeze_authority.clone(),
            accounts.ocp_program.clone(),
            accounts.cmt_program.clone(),
            accounts.instructions.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
            accounts.rent.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; OCP_SELL_IX_ACCOUNTS_LEN]>
    for OcpSellAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; OCP_SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: &arr[0],
            notary: &arr[1],
            program_as_signer: &arr[2],
            token_ata: &arr[3],
            token_mint: &arr[4],
            metadata: &arr[5],
            auction_house: &arr[6],
            seller_trade_state: &arr[7],
            seller_referral: &arr[8],
            ocp_mint_state: &arr[9],
            ocp_policy: &arr[10],
            ocp_freeze_authority: &arr[11],
            ocp_program: &arr[12],
            cmt_program: &arr[13],
            instructions: &arr[14],
            token_program: &arr[15],
            system_program: &arr[16],
            rent: &arr[17],
        }
    }
}
pub const OCP_SELL_IX_DISCM: [u8; 8] = [22, 41, 217, 220, 21, 104, 61, 99];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct OcpSellIxArgs {
    pub args: OCPSellArgs,
}
#[derive(Clone, Debug, PartialEq)]
pub struct OcpSellIxData(pub OcpSellIxArgs);
impl From<OcpSellIxArgs> for OcpSellIxData {
    fn from(args: OcpSellIxArgs) -> Self {
        Self(args)
    }
}
impl OcpSellIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != OCP_SELL_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    OCP_SELL_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(OcpSellIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&OCP_SELL_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn ocp_sell_ix_with_program_id(
    program_id: Pubkey,
    keys: OcpSellKeys,
    args: OcpSellIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; OCP_SELL_IX_ACCOUNTS_LEN] = keys.into();
    let data: OcpSellIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn ocp_sell_ix(keys: OcpSellKeys, args: OcpSellIxArgs) -> std::io::Result<Instruction> {
    ocp_sell_ix_with_program_id(crate::ID, keys, args)
}
pub fn ocp_sell_invoke_with_program_id(
    program_id: Pubkey,
    accounts: OcpSellAccounts<'_, '_>,
    args: OcpSellIxArgs,
) -> ProgramResult {
    let keys: OcpSellKeys = accounts.into();
    let ix = ocp_sell_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn ocp_sell_invoke(accounts: OcpSellAccounts<'_, '_>, args: OcpSellIxArgs) -> ProgramResult {
    ocp_sell_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn ocp_sell_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: OcpSellAccounts<'_, '_>,
    args: OcpSellIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: OcpSellKeys = accounts.into();
    let ix = ocp_sell_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn ocp_sell_invoke_signed(
    accounts: OcpSellAccounts<'_, '_>,
    args: OcpSellIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    ocp_sell_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn ocp_sell_verify_account_keys(
    accounts: OcpSellAccounts<'_, '_>,
    keys: OcpSellKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.wallet.key, keys.wallet),
        (*accounts.notary.key, keys.notary),
        (*accounts.program_as_signer.key, keys.program_as_signer),
        (*accounts.token_ata.key, keys.token_ata),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.metadata.key, keys.metadata),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.seller_trade_state.key, keys.seller_trade_state),
        (*accounts.seller_referral.key, keys.seller_referral),
        (*accounts.ocp_mint_state.key, keys.ocp_mint_state),
        (*accounts.ocp_policy.key, keys.ocp_policy),
        (
            *accounts.ocp_freeze_authority.key,
            keys.ocp_freeze_authority,
        ),
        (*accounts.ocp_program.key, keys.ocp_program),
        (*accounts.cmt_program.key, keys.cmt_program),
        (*accounts.instructions.key, keys.instructions),
        (*accounts.token_program.key, keys.token_program),
        (*accounts.system_program.key, keys.system_program),
        (*accounts.rent.key, keys.rent),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn ocp_sell_verify_writable_privileges<'me, 'info>(
    accounts: OcpSellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.wallet,
        accounts.token_ata,
        accounts.seller_trade_state,
        accounts.ocp_mint_state,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn ocp_sell_verify_signer_privileges<'me, 'info>(
    accounts: OcpSellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.wallet] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn ocp_sell_verify_account_privileges<'me, 'info>(
    accounts: OcpSellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    ocp_sell_verify_writable_privileges(accounts)?;
    ocp_sell_verify_signer_privileges(accounts)?;
    Ok(())
}
pub const OCP_CANCEL_SELL_IX_ACCOUNTS_LEN: usize = 17;
#[derive(Copy, Clone, Debug)]
pub struct OcpCancelSellAccounts<'me, 'info> {
    pub wallet: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub program_as_signer: &'me AccountInfo<'info>,
    pub token_ata: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub metadata: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub seller_trade_state: &'me AccountInfo<'info>,
    pub ocp_mint_state: &'me AccountInfo<'info>,
    pub ocp_policy: &'me AccountInfo<'info>,
    pub ocp_freeze_authority: &'me AccountInfo<'info>,
    pub ocp_program: &'me AccountInfo<'info>,
    pub cmt_program: &'me AccountInfo<'info>,
    pub instructions: &'me AccountInfo<'info>,
    pub token_program: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
    pub rent: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct OcpCancelSellKeys {
    pub wallet: Pubkey,
    pub notary: Pubkey,
    pub program_as_signer: Pubkey,
    pub token_ata: Pubkey,
    pub token_mint: Pubkey,
    pub metadata: Pubkey,
    pub auction_house: Pubkey,
    pub seller_trade_state: Pubkey,
    pub ocp_mint_state: Pubkey,
    pub ocp_policy: Pubkey,
    pub ocp_freeze_authority: Pubkey,
    pub ocp_program: Pubkey,
    pub cmt_program: Pubkey,
    pub instructions: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
    pub rent: Pubkey,
}
impl From<OcpCancelSellAccounts<'_, '_>> for OcpCancelSellKeys {
    fn from(accounts: OcpCancelSellAccounts) -> Self {
        Self {
            wallet: *accounts.wallet.key,
            notary: *accounts.notary.key,
            program_as_signer: *accounts.program_as_signer.key,
            token_ata: *accounts.token_ata.key,
            token_mint: *accounts.token_mint.key,
            metadata: *accounts.metadata.key,
            auction_house: *accounts.auction_house.key,
            seller_trade_state: *accounts.seller_trade_state.key,
            ocp_mint_state: *accounts.ocp_mint_state.key,
            ocp_policy: *accounts.ocp_policy.key,
            ocp_freeze_authority: *accounts.ocp_freeze_authority.key,
            ocp_program: *accounts.ocp_program.key,
            cmt_program: *accounts.cmt_program.key,
            instructions: *accounts.instructions.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
            rent: *accounts.rent.key,
        }
    }
}
impl From<OcpCancelSellKeys> for [AccountMeta; OCP_CANCEL_SELL_IX_ACCOUNTS_LEN] {
    fn from(keys: OcpCancelSellKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.wallet,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: true,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.program_as_signer,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_ata,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.metadata,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.seller_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.ocp_mint_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.ocp_policy,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.ocp_freeze_authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.ocp_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.cmt_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.instructions,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.rent,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; OCP_CANCEL_SELL_IX_ACCOUNTS_LEN]> for OcpCancelSellKeys {
    fn from(pubkeys: [Pubkey; OCP_CANCEL_SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: pubkeys[0],
            notary: pubkeys[1],
            program_as_signer: pubkeys[2],
            token_ata: pubkeys[3],
            token_mint: pubkeys[4],
            metadata: pubkeys[5],
            auction_house: pubkeys[6],
            seller_trade_state: pubkeys[7],
            ocp_mint_state: pubkeys[8],
            ocp_policy: pubkeys[9],
            ocp_freeze_authority: pubkeys[10],
            ocp_program: pubkeys[11],
            cmt_program: pubkeys[12],
            instructions: pubkeys[13],
            token_program: pubkeys[14],
            system_program: pubkeys[15],
            rent: pubkeys[16],
        }
    }
}
impl<'info> From<OcpCancelSellAccounts<'_, 'info>>
    for [AccountInfo<'info>; OCP_CANCEL_SELL_IX_ACCOUNTS_LEN]
{
    fn from(accounts: OcpCancelSellAccounts<'_, 'info>) -> Self {
        [
            accounts.wallet.clone(),
            accounts.notary.clone(),
            accounts.program_as_signer.clone(),
            accounts.token_ata.clone(),
            accounts.token_mint.clone(),
            accounts.metadata.clone(),
            accounts.auction_house.clone(),
            accounts.seller_trade_state.clone(),
            accounts.ocp_mint_state.clone(),
            accounts.ocp_policy.clone(),
            accounts.ocp_freeze_authority.clone(),
            accounts.ocp_program.clone(),
            accounts.cmt_program.clone(),
            accounts.instructions.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
            accounts.rent.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; OCP_CANCEL_SELL_IX_ACCOUNTS_LEN]>
    for OcpCancelSellAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; OCP_CANCEL_SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: &arr[0],
            notary: &arr[1],
            program_as_signer: &arr[2],
            token_ata: &arr[3],
            token_mint: &arr[4],
            metadata: &arr[5],
            auction_house: &arr[6],
            seller_trade_state: &arr[7],
            ocp_mint_state: &arr[8],
            ocp_policy: &arr[9],
            ocp_freeze_authority: &arr[10],
            ocp_program: &arr[11],
            cmt_program: &arr[12],
            instructions: &arr[13],
            token_program: &arr[14],
            system_program: &arr[15],
            rent: &arr[16],
        }
    }
}
pub const OCP_CANCEL_SELL_IX_DISCM: [u8; 8] = [73, 4, 55, 246, 37, 155, 2, 166];
#[derive(Clone, Debug, PartialEq)]
pub struct OcpCancelSellIxData;
impl OcpCancelSellIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != OCP_CANCEL_SELL_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    OCP_CANCEL_SELL_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self)
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&OCP_CANCEL_SELL_IX_DISCM)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn ocp_cancel_sell_ix_with_program_id(
    program_id: Pubkey,
    keys: OcpCancelSellKeys,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; OCP_CANCEL_SELL_IX_ACCOUNTS_LEN] = keys.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: OcpCancelSellIxData.try_to_vec()?,
    })
}
pub fn ocp_cancel_sell_ix(keys: OcpCancelSellKeys) -> std::io::Result<Instruction> {
    ocp_cancel_sell_ix_with_program_id(crate::ID, keys)
}
pub fn ocp_cancel_sell_invoke_with_program_id(
    program_id: Pubkey,
    accounts: OcpCancelSellAccounts<'_, '_>,
) -> ProgramResult {
    let keys: OcpCancelSellKeys = accounts.into();
    let ix = ocp_cancel_sell_ix_with_program_id(program_id, keys)?;
    invoke_instruction(&ix, accounts)
}
pub fn ocp_cancel_sell_invoke(accounts: OcpCancelSellAccounts<'_, '_>) -> ProgramResult {
    ocp_cancel_sell_invoke_with_program_id(crate::ID, accounts)
}
pub fn ocp_cancel_sell_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: OcpCancelSellAccounts<'_, '_>,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: OcpCancelSellKeys = accounts.into();
    let ix = ocp_cancel_sell_ix_with_program_id(program_id, keys)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn ocp_cancel_sell_invoke_signed(
    accounts: OcpCancelSellAccounts<'_, '_>,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    ocp_cancel_sell_invoke_signed_with_program_id(crate::ID, accounts, seeds)
}
pub fn ocp_cancel_sell_verify_account_keys(
    accounts: OcpCancelSellAccounts<'_, '_>,
    keys: OcpCancelSellKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.wallet.key, keys.wallet),
        (*accounts.notary.key, keys.notary),
        (*accounts.program_as_signer.key, keys.program_as_signer),
        (*accounts.token_ata.key, keys.token_ata),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.metadata.key, keys.metadata),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.seller_trade_state.key, keys.seller_trade_state),
        (*accounts.ocp_mint_state.key, keys.ocp_mint_state),
        (*accounts.ocp_policy.key, keys.ocp_policy),
        (
            *accounts.ocp_freeze_authority.key,
            keys.ocp_freeze_authority,
        ),
        (*accounts.ocp_program.key, keys.ocp_program),
        (*accounts.cmt_program.key, keys.cmt_program),
        (*accounts.instructions.key, keys.instructions),
        (*accounts.token_program.key, keys.token_program),
        (*accounts.system_program.key, keys.system_program),
        (*accounts.rent.key, keys.rent),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn ocp_cancel_sell_verify_writable_privileges<'me, 'info>(
    accounts: OcpCancelSellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.wallet,
        accounts.token_ata,
        accounts.seller_trade_state,
        accounts.ocp_mint_state,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn ocp_cancel_sell_verify_signer_privileges<'me, 'info>(
    accounts: OcpCancelSellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.notary] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn ocp_cancel_sell_verify_account_privileges<'me, 'info>(
    accounts: OcpCancelSellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    ocp_cancel_sell_verify_writable_privileges(accounts)?;
    ocp_cancel_sell_verify_signer_privileges(accounts)?;
    Ok(())
}
pub const OCP_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN: usize = 26;
#[derive(Copy, Clone, Debug)]
pub struct OcpExecuteSaleV2Accounts<'me, 'info> {
    pub payer: &'me AccountInfo<'info>,
    pub buyer: &'me AccountInfo<'info>,
    pub seller: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub program_as_signer: &'me AccountInfo<'info>,
    pub seller_token_ata: &'me AccountInfo<'info>,
    pub buyer_token_ata: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub metadata: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub auction_house_treasury: &'me AccountInfo<'info>,
    pub seller_trade_state: &'me AccountInfo<'info>,
    pub buyer_trade_state: &'me AccountInfo<'info>,
    pub buyer_escrow_payment_account: &'me AccountInfo<'info>,
    pub buyer_referral: &'me AccountInfo<'info>,
    pub seller_referral: &'me AccountInfo<'info>,
    pub ocp_mint_state: &'me AccountInfo<'info>,
    pub ocp_policy: &'me AccountInfo<'info>,
    pub ocp_freeze_authority: &'me AccountInfo<'info>,
    pub ocp_program: &'me AccountInfo<'info>,
    pub cmt_program: &'me AccountInfo<'info>,
    pub instructions: &'me AccountInfo<'info>,
    pub associated_token_program: &'me AccountInfo<'info>,
    pub token_program: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
    pub rent: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct OcpExecuteSaleV2Keys {
    pub payer: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub notary: Pubkey,
    pub program_as_signer: Pubkey,
    pub seller_token_ata: Pubkey,
    pub buyer_token_ata: Pubkey,
    pub token_mint: Pubkey,
    pub metadata: Pubkey,
    pub auction_house: Pubkey,
    pub auction_house_treasury: Pubkey,
    pub seller_trade_state: Pubkey,
    pub buyer_trade_state: Pubkey,
    pub buyer_escrow_payment_account: Pubkey,
    pub buyer_referral: Pubkey,
    pub seller_referral: Pubkey,
    pub ocp_mint_state: Pubkey,
    pub ocp_policy: Pubkey,
    pub ocp_freeze_authority: Pubkey,
    pub ocp_program: Pubkey,
    pub cmt_program: Pubkey,
    pub instructions: Pubkey,
    pub associated_token_program: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
    pub rent: Pubkey,
}
impl From<OcpExecuteSaleV2Accounts<'_, '_>> for OcpExecuteSaleV2Keys {
    fn from(accounts: OcpExecuteSaleV2Accounts) -> Self {
        Self {
            payer: *accounts.payer.key,
            buyer: *accounts.buyer.key,
            seller: *accounts.seller.key,
            notary: *accounts.notary.key,
            program_as_signer: *accounts.program_as_signer.key,
            seller_token_ata: *accounts.seller_token_ata.key,
            buyer_token_ata: *accounts.buyer_token_ata.key,
            token_mint: *accounts.token_mint.key,
            metadata: *accounts.metadata.key,
            auction_house: *accounts.auction_house.key,
            auction_house_treasury: *accounts.auction_house_treasury.key,
            seller_trade_state: *accounts.seller_trade_state.key,
            buyer_trade_state: *accounts.buyer_trade_state.key,
            buyer_escrow_payment_account: *accounts.buyer_escrow_payment_account.key,
            buyer_referral: *accounts.buyer_referral.key,
            seller_referral: *accounts.seller_referral.key,
            ocp_mint_state: *accounts.ocp_mint_state.key,
            ocp_policy: *accounts.ocp_policy.key,
            ocp_freeze_authority: *accounts.ocp_freeze_authority.key,
            ocp_program: *accounts.ocp_program.key,
            cmt_program: *accounts.cmt_program.key,
            instructions: *accounts.instructions.key,
            associated_token_program: *accounts.associated_token_program.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
            rent: *accounts.rent.key,
        }
    }
}
impl From<OcpExecuteSaleV2Keys> for [AccountMeta; OCP_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN] {
    fn from(keys: OcpExecuteSaleV2Keys) -> Self {
        [
            AccountMeta {
                pubkey: keys.payer,
                is_signer: true,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.program_as_signer,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.seller_token_ata,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_token_ata,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.metadata,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house_treasury,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_escrow_payment_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_referral,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller_referral,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.ocp_mint_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.ocp_policy,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.ocp_freeze_authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.ocp_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.cmt_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.instructions,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.associated_token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.rent,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; OCP_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]> for OcpExecuteSaleV2Keys {
    fn from(pubkeys: [Pubkey; OCP_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            payer: pubkeys[0],
            buyer: pubkeys[1],
            seller: pubkeys[2],
            notary: pubkeys[3],
            program_as_signer: pubkeys[4],
            seller_token_ata: pubkeys[5],
            buyer_token_ata: pubkeys[6],
            token_mint: pubkeys[7],
            metadata: pubkeys[8],
            auction_house: pubkeys[9],
            auction_house_treasury: pubkeys[10],
            seller_trade_state: pubkeys[11],
            buyer_trade_state: pubkeys[12],
            buyer_escrow_payment_account: pubkeys[13],
            buyer_referral: pubkeys[14],
            seller_referral: pubkeys[15],
            ocp_mint_state: pubkeys[16],
            ocp_policy: pubkeys[17],
            ocp_freeze_authority: pubkeys[18],
            ocp_program: pubkeys[19],
            cmt_program: pubkeys[20],
            instructions: pubkeys[21],
            associated_token_program: pubkeys[22],
            token_program: pubkeys[23],
            system_program: pubkeys[24],
            rent: pubkeys[25],
        }
    }
}
impl<'info> From<OcpExecuteSaleV2Accounts<'_, 'info>>
    for [AccountInfo<'info>; OCP_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]
{
    fn from(accounts: OcpExecuteSaleV2Accounts<'_, 'info>) -> Self {
        [
            accounts.payer.clone(),
            accounts.buyer.clone(),
            accounts.seller.clone(),
            accounts.notary.clone(),
            accounts.program_as_signer.clone(),
            accounts.seller_token_ata.clone(),
            accounts.buyer_token_ata.clone(),
            accounts.token_mint.clone(),
            accounts.metadata.clone(),
            accounts.auction_house.clone(),
            accounts.auction_house_treasury.clone(),
            accounts.seller_trade_state.clone(),
            accounts.buyer_trade_state.clone(),
            accounts.buyer_escrow_payment_account.clone(),
            accounts.buyer_referral.clone(),
            accounts.seller_referral.clone(),
            accounts.ocp_mint_state.clone(),
            accounts.ocp_policy.clone(),
            accounts.ocp_freeze_authority.clone(),
            accounts.ocp_program.clone(),
            accounts.cmt_program.clone(),
            accounts.instructions.clone(),
            accounts.associated_token_program.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
            accounts.rent.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; OCP_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]>
    for OcpExecuteSaleV2Accounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; OCP_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            payer: &arr[0],
            buyer: &arr[1],
            seller: &arr[2],
            notary: &arr[3],
            program_as_signer: &arr[4],
            seller_token_ata: &arr[5],
            buyer_token_ata: &arr[6],
            token_mint: &arr[7],
            metadata: &arr[8],
            auction_house: &arr[9],
            auction_house_treasury: &arr[10],
            seller_trade_state: &arr[11],
            buyer_trade_state: &arr[12],
            buyer_escrow_payment_account: &arr[13],
            buyer_referral: &arr[14],
            seller_referral: &arr[15],
            ocp_mint_state: &arr[16],
            ocp_policy: &arr[17],
            ocp_freeze_authority: &arr[18],
            ocp_program: &arr[19],
            cmt_program: &arr[20],
            instructions: &arr[21],
            associated_token_program: &arr[22],
            token_program: &arr[23],
            system_program: &arr[24],
            rent: &arr[25],
        }
    }
}
pub const OCP_EXECUTE_SALE_V2_IX_DISCM: [u8; 8] = [200, 83, 31, 82, 156, 156, 20, 97];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct OcpExecuteSaleV2IxArgs {
    pub args: OCPExecuteSaleV2Args,
}
#[derive(Clone, Debug, PartialEq)]
pub struct OcpExecuteSaleV2IxData(pub OcpExecuteSaleV2IxArgs);
impl From<OcpExecuteSaleV2IxArgs> for OcpExecuteSaleV2IxData {
    fn from(args: OcpExecuteSaleV2IxArgs) -> Self {
        Self(args)
    }
}
impl OcpExecuteSaleV2IxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != OCP_EXECUTE_SALE_V2_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    OCP_EXECUTE_SALE_V2_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(OcpExecuteSaleV2IxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&OCP_EXECUTE_SALE_V2_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn ocp_execute_sale_v2_ix_with_program_id(
    program_id: Pubkey,
    keys: OcpExecuteSaleV2Keys,
    args: OcpExecuteSaleV2IxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; OCP_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN] = keys.into();
    let data: OcpExecuteSaleV2IxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn ocp_execute_sale_v2_ix(
    keys: OcpExecuteSaleV2Keys,
    args: OcpExecuteSaleV2IxArgs,
) -> std::io::Result<Instruction> {
    ocp_execute_sale_v2_ix_with_program_id(crate::ID, keys, args)
}
pub fn ocp_execute_sale_v2_invoke_with_program_id(
    program_id: Pubkey,
    accounts: OcpExecuteSaleV2Accounts<'_, '_>,
    args: OcpExecuteSaleV2IxArgs,
) -> ProgramResult {
    let keys: OcpExecuteSaleV2Keys = accounts.into();
    let ix = ocp_execute_sale_v2_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn ocp_execute_sale_v2_invoke(
    accounts: OcpExecuteSaleV2Accounts<'_, '_>,
    args: OcpExecuteSaleV2IxArgs,
) -> ProgramResult {
    ocp_execute_sale_v2_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn ocp_execute_sale_v2_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: OcpExecuteSaleV2Accounts<'_, '_>,
    args: OcpExecuteSaleV2IxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: OcpExecuteSaleV2Keys = accounts.into();
    let ix = ocp_execute_sale_v2_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn ocp_execute_sale_v2_invoke_signed(
    accounts: OcpExecuteSaleV2Accounts<'_, '_>,
    args: OcpExecuteSaleV2IxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    ocp_execute_sale_v2_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn ocp_execute_sale_v2_verify_account_keys(
    accounts: OcpExecuteSaleV2Accounts<'_, '_>,
    keys: OcpExecuteSaleV2Keys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.payer.key, keys.payer),
        (*accounts.buyer.key, keys.buyer),
        (*accounts.seller.key, keys.seller),
        (*accounts.notary.key, keys.notary),
        (*accounts.program_as_signer.key, keys.program_as_signer),
        (*accounts.seller_token_ata.key, keys.seller_token_ata),
        (*accounts.buyer_token_ata.key, keys.buyer_token_ata),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.metadata.key, keys.metadata),
        (*accounts.auction_house.key, keys.auction_house),
        (
            *accounts.auction_house_treasury.key,
            keys.auction_house_treasury,
        ),
        (*accounts.seller_trade_state.key, keys.seller_trade_state),
        (*accounts.buyer_trade_state.key, keys.buyer_trade_state),
        (
            *accounts.buyer_escrow_payment_account.key,
            keys.buyer_escrow_payment_account,
        ),
        (*accounts.buyer_referral.key, keys.buyer_referral),
        (*accounts.seller_referral.key, keys.seller_referral),
        (*accounts.ocp_mint_state.key, keys.ocp_mint_state),
        (*accounts.ocp_policy.key, keys.ocp_policy),
        (
            *accounts.ocp_freeze_authority.key,
            keys.ocp_freeze_authority,
        ),
        (*accounts.ocp_program.key, keys.ocp_program),
        (*accounts.cmt_program.key, keys.cmt_program),
        (*accounts.instructions.key, keys.instructions),
        (
            *accounts.associated_token_program.key,
            keys.associated_token_program,
        ),
        (*accounts.token_program.key, keys.token_program),
        (*accounts.system_program.key, keys.system_program),
        (*accounts.rent.key, keys.rent),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn ocp_execute_sale_v2_verify_writable_privileges<'me, 'info>(
    accounts: OcpExecuteSaleV2Accounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.payer,
        accounts.buyer,
        accounts.seller,
        accounts.seller_token_ata,
        accounts.buyer_token_ata,
        accounts.auction_house_treasury,
        accounts.seller_trade_state,
        accounts.buyer_trade_state,
        accounts.buyer_escrow_payment_account,
        accounts.buyer_referral,
        accounts.seller_referral,
        accounts.ocp_mint_state,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn ocp_execute_sale_v2_verify_signer_privileges<'me, 'info>(
    accounts: OcpExecuteSaleV2Accounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.payer] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn ocp_execute_sale_v2_verify_account_privileges<'me, 'info>(
    accounts: OcpExecuteSaleV2Accounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    ocp_execute_sale_v2_verify_writable_privileges(accounts)?;
    ocp_execute_sale_v2_verify_signer_privileges(accounts)?;
    Ok(())
}
pub const EXECUTE_SALE_V2_IX_ACCOUNTS_LEN: usize = 20;
#[derive(Copy, Clone, Debug)]
pub struct ExecuteSaleV2Accounts<'me, 'info> {
    pub buyer: &'me AccountInfo<'info>,
    pub seller: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub token_account: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub metadata: &'me AccountInfo<'info>,
    pub escrow_payment_account: &'me AccountInfo<'info>,
    pub buyer_receipt_token_account: &'me AccountInfo<'info>,
    pub authority: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub auction_house_treasury: &'me AccountInfo<'info>,
    pub buyer_trade_state: &'me AccountInfo<'info>,
    pub buyer_referral: &'me AccountInfo<'info>,
    pub seller_trade_state: &'me AccountInfo<'info>,
    pub seller_referral: &'me AccountInfo<'info>,
    pub token_program: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
    pub ata_program: &'me AccountInfo<'info>,
    pub program_as_signer: &'me AccountInfo<'info>,
    pub rent: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct ExecuteSaleV2Keys {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub notary: Pubkey,
    pub token_account: Pubkey,
    pub token_mint: Pubkey,
    pub metadata: Pubkey,
    pub escrow_payment_account: Pubkey,
    pub buyer_receipt_token_account: Pubkey,
    pub authority: Pubkey,
    pub auction_house: Pubkey,
    pub auction_house_treasury: Pubkey,
    pub buyer_trade_state: Pubkey,
    pub buyer_referral: Pubkey,
    pub seller_trade_state: Pubkey,
    pub seller_referral: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
    pub ata_program: Pubkey,
    pub program_as_signer: Pubkey,
    pub rent: Pubkey,
}
impl From<ExecuteSaleV2Accounts<'_, '_>> for ExecuteSaleV2Keys {
    fn from(accounts: ExecuteSaleV2Accounts) -> Self {
        Self {
            buyer: *accounts.buyer.key,
            seller: *accounts.seller.key,
            notary: *accounts.notary.key,
            token_account: *accounts.token_account.key,
            token_mint: *accounts.token_mint.key,
            metadata: *accounts.metadata.key,
            escrow_payment_account: *accounts.escrow_payment_account.key,
            buyer_receipt_token_account: *accounts.buyer_receipt_token_account.key,
            authority: *accounts.authority.key,
            auction_house: *accounts.auction_house.key,
            auction_house_treasury: *accounts.auction_house_treasury.key,
            buyer_trade_state: *accounts.buyer_trade_state.key,
            buyer_referral: *accounts.buyer_referral.key,
            seller_trade_state: *accounts.seller_trade_state.key,
            seller_referral: *accounts.seller_referral.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
            ata_program: *accounts.ata_program.key,
            program_as_signer: *accounts.program_as_signer.key,
            rent: *accounts.rent.key,
        }
    }
}
impl From<ExecuteSaleV2Keys> for [AccountMeta; EXECUTE_SALE_V2_IX_ACCOUNTS_LEN] {
    fn from(keys: ExecuteSaleV2Keys) -> Self {
        [
            AccountMeta {
                pubkey: keys.buyer,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.metadata,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.escrow_payment_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_receipt_token_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.authority,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house_treasury,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_referral,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller_referral,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.ata_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.program_as_signer,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.rent,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]> for ExecuteSaleV2Keys {
    fn from(pubkeys: [Pubkey; EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            buyer: pubkeys[0],
            seller: pubkeys[1],
            notary: pubkeys[2],
            token_account: pubkeys[3],
            token_mint: pubkeys[4],
            metadata: pubkeys[5],
            escrow_payment_account: pubkeys[6],
            buyer_receipt_token_account: pubkeys[7],
            authority: pubkeys[8],
            auction_house: pubkeys[9],
            auction_house_treasury: pubkeys[10],
            buyer_trade_state: pubkeys[11],
            buyer_referral: pubkeys[12],
            seller_trade_state: pubkeys[13],
            seller_referral: pubkeys[14],
            token_program: pubkeys[15],
            system_program: pubkeys[16],
            ata_program: pubkeys[17],
            program_as_signer: pubkeys[18],
            rent: pubkeys[19],
        }
    }
}
impl<'info> From<ExecuteSaleV2Accounts<'_, 'info>>
    for [AccountInfo<'info>; EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]
{
    fn from(accounts: ExecuteSaleV2Accounts<'_, 'info>) -> Self {
        [
            accounts.buyer.clone(),
            accounts.seller.clone(),
            accounts.notary.clone(),
            accounts.token_account.clone(),
            accounts.token_mint.clone(),
            accounts.metadata.clone(),
            accounts.escrow_payment_account.clone(),
            accounts.buyer_receipt_token_account.clone(),
            accounts.authority.clone(),
            accounts.auction_house.clone(),
            accounts.auction_house_treasury.clone(),
            accounts.buyer_trade_state.clone(),
            accounts.buyer_referral.clone(),
            accounts.seller_trade_state.clone(),
            accounts.seller_referral.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
            accounts.ata_program.clone(),
            accounts.program_as_signer.clone(),
            accounts.rent.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]>
    for ExecuteSaleV2Accounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            buyer: &arr[0],
            seller: &arr[1],
            notary: &arr[2],
            token_account: &arr[3],
            token_mint: &arr[4],
            metadata: &arr[5],
            escrow_payment_account: &arr[6],
            buyer_receipt_token_account: &arr[7],
            authority: &arr[8],
            auction_house: &arr[9],
            auction_house_treasury: &arr[10],
            buyer_trade_state: &arr[11],
            buyer_referral: &arr[12],
            seller_trade_state: &arr[13],
            seller_referral: &arr[14],
            token_program: &arr[15],
            system_program: &arr[16],
            ata_program: &arr[17],
            program_as_signer: &arr[18],
            rent: &arr[19],
        }
    }
}
pub const EXECUTE_SALE_V2_IX_DISCM: [u8; 8] = [91, 220, 49, 223, 204, 129, 53, 193];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ExecuteSaleV2IxArgs {
    pub escrow_payment_bump: u8,
    pub program_as_signer_bump: u8,
    pub buyer_price: u64,
    pub token_size: u64,
    pub buyer_state_expiry: i64,
    pub seller_state_expiry: i64,
    pub maker_fee_bp: i16,
    pub taker_fee_bp: u16,
}
#[derive(Clone, Debug, PartialEq)]
pub struct ExecuteSaleV2IxData(pub ExecuteSaleV2IxArgs);
impl From<ExecuteSaleV2IxArgs> for ExecuteSaleV2IxData {
    fn from(args: ExecuteSaleV2IxArgs) -> Self {
        Self(args)
    }
}
impl ExecuteSaleV2IxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != EXECUTE_SALE_V2_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    EXECUTE_SALE_V2_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(ExecuteSaleV2IxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&EXECUTE_SALE_V2_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn execute_sale_v2_ix_with_program_id(
    program_id: Pubkey,
    keys: ExecuteSaleV2Keys,
    args: ExecuteSaleV2IxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; EXECUTE_SALE_V2_IX_ACCOUNTS_LEN] = keys.into();
    let data: ExecuteSaleV2IxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn execute_sale_v2_ix(
    keys: ExecuteSaleV2Keys,
    args: ExecuteSaleV2IxArgs,
) -> std::io::Result<Instruction> {
    execute_sale_v2_ix_with_program_id(crate::ID, keys, args)
}
pub fn execute_sale_v2_invoke_with_program_id(
    program_id: Pubkey,
    accounts: ExecuteSaleV2Accounts<'_, '_>,
    args: ExecuteSaleV2IxArgs,
) -> ProgramResult {
    let keys: ExecuteSaleV2Keys = accounts.into();
    let ix = execute_sale_v2_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn execute_sale_v2_invoke(
    accounts: ExecuteSaleV2Accounts<'_, '_>,
    args: ExecuteSaleV2IxArgs,
) -> ProgramResult {
    execute_sale_v2_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn execute_sale_v2_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: ExecuteSaleV2Accounts<'_, '_>,
    args: ExecuteSaleV2IxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: ExecuteSaleV2Keys = accounts.into();
    let ix = execute_sale_v2_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn execute_sale_v2_invoke_signed(
    accounts: ExecuteSaleV2Accounts<'_, '_>,
    args: ExecuteSaleV2IxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    execute_sale_v2_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn execute_sale_v2_verify_account_keys(
    accounts: ExecuteSaleV2Accounts<'_, '_>,
    keys: ExecuteSaleV2Keys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.buyer.key, keys.buyer),
        (*accounts.seller.key, keys.seller),
        (*accounts.notary.key, keys.notary),
        (*accounts.token_account.key, keys.token_account),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.metadata.key, keys.metadata),
        (
            *accounts.escrow_payment_account.key,
            keys.escrow_payment_account,
        ),
        (
            *accounts.buyer_receipt_token_account.key,
            keys.buyer_receipt_token_account,
        ),
        (*accounts.authority.key, keys.authority),
        (*accounts.auction_house.key, keys.auction_house),
        (
            *accounts.auction_house_treasury.key,
            keys.auction_house_treasury,
        ),
        (*accounts.buyer_trade_state.key, keys.buyer_trade_state),
        (*accounts.buyer_referral.key, keys.buyer_referral),
        (*accounts.seller_trade_state.key, keys.seller_trade_state),
        (*accounts.seller_referral.key, keys.seller_referral),
        (*accounts.token_program.key, keys.token_program),
        (*accounts.system_program.key, keys.system_program),
        (*accounts.ata_program.key, keys.ata_program),
        (*accounts.program_as_signer.key, keys.program_as_signer),
        (*accounts.rent.key, keys.rent),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn execute_sale_v2_verify_writable_privileges<'me, 'info>(
    accounts: ExecuteSaleV2Accounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.buyer,
        accounts.seller,
        accounts.token_account,
        accounts.escrow_payment_account,
        accounts.buyer_receipt_token_account,
        accounts.auction_house_treasury,
        accounts.buyer_trade_state,
        accounts.buyer_referral,
        accounts.seller_trade_state,
        accounts.seller_referral,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn execute_sale_v2_verify_account_privileges<'me, 'info>(
    accounts: ExecuteSaleV2Accounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    execute_sale_v2_verify_writable_privileges(accounts)?;
    Ok(())
}
pub const MIP1_SELL_IX_ACCOUNTS_LEN: usize = 22;
#[derive(Copy, Clone, Debug)]
pub struct Mip1SellAccounts<'me, 'info> {
    pub wallet: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub program_as_signer: &'me AccountInfo<'info>,
    pub token_account: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub metadata: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub seller_trade_state: &'me AccountInfo<'info>,
    pub migration_seller_trade_state: &'me AccountInfo<'info>,
    pub seller_referral: &'me AccountInfo<'info>,
    pub token_ata: &'me AccountInfo<'info>,
    pub token_metadata_program: &'me AccountInfo<'info>,
    pub edition: &'me AccountInfo<'info>,
    pub authorization_rules_program: &'me AccountInfo<'info>,
    pub authorization_rules: &'me AccountInfo<'info>,
    pub instructions: &'me AccountInfo<'info>,
    pub owner_token_record: &'me AccountInfo<'info>,
    pub destination_token_record: &'me AccountInfo<'info>,
    pub associated_token_program: &'me AccountInfo<'info>,
    pub token_program: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
    pub rent: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct Mip1SellKeys {
    pub wallet: Pubkey,
    pub notary: Pubkey,
    pub program_as_signer: Pubkey,
    pub token_account: Pubkey,
    pub token_mint: Pubkey,
    pub metadata: Pubkey,
    pub auction_house: Pubkey,
    pub seller_trade_state: Pubkey,
    pub migration_seller_trade_state: Pubkey,
    pub seller_referral: Pubkey,
    pub token_ata: Pubkey,
    pub token_metadata_program: Pubkey,
    pub edition: Pubkey,
    pub authorization_rules_program: Pubkey,
    pub authorization_rules: Pubkey,
    pub instructions: Pubkey,
    pub owner_token_record: Pubkey,
    pub destination_token_record: Pubkey,
    pub associated_token_program: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
    pub rent: Pubkey,
}
impl From<Mip1SellAccounts<'_, '_>> for Mip1SellKeys {
    fn from(accounts: Mip1SellAccounts) -> Self {
        Self {
            wallet: *accounts.wallet.key,
            notary: *accounts.notary.key,
            program_as_signer: *accounts.program_as_signer.key,
            token_account: *accounts.token_account.key,
            token_mint: *accounts.token_mint.key,
            metadata: *accounts.metadata.key,
            auction_house: *accounts.auction_house.key,
            seller_trade_state: *accounts.seller_trade_state.key,
            migration_seller_trade_state: *accounts.migration_seller_trade_state.key,
            seller_referral: *accounts.seller_referral.key,
            token_ata: *accounts.token_ata.key,
            token_metadata_program: *accounts.token_metadata_program.key,
            edition: *accounts.edition.key,
            authorization_rules_program: *accounts.authorization_rules_program.key,
            authorization_rules: *accounts.authorization_rules.key,
            instructions: *accounts.instructions.key,
            owner_token_record: *accounts.owner_token_record.key,
            destination_token_record: *accounts.destination_token_record.key,
            associated_token_program: *accounts.associated_token_program.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
            rent: *accounts.rent.key,
        }
    }
}
impl From<Mip1SellKeys> for [AccountMeta; MIP1_SELL_IX_ACCOUNTS_LEN] {
    fn from(keys: Mip1SellKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.wallet,
                is_signer: true,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.program_as_signer,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.metadata,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.seller_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.migration_seller_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller_referral,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_ata,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_metadata_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.edition,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.authorization_rules_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.authorization_rules,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.instructions,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.owner_token_record,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.destination_token_record,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.associated_token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.rent,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; MIP1_SELL_IX_ACCOUNTS_LEN]> for Mip1SellKeys {
    fn from(pubkeys: [Pubkey; MIP1_SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: pubkeys[0],
            notary: pubkeys[1],
            program_as_signer: pubkeys[2],
            token_account: pubkeys[3],
            token_mint: pubkeys[4],
            metadata: pubkeys[5],
            auction_house: pubkeys[6],
            seller_trade_state: pubkeys[7],
            migration_seller_trade_state: pubkeys[8],
            seller_referral: pubkeys[9],
            token_ata: pubkeys[10],
            token_metadata_program: pubkeys[11],
            edition: pubkeys[12],
            authorization_rules_program: pubkeys[13],
            authorization_rules: pubkeys[14],
            instructions: pubkeys[15],
            owner_token_record: pubkeys[16],
            destination_token_record: pubkeys[17],
            associated_token_program: pubkeys[18],
            token_program: pubkeys[19],
            system_program: pubkeys[20],
            rent: pubkeys[21],
        }
    }
}
impl<'info> From<Mip1SellAccounts<'_, 'info>> for [AccountInfo<'info>; MIP1_SELL_IX_ACCOUNTS_LEN] {
    fn from(accounts: Mip1SellAccounts<'_, 'info>) -> Self {
        [
            accounts.wallet.clone(),
            accounts.notary.clone(),
            accounts.program_as_signer.clone(),
            accounts.token_account.clone(),
            accounts.token_mint.clone(),
            accounts.metadata.clone(),
            accounts.auction_house.clone(),
            accounts.seller_trade_state.clone(),
            accounts.migration_seller_trade_state.clone(),
            accounts.seller_referral.clone(),
            accounts.token_ata.clone(),
            accounts.token_metadata_program.clone(),
            accounts.edition.clone(),
            accounts.authorization_rules_program.clone(),
            accounts.authorization_rules.clone(),
            accounts.instructions.clone(),
            accounts.owner_token_record.clone(),
            accounts.destination_token_record.clone(),
            accounts.associated_token_program.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
            accounts.rent.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; MIP1_SELL_IX_ACCOUNTS_LEN]>
    for Mip1SellAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; MIP1_SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: &arr[0],
            notary: &arr[1],
            program_as_signer: &arr[2],
            token_account: &arr[3],
            token_mint: &arr[4],
            metadata: &arr[5],
            auction_house: &arr[6],
            seller_trade_state: &arr[7],
            migration_seller_trade_state: &arr[8],
            seller_referral: &arr[9],
            token_ata: &arr[10],
            token_metadata_program: &arr[11],
            edition: &arr[12],
            authorization_rules_program: &arr[13],
            authorization_rules: &arr[14],
            instructions: &arr[15],
            owner_token_record: &arr[16],
            destination_token_record: &arr[17],
            associated_token_program: &arr[18],
            token_program: &arr[19],
            system_program: &arr[20],
            rent: &arr[21],
        }
    }
}
pub const MIP1_SELL_IX_DISCM: [u8; 8] = [58, 50, 172, 111, 166, 151, 22, 94];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Mip1SellIxArgs {
    pub args: MIP1SellArgs,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Mip1SellIxData(pub Mip1SellIxArgs);
impl From<Mip1SellIxArgs> for Mip1SellIxData {
    fn from(args: Mip1SellIxArgs) -> Self {
        Self(args)
    }
}
impl Mip1SellIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != MIP1_SELL_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    MIP1_SELL_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(Mip1SellIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&MIP1_SELL_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn mip1_sell_ix_with_program_id(
    program_id: Pubkey,
    keys: Mip1SellKeys,
    args: Mip1SellIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; MIP1_SELL_IX_ACCOUNTS_LEN] = keys.into();
    let data: Mip1SellIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn mip1_sell_ix(keys: Mip1SellKeys, args: Mip1SellIxArgs) -> std::io::Result<Instruction> {
    mip1_sell_ix_with_program_id(crate::ID, keys, args)
}
pub fn mip1_sell_invoke_with_program_id(
    program_id: Pubkey,
    accounts: Mip1SellAccounts<'_, '_>,
    args: Mip1SellIxArgs,
) -> ProgramResult {
    let keys: Mip1SellKeys = accounts.into();
    let ix = mip1_sell_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn mip1_sell_invoke(accounts: Mip1SellAccounts<'_, '_>, args: Mip1SellIxArgs) -> ProgramResult {
    mip1_sell_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn mip1_sell_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: Mip1SellAccounts<'_, '_>,
    args: Mip1SellIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: Mip1SellKeys = accounts.into();
    let ix = mip1_sell_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn mip1_sell_invoke_signed(
    accounts: Mip1SellAccounts<'_, '_>,
    args: Mip1SellIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    mip1_sell_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn mip1_sell_verify_account_keys(
    accounts: Mip1SellAccounts<'_, '_>,
    keys: Mip1SellKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.wallet.key, keys.wallet),
        (*accounts.notary.key, keys.notary),
        (*accounts.program_as_signer.key, keys.program_as_signer),
        (*accounts.token_account.key, keys.token_account),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.metadata.key, keys.metadata),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.seller_trade_state.key, keys.seller_trade_state),
        (
            *accounts.migration_seller_trade_state.key,
            keys.migration_seller_trade_state,
        ),
        (*accounts.seller_referral.key, keys.seller_referral),
        (*accounts.token_ata.key, keys.token_ata),
        (
            *accounts.token_metadata_program.key,
            keys.token_metadata_program,
        ),
        (*accounts.edition.key, keys.edition),
        (
            *accounts.authorization_rules_program.key,
            keys.authorization_rules_program,
        ),
        (*accounts.authorization_rules.key, keys.authorization_rules),
        (*accounts.instructions.key, keys.instructions),
        (*accounts.owner_token_record.key, keys.owner_token_record),
        (
            *accounts.destination_token_record.key,
            keys.destination_token_record,
        ),
        (
            *accounts.associated_token_program.key,
            keys.associated_token_program,
        ),
        (*accounts.token_program.key, keys.token_program),
        (*accounts.system_program.key, keys.system_program),
        (*accounts.rent.key, keys.rent),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn mip1_sell_verify_writable_privileges<'me, 'info>(
    accounts: Mip1SellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.wallet,
        accounts.token_account,
        accounts.metadata,
        accounts.seller_trade_state,
        accounts.migration_seller_trade_state,
        accounts.token_ata,
        accounts.owner_token_record,
        accounts.destination_token_record,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn mip1_sell_verify_signer_privileges<'me, 'info>(
    accounts: Mip1SellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.wallet] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn mip1_sell_verify_account_privileges<'me, 'info>(
    accounts: Mip1SellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    mip1_sell_verify_writable_privileges(accounts)?;
    mip1_sell_verify_signer_privileges(accounts)?;
    Ok(())
}
pub const MIP1_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN: usize = 27;
#[derive(Copy, Clone, Debug)]
pub struct Mip1ExecuteSaleV2Accounts<'me, 'info> {
    pub payer: &'me AccountInfo<'info>,
    pub buyer: &'me AccountInfo<'info>,
    pub seller: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub program_as_signer: &'me AccountInfo<'info>,
    pub token_account: &'me AccountInfo<'info>,
    pub buyer_receipt_token_account: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub metadata: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub auction_house_treasury: &'me AccountInfo<'info>,
    pub seller_trade_state: &'me AccountInfo<'info>,
    pub buyer_trade_state: &'me AccountInfo<'info>,
    pub buyer_escrow_payment_account: &'me AccountInfo<'info>,
    pub buyer_referral: &'me AccountInfo<'info>,
    pub seller_referral: &'me AccountInfo<'info>,
    pub token_metadata_program: &'me AccountInfo<'info>,
    pub edition: &'me AccountInfo<'info>,
    pub authorization_rules_program: &'me AccountInfo<'info>,
    pub authorization_rules: &'me AccountInfo<'info>,
    pub owner_token_record: &'me AccountInfo<'info>,
    pub destination_token_record: &'me AccountInfo<'info>,
    pub instructions: &'me AccountInfo<'info>,
    pub associated_token_program: &'me AccountInfo<'info>,
    pub token_program: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
    pub rent: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct Mip1ExecuteSaleV2Keys {
    pub payer: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub notary: Pubkey,
    pub program_as_signer: Pubkey,
    pub token_account: Pubkey,
    pub buyer_receipt_token_account: Pubkey,
    pub token_mint: Pubkey,
    pub metadata: Pubkey,
    pub auction_house: Pubkey,
    pub auction_house_treasury: Pubkey,
    pub seller_trade_state: Pubkey,
    pub buyer_trade_state: Pubkey,
    pub buyer_escrow_payment_account: Pubkey,
    pub buyer_referral: Pubkey,
    pub seller_referral: Pubkey,
    pub token_metadata_program: Pubkey,
    pub edition: Pubkey,
    pub authorization_rules_program: Pubkey,
    pub authorization_rules: Pubkey,
    pub owner_token_record: Pubkey,
    pub destination_token_record: Pubkey,
    pub instructions: Pubkey,
    pub associated_token_program: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
    pub rent: Pubkey,
}
impl From<Mip1ExecuteSaleV2Accounts<'_, '_>> for Mip1ExecuteSaleV2Keys {
    fn from(accounts: Mip1ExecuteSaleV2Accounts) -> Self {
        Self {
            payer: *accounts.payer.key,
            buyer: *accounts.buyer.key,
            seller: *accounts.seller.key,
            notary: *accounts.notary.key,
            program_as_signer: *accounts.program_as_signer.key,
            token_account: *accounts.token_account.key,
            buyer_receipt_token_account: *accounts.buyer_receipt_token_account.key,
            token_mint: *accounts.token_mint.key,
            metadata: *accounts.metadata.key,
            auction_house: *accounts.auction_house.key,
            auction_house_treasury: *accounts.auction_house_treasury.key,
            seller_trade_state: *accounts.seller_trade_state.key,
            buyer_trade_state: *accounts.buyer_trade_state.key,
            buyer_escrow_payment_account: *accounts.buyer_escrow_payment_account.key,
            buyer_referral: *accounts.buyer_referral.key,
            seller_referral: *accounts.seller_referral.key,
            token_metadata_program: *accounts.token_metadata_program.key,
            edition: *accounts.edition.key,
            authorization_rules_program: *accounts.authorization_rules_program.key,
            authorization_rules: *accounts.authorization_rules.key,
            owner_token_record: *accounts.owner_token_record.key,
            destination_token_record: *accounts.destination_token_record.key,
            instructions: *accounts.instructions.key,
            associated_token_program: *accounts.associated_token_program.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
            rent: *accounts.rent.key,
        }
    }
}
impl From<Mip1ExecuteSaleV2Keys> for [AccountMeta; MIP1_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN] {
    fn from(keys: Mip1ExecuteSaleV2Keys) -> Self {
        [
            AccountMeta {
                pubkey: keys.payer,
                is_signer: true,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.program_as_signer,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_receipt_token_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.metadata,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.auction_house_treasury,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_escrow_payment_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.buyer_referral,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.seller_referral,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_metadata_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.edition,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.authorization_rules_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.authorization_rules,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.owner_token_record,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.destination_token_record,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.instructions,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.associated_token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.rent,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; MIP1_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]> for Mip1ExecuteSaleV2Keys {
    fn from(pubkeys: [Pubkey; MIP1_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            payer: pubkeys[0],
            buyer: pubkeys[1],
            seller: pubkeys[2],
            notary: pubkeys[3],
            program_as_signer: pubkeys[4],
            token_account: pubkeys[5],
            buyer_receipt_token_account: pubkeys[6],
            token_mint: pubkeys[7],
            metadata: pubkeys[8],
            auction_house: pubkeys[9],
            auction_house_treasury: pubkeys[10],
            seller_trade_state: pubkeys[11],
            buyer_trade_state: pubkeys[12],
            buyer_escrow_payment_account: pubkeys[13],
            buyer_referral: pubkeys[14],
            seller_referral: pubkeys[15],
            token_metadata_program: pubkeys[16],
            edition: pubkeys[17],
            authorization_rules_program: pubkeys[18],
            authorization_rules: pubkeys[19],
            owner_token_record: pubkeys[20],
            destination_token_record: pubkeys[21],
            instructions: pubkeys[22],
            associated_token_program: pubkeys[23],
            token_program: pubkeys[24],
            system_program: pubkeys[25],
            rent: pubkeys[26],
        }
    }
}
impl<'info> From<Mip1ExecuteSaleV2Accounts<'_, 'info>>
    for [AccountInfo<'info>; MIP1_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]
{
    fn from(accounts: Mip1ExecuteSaleV2Accounts<'_, 'info>) -> Self {
        [
            accounts.payer.clone(),
            accounts.buyer.clone(),
            accounts.seller.clone(),
            accounts.notary.clone(),
            accounts.program_as_signer.clone(),
            accounts.token_account.clone(),
            accounts.buyer_receipt_token_account.clone(),
            accounts.token_mint.clone(),
            accounts.metadata.clone(),
            accounts.auction_house.clone(),
            accounts.auction_house_treasury.clone(),
            accounts.seller_trade_state.clone(),
            accounts.buyer_trade_state.clone(),
            accounts.buyer_escrow_payment_account.clone(),
            accounts.buyer_referral.clone(),
            accounts.seller_referral.clone(),
            accounts.token_metadata_program.clone(),
            accounts.edition.clone(),
            accounts.authorization_rules_program.clone(),
            accounts.authorization_rules.clone(),
            accounts.owner_token_record.clone(),
            accounts.destination_token_record.clone(),
            accounts.instructions.clone(),
            accounts.associated_token_program.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
            accounts.rent.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; MIP1_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]>
    for Mip1ExecuteSaleV2Accounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; MIP1_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            payer: &arr[0],
            buyer: &arr[1],
            seller: &arr[2],
            notary: &arr[3],
            program_as_signer: &arr[4],
            token_account: &arr[5],
            buyer_receipt_token_account: &arr[6],
            token_mint: &arr[7],
            metadata: &arr[8],
            auction_house: &arr[9],
            auction_house_treasury: &arr[10],
            seller_trade_state: &arr[11],
            buyer_trade_state: &arr[12],
            buyer_escrow_payment_account: &arr[13],
            buyer_referral: &arr[14],
            seller_referral: &arr[15],
            token_metadata_program: &arr[16],
            edition: &arr[17],
            authorization_rules_program: &arr[18],
            authorization_rules: &arr[19],
            owner_token_record: &arr[20],
            destination_token_record: &arr[21],
            instructions: &arr[22],
            associated_token_program: &arr[23],
            token_program: &arr[24],
            system_program: &arr[25],
            rent: &arr[26],
        }
    }
}
pub const MIP1_EXECUTE_SALE_V2_IX_DISCM: [u8; 8] = [236, 163, 204, 173, 71, 144, 235, 118];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Mip1ExecuteSaleV2IxArgs {
    pub args: MIP1ExecuteSaleV2Args,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Mip1ExecuteSaleV2IxData(pub Mip1ExecuteSaleV2IxArgs);
impl From<Mip1ExecuteSaleV2IxArgs> for Mip1ExecuteSaleV2IxData {
    fn from(args: Mip1ExecuteSaleV2IxArgs) -> Self {
        Self(args)
    }
}
impl Mip1ExecuteSaleV2IxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != MIP1_EXECUTE_SALE_V2_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    MIP1_EXECUTE_SALE_V2_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(Mip1ExecuteSaleV2IxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&MIP1_EXECUTE_SALE_V2_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn mip1_execute_sale_v2_ix_with_program_id(
    program_id: Pubkey,
    keys: Mip1ExecuteSaleV2Keys,
    args: Mip1ExecuteSaleV2IxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; MIP1_EXECUTE_SALE_V2_IX_ACCOUNTS_LEN] = keys.into();
    let data: Mip1ExecuteSaleV2IxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn mip1_execute_sale_v2_ix(
    keys: Mip1ExecuteSaleV2Keys,
    args: Mip1ExecuteSaleV2IxArgs,
) -> std::io::Result<Instruction> {
    mip1_execute_sale_v2_ix_with_program_id(crate::ID, keys, args)
}
pub fn mip1_execute_sale_v2_invoke_with_program_id(
    program_id: Pubkey,
    accounts: Mip1ExecuteSaleV2Accounts<'_, '_>,
    args: Mip1ExecuteSaleV2IxArgs,
) -> ProgramResult {
    let keys: Mip1ExecuteSaleV2Keys = accounts.into();
    let ix = mip1_execute_sale_v2_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn mip1_execute_sale_v2_invoke(
    accounts: Mip1ExecuteSaleV2Accounts<'_, '_>,
    args: Mip1ExecuteSaleV2IxArgs,
) -> ProgramResult {
    mip1_execute_sale_v2_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn mip1_execute_sale_v2_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: Mip1ExecuteSaleV2Accounts<'_, '_>,
    args: Mip1ExecuteSaleV2IxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: Mip1ExecuteSaleV2Keys = accounts.into();
    let ix = mip1_execute_sale_v2_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn mip1_execute_sale_v2_invoke_signed(
    accounts: Mip1ExecuteSaleV2Accounts<'_, '_>,
    args: Mip1ExecuteSaleV2IxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    mip1_execute_sale_v2_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn mip1_execute_sale_v2_verify_account_keys(
    accounts: Mip1ExecuteSaleV2Accounts<'_, '_>,
    keys: Mip1ExecuteSaleV2Keys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.payer.key, keys.payer),
        (*accounts.buyer.key, keys.buyer),
        (*accounts.seller.key, keys.seller),
        (*accounts.notary.key, keys.notary),
        (*accounts.program_as_signer.key, keys.program_as_signer),
        (*accounts.token_account.key, keys.token_account),
        (
            *accounts.buyer_receipt_token_account.key,
            keys.buyer_receipt_token_account,
        ),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.metadata.key, keys.metadata),
        (*accounts.auction_house.key, keys.auction_house),
        (
            *accounts.auction_house_treasury.key,
            keys.auction_house_treasury,
        ),
        (*accounts.seller_trade_state.key, keys.seller_trade_state),
        (*accounts.buyer_trade_state.key, keys.buyer_trade_state),
        (
            *accounts.buyer_escrow_payment_account.key,
            keys.buyer_escrow_payment_account,
        ),
        (*accounts.buyer_referral.key, keys.buyer_referral),
        (*accounts.seller_referral.key, keys.seller_referral),
        (
            *accounts.token_metadata_program.key,
            keys.token_metadata_program,
        ),
        (*accounts.edition.key, keys.edition),
        (
            *accounts.authorization_rules_program.key,
            keys.authorization_rules_program,
        ),
        (*accounts.authorization_rules.key, keys.authorization_rules),
        (*accounts.owner_token_record.key, keys.owner_token_record),
        (
            *accounts.destination_token_record.key,
            keys.destination_token_record,
        ),
        (*accounts.instructions.key, keys.instructions),
        (
            *accounts.associated_token_program.key,
            keys.associated_token_program,
        ),
        (*accounts.token_program.key, keys.token_program),
        (*accounts.system_program.key, keys.system_program),
        (*accounts.rent.key, keys.rent),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn mip1_execute_sale_v2_verify_writable_privileges<'me, 'info>(
    accounts: Mip1ExecuteSaleV2Accounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.payer,
        accounts.buyer,
        accounts.seller,
        accounts.token_account,
        accounts.buyer_receipt_token_account,
        accounts.metadata,
        accounts.auction_house_treasury,
        accounts.seller_trade_state,
        accounts.buyer_trade_state,
        accounts.buyer_escrow_payment_account,
        accounts.buyer_referral,
        accounts.seller_referral,
        accounts.owner_token_record,
        accounts.destination_token_record,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn mip1_execute_sale_v2_verify_signer_privileges<'me, 'info>(
    accounts: Mip1ExecuteSaleV2Accounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.payer] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn mip1_execute_sale_v2_verify_account_privileges<'me, 'info>(
    accounts: Mip1ExecuteSaleV2Accounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    mip1_execute_sale_v2_verify_writable_privileges(accounts)?;
    mip1_execute_sale_v2_verify_signer_privileges(accounts)?;
    Ok(())
}
pub const MIP1_CANCEL_SELL_IX_ACCOUNTS_LEN: usize = 21;
#[derive(Copy, Clone, Debug)]
pub struct Mip1CancelSellAccounts<'me, 'info> {
    pub wallet: &'me AccountInfo<'info>,
    pub notary: &'me AccountInfo<'info>,
    pub program_as_signer: &'me AccountInfo<'info>,
    pub token_ata: &'me AccountInfo<'info>,
    pub token_mint: &'me AccountInfo<'info>,
    pub metadata: &'me AccountInfo<'info>,
    pub auction_house: &'me AccountInfo<'info>,
    pub seller_trade_state: &'me AccountInfo<'info>,
    pub token_account: &'me AccountInfo<'info>,
    pub token_account_temp: &'me AccountInfo<'info>,
    pub temp_token_record: &'me AccountInfo<'info>,
    pub token_metadata_program: &'me AccountInfo<'info>,
    pub edition: &'me AccountInfo<'info>,
    pub authorization_rules_program: &'me AccountInfo<'info>,
    pub authorization_rules: &'me AccountInfo<'info>,
    pub owner_token_record: &'me AccountInfo<'info>,
    pub destination_token_record: &'me AccountInfo<'info>,
    pub instructions: &'me AccountInfo<'info>,
    pub associated_token_program: &'me AccountInfo<'info>,
    pub token_program: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct Mip1CancelSellKeys {
    pub wallet: Pubkey,
    pub notary: Pubkey,
    pub program_as_signer: Pubkey,
    pub token_ata: Pubkey,
    pub token_mint: Pubkey,
    pub metadata: Pubkey,
    pub auction_house: Pubkey,
    pub seller_trade_state: Pubkey,
    pub token_account: Pubkey,
    pub token_account_temp: Pubkey,
    pub temp_token_record: Pubkey,
    pub token_metadata_program: Pubkey,
    pub edition: Pubkey,
    pub authorization_rules_program: Pubkey,
    pub authorization_rules: Pubkey,
    pub owner_token_record: Pubkey,
    pub destination_token_record: Pubkey,
    pub instructions: Pubkey,
    pub associated_token_program: Pubkey,
    pub token_program: Pubkey,
    pub system_program: Pubkey,
}
impl From<Mip1CancelSellAccounts<'_, '_>> for Mip1CancelSellKeys {
    fn from(accounts: Mip1CancelSellAccounts) -> Self {
        Self {
            wallet: *accounts.wallet.key,
            notary: *accounts.notary.key,
            program_as_signer: *accounts.program_as_signer.key,
            token_ata: *accounts.token_ata.key,
            token_mint: *accounts.token_mint.key,
            metadata: *accounts.metadata.key,
            auction_house: *accounts.auction_house.key,
            seller_trade_state: *accounts.seller_trade_state.key,
            token_account: *accounts.token_account.key,
            token_account_temp: *accounts.token_account_temp.key,
            temp_token_record: *accounts.temp_token_record.key,
            token_metadata_program: *accounts.token_metadata_program.key,
            edition: *accounts.edition.key,
            authorization_rules_program: *accounts.authorization_rules_program.key,
            authorization_rules: *accounts.authorization_rules.key,
            owner_token_record: *accounts.owner_token_record.key,
            destination_token_record: *accounts.destination_token_record.key,
            instructions: *accounts.instructions.key,
            associated_token_program: *accounts.associated_token_program.key,
            token_program: *accounts.token_program.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<Mip1CancelSellKeys> for [AccountMeta; MIP1_CANCEL_SELL_IX_ACCOUNTS_LEN] {
    fn from(keys: Mip1CancelSellKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.wallet,
                is_signer: true,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.notary,
                is_signer: true,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.program_as_signer,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_ata,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_mint,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.metadata,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.auction_house,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.seller_trade_state,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_account_temp,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.temp_token_record,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.token_metadata_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.edition,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.authorization_rules_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.authorization_rules,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.owner_token_record,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.destination_token_record,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.instructions,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.associated_token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.token_program,
                is_signer: false,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; MIP1_CANCEL_SELL_IX_ACCOUNTS_LEN]> for Mip1CancelSellKeys {
    fn from(pubkeys: [Pubkey; MIP1_CANCEL_SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: pubkeys[0],
            notary: pubkeys[1],
            program_as_signer: pubkeys[2],
            token_ata: pubkeys[3],
            token_mint: pubkeys[4],
            metadata: pubkeys[5],
            auction_house: pubkeys[6],
            seller_trade_state: pubkeys[7],
            token_account: pubkeys[8],
            token_account_temp: pubkeys[9],
            temp_token_record: pubkeys[10],
            token_metadata_program: pubkeys[11],
            edition: pubkeys[12],
            authorization_rules_program: pubkeys[13],
            authorization_rules: pubkeys[14],
            owner_token_record: pubkeys[15],
            destination_token_record: pubkeys[16],
            instructions: pubkeys[17],
            associated_token_program: pubkeys[18],
            token_program: pubkeys[19],
            system_program: pubkeys[20],
        }
    }
}
impl<'info> From<Mip1CancelSellAccounts<'_, 'info>>
    for [AccountInfo<'info>; MIP1_CANCEL_SELL_IX_ACCOUNTS_LEN]
{
    fn from(accounts: Mip1CancelSellAccounts<'_, 'info>) -> Self {
        [
            accounts.wallet.clone(),
            accounts.notary.clone(),
            accounts.program_as_signer.clone(),
            accounts.token_ata.clone(),
            accounts.token_mint.clone(),
            accounts.metadata.clone(),
            accounts.auction_house.clone(),
            accounts.seller_trade_state.clone(),
            accounts.token_account.clone(),
            accounts.token_account_temp.clone(),
            accounts.temp_token_record.clone(),
            accounts.token_metadata_program.clone(),
            accounts.edition.clone(),
            accounts.authorization_rules_program.clone(),
            accounts.authorization_rules.clone(),
            accounts.owner_token_record.clone(),
            accounts.destination_token_record.clone(),
            accounts.instructions.clone(),
            accounts.associated_token_program.clone(),
            accounts.token_program.clone(),
            accounts.system_program.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; MIP1_CANCEL_SELL_IX_ACCOUNTS_LEN]>
    for Mip1CancelSellAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; MIP1_CANCEL_SELL_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            wallet: &arr[0],
            notary: &arr[1],
            program_as_signer: &arr[2],
            token_ata: &arr[3],
            token_mint: &arr[4],
            metadata: &arr[5],
            auction_house: &arr[6],
            seller_trade_state: &arr[7],
            token_account: &arr[8],
            token_account_temp: &arr[9],
            temp_token_record: &arr[10],
            token_metadata_program: &arr[11],
            edition: &arr[12],
            authorization_rules_program: &arr[13],
            authorization_rules: &arr[14],
            owner_token_record: &arr[15],
            destination_token_record: &arr[16],
            instructions: &arr[17],
            associated_token_program: &arr[18],
            token_program: &arr[19],
            system_program: &arr[20],
        }
    }
}
pub const MIP1_CANCEL_SELL_IX_DISCM: [u8; 8] = [74, 190, 185, 225, 88, 105, 209, 156];
#[derive(Clone, Debug, PartialEq)]
pub struct Mip1CancelSellIxData;
impl Mip1CancelSellIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != MIP1_CANCEL_SELL_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    MIP1_CANCEL_SELL_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self)
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&MIP1_CANCEL_SELL_IX_DISCM)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn mip1_cancel_sell_ix_with_program_id(
    program_id: Pubkey,
    keys: Mip1CancelSellKeys,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; MIP1_CANCEL_SELL_IX_ACCOUNTS_LEN] = keys.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: Mip1CancelSellIxData.try_to_vec()?,
    })
}
pub fn mip1_cancel_sell_ix(keys: Mip1CancelSellKeys) -> std::io::Result<Instruction> {
    mip1_cancel_sell_ix_with_program_id(crate::ID, keys)
}
pub fn mip1_cancel_sell_invoke_with_program_id(
    program_id: Pubkey,
    accounts: Mip1CancelSellAccounts<'_, '_>,
) -> ProgramResult {
    let keys: Mip1CancelSellKeys = accounts.into();
    let ix = mip1_cancel_sell_ix_with_program_id(program_id, keys)?;
    invoke_instruction(&ix, accounts)
}
pub fn mip1_cancel_sell_invoke(accounts: Mip1CancelSellAccounts<'_, '_>) -> ProgramResult {
    mip1_cancel_sell_invoke_with_program_id(crate::ID, accounts)
}
pub fn mip1_cancel_sell_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: Mip1CancelSellAccounts<'_, '_>,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: Mip1CancelSellKeys = accounts.into();
    let ix = mip1_cancel_sell_ix_with_program_id(program_id, keys)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn mip1_cancel_sell_invoke_signed(
    accounts: Mip1CancelSellAccounts<'_, '_>,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    mip1_cancel_sell_invoke_signed_with_program_id(crate::ID, accounts, seeds)
}
pub fn mip1_cancel_sell_verify_account_keys(
    accounts: Mip1CancelSellAccounts<'_, '_>,
    keys: Mip1CancelSellKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.wallet.key, keys.wallet),
        (*accounts.notary.key, keys.notary),
        (*accounts.program_as_signer.key, keys.program_as_signer),
        (*accounts.token_ata.key, keys.token_ata),
        (*accounts.token_mint.key, keys.token_mint),
        (*accounts.metadata.key, keys.metadata),
        (*accounts.auction_house.key, keys.auction_house),
        (*accounts.seller_trade_state.key, keys.seller_trade_state),
        (*accounts.token_account.key, keys.token_account),
        (*accounts.token_account_temp.key, keys.token_account_temp),
        (*accounts.temp_token_record.key, keys.temp_token_record),
        (
            *accounts.token_metadata_program.key,
            keys.token_metadata_program,
        ),
        (*accounts.edition.key, keys.edition),
        (
            *accounts.authorization_rules_program.key,
            keys.authorization_rules_program,
        ),
        (*accounts.authorization_rules.key, keys.authorization_rules),
        (*accounts.owner_token_record.key, keys.owner_token_record),
        (
            *accounts.destination_token_record.key,
            keys.destination_token_record,
        ),
        (*accounts.instructions.key, keys.instructions),
        (
            *accounts.associated_token_program.key,
            keys.associated_token_program,
        ),
        (*accounts.token_program.key, keys.token_program),
        (*accounts.system_program.key, keys.system_program),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn mip1_cancel_sell_verify_writable_privileges<'me, 'info>(
    accounts: Mip1CancelSellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [
        accounts.wallet,
        accounts.token_ata,
        accounts.metadata,
        accounts.seller_trade_state,
        accounts.token_account,
        accounts.token_account_temp,
        accounts.temp_token_record,
        accounts.owner_token_record,
        accounts.destination_token_record,
    ] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn mip1_cancel_sell_verify_signer_privileges<'me, 'info>(
    accounts: Mip1CancelSellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.wallet, accounts.notary] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn mip1_cancel_sell_verify_account_privileges<'me, 'info>(
    accounts: Mip1CancelSellAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    mip1_cancel_sell_verify_writable_privileges(accounts)?;
    mip1_cancel_sell_verify_signer_privileges(accounts)?;
    Ok(())
}
pub const WITHDRAW_BY_MMM_IX_ACCOUNTS_LEN: usize = 4;
#[derive(Copy, Clone, Debug)]
pub struct WithdrawByMmmAccounts<'me, 'info> {
    pub mmm_pool: &'me AccountInfo<'info>,
    pub to: &'me AccountInfo<'info>,
    pub escrow_payment_account: &'me AccountInfo<'info>,
    pub system_program: &'me AccountInfo<'info>,
}
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct WithdrawByMmmKeys {
    pub mmm_pool: Pubkey,
    pub to: Pubkey,
    pub escrow_payment_account: Pubkey,
    pub system_program: Pubkey,
}
impl From<WithdrawByMmmAccounts<'_, '_>> for WithdrawByMmmKeys {
    fn from(accounts: WithdrawByMmmAccounts) -> Self {
        Self {
            mmm_pool: *accounts.mmm_pool.key,
            to: *accounts.to.key,
            escrow_payment_account: *accounts.escrow_payment_account.key,
            system_program: *accounts.system_program.key,
        }
    }
}
impl From<WithdrawByMmmKeys> for [AccountMeta; WITHDRAW_BY_MMM_IX_ACCOUNTS_LEN] {
    fn from(keys: WithdrawByMmmKeys) -> Self {
        [
            AccountMeta {
                pubkey: keys.mmm_pool,
                is_signer: true,
                is_writable: false,
            },
            AccountMeta {
                pubkey: keys.to,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.escrow_payment_account,
                is_signer: false,
                is_writable: true,
            },
            AccountMeta {
                pubkey: keys.system_program,
                is_signer: false,
                is_writable: false,
            },
        ]
    }
}
impl From<[Pubkey; WITHDRAW_BY_MMM_IX_ACCOUNTS_LEN]> for WithdrawByMmmKeys {
    fn from(pubkeys: [Pubkey; WITHDRAW_BY_MMM_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            mmm_pool: pubkeys[0],
            to: pubkeys[1],
            escrow_payment_account: pubkeys[2],
            system_program: pubkeys[3],
        }
    }
}
impl<'info> From<WithdrawByMmmAccounts<'_, 'info>>
    for [AccountInfo<'info>; WITHDRAW_BY_MMM_IX_ACCOUNTS_LEN]
{
    fn from(accounts: WithdrawByMmmAccounts<'_, 'info>) -> Self {
        [
            accounts.mmm_pool.clone(),
            accounts.to.clone(),
            accounts.escrow_payment_account.clone(),
            accounts.system_program.clone(),
        ]
    }
}
impl<'me, 'info> From<&'me [AccountInfo<'info>; WITHDRAW_BY_MMM_IX_ACCOUNTS_LEN]>
    for WithdrawByMmmAccounts<'me, 'info>
{
    fn from(arr: &'me [AccountInfo<'info>; WITHDRAW_BY_MMM_IX_ACCOUNTS_LEN]) -> Self {
        Self {
            mmm_pool: &arr[0],
            to: &arr[1],
            escrow_payment_account: &arr[2],
            system_program: &arr[3],
        }
    }
}
pub const WITHDRAW_BY_MMM_IX_DISCM: [u8; 8] = [35, 73, 133, 139, 32, 55, 213, 140];
#[derive(BorshDeserialize, BorshSerialize, Clone, Debug, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct WithdrawByMmmIxArgs {
    pub args: WithdrawByMMMArgs,
}
#[derive(Clone, Debug, PartialEq)]
pub struct WithdrawByMmmIxData(pub WithdrawByMmmIxArgs);
impl From<WithdrawByMmmIxArgs> for WithdrawByMmmIxData {
    fn from(args: WithdrawByMmmIxArgs) -> Self {
        Self(args)
    }
}
impl WithdrawByMmmIxData {
    pub fn deserialize(buf: &[u8]) -> std::io::Result<Self> {
        let mut reader = buf;
        let mut maybe_discm = [0u8; 8];
        reader.read_exact(&mut maybe_discm)?;
        if maybe_discm != WITHDRAW_BY_MMM_IX_DISCM {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "discm does not match. Expected: {:?}. Received: {:?}",
                    WITHDRAW_BY_MMM_IX_DISCM, maybe_discm
                ),
            ));
        }
        Ok(Self(WithdrawByMmmIxArgs::deserialize(&mut reader)?))
    }
    pub fn serialize<W: std::io::Write>(&self, mut writer: W) -> std::io::Result<()> {
        writer.write_all(&WITHDRAW_BY_MMM_IX_DISCM)?;
        self.0.serialize(&mut writer)
    }
    pub fn try_to_vec(&self) -> std::io::Result<Vec<u8>> {
        let mut data = Vec::new();
        self.serialize(&mut data)?;
        Ok(data)
    }
}
pub fn withdraw_by_mmm_ix_with_program_id(
    program_id: Pubkey,
    keys: WithdrawByMmmKeys,
    args: WithdrawByMmmIxArgs,
) -> std::io::Result<Instruction> {
    let metas: [AccountMeta; WITHDRAW_BY_MMM_IX_ACCOUNTS_LEN] = keys.into();
    let data: WithdrawByMmmIxData = args.into();
    Ok(Instruction {
        program_id,
        accounts: Vec::from(metas),
        data: data.try_to_vec()?,
    })
}
pub fn withdraw_by_mmm_ix(
    keys: WithdrawByMmmKeys,
    args: WithdrawByMmmIxArgs,
) -> std::io::Result<Instruction> {
    withdraw_by_mmm_ix_with_program_id(crate::ID, keys, args)
}
pub fn withdraw_by_mmm_invoke_with_program_id(
    program_id: Pubkey,
    accounts: WithdrawByMmmAccounts<'_, '_>,
    args: WithdrawByMmmIxArgs,
) -> ProgramResult {
    let keys: WithdrawByMmmKeys = accounts.into();
    let ix = withdraw_by_mmm_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction(&ix, accounts)
}
pub fn withdraw_by_mmm_invoke(
    accounts: WithdrawByMmmAccounts<'_, '_>,
    args: WithdrawByMmmIxArgs,
) -> ProgramResult {
    withdraw_by_mmm_invoke_with_program_id(crate::ID, accounts, args)
}
pub fn withdraw_by_mmm_invoke_signed_with_program_id(
    program_id: Pubkey,
    accounts: WithdrawByMmmAccounts<'_, '_>,
    args: WithdrawByMmmIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    let keys: WithdrawByMmmKeys = accounts.into();
    let ix = withdraw_by_mmm_ix_with_program_id(program_id, keys, args)?;
    invoke_instruction_signed(&ix, accounts, seeds)
}
pub fn withdraw_by_mmm_invoke_signed(
    accounts: WithdrawByMmmAccounts<'_, '_>,
    args: WithdrawByMmmIxArgs,
    seeds: &[&[&[u8]]],
) -> ProgramResult {
    withdraw_by_mmm_invoke_signed_with_program_id(crate::ID, accounts, args, seeds)
}
pub fn withdraw_by_mmm_verify_account_keys(
    accounts: WithdrawByMmmAccounts<'_, '_>,
    keys: WithdrawByMmmKeys,
) -> Result<(), (Pubkey, Pubkey)> {
    for (actual, expected) in [
        (*accounts.mmm_pool.key, keys.mmm_pool),
        (*accounts.to.key, keys.to),
        (
            *accounts.escrow_payment_account.key,
            keys.escrow_payment_account,
        ),
        (*accounts.system_program.key, keys.system_program),
    ] {
        if actual != expected {
            return Err((actual, expected));
        }
    }
    Ok(())
}
pub fn withdraw_by_mmm_verify_writable_privileges<'me, 'info>(
    accounts: WithdrawByMmmAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_writable in [accounts.to, accounts.escrow_payment_account] {
        if !should_be_writable.is_writable {
            return Err((should_be_writable, ProgramError::InvalidAccountData));
        }
    }
    Ok(())
}
pub fn withdraw_by_mmm_verify_signer_privileges<'me, 'info>(
    accounts: WithdrawByMmmAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    for should_be_signer in [accounts.mmm_pool] {
        if !should_be_signer.is_signer {
            return Err((should_be_signer, ProgramError::MissingRequiredSignature));
        }
    }
    Ok(())
}
pub fn withdraw_by_mmm_verify_account_privileges<'me, 'info>(
    accounts: WithdrawByMmmAccounts<'me, 'info>,
) -> Result<(), (&'me AccountInfo<'info>, ProgramError)> {
    withdraw_by_mmm_verify_writable_privileges(accounts)?;
    withdraw_by_mmm_verify_signer_privileges(accounts)?;
    Ok(())
}
