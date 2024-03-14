import { PROGRAM_ID as AUTH_RULES_PROGRAM_ID } from '@metaplex-foundation/mpl-token-auth-rules';
import { MPL_TOKEN_METADATA_PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import * as anchor from '@project-serum/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount as getTokenAccount,
} from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from '@solana/web3.js';
import { assert } from 'chai';
import {
  AllowlistKind,
  CurveKind,
  IDL,
  M2_PROGRAM,
  MMMProgramID,
  Mmm,
  getM2BuyerSharedEscrow,
  getMMMSellStatePDA,
  getSolFulfillBuyPrices,
  getTokenRecordPDA,
} from '../sdk/src';
import {
  MIP1_COMPUTE_UNITS,
  SIGNATURE_FEE_LAMPORTS,
  airdrop,
  assertTx,
  createDefaultTokenAuthorizationRules,
  createPoolWithExampleDeposits,
  createPoolWithExampleMip1Deposits,
  getMetaplexInstance,
  getSellStatePDARent,
  getTokenAccountRent,
  sendAndAssertTx,
} from './utils';

describe('shared-escrow mmm-fulfill-linear', () => {
  const { connection } = anchor.AnchorProvider.env();
  const wallet = new anchor.Wallet(Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: 'processed',
  });
  const program = new anchor.Program(
    IDL,
    MMMProgramID,
    provider,
  ) as anchor.Program<Mmm>;
  const cosigner = Keypair.generate();

  beforeEach(async () => {
    await airdrop(connection, wallet.publicKey, 50);
  });

  it('can fullfill buy with shared-escrow for vanila nfts', async () => {
    const seller = Keypair.generate();
    const buyerSharedEscrow = getM2BuyerSharedEscrow(wallet.publicKey).key;
    const metaplexInstance = getMetaplexInstance(connection);
    const [poolData] = await Promise.all([
      createPoolWithExampleDeposits(
        program,
        connection,
        [AllowlistKind.mcc],
        {
          owner: wallet.publicKey,
          cosigner,
          curveType: CurveKind.linear,
          curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(new anchor.BN(10)), // 0.1 SOL
          expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
          referralBp: 200,
          reinvestFulfillBuy: false,
          reinvestFulfillSell: false,
        },
        'buy',
        TOKEN_PROGRAM_ID,
        seller.publicKey,
        true, // sharedEscrow
        4, // can be fulfilled 4 times, one more than the sft amount to be tested
      ),
      airdrop(connection, seller.publicKey, 10),
      airdrop(connection, buyerSharedEscrow, 10),
    ]);

    const ownerExtraSftAtaAddress = await getAssociatedTokenAddress(
      poolData.extraSft.mintAddress,
      wallet.publicKey,
    );
    let initWalletBalance = await connection.getBalance(wallet.publicKey);
    let initReferralBalance = await connection.getBalance(
      poolData.referral.publicKey,
    );
    let initSellerBalance = await connection.getBalance(seller.publicKey);
    let initBuyerSharedEscrowBalance = await connection.getBalance(
      buyerSharedEscrow,
    );
    let totalMakerFees = 0;

    {
      const expectedTakerFees = 2.7 * LAMPORTS_PER_SOL * 0.04;
      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        poolData.extraSft.mintAddress,
      );
      const tx = await program.methods
        .solFulfillBuy({
          assetAmount: new anchor.BN(3),
          minPaymentAmount: new anchor.BN(
            2.7 * LAMPORTS_PER_SOL - expectedTakerFees,
          ),
          allowlistAux: '',
          takerFeeBp: 400,
          makerFeeBp: -100,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: poolData.poolPaymentEscrow,
          assetMetadata: poolData.extraSft.metadataAddress,
          assetMasterEdition: metaplexInstance
            .nfts()
            .pdas()
            .masterEdition({ mint: poolData.extraSft.mintAddress }),
          assetMint: poolData.extraSft.mintAddress,
          payerAssetAccount: poolData.extraSft.tokenAddress!,
          sellsideEscrowTokenAccount: poolData.poolAtaExtraSft,
          ownerTokenAccount: ownerExtraSftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          sellState,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .remainingAccounts([
          {
            pubkey: M2_PROGRAM,
            isWritable: false,
            isSigner: false,
          },
          {
            pubkey: buyerSharedEscrow,
            isWritable: true,
            isSigner: false,
          },
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = seller.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, seller);

      const txId = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
      });
      const confirmedTx = await connection.confirmTransaction(
        {
          signature: txId,
          blockhash: blockhashData.blockhash,
          lastValidBlockHeight: blockhashData.lastValidBlockHeight,
        },
        'processed',
      );
      assertTx(txId, confirmedTx);
      assert.equal(await connection.getBalance(sellState), 0);
    }

    const tokenAccountRent = await getTokenAccountRent(connection);
    const sellStatePDARent = await getSellStatePDARent(connection);
    {
      const expectedTakerFees = 2.7 * LAMPORTS_PER_SOL * 0.04;
      const expectedMakerFees = 2.7 * LAMPORTS_PER_SOL * -0.01;
      const expectedReferralFees = expectedTakerFees + expectedMakerFees;
      totalMakerFees += expectedMakerFees;
      const [
        sellerBalance,
        referralBalance,
        poolAtaBalance,
        poolEscrowBalance,
        afterWalletBalance,
        afterSharedEscrowBalance,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(poolData.poolAtaSft),
        connection.getBalance(poolData.poolPaymentEscrow),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(buyerSharedEscrow),
      ]);
      assert.equal(
        sellerBalance,
        initSellerBalance +
          2.7 * LAMPORTS_PER_SOL -
          (SIGNATURE_FEE_LAMPORTS * 2 + tokenAccountRent) -
          expectedTakerFees,
      );
      assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
      assert.equal(poolAtaBalance, 0);
      assert.equal(poolEscrowBalance, 0); // because it's shared escrow, so the pool escrow is empty
      assert.equal(afterWalletBalance, initWalletBalance);
      assert.notEqual(afterSharedEscrowBalance, 0);
      assert.equal(
        initBuyerSharedEscrowBalance - afterSharedEscrowBalance,
        2.7 * LAMPORTS_PER_SOL + expectedMakerFees,
      );

      initReferralBalance = referralBalance;
      initSellerBalance = sellerBalance;
    }

    let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assert.equal(poolAccountInfo.spotPrice.toNumber(), 0.7 * LAMPORTS_PER_SOL);
    assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
    assert.equal(poolAccountInfo.buysidePaymentAmount.toNumber(), 0);
  });

  it.only('can fulfill buy with shared escrow for mip1 nfts', async () => {
    const DEFAULT_ACCOUNTS = {
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      authorizationRulesProgram: AUTH_RULES_PROGRAM_ID,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    };
    const seller = Keypair.generate();
    const nftCreator = Keypair.generate();
    await airdrop(connection, nftCreator.publicKey, 10);
    const rulesRes = await createDefaultTokenAuthorizationRules(
      connection,
      nftCreator,
      'test',
    );
    const defaultRules = rulesRes.ruleSetAddress;
    const buyerSharedEscrow = getM2BuyerSharedEscrow(wallet.publicKey).key;
    await airdrop(connection, buyerSharedEscrow, 10);

    const [poolData] = await Promise.all([
      createPoolWithExampleMip1Deposits(
        program,
        {
          owner: wallet.publicKey,
          cosigner,
          spotPrice: new anchor.BN(2.2 * LAMPORTS_PER_SOL),
          curveDelta: new anchor.BN(1 * LAMPORTS_PER_SOL),
          curveType: CurveKind.linear,
          reinvestFulfillBuy: false,
          reinvestFulfillSell: false,
        },
        'buy',
        nftCreator,
        TOKEN_PROGRAM_ID,
        seller.publicKey,
        defaultRules,
        true, // sharedEscrow
      ),
      airdrop(connection, seller.publicKey, 10),
    ]);

    const [
      initSellerBalance,
      initPaymentEscrowBalance,
      initCreatorBalance,
      initReferralBalance,
      sellStateAccountRent,
      initBuyerSharedEscrowBalance,
    ] = await Promise.all([
      connection.getBalance(seller.publicKey),
      connection.getBalance(poolData.poolPaymentEscrow),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      getSellStatePDARent(connection),
      connection.getBalance(buyerSharedEscrow),
    ]);

    const { key: sellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      poolData.extraNft.mintAddress,
    );

    const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
      poolData.extraNft.mintAddress,
      wallet.publicKey,
    );

    // sale price should be 2.2 SOL
    // with taker fee and royalties should be 2.2 / (1 + 0.015) * (1 - 0.005) ~ 2.157 SOL
    const expectedBuyPrices = getSolFulfillBuyPrices({
      totalPriceLamports: 2.2 * LAMPORTS_PER_SOL,
      takerFeeBp: 50,
      metadataRoyaltyBp: 150,
      buysideCreatorRoyaltyBp: 10000,
      lpFeeBp: 0,
      makerFeeBp: 350,
    });

    const tx = await program.methods
      .solMip1FulfillBuy({
        assetAmount: new anchor.BN(1),
        minPaymentAmount: expectedBuyPrices.sellerReceives,
        allowlistAux: null,
        makerFeeBp: 350,
        takerFeeBp: 50,
      })
      .accountsStrict({
        payer: seller.publicKey,
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        referral: poolData.referral.publicKey,
        pool: poolData.poolKey,
        buysideSolEscrowAccount: poolData.poolPaymentEscrow,
        assetMetadata: poolData.extraNft.metadataAddress,
        assetMint: poolData.extraNft.mintAddress,
        assetMasterEdition: poolData.extraNft.masterEditionAddress,
        payerAssetAccount: poolData.extraNft.tokenAddress,
        sellsideEscrowTokenAccount: poolData.poolAtaExtraNft,
        ownerTokenAccount: ownerExtraNftAtaAddress,
        allowlistAuxAccount: SystemProgram.programId,
        sellState,
        tokenOwnerTokenRecord: getTokenRecordPDA(
          poolData.extraNft.mintAddress,
          poolData.extraNft.tokenAddress,
        ).key,
        poolTokenRecord: getTokenRecordPDA(
          poolData.extraNft.mintAddress,
          poolData.poolAtaExtraNft,
        ).key,
        poolOwnerTokenRecord: getTokenRecordPDA(
          poolData.extraNft.mintAddress,
          ownerExtraNftAtaAddress,
        ).key,
        authorizationRules: defaultRules,
        ...DEFAULT_ACCOUNTS,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: MIP1_COMPUTE_UNITS }),
      ])
      .remainingAccounts([
        {
          pubkey: M2_PROGRAM,
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: buyerSharedEscrow,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: poolData.nftCreator.publicKey,
          isSigner: false,
          isWritable: true,
        },
      ])
      .transaction();

    const blockhashData = await connection.getLatestBlockhash();
    tx.feePayer = seller.publicKey;
    tx.recentBlockhash = blockhashData.blockhash;
    tx.partialSign(cosigner, seller);
    await sendAndAssertTx(connection, tx, blockhashData, false);

    const expectedReferralFees =
      expectedBuyPrices.makerFeePaid.toNumber() +
      expectedBuyPrices.takerFeePaid.toNumber();
    const [
      sellerBalance,
      paymentEscrowAccount,
      paymentEscrowBalance,
      creatorBalance,
      referralBalance,
      afterBuyerSharedEscrowBalance,
    ] = await Promise.all([
      connection.getBalance(seller.publicKey),
      connection.getAccountInfo(poolData.poolPaymentEscrow),
      connection.getBalance(poolData.poolPaymentEscrow),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      connection.getBalance(buyerSharedEscrow),
    ]);

    assert.equal(
      sellerBalance,
      initSellerBalance +
        expectedBuyPrices.sellerReceives.toNumber() -
        SIGNATURE_FEE_LAMPORTS * 2,
    );
    assert.equal(
      initBuyerSharedEscrowBalance - afterBuyerSharedEscrowBalance,
      2.2 * LAMPORTS_PER_SOL + expectedBuyPrices.makerFeePaid.toNumber(),
    );
    assert.equal(paymentEscrowBalance, 0);
    assert.isNull(paymentEscrowAccount);
    assert.equal(
      creatorBalance,
      initCreatorBalance + expectedBuyPrices.royaltyPaid.toNumber(),
    );
    assert.equal(referralBalance, initReferralBalance + expectedReferralFees);

    const poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
    assert.equal(poolAccountInfo.spotPrice.toNumber(), 1.2 * LAMPORTS_PER_SOL);
  });

  it('can fulfill buy with shared escrow for mip1 nfts that will close the pool due to not enough cap', async () => {
    const DEFAULT_ACCOUNTS = {
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      authorizationRulesProgram: AUTH_RULES_PROGRAM_ID,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    };
    const seller = Keypair.generate();
    const nftCreator = Keypair.generate();
    await airdrop(connection, nftCreator.publicKey, 10);
    const rulesRes = await createDefaultTokenAuthorizationRules(
      connection,
      nftCreator,
      'test',
    );
    const defaultRules = rulesRes.ruleSetAddress;
    const buyerSharedEscrow = getM2BuyerSharedEscrow(wallet.publicKey).key;
    await airdrop(connection, buyerSharedEscrow, 10);

    const [poolData] = await Promise.all([
      createPoolWithExampleMip1Deposits(
        program,
        {
          owner: wallet.publicKey,
          cosigner,
          spotPrice: new anchor.BN(2.2 * LAMPORTS_PER_SOL),
          curveDelta: new anchor.BN(1 * LAMPORTS_PER_SOL),
          curveType: CurveKind.linear,
          reinvestFulfillBuy: false,
          reinvestFulfillSell: false,
        },
        'buy',
        nftCreator,
        TOKEN_PROGRAM_ID,
        seller.publicKey,
        defaultRules,
        true, // sharedEscrow
        1, // just enough sol to cover the first fulfilment
      ),
      airdrop(connection, seller.publicKey, 10),
    ]);

    const [
      initSellerBalance,
      initPaymentEscrowBalance,
      initCreatorBalance,
      initReferralBalance,
      sellStateAccountRent,
      initBuyerSharedEscrowBalance,
    ] = await Promise.all([
      connection.getBalance(seller.publicKey),
      connection.getBalance(poolData.poolPaymentEscrow),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      getSellStatePDARent(connection),
      connection.getBalance(buyerSharedEscrow),
    ]);

    const { key: sellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      poolData.extraNft.mintAddress,
    );

    const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
      poolData.extraNft.mintAddress,
      wallet.publicKey,
    );

    // sale price should be 2.2 SOL
    // with taker fee and royalties should be 2.2 / (1 + 0.015) * (1 - 0.005) ~ 2.157 SOL
    const expectedBuyPrices = getSolFulfillBuyPrices({
      totalPriceLamports: 2.2 * LAMPORTS_PER_SOL,
      takerFeeBp: 50,
      metadataRoyaltyBp: 150,
      buysideCreatorRoyaltyBp: 10000,
      lpFeeBp: 0,
      makerFeeBp: 350,
    });

    const tx = await program.methods
      .solMip1FulfillBuy({
        assetAmount: new anchor.BN(1),
        minPaymentAmount: expectedBuyPrices.sellerReceives,
        allowlistAux: null,
        makerFeeBp: 350,
        takerFeeBp: 50,
      })
      .accountsStrict({
        payer: seller.publicKey,
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        referral: poolData.referral.publicKey,
        pool: poolData.poolKey,
        buysideSolEscrowAccount: poolData.poolPaymentEscrow,
        assetMetadata: poolData.extraNft.metadataAddress,
        assetMint: poolData.extraNft.mintAddress,
        assetMasterEdition: poolData.extraNft.masterEditionAddress,
        payerAssetAccount: poolData.extraNft.tokenAddress,
        sellsideEscrowTokenAccount: poolData.poolAtaExtraNft,
        ownerTokenAccount: ownerExtraNftAtaAddress,
        allowlistAuxAccount: SystemProgram.programId,
        sellState,
        tokenOwnerTokenRecord: getTokenRecordPDA(
          poolData.extraNft.mintAddress,
          poolData.extraNft.tokenAddress,
        ).key,
        poolTokenRecord: getTokenRecordPDA(
          poolData.extraNft.mintAddress,
          poolData.poolAtaExtraNft,
        ).key,
        poolOwnerTokenRecord: getTokenRecordPDA(
          poolData.extraNft.mintAddress,
          ownerExtraNftAtaAddress,
        ).key,
        authorizationRules: defaultRules,
        ...DEFAULT_ACCOUNTS,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: MIP1_COMPUTE_UNITS }),
      ])
      .remainingAccounts([
        {
          pubkey: M2_PROGRAM,
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: buyerSharedEscrow,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: poolData.nftCreator.publicKey,
          isSigner: false,
          isWritable: true,
        },
      ])
      .transaction();

    const blockhashData = await connection.getLatestBlockhash();
    tx.feePayer = seller.publicKey;
    tx.recentBlockhash = blockhashData.blockhash;
    tx.partialSign(cosigner, seller);
    await sendAndAssertTx(connection, tx, blockhashData, false);

    const expectedReferralFees =
      expectedBuyPrices.makerFeePaid.toNumber() +
      expectedBuyPrices.takerFeePaid.toNumber();
    const [
      sellerBalance,
      paymentEscrowAccount,
      paymentEscrowBalance,
      creatorBalance,
      referralBalance,
      afterBuyerSharedEscrowBalance,
    ] = await Promise.all([
      connection.getBalance(seller.publicKey),
      connection.getAccountInfo(poolData.poolPaymentEscrow),
      connection.getBalance(poolData.poolPaymentEscrow),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      connection.getBalance(buyerSharedEscrow),
    ]);

    assert.equal(
      sellerBalance,
      initSellerBalance +
        expectedBuyPrices.sellerReceives.toNumber() -
        SIGNATURE_FEE_LAMPORTS * 2,
    );
    assert.equal(
      initBuyerSharedEscrowBalance - afterBuyerSharedEscrowBalance,
      2.2 * LAMPORTS_PER_SOL + expectedBuyPrices.makerFeePaid.toNumber(),
    );
    assert.equal(paymentEscrowBalance, 0);
    assert.isNull(paymentEscrowAccount);
    assert.equal(
      creatorBalance,
      initCreatorBalance + expectedBuyPrices.royaltyPaid.toNumber(),
    );
    assert.equal(referralBalance, initReferralBalance + expectedReferralFees);

    const poolAccountInfo = await program.account.pool.fetchNullable(
      poolData.poolKey,
    );
    assert.isNull(poolAccountInfo);
  });
});
