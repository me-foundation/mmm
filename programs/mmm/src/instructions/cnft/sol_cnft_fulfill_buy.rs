use std::str::FromStr;

use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{
    constants::*,
    errors::MMMErrorCode,
    state::{BubblegumProgram, Pool, SellState, TreeConfigAnchor},
    util::{log_pool, transfer_compressed_nft, try_close_pool},
    verify_referral::verify_referral,
};

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

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SolCnftFulfillBuyArgs {
    // === cNFT transfer args === //
    // The Merkle root for the tree. Can be retrieved from off-chain data store.
    root: [u8; 32],
    // The Keccak256 hash of the NFTs existing metadata (without the verified flag for the creator changed).
    // The metadata is retrieved from off-chain data store.
    metadata_hash: [u8; 32],
    // The Keccak256 hash of the NFTs existing creators array (without the verified flag for the creator changed).
    // The creators array is retrieved from off-chain data store.
    creator_hash: [u8; 32],
    // A nonce ("number used once") value used to make the Merkle tree leaves unique.
    // This is the value of num_minted for the tree stored in the TreeConfig account at the time the NFT was minted.
    // The unique value for each asset can be retrieved from off-chain data store.
    nonce: u64,
    // The index of the leaf in the merkle tree. Can be retrieved from off-chain store.
    index: u32,

    // === Contract args === //
    // Price of the NFT in the payment_mint.
    buyer_price: u64,
    // The mint of the SPL token used to pay for the NFT, currently not used and default to SOL.
    payment_mint: Pubkey,
    // The asset amount to deposit, default to 1.
    pub asset_amount: u64,
    pub min_payment_amount: u64,
    pub allowlist_aux: Option<String>, // TODO: use it for future allowlist_aux
    pub maker_fee_bp: i16,             // will be checked by cosigner
    pub taker_fee_bp: i16,             // will be checked by cosigner

    // === Creator args === //
    creator_shares: Vec<u16>,
    creator_verified: Vec<bool>,
    // Creator royalties. Validated against the metadata_hash by Bubblegum after hashing with metadata_hash.
    seller_fee_basis_points: u16,

    pub metadata_args: MetadataArgs,
}

#[derive(Accounts)]
#[instruction(args:SolCnftFulfillBuyArgs)]
pub struct SolCnftFulfillBuy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: we will check the owner field that matches the pool owner
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,
    #[account(constraint = owner.key() != cosigner.key() @ MMMErrorCode::InvalidCosigner)]
    pub cosigner: Signer<'info>,
    #[account(
        mut,
        constraint = verify_referral(&pool, &referral) @ MMMErrorCode::InvalidReferral,
    )]
    /// CHECK: use verify_referral to check the referral account
    pub referral: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
        has_one = owner @ MMMErrorCode::InvalidOwner,
        has_one = cosigner @ MMMErrorCode::InvalidCosigner,
        constraint = pool.payment_mint.eq(&Pubkey::default()) @ MMMErrorCode::InvalidPaymentMint,
        constraint = pool.expiry == 0 || pool.expiry > Clock::get().unwrap().unix_timestamp @ MMMErrorCode::Expired,
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// CHECK: it's a pda, and the private key is owned by the seeds
    #[account(
        mut,
        seeds = [BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(), pool.key().as_ref()],
        bump,
    )]
    pub buyside_sol_escrow_account: UncheckedAccount<'info>,

    // ==== cNFT transfer args ==== //
    #[account(
            mut,
            seeds = [merkle_tree.key().as_ref()],
            seeds::program = bubblegum_program.key(),
            bump,
          )]
    /// CHECK: This account is neither written to nor read from.
    pub tree_authority: Account<'info, TreeConfigAnchor>,

    // The account that contains the Merkle tree, initialized by create_tree.
    /// CHECK: This account is modified in the downstream Bubblegum program
    #[account(mut)]
    merkle_tree: UncheckedAccount<'info>,
    /// CHECK: Used by bubblegum for logging (CPI)
    #[account(address = Pubkey::from_str("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV").unwrap())]
    log_wrapper: UncheckedAccount<'info>,

    bubblegum_program: Program<'info, BubblegumProgram>,

    /// CHECK: The Solana Program Library spl-account-compression program ID.
    #[account(address = Pubkey::from_str("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK").unwrap())]
    compression_program: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        seeds = [
            SELL_STATE_PREFIX.as_bytes(),
            pool.key().as_ref(),
            merkle_tree.key().as_ref(),
            args.index.to_le_bytes().as_ref(),
        ],
        space = SellState::LEN,
        bump
    )]
    pub sell_state: Account<'info, SellState>,
    pub system_program: Program<'info, System>,
    // Remaining accounts
    // Branch: using shared escrow accounts
    //   0: m2_program
    //   1: shared_escrow_account
    //   2+: creator accounts
    // Branch: not using shared escrow accounts
    //   0+: creator accounts
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, SolCnftFulfillBuy<'info>>,
    args: SolCnftFulfillBuyArgs,
) -> Result<()> {
    // let payer = &ctx.accounts.payer;
    let owner = &ctx.accounts.owner;
    let pool = &ctx.accounts.pool;
    // let sell_state = &mut ctx.accounts.sell_state;
    // let merkle_tree = &ctx.accounts.merkle_tree;
    // Remaining accounts are 1. (Optional) creator addresses and 2. Merkle proof path.
    let creator_shares_length = args.creator_shares.len();
    let creator_shares_clone = args.creator_shares.clone();
    let (creator_accounts, proof_path) = ctx.remaining_accounts.split_at(creator_shares_length);

    if pool.using_shared_escrow() {
        return Err(MMMErrorCode::InvalidAccountState.into());
    }

    msg!("seller fee basis points: {}", args.seller_fee_basis_points);
    // Create data_hash from metadata_hash + seller_fee_basis_points (secures creator royalties)
    // let data_hash = hash_metadata_data(args.metadata_hash, args.seller_fee_basis_points)?;

    // Transfer CNFT from seller(payer) to buyer (pool owner)
    // TODO: do I need to send to pool instead?
    transfer_compressed_nft(
        &ctx.accounts.tree_authority.to_account_info(),
        &ctx.accounts.payer.to_account_info(),
        &ctx.accounts.payer.to_account_info(),
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.merkle_tree,
        &ctx.accounts.log_wrapper,
        &ctx.accounts.compression_program,
        &ctx.accounts.system_program, // Pass as Program<System> without calling to_account_info()
        proof_path,
        ctx.accounts.bubblegum_program.key(),
        args.root,
        args.metadata_hash,
        args.creator_hash,
        args.nonce,
        args.index,
        None, // signer passed through from ctx
    )?;

    log_pool("post_sol_cnft_fulfill_buy", pool)?;
    try_close_pool(pool, owner.to_account_info())?;

    Ok(())
}
