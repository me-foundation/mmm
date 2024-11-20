use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};
use mpl_bubblegum::utils::get_asset_id;
use solana_program::pubkey;

use crate::{
    constants::*,
    errors::MMMErrorCode,
    index_ra,
    state::{BubblegumProgram, Pool, SellState},
    util::{
        assert_valid_fees_bp, check_allowlists_for_cnft, check_remaining_accounts_for_m2,
        get_buyside_seller_receives, get_lp_fee_bp, get_sol_fee, get_sol_lp_fee,
        get_sol_total_price_and_next_price, hash_metadata, log_pool, pay_creator_fees_in_sol_cnft,
        transfer_compressed_nft, try_close_escrow, try_close_pool, try_close_sell_state,
        verify_creators, withdraw_m2,
    },
    verify_referral::verify_referral,
};

use super::MetadataArgs;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SolCnftFulfillBuyArgs {
    // === cNFT transfer args === //
    asset_id: Pubkey,
    // The Merkle root for the tree. Can be retrieved from off-chain data store.
    root: [u8; 32],
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
    pub min_payment_amount: u64,
    pub maker_fee_bp: i16, // will be checked by cosigner
    pub taker_fee_bp: i16, // will be checked by cosigner

    // Metadata args for cnft hash
    // Reference: https://developers.metaplex.com/bubblegum/hashed-nft-data
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
    pub tree_authority: UncheckedAccount<'info>,

    // The account that contains the Merkle tree, initialized by create_tree.
    /// CHECK: This account is modified in the downstream Bubblegum program
    #[account(mut)]
    merkle_tree: UncheckedAccount<'info>,
    /// CHECK: Used by bubblegum for logging (CPI)
    #[account(address = pubkey!("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"))]
    log_wrapper: UncheckedAccount<'info>,

    bubblegum_program: Program<'info, BubblegumProgram>,

    /// CHECK: The Solana Program Library spl-account-compression program ID.
    #[account(address = pubkey!("cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK")
)]
    compression_program: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        seeds = [
            SELL_STATE_PREFIX.as_bytes(),
            pool.key().as_ref(),
            args.asset_id.as_ref(),
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
    //   2-N: creator accounts
    //.  N+: proof accounts
    // Branch: not using shared escrow accounts
    //   0-N: creator accounts
    //.  N+: proof accounts
}

pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, SolCnftFulfillBuy<'info>>,
    args: SolCnftFulfillBuyArgs,
) -> Result<()> {
    // let payer = &ctx.accounts.payer;
    let owner = &ctx.accounts.owner;
    let pool = &mut ctx.accounts.pool;
    let buyside_sol_escrow_account = &ctx.accounts.buyside_sol_escrow_account;
    let sell_state = &mut ctx.accounts.sell_state;
    let payer = &ctx.accounts.payer;
    let referral: &UncheckedAccount<'info> = &ctx.accounts.referral;
    let merkle_tree = &ctx.accounts.merkle_tree;
    let pool_key = pool.key();
    let buyside_sol_escrow_account_seeds: &[&[&[u8]]] = &[&[
        BUYSIDE_SOL_ESCROW_ACCOUNT_PREFIX.as_bytes(),
        pool_key.as_ref(),
        &[ctx.bumps.buyside_sol_escrow_account],
    ]];
    let system_program = &ctx.accounts.system_program;
    // Remaining accounts are 1. (Optional) creator addresses and 2. Merkle proof path.
    let creator_length = args.metadata_args.creators.len();
    let remaining_accounts = ctx.remaining_accounts;

    // 0. Verify allowlist
    if let Some(ref collection) = args.metadata_args.collection {
        let _ = check_allowlists_for_cnft(&pool.allowlists, collection.clone())?;
    } else {
        return Err(MMMErrorCode::InvalidCnftMetadata.into());
    }

    // 1. Cacluate amount and fees
    let (total_price, next_price) = get_sol_total_price_and_next_price(pool, 1, true)?;
    let metadata_royalty_bp = args.metadata_args.seller_fee_basis_points;
    let seller_receives = {
        let lp_fee_bp = get_lp_fee_bp(pool, buyside_sol_escrow_account.lamports());
        get_buyside_seller_receives(
            total_price,
            lp_fee_bp,
            metadata_royalty_bp,
            pool.buyside_creator_royalty_bp,
        )
    }?;

    let lp_fee = get_sol_lp_fee(pool, buyside_sol_escrow_account.lamports(), seller_receives)?;
    assert_valid_fees_bp(args.maker_fee_bp, args.taker_fee_bp)?;
    let maker_fee = get_sol_fee(seller_receives, args.maker_fee_bp)?;
    let taker_fee = get_sol_fee(seller_receives, args.taker_fee_bp)?;
    let referral_fee = u64::try_from(
        maker_fee
            .checked_add(taker_fee)
            .ok_or(MMMErrorCode::NumericOverflow)?,
    )
    .map_err(|_| MMMErrorCode::NumericOverflow)?;

    // 2. Get creator accounts, verify creators
    let (creator_accounts, proof_path) = if pool.using_shared_escrow() {
        check_remaining_accounts_for_m2(remaining_accounts, &pool.owner.key())?;

        let amount: u64 = (total_price as i64 + maker_fee) as u64;
        withdraw_m2(
            pool,
            ctx.bumps.pool,
            buyside_sol_escrow_account,
            index_ra!(remaining_accounts, 1),
            system_program,
            index_ra!(remaining_accounts, 0),
            pool.owner,
            amount,
        )?;
        pool.shared_escrow_count = pool
            .shared_escrow_count
            .checked_sub(1)
            .ok_or(MMMErrorCode::NumericOverflow)?;

        remaining_accounts[2..].split_at(creator_length + 2)
    } else {
        remaining_accounts.split_at(creator_length)
    };

    let creator_shares = args
        .metadata_args
        .creators
        .iter()
        .map(|c| c.share as u16)
        .collect::<Vec<u16>>();

    let creator_verified = args
        .metadata_args
        .creators
        .iter()
        .map(|c| c.verified)
        .collect();

    verify_creators(
        creator_accounts.iter(),
        creator_shares,
        creator_verified,
        args.creator_hash,
    )?;

    // 3. Transfer CNFT to buyer (pool or owner)
    let data_hash = hash_metadata(&args.metadata_args)?;
    let asset_mint = get_asset_id(&merkle_tree.key(), args.nonce);
    if asset_mint != args.asset_id {
        return Err(MMMErrorCode::InvalidCnftMetadataArgs.into());
    }
    // reinvest fulfill buy is just a placeholder for now if we want to enable double sided
    // pool for cnft in the the future.
    if pool.reinvest_fulfill_buy {
        if pool.using_shared_escrow() {
            return Err(MMMErrorCode::InvalidAccountState.into());
        }
        transfer_compressed_nft(
            &ctx.accounts.tree_authority.to_account_info(),
            &pool.to_account_info(),
            &ctx.accounts.payer.to_account_info(),
            &ctx.accounts.owner.to_account_info(),
            &ctx.accounts.merkle_tree,
            &ctx.accounts.log_wrapper,
            &ctx.accounts.compression_program,
            &ctx.accounts.system_program, // Pass as Program<System> without calling to_account_info()
            proof_path,
            ctx.accounts.bubblegum_program.key(),
            args.root,
            data_hash,
            args.creator_hash,
            args.nonce,
            args.index,
            None, // signer passed through from ctx
        )?;
        pool.sellside_asset_amount = pool
            .sellside_asset_amount
            .checked_add(1)
            .ok_or(MMMErrorCode::NumericOverflow)?;
        sell_state.pool = pool.key();
        sell_state.pool_owner = owner.key();
        sell_state.asset_mint = asset_mint.key();
        sell_state.cosigner_annotation = pool.cosigner_annotation;
        sell_state.asset_amount = sell_state
            .asset_amount
            .checked_add(1)
            .ok_or(MMMErrorCode::NumericOverflow)?;
    } else {
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
            data_hash,
            args.creator_hash,
            args.nonce,
            args.index,
            None, // signer passed through from ctx
        )?;
    }

    // 4. Pool owner as buyer pay royalties to creators
    let royalty_paid = pay_creator_fees_in_sol_cnft(
        pool.buyside_creator_royalty_bp,
        seller_receives,
        &args.metadata_args,
        creator_accounts,
        buyside_sol_escrow_account.to_account_info(),
        buyside_sol_escrow_account_seeds,
        system_program.to_account_info(),
    )?;

    // 5. Seller pay buyer, prevent frontrun by pool config changes
    let payment_amount = total_price
        .checked_sub(lp_fee)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_sub(taker_fee as u64)
        .ok_or(MMMErrorCode::NumericOverflow)?
        .checked_sub(royalty_paid)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    if payment_amount < args.min_payment_amount {
        return Err(MMMErrorCode::InvalidRequestedPrice.into());
    }

    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::transfer(
            buyside_sol_escrow_account.key,
            &payer.key,
            payment_amount,
        ),
        &[
            buyside_sol_escrow_account.to_account_info(),
            payer.to_account_info(),
            system_program.to_account_info(),
        ],
        buyside_sol_escrow_account_seeds,
    )?;

    // 6. Pay lp fee
    if lp_fee > 0 {
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                buyside_sol_escrow_account.key,
                owner.key,
                lp_fee,
            ),
            &[
                buyside_sol_escrow_account.to_account_info(),
                owner.to_account_info(),
                system_program.to_account_info(),
            ],
            buyside_sol_escrow_account_seeds,
        )?;
    }

    // 7. Pay referral fee
    if referral_fee > 0 {
        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::transfer(
                buyside_sol_escrow_account.key,
                referral.key,
                referral_fee,
            ),
            &[
                buyside_sol_escrow_account.to_account_info(),
                referral.to_account_info(),
                system_program.to_account_info(),
            ],
            buyside_sol_escrow_account_seeds,
        )?;
    }

    // 8. try close accounts
    try_close_escrow(
        &buyside_sol_escrow_account.to_account_info(),
        pool,
        system_program,
        buyside_sol_escrow_account_seeds,
    )?;
    try_close_sell_state(sell_state, payer.to_account_info())?;

    // 9. Return the remaining per pool escrow balance to the shared escrow account
    if pool.using_shared_escrow() {
        let min_rent = Rent::get()?.minimum_balance(0);
        let shared_escrow_account = index_ra!(remaining_accounts, 1).to_account_info();
        if shared_escrow_account.lamports() + buyside_sol_escrow_account.lamports() > min_rent
            && buyside_sol_escrow_account.lamports() > 0
        {
            anchor_lang::solana_program::program::invoke_signed(
                &anchor_lang::solana_program::system_instruction::transfer(
                    buyside_sol_escrow_account.key,
                    shared_escrow_account.key,
                    buyside_sol_escrow_account.lamports(),
                ),
                &[
                    buyside_sol_escrow_account.to_account_info(),
                    shared_escrow_account,
                    system_program.to_account_info(),
                ],
                buyside_sol_escrow_account_seeds,
            )?;
        } else {
            try_close_escrow(
                buyside_sol_escrow_account,
                pool,
                system_program,
                buyside_sol_escrow_account_seeds,
            )?;
        }
    }

    // 10. update pool state and log
    pool.lp_fee_earned = pool
        .lp_fee_earned
        .checked_add(lp_fee)
        .ok_or(MMMErrorCode::NumericOverflow)?;
    pool.spot_price = next_price;
    pool.buyside_payment_amount = buyside_sol_escrow_account.lamports();

    log_pool("post_sol_cnft_fulfill_buy", pool)?;
    try_close_pool(pool, owner.to_account_info())?;

    Ok(())
}
