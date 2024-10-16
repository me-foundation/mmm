use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{
    constants::*,
    errors::MMMErrorCode,
    state::{Pool, SellState},
    util::{check_allowlists_for_mint, log_pool},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CnftDepositSellArgs {
    // === cNFT transfer args === //
    // The Merkle root for the tree. Can be retrieved from off-chain data store.
    root: [u8; 32],
    // The Keccak256 hash of the NFTs existing metadata (without the verified flag for the creator changed).
    // The metadata is retrieved from off-chain data store.
    data_hash: [u8; 32],
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
    pub allowlist_aux: Option<String>, // TODO: use it for future allowlist_aux
}

#[derive(Accounts)]
#[instruction(args:CnftDepositSellArgs)]
pub struct CnftDepositSell<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(constraint = owner.key() != cosigner.key() @ MMMErrorCode::InvalidCosigner)]
    pub cosigner: Signer<'info>,
    #[account(
        mut,
        seeds = [POOL_PREFIX.as_bytes(), owner.key().as_ref(), pool.uuid.as_ref()],
        has_one = owner @ MMMErrorCode::InvalidOwner,
        has_one = cosigner @ MMMErrorCode::InvalidCosigner,
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    // ==== cNFT transfer args ==== //
    #[account(
            mut,
            seeds = [merkle_tree.key().as_ref()],
            seeds::program = bubblegum_program.key(),
            bump,
          )]
    /// CHECK: This account is neither written to nor read from.
    pub tree_authority: Account<'info, TreeConfigAnchor>,
    // The NFT delegate. Transfers must be signed by either the NFT owner or NFT delegate.
    /// CHECK: This account is checked in the Bubblegum transfer instruction
    leaf_delegate: UncheckedAccount<'info>,
    // The account that contains the Merkle tree, initialized by create_tree.
    /// CHECK: This account is modified in the downstream Bubblegum program
    #[account(mut)]
    merkle_tree: UncheckedAccount<'info>,
    // Used by bubblegum for logging (CPI)
    log_wrapper: Program<'info, Noop>,

    bubblegum_program: Program<'info, BubblegumProgram>,

    // The Solana Program Library spl-account-compression program ID.
    compression_program: Program<'info, SplAccountCompression>,

    pub sell_state: Account<'info, SellState>,
    /// CHECK: will be used for allowlist checks
    pub allowlist_aux_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CnftDepositSell>, args: CnftDepositSellArgs) -> Result<()> {
    let owner = &ctx.accounts.owner;
    let pool = &mut ctx.accounts.pool;
    let sell_state = &mut ctx.accounts.sell_state;
    let merkle_tree = &ctx.accounts.merkle_tree.clone();

    if pool.using_shared_escrow() {
        return Err(MMMErrorCode::InvalidAccountState.into());
    }

    let asset_id = get_asset_id(&merkle_tree.key(), args.nonce);

    // Need to do check allowlist against cnft metadata args
    // check_allowlists_for_mint(
    //     &pool.allowlists,
    //     asset_mint,
    //     asset_metadata,
    //     Some(asset_master_edition),
    //     args.allowlist_aux,
    // )?;

    // Do Cnft transfer logic here
    msg!(
        "Transferring asset to: {}",
        ctx.accounts.program_as_signer.key
    );
    transfer_compressed_nft(
        &ctx.accounts.tree_authority.to_account_info(),
        &wallet.to_account_info(),
        &ctx.accounts.leaf_delegate.to_account_info(), // delegate
        &ctx.accounts.program_as_signer.to_account_info(),
        &ctx.accounts.merkle_tree,
        &ctx.accounts.log_wrapper,
        &ctx.accounts.compression_program,
        &ctx.accounts.system_program,
        ctx.remaining_accounts,
        ctx.accounts.bubblegum_program.key(),
        args.root,
        args.data_hash,
        args.creator_hash,
        args.nonce,
        args.index,
        None, // signer passed through from ctx
    )?;

    pool.sellside_asset_amount = pool
        .sellside_asset_amount
        .checked_add(args.asset_amount)
        .ok_or(MMMErrorCode::NumericOverflow)?;

    sell_state.pool = pool.key();
    sell_state.pool_owner = owner.key();
    // TODO: asset_mint can be get from tree.
    sell_state.asset_mint = asset_id;
    sell_state.cosigner_annotation = pool.cosigner_annotation;
    sell_state.asset_amount = sell_state
        .asset_amount
        .checked_add(args.asset_amount)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    log_pool("post_cnft_deposit_sell", pool)?;

    Ok(())
}
