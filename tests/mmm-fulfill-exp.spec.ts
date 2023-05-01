import * as anchor from '@project-serum/anchor';
import {
  getAssociatedTokenAddress,
  getAccount as getTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { assert } from 'chai';
import {
  Mmm,
  AllowlistKind,
  CurveKind,
  getMMMSellStatePDA,
  IDL,
  MMMProgramID,
} from '../sdk/src';
import {
  airdrop,
  assertIsBetween,
  assertTx,
  createPoolWithExampleDeposits,
  getMetaplexInstance,
  getSellStatePDARent,
  getTokenAccountRent,
  LAMPORT_ERROR_RANGE,
  PRICE_ERROR_RANGE,
  SIGNATURE_FEE_LAMPORTS,
} from './utils';

describe('mmm-fulfill-exp', () => {
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

  it('Sellside only', async () => {
    const buyer = Keypair.generate();
    const metaplexInstance = getMetaplexInstance(connection);
    const [poolData] = await Promise.all([
      createPoolWithExampleDeposits(
        program,
        connection,
        [AllowlistKind.fvca],
        {
          owner: wallet.publicKey,
          cosigner,
          curveType: CurveKind.exp,
          curveDelta: new anchor.BN(200), // 200 basis points
          expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
          reinvestFulfillBuy: true,
          reinvestFulfillSell: true,
        },
        'sell',
      ),
      airdrop(connection, buyer.publicKey, 20),
    ]);

    const buyerNftAtaAddress = await getAssociatedTokenAddress(
      poolData.nft.mintAddress,
      buyer.publicKey,
    );
    const { key: sellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      poolData.nft.mintAddress,
    );
    let initWalletBalance = await connection.getBalance(wallet.publicKey);
    let initReferralBalance = await connection.getBalance(
      poolData.referral.publicKey,
    );
    let initBuyerBalance = await connection.getBalance(buyer.publicKey);

    {
      const expectedTakerFees = 1.02 * LAMPORTS_PER_SOL * 0.01;
      const tx = await program.methods
        .solFulfillSell({
          assetAmount: new anchor.BN(1),
          maxPaymentAmount: new anchor.BN(
            1.02 * LAMPORTS_PER_SOL + expectedTakerFees,
          ),
          buysideCreatorRoyaltyBp: 0,
          allowlistAux: '',
          takerFeeBp: 100,
          makerFeeBp: 0,
        })
        .accountsStrict({
          payer: buyer.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: poolData.poolPaymentEscrow,
          assetMetadata: poolData.nft.metadataAddress,
          assetMasterEdition: metaplexInstance
            .nfts()
            .pdas()
            .masterEdition({ mint: poolData.nft.mintAddress }),
          assetMint: poolData.nft.mintAddress,
          sellsideEscrowTokenAccount: poolData.poolAtaNft,
          payerAssetAccount: buyerNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          sellState,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = buyer.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, buyer);

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
    }

    const tokenAccountRent = await getTokenAccountRent(connection);
    const sellStatePDARent = await getSellStatePDARent(connection);

    const expectedTxFees =
      SIGNATURE_FEE_LAMPORTS * 2 + // cosigner + payer
      tokenAccountRent; // token account
    {
      const expectedTakerFees = 1.02 * LAMPORTS_PER_SOL * 0.01;
      const expectedReferralFees = expectedTakerFees;
      const [
        buyerBalance,
        referralBalance,
        poolAtaBalance,
        poolEscrowBalance,
        afterWalletBalance,
        sellStateBalance,
      ] = await Promise.all([
        connection.getBalance(buyer.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(poolData.poolAtaNft),
        connection.getBalance(poolData.poolPaymentEscrow),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(sellState),
      ]);
      assert.equal(
        buyerBalance,
        initBuyerBalance -
          1.02 * LAMPORTS_PER_SOL -
          expectedTxFees -
          expectedTakerFees,
      );
      assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
      assert.equal(poolAtaBalance, 0);
      assert.equal(poolEscrowBalance, 1.02 * LAMPORTS_PER_SOL);
      assertIsBetween(
        afterWalletBalance,
        initWalletBalance + tokenAccountRent + sellStatePDARent,
        LAMPORT_ERROR_RANGE,
      );
      assert.equal(sellStateBalance, 0);

      initReferralBalance = referralBalance;
      initBuyerBalance = buyerBalance;
    }

    let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assert.equal(poolAccountInfo.spotPrice.toNumber(), 1.02 * LAMPORTS_PER_SOL);
    assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 5);
    assert.equal(
      poolAccountInfo.buysidePaymentAmount.toNumber(),
      1.02 * LAMPORTS_PER_SOL,
    );

    const buyerSftAtaAddress = await getAssociatedTokenAddress(
      poolData.sft.mintAddress,
      buyer.publicKey,
    );
    {
      // update pool to reinvest = false and price to 2.1
      // since spot price > escrow, no LP fees are paid
      await program.methods
        .updatePool({
          curveType: CurveKind.exp,
          curveDelta: new anchor.BN(500),
          spotPrice: new anchor.BN(2.1 * LAMPORTS_PER_SOL),
          reinvestFulfillBuy: false,
          reinvestFulfillSell: false,
          expiry: new anchor.BN(0),
          lpFeeBp: 200,
          referral: poolData.referral.publicKey,
          cosignerAnnotation: new Array(32).fill(0).map((_, index) => index),
          buysideCreatorRoyaltyBp: 0,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolData.poolKey,
        })
        .signers([cosigner])
        .rpc();

      initWalletBalance = await connection.getBalance(wallet.publicKey);
      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        poolData.sft.mintAddress,
      );
      // total price should be 2.1 * 1.05 + 2.1 * 1.05^2 = 4.52025
      const expectedTakerFees = 4.52025 * LAMPORTS_PER_SOL * 0.015;
      const tx = await program.methods
        .solFulfillSell({
          assetAmount: new anchor.BN(2),
          maxPaymentAmount: new anchor.BN(
            4.52025 * LAMPORTS_PER_SOL + expectedTakerFees,
          ),
          buysideCreatorRoyaltyBp: 0,
          allowlistAux: '',
          takerFeeBp: 150,
          makerFeeBp: 200,
        })
        .accountsStrict({
          payer: buyer.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: poolData.poolPaymentEscrow,
          assetMetadata: poolData.sft.metadataAddress,
          assetMasterEdition: metaplexInstance
            .nfts()
            .pdas()
            .masterEdition({ mint: poolData.sft.mintAddress }),
          assetMint: poolData.sft.mintAddress,
          sellsideEscrowTokenAccount: poolData.poolAtaSft,
          payerAssetAccount: buyerSftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          sellState,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = buyer.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, buyer);

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
    }

    {
      const expectedTakerFees = 4.52025 * LAMPORTS_PER_SOL * 0.015;
      const expectedMakerFees = 4.52025 * LAMPORTS_PER_SOL * 0.02;
      const expectedReferralFees = expectedMakerFees + expectedTakerFees;
      const [
        buyerBalance,
        referralBalance,
        poolAtaBalance,
        poolEscrowBalance,
        afterWalletBalance,
      ] = await Promise.all([
        connection.getBalance(buyer.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(poolData.poolAtaSft),
        connection.getBalance(poolData.poolPaymentEscrow),
        connection.getBalance(wallet.publicKey),
      ]);
      assert.equal(
        buyerBalance,
        initBuyerBalance -
          4.52025 * LAMPORTS_PER_SOL -
          expectedTxFees -
          expectedTakerFees,
      );
      assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
      assert.equal(poolAtaBalance, tokenAccountRent);
      assert.equal(poolEscrowBalance, 1.02 * LAMPORTS_PER_SOL);
      assert.equal(
        afterWalletBalance,
        initWalletBalance + 4.52025 * LAMPORTS_PER_SOL - expectedMakerFees,
      );

      initReferralBalance = referralBalance;
      initBuyerBalance = buyerBalance;
    }

    {
      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        poolData.sft.mintAddress,
      );
      const sellStateAccountInfo = await program.account.sellState.fetch(
        sellState,
      );
      assert.equal(
        sellStateAccountInfo.pool.toBase58(),
        poolData.poolKey.toBase58(),
      );
      assert.equal(
        sellStateAccountInfo.assetMint.toBase58(),
        poolData.sft.mintAddress.toBase58(),
      );
      assert.equal(sellStateAccountInfo.assetAmount.toNumber(), 3);
    }

    poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    // spot price is 2.1 * 1.05^2 = 2.31525
    assert.equal(
      poolAccountInfo.spotPrice.toNumber(),
      2.31525 * LAMPORTS_PER_SOL,
    );
    assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 3);
    assert.equal(
      poolAccountInfo.buysidePaymentAmount.toNumber(),
      1.02 * LAMPORTS_PER_SOL,
    );

    {
      initWalletBalance = await connection.getBalance(wallet.publicKey);
      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        poolData.sft.mintAddress,
      );
      // price is now 2.31525 * 1.05 = 2.431025
      const tx = await program.methods
        .solFulfillSell({
          assetAmount: new anchor.BN(1),
          maxPaymentAmount: new anchor.BN(2.4310125 * LAMPORTS_PER_SOL),
          buysideCreatorRoyaltyBp: 0,
          allowlistAux: '',
          makerFeeBp: 400,
          takerFeeBp: 0,
        })
        .accountsStrict({
          payer: buyer.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: poolData.poolPaymentEscrow,
          assetMetadata: poolData.sft.metadataAddress,
          assetMasterEdition: metaplexInstance
            .nfts()
            .pdas()
            .masterEdition({ mint: poolData.sft.mintAddress }),
          assetMint: poolData.sft.mintAddress,
          sellsideEscrowTokenAccount: poolData.poolAtaSft,
          payerAssetAccount: buyerSftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          sellState,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = buyer.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, buyer);

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
    }

    {
      const expectedMakerFees = 2.4310125 * LAMPORTS_PER_SOL * 0.04;
      const expectedReferralFees = expectedMakerFees;
      const [
        buyerBalance,
        referralBalance,
        poolAtaBalance,
        poolEscrowBalance,
        afterWalletBalance,
      ] = await Promise.all([
        connection.getBalance(buyer.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(poolData.poolAtaSft),
        connection.getBalance(poolData.poolPaymentEscrow),
        connection.getBalance(wallet.publicKey),
      ]);
      assert.equal(
        buyerBalance,
        initBuyerBalance -
          2.4310125 * LAMPORTS_PER_SOL -
          (expectedTxFees - tokenAccountRent), // token account has already been created
      );
      assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
      assert.equal(poolAtaBalance, tokenAccountRent);
      assert.equal(poolEscrowBalance, 1.02 * LAMPORTS_PER_SOL);
      assert.equal(
        afterWalletBalance,
        initWalletBalance + 2.4310125 * LAMPORTS_PER_SOL - expectedMakerFees,
      );

      initReferralBalance = referralBalance;
      initBuyerBalance = buyerBalance;
    }

    poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assert.equal(
      poolAccountInfo.spotPrice.toNumber(),
      2.4310125 * LAMPORTS_PER_SOL,
    );
    assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 2);
    assert.equal(
      poolAccountInfo.buysidePaymentAmount.toNumber(),
      1.02 * LAMPORTS_PER_SOL,
    );

    {
      initWalletBalance = await connection.getBalance(wallet.publicKey);
      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        poolData.sft.mintAddress,
      );
      // price is now 2.4310125 * 1.05 = 2.552563125
      const expectedTakerFees = 2.552563125 * LAMPORTS_PER_SOL * 0.01;
      const tx = await program.methods
        .solFulfillSell({
          assetAmount: new anchor.BN(1),
          maxPaymentAmount: new anchor.BN(
            2.552563125 * LAMPORTS_PER_SOL + expectedTakerFees,
          ),
          buysideCreatorRoyaltyBp: 0,
          allowlistAux: '',
          makerFeeBp: -50,
          takerFeeBp: 100,
        })
        .accountsStrict({
          payer: buyer.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: poolData.poolPaymentEscrow,
          assetMetadata: poolData.sft.metadataAddress,
          assetMasterEdition: metaplexInstance
            .nfts()
            .pdas()
            .masterEdition({ mint: poolData.sft.mintAddress }),
          assetMint: poolData.sft.mintAddress,
          sellsideEscrowTokenAccount: poolData.poolAtaSft,
          payerAssetAccount: buyerSftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          sellState,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = buyer.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, buyer);

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
    }

    {
      const expectedMakerFees = Math.ceil(
        2.552563125 * LAMPORTS_PER_SOL * -0.005,
      );
      const expectedTakerFees = Math.floor(
        2.552563125 * LAMPORTS_PER_SOL * 0.01,
      );
      const expectedReferralFees = expectedMakerFees + expectedTakerFees;
      const [
        buyerBalance,
        referralBalance,
        poolAtaBalance,
        poolEscrowBalance,
        afterWalletBalance,
      ] = await Promise.all([
        connection.getBalance(buyer.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(poolData.poolAtaSft),
        connection.getBalance(poolData.poolPaymentEscrow),
        connection.getBalance(wallet.publicKey),
      ]);
      assert.equal(
        buyerBalance,
        initBuyerBalance -
          2.552563125 * LAMPORTS_PER_SOL -
          expectedTakerFees -
          (expectedTxFees - tokenAccountRent), // token account has already been created
      );
      assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
      assert.equal(poolAtaBalance, tokenAccountRent);
      assert.equal(poolEscrowBalance, 1.02 * LAMPORTS_PER_SOL);
      assert.equal(
        afterWalletBalance,
        initWalletBalance + 2.552563125 * LAMPORTS_PER_SOL - expectedMakerFees,
      );
    }

    poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assert.equal(
      poolAccountInfo.spotPrice.toNumber(),
      2.552563125 * LAMPORTS_PER_SOL,
    );
    assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
  });

  it('Buyside only', async () => {
    const seller = Keypair.generate();
    const metaplexInstance = getMetaplexInstance(connection);
    const [poolData] = await Promise.all([
      createPoolWithExampleDeposits(
        program,
        connection,
        [AllowlistKind.mcc],
        {
          owner: wallet.publicKey,
          cosigner,
          curveType: CurveKind.exp,
          curveDelta: new anchor.BN(1000), // 1000 bp
          expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
          referralBp: 200,
          reinvestFulfillBuy: false,
          reinvestFulfillSell: false,
        },
        'buy',
        seller.publicKey,
      ),
      airdrop(connection, seller.publicKey, 10),
    ]);

    const ownerExtraSftAtaAddress = await getAssociatedTokenAddress(
      poolData.extraSft.mintAddress,
      wallet.publicKey,
    );
    let [
      initWalletBalance,
      initReferralBalance,
      initSellerBalance,
      initPaymentEscrowBalance,
    ] = await Promise.all([
      connection.getBalance(wallet.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      connection.getBalance(seller.publicKey),
      connection.getBalance(poolData.poolPaymentEscrow),
    ]);

    let expectedTotalPrice = 1 + 1 / 1.1 + 1 / 1.1 ** 2;
    {
      // total price: 1 + 1 / 1.1 + 1 / 1.1^2 ~ 2.735537190
      const expectedTakerFees = expectedTotalPrice * LAMPORTS_PER_SOL * 0.04;
      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        poolData.extraSft.mintAddress,
      );
      const tx = await program.methods
        .solFulfillBuy({
          assetAmount: new anchor.BN(3),
          minPaymentAmount: new anchor.BN(
            expectedTotalPrice * LAMPORTS_PER_SOL -
              expectedTakerFees -
              PRICE_ERROR_RANGE,
          ),
          allowlistAux: '',
          takerFeeBp: 400,
          makerFeeBp: 100,
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
      const expectedTakerFees = expectedTotalPrice * LAMPORTS_PER_SOL * 0.04;
      const expectedMakerFees = expectedTotalPrice * LAMPORTS_PER_SOL * 0.01;
      const expectedReferralFees = expectedTakerFees + expectedMakerFees;
      const [
        sellerBalance,
        referralBalance,
        poolAtaBalance,
        poolEscrowBalance,
        afterWalletBalance,
        ownerSftTokenAccount,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(poolData.poolAtaSft),
        connection.getBalance(poolData.poolPaymentEscrow),
        connection.getBalance(wallet.publicKey),
        getTokenAccount(connection, ownerExtraSftAtaAddress),
      ]);
      assertIsBetween(
        sellerBalance,
        initSellerBalance +
          expectedTotalPrice * LAMPORTS_PER_SOL -
          (SIGNATURE_FEE_LAMPORTS * 2 + tokenAccountRent) -
          expectedTakerFees,
        PRICE_ERROR_RANGE,
      );
      assertIsBetween(
        referralBalance,
        initReferralBalance + expectedReferralFees,
        PRICE_ERROR_RANGE,
      );
      assert.equal(poolAtaBalance, 0);
      assertIsBetween(
        poolEscrowBalance,
        initPaymentEscrowBalance -
          expectedTotalPrice * LAMPORTS_PER_SOL -
          expectedMakerFees,
        PRICE_ERROR_RANGE,
      );
      assert.equal(afterWalletBalance, initWalletBalance);
      assert.equal(
        ownerSftTokenAccount.owner.toBase58(),
        wallet.publicKey.toBase58(),
      );
      assert.equal(Number(ownerSftTokenAccount.amount), 3);

      initReferralBalance = referralBalance;
      initSellerBalance = sellerBalance;
      initPaymentEscrowBalance = poolEscrowBalance;
    }

    let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assertIsBetween(
      poolAccountInfo.spotPrice.toNumber(),
      (1 / 1.1 ** 3) * LAMPORTS_PER_SOL,
      PRICE_ERROR_RANGE,
    );
    assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
    assert.equal(
      poolAccountInfo.buysidePaymentAmount.toNumber(),
      initPaymentEscrowBalance,
    );

    const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
      poolData.extraNft.mintAddress,
      wallet.publicKey,
    );

    expectedTotalPrice = 0.5;
    {
      // update pool to reinvest = true and price to 0.5
      // since spot price < escrow, LP fees are paid
      await program.methods
        .updatePool({
          curveType: CurveKind.exp,
          curveDelta: new anchor.BN(125), // 125 bp
          spotPrice: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
          reinvestFulfillBuy: true,
          reinvestFulfillSell: true,
          expiry: new anchor.BN(0),
          lpFeeBp: 200,
          referral: poolData.referral.publicKey,
          cosignerAnnotation: new Array(32).fill(0).map((_, index) => index),
          buysideCreatorRoyaltyBp: 0,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolData.poolKey,
        })
        .signers([cosigner])
        .rpc();

      initWalletBalance = await connection.getBalance(wallet.publicKey);
      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        poolData.extraNft.mintAddress,
      );
      const tx = await program.methods
        .solFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: new anchor.BN(
            expectedTotalPrice * LAMPORTS_PER_SOL,
          ),
          allowlistAux: '',
          makerFeeBp: 150,
          takerFeeBp: 0,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: poolData.poolPaymentEscrow,
          assetMetadata: poolData.extraNft.metadataAddress,
          assetMasterEdition: metaplexInstance
            .nfts()
            .pdas()
            .masterEdition({ mint: poolData.extraNft.mintAddress }),
          assetMint: poolData.extraNft.mintAddress,
          payerAssetAccount: poolData.extraNft.tokenAddress!,
          sellsideEscrowTokenAccount: poolData.poolAtaExtraNft,
          ownerTokenAccount: ownerExtraNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          sellState,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
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
    }

    {
      const expectedMakerFees = expectedTotalPrice * LAMPORTS_PER_SOL * 0.015;
      const expectedReferralFees = expectedMakerFees;
      const [
        sellerBalance,
        referralBalance,
        poolAtaBalance,
        poolEscrowBalance,
        afterWalletBalance,
        poolAta,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(poolData.poolAtaExtraNft),
        connection.getBalance(poolData.poolPaymentEscrow),
        connection.getBalance(wallet.publicKey),
        getTokenAccount(connection, poolData.poolAtaExtraNft),
      ]);
      assert.equal(
        sellerBalance,
        initSellerBalance +
          expectedTotalPrice * LAMPORTS_PER_SOL -
          (SIGNATURE_FEE_LAMPORTS * 2 +
            tokenAccountRent * 0 +
            sellStatePDARent), // reinvest thus we don't need to pay the owner_token_account rent
      );
      assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
      assert.equal(poolAtaBalance, tokenAccountRent);
      assert.equal(
        poolEscrowBalance,
        initPaymentEscrowBalance -
          expectedTotalPrice * LAMPORTS_PER_SOL -
          expectedMakerFees,
      );
      assert.equal(afterWalletBalance, initWalletBalance);
      assert.equal(Number(poolAta.amount), 1);
      assert.equal(poolAta.owner.toBase58(), poolData.poolKey.toBase58());
      assert.equal(
        poolAta.mint.toBase58(),
        poolData.extraNft.mintAddress.toBase58(),
      );

      initPaymentEscrowBalance = poolEscrowBalance;
      initReferralBalance = referralBalance;
      initSellerBalance = sellerBalance;
    }

    {
      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        poolData.extraNft.mintAddress,
      );
      const sellStateAccountInfo = await program.account.sellState.fetch(
        sellState,
      );
      assert.equal(
        sellStateAccountInfo.pool.toBase58(),
        poolData.poolKey.toBase58(),
      );
      assert.equal(
        sellStateAccountInfo.assetMint.toBase58(),
        poolData.extraNft.mintAddress.toBase58(),
      );
      assert.equal(sellStateAccountInfo.assetAmount.toNumber(), 1);
    }

    poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assertIsBetween(
      poolAccountInfo.spotPrice.toNumber(),
      (expectedTotalPrice * LAMPORTS_PER_SOL) / 1.0125,
      PRICE_ERROR_RANGE,
    );
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
    assert.equal(
      poolAccountInfo.buysidePaymentAmount.toNumber(),
      initPaymentEscrowBalance,
    );
  });

  it('Two sides', async () => {
    const seller = Keypair.generate();
    const buyer = Keypair.generate();
    const metaplexInstance = getMetaplexInstance(connection);
    const [poolData] = await Promise.all([
      createPoolWithExampleDeposits(
        program,
        connection,
        [AllowlistKind.mint],
        {
          owner: wallet.publicKey,
          cosigner,
          curveType: CurveKind.exp,
          curveDelta: new anchor.BN(300), // 300 bp
          expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
          lpFeeBp: 200,
        },
        'both',
        seller.publicKey,
      ),
      airdrop(connection, seller.publicKey, 10),
      airdrop(connection, buyer.publicKey, 10),
    ]);

    const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
      poolData.extraNft.mintAddress,
      wallet.publicKey,
    );
    const { key: extraNftSellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      poolData.extraNft.mintAddress,
    );
    let [initReferralBalance, initSellerBalance, initBuyerBalance] =
      await Promise.all([
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(seller.publicKey),
        connection.getBalance(buyer.publicKey),
      ]);

    const expectedLpFees = LAMPORTS_PER_SOL * 0.02;
    const expectedTakerFees = LAMPORTS_PER_SOL * 0.01;
    {
      const tx = await program.methods
        .solFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: new anchor.BN(
            LAMPORTS_PER_SOL - expectedLpFees - expectedTakerFees,
          ),
          allowlistAux: null,
          takerFeeBp: 100,
          makerFeeBp: 0,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: poolData.poolPaymentEscrow,
          assetMetadata: poolData.extraNft.metadataAddress,
          assetMasterEdition: metaplexInstance
            .nfts()
            .pdas()
            .masterEdition({ mint: poolData.extraNft.mintAddress }),
          assetMint: poolData.extraNft.mintAddress,
          payerAssetAccount: poolData.extraNft.tokenAddress!,
          sellsideEscrowTokenAccount: poolData.poolAtaExtraNft,
          ownerTokenAccount: ownerExtraNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          sellState: extraNftSellState,
        })
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
    }

    const tokenAccountRent = await getTokenAccountRent(connection);
    const sellStatePDARent = await getSellStatePDARent(connection);

    const expectedTxFees = SIGNATURE_FEE_LAMPORTS * 2; // cosigner + payer
    {
      const [sellerBalance, referralBalance, poolAta] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        getTokenAccount(connection, poolData.poolAtaExtraNft),
      ]);

      assert.equal(
        sellerBalance,
        initSellerBalance +
          LAMPORTS_PER_SOL -
          expectedLpFees -
          expectedTakerFees -
          expectedTxFees -
          sellStatePDARent, // no token account rent bc seller ata was closed and pool ata opened
      );
      assert.equal(referralBalance, initReferralBalance + expectedTakerFees);
      assert.equal(Number(poolAta.amount), 1);
      initReferralBalance = referralBalance;
    }

    let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assertIsBetween(
      poolAccountInfo.spotPrice.toNumber(),
      LAMPORTS_PER_SOL / 1.03,
      PRICE_ERROR_RANGE,
    );
    assert.equal(
      poolAccountInfo.lpFeeEarned.toNumber(),
      0.02 * LAMPORTS_PER_SOL,
    );
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 7);

    const buyerNftAtaAddress = await getAssociatedTokenAddress(
      poolData.nft.mintAddress,
      buyer.publicKey,
    );
    const { key: nftSellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      poolData.nft.mintAddress,
    );

    {
      const tx = await program.methods
        .solFulfillSell({
          assetAmount: new anchor.BN(1),
          maxPaymentAmount: new anchor.BN(
            LAMPORTS_PER_SOL + expectedTakerFees + expectedLpFees,
          ),
          buysideCreatorRoyaltyBp: 0,
          allowlistAux: '',
          takerFeeBp: 100,
          makerFeeBp: 100,
        })
        .accountsStrict({
          payer: buyer.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: poolData.poolPaymentEscrow,
          assetMetadata: poolData.nft.metadataAddress,
          assetMasterEdition: metaplexInstance
            .nfts()
            .pdas()
            .masterEdition({ mint: poolData.nft.mintAddress }),
          assetMint: poolData.nft.mintAddress,
          sellsideEscrowTokenAccount: poolData.poolAtaNft,
          payerAssetAccount: buyerNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          sellState: nftSellState,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = buyer.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, buyer);

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
    }

    {
      const expectedMakerFees = LAMPORTS_PER_SOL * 0.01;
      const expectedReferralFees = expectedTakerFees + expectedMakerFees;
      const [buyerBalance, referralBalance, buyerAta] = await Promise.all([
        connection.getBalance(buyer.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        getTokenAccount(connection, buyerNftAtaAddress),
      ]);

      assertIsBetween(
        buyerBalance,
        initBuyerBalance -
          LAMPORTS_PER_SOL -
          expectedLpFees -
          expectedTakerFees -
          expectedTxFees -
          tokenAccountRent, // no token account rent bc seller ata was closed and pool ata opened
        PRICE_ERROR_RANGE,
      );
      assertIsBetween(
        referralBalance,
        initReferralBalance + expectedReferralFees,
        PRICE_ERROR_RANGE,
      );
      assert.equal(Number(buyerAta.amount), 1);
    }

    poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assertIsBetween(
      poolAccountInfo.spotPrice.toNumber(),
      1 * LAMPORTS_PER_SOL,
      PRICE_ERROR_RANGE,
    );
    assertIsBetween(
      poolAccountInfo.lpFeeEarned.toNumber(),
      0.04 * LAMPORTS_PER_SOL,
      PRICE_ERROR_RANGE,
    );
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 6);

    const [finalSellerBalance, finalBuyerBalance] = await Promise.all([
      connection.getBalance(seller.publicKey),
      connection.getBalance(buyer.publicKey),
    ]);

    assert.isAtMost(
      finalBuyerBalance + finalSellerBalance,
      initBuyerBalance + initSellerBalance,
    );
  });
});
