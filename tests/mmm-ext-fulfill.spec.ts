import * as anchor from '@project-serum/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from '@solana/web3.js';
import { assert } from 'chai';
import {
  Mmm,
  getMMMSellStatePDA,
  IDL,
  MMMProgramID,
  CurveKind,
  getSolFulfillBuyPrices,
  getM2BuyerSharedEscrow,
  M2_PROGRAM,
} from '../sdk/src';
import {
  IMMUTABLE_OWNER_EXTENSION_LAMPORTS,
  LAMPORT_ERROR_RANGE,
  LIBREPLEX_ROYALTY_ENFORCEMENT_PROGRAM_ID,
  PRICE_ERROR_RANGE,
  SIGNATURE_FEE_LAMPORTS,
  TRANSFER_HOOK_COMPUTE_UNITS,
  TransferHookArgs,
  airdrop,
  assertIsBetween,
  createPoolWithExampleT22ExtDeposits,
  createTestMintAndTokenT22VanillaExt,
  generateRemainingAccounts,
  getSellStatePDARent,
  getTokenAccount2022,
  getTokenAccountRent,
  sendAndAssertTx,
} from './utils';

describe('mmm-ext-fulfill', () => {
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
  const buyer = Keypair.generate();

  async function executeFulfillSell(
    maxPaymentAmount: number,
    referral: Keypair,
    poolKey: PublicKey,
    mint: PublicKey,
    sellState: PublicKey,
    solEscrowKey: PublicKey,
    poolAta: PublicKey,
    buyerNftAtaAddress: PublicKey,
    takerFeeBp: number,
    makerFeeBp: number,
    transferHookArgs?: TransferHookArgs,
  ) {
    const tx = await program.methods
      .solExtFulfillSell({
        assetAmount: new anchor.BN(1),
        maxPaymentAmount: new anchor.BN(maxPaymentAmount),
        buysideCreatorRoyaltyBp: 0,
        allowlistAux: '',
        takerFeeBp,
        makerFeeBp,
      })
      .accountsStrict({
        payer: buyer.publicKey,
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        referral: referral.publicKey,
        pool: poolKey,
        buysideSolEscrowAccount: solEscrowKey,
        assetMint: mint,
        sellsideEscrowTokenAccount: poolAta,
        payerAssetAccount: buyerNftAtaAddress,
        sellState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(
        transferHookArgs
          ? await generateRemainingAccounts(
              connection,
              mint,
              transferHookArgs,
              true, // isFulfill
            )
          : [],
      )
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: TRANSFER_HOOK_COMPUTE_UNITS,
        }),
      ])
      .transaction();

    const blockhashData = await connection.getLatestBlockhash();
    tx.feePayer = buyer.publicKey;
    tx.recentBlockhash = blockhashData.blockhash;
    tx.partialSign(cosigner, buyer);

    await sendAndAssertTx(connection, tx, blockhashData, false);
  }

  beforeEach(async () => {
    await airdrop(connection, wallet.publicKey, 50);
    await airdrop(connection, buyer.publicKey, 50);
  });

  describe('ext_fulfill_sell', () => {
    it('Sellside only', async () => {
      const { mint, poolData, poolAta, sellState, solEscrowKey } =
        await createPoolWithExampleT22ExtDeposits(
          program,
          connection,
          wallet.payer,
          'sell', // side
          {
            owner: wallet.publicKey,
            cosigner: cosigner,
            curveType: CurveKind.exp,
            curveDelta: new anchor.BN(200), // 200 basis points
            expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
            reinvestFulfillBuy: true,
            reinvestFulfillSell: true,
          },
        );

      const buyerNftAtaAddress = await getAssociatedTokenAddress(
        mint,
        buyer.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      let initWalletBalance = await connection.getBalance(wallet.publicKey);
      let initReferralBalance = await connection.getBalance(
        poolData.referral.publicKey,
      );
      let initBuyerBalance = await connection.getBalance(buyer.publicKey);

      let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);

      let expectedTakerFees = 1.02 * LAMPORTS_PER_SOL * 0.01;
      await executeFulfillSell(
        1.02 * LAMPORTS_PER_SOL + expectedTakerFees,
        poolData.referral,
        poolData.poolKey,
        mint,
        sellState,
        solEscrowKey,
        poolAta,
        buyerNftAtaAddress,
        100, // takerFeeBp
        0, // makerFeeBp
      );

      let tokenAccountRent =
        (await getTokenAccountRent(connection)) +
        IMMUTABLE_OWNER_EXTENSION_LAMPORTS;
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
          connection.getBalance(poolAta),
          connection.getBalance(solEscrowKey),
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
        assert.equal(
          referralBalance,
          initReferralBalance + expectedReferralFees,
        );
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

      poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(
        poolAccountInfo.spotPrice.toNumber(),
        1.02 * LAMPORTS_PER_SOL,
      );
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
      assert.equal(
        poolAccountInfo.buysidePaymentAmount.toNumber(),
        1.02 * LAMPORTS_PER_SOL,
      );
    });

    it('Sellside only royalty transfer hook', async () => {
      const creatorKeypair = Keypair.generate();
      const royaltyTransferHookArgs: TransferHookArgs = {
        transferHookProgramId: LIBREPLEX_ROYALTY_ENFORCEMENT_PROGRAM_ID,
        creatorAddress: creatorKeypair.publicKey,
        royaltyBp: 300,
        legacy: false,
      };
      const { mint, poolData, poolAta, sellState, solEscrowKey } =
        await createPoolWithExampleT22ExtDeposits(
          program,
          connection,
          wallet.payer,
          'sell', // side
          {
            owner: wallet.publicKey,
            cosigner: cosigner,
            curveType: CurveKind.exp,
            curveDelta: new anchor.BN(200), // 200 basis points
            expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
            reinvestFulfillBuy: true,
            reinvestFulfillSell: true,
          },
          undefined,
          undefined,
          royaltyTransferHookArgs,
        );

      const buyerNftAtaAddress = await getAssociatedTokenAddress(
        mint,
        buyer.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      let initWalletBalance = await connection.getBalance(wallet.publicKey);
      let initReferralBalance = await connection.getBalance(
        poolData.referral.publicKey,
      );
      let initBuyerBalance = await connection.getBalance(buyer.publicKey);
      let initCreatorBalance = await connection.getBalance(
        creatorKeypair.publicKey,
      );

      let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);

      let expectedTakerFees = 1.02 * LAMPORTS_PER_SOL * 0.01;
      let expectedRoyaltyFees = 1.02 * LAMPORTS_PER_SOL * 0.03;
      await executeFulfillSell(
        1.02 * LAMPORTS_PER_SOL + expectedTakerFees + expectedRoyaltyFees,
        poolData.referral,
        poolData.poolKey,
        mint,
        sellState,
        solEscrowKey,
        poolAta,
        buyerNftAtaAddress,
        100, // takerFeeBp
        0, // makerFeeBp
        royaltyTransferHookArgs,
      );

      const sellStatePDARent = await getSellStatePDARent(connection);

      {
        const expectedTakerFees = 1.02 * LAMPORTS_PER_SOL * 0.01;
        const expectedRoyaltyFees = 1.02 * LAMPORTS_PER_SOL * 0.03;
        const expectedReferralFees = expectedTakerFees;

        const buyerAtaAddress = getAssociatedTokenAddressSync(
          mint,
          buyer.publicKey,
          true,
          TOKEN_2022_PROGRAM_ID,
        );
        const [
          buyerBalance,
          referralBalance,
          poolAtaBalance,
          poolEscrowBalance,
          afterWalletBalance,
          sellStateBalance,
          creatorBalance,
          tokenAccountRent,
        ] = await Promise.all([
          connection.getBalance(buyer.publicKey),
          connection.getBalance(poolData.referral.publicKey),
          connection.getBalance(poolAta),
          connection.getBalance(solEscrowKey),
          connection.getBalance(wallet.publicKey),
          connection.getBalance(sellState),
          connection.getBalance(creatorKeypair.publicKey),
          connection.getBalance(buyerAtaAddress),
        ]);
        assert.equal(creatorBalance, initCreatorBalance + expectedRoyaltyFees);
        assert.equal(
          buyerBalance,
          initBuyerBalance -
            1.02 * LAMPORTS_PER_SOL -
            SIGNATURE_FEE_LAMPORTS * 2 -
            tokenAccountRent -
            expectedRoyaltyFees -
            expectedTakerFees,
        );
        assert.equal(
          referralBalance,
          initReferralBalance + expectedReferralFees,
        );
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

      poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(
        poolAccountInfo.spotPrice.toNumber(),
        1.02 * LAMPORTS_PER_SOL,
      );
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
      assert.equal(
        poolAccountInfo.buysidePaymentAmount.toNumber(),
        1.02 * LAMPORTS_PER_SOL,
      );
    });

    it('Sellside only royalty transfer hook legacy', async () => {
      const creatorKeypair = Keypair.generate();
      const royaltyTransferHookArgs: TransferHookArgs = {
        transferHookProgramId: LIBREPLEX_ROYALTY_ENFORCEMENT_PROGRAM_ID,
        creatorAddress: creatorKeypair.publicKey,
        royaltyBp: 500,
        legacy: true,
      };
      const { mint, poolData, poolAta, sellState, solEscrowKey } =
        await createPoolWithExampleT22ExtDeposits(
          program,
          connection,
          wallet.payer,
          'sell', // side
          {
            owner: wallet.publicKey,
            cosigner: cosigner,
            curveType: CurveKind.exp,
            curveDelta: new anchor.BN(200), // 200 basis points
            expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
            reinvestFulfillBuy: true,
            reinvestFulfillSell: true,
          },
          undefined,
          undefined,
          royaltyTransferHookArgs,
        );

      const buyerNftAtaAddress = await getAssociatedTokenAddress(
        mint,
        buyer.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      let initWalletBalance = await connection.getBalance(wallet.publicKey);
      let initReferralBalance = await connection.getBalance(
        poolData.referral.publicKey,
      );
      let initBuyerBalance = await connection.getBalance(buyer.publicKey);
      let initCreatorBalance = await connection.getBalance(
        creatorKeypair.publicKey,
      );

      let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);

      let expectedTakerFees = 1.02 * LAMPORTS_PER_SOL * 0.01;
      let expectedRoyaltyFees = 1.02 * LAMPORTS_PER_SOL * 0.05;
      await executeFulfillSell(
        1.02 * LAMPORTS_PER_SOL + expectedTakerFees + expectedRoyaltyFees,
        poolData.referral,
        poolData.poolKey,
        mint,
        sellState,
        solEscrowKey,
        poolAta,
        buyerNftAtaAddress,
        100, // takerFeeBp
        0, // makerFeeBp
        royaltyTransferHookArgs,
      );

      const sellStatePDARent = await getSellStatePDARent(connection);

      {
        const expectedReferralFees = expectedTakerFees;

        const buyerAtaAddress = getAssociatedTokenAddressSync(
          mint,
          buyer.publicKey,
          true,
          TOKEN_2022_PROGRAM_ID,
        );
        const [
          buyerBalance,
          referralBalance,
          poolAtaBalance,
          poolEscrowBalance,
          afterWalletBalance,
          sellStateBalance,
          creatorBalance,
          tokenAccountRent,
        ] = await Promise.all([
          connection.getBalance(buyer.publicKey),
          connection.getBalance(poolData.referral.publicKey),
          connection.getBalance(poolAta),
          connection.getBalance(solEscrowKey),
          connection.getBalance(wallet.publicKey),
          connection.getBalance(sellState),
          connection.getBalance(creatorKeypair.publicKey),
          connection.getBalance(buyerAtaAddress),
        ]);
        assert.equal(creatorBalance, initCreatorBalance + expectedRoyaltyFees);
        assert.equal(
          buyerBalance,
          initBuyerBalance -
            1.02 * LAMPORTS_PER_SOL -
            SIGNATURE_FEE_LAMPORTS * 2 -
            tokenAccountRent -
            expectedRoyaltyFees -
            expectedTakerFees,
        );
        assert.equal(
          referralBalance,
          initReferralBalance + expectedReferralFees,
        );
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

      poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(
        poolAccountInfo.spotPrice.toNumber(),
        1.02 * LAMPORTS_PER_SOL,
      );
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
      assert.equal(
        poolAccountInfo.buysidePaymentAmount.toNumber(),
        1.02 * LAMPORTS_PER_SOL,
      );
    });
  });

  describe('ext_fulfill_buy', () => {
    it('Buyside only', async () => {
      const seller = Keypair.generate();
      await airdrop(connection, seller.publicKey, 50);
      const { poolData, solEscrowKey, groupAddress } =
        await createPoolWithExampleT22ExtDeposits(
          program,
          connection,
          wallet.payer,
          'buy', // side
          {
            owner: wallet.publicKey,
            cosigner,
            curveType: CurveKind.exp,
            curveDelta: new anchor.BN(125), // 125 bp
            expiry: new anchor.BN(0),
            spotPrice: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
            referralBp: 200,
            reinvestFulfillBuy: false,
            reinvestFulfillSell: false,
          },
        );
      const {
        mint: extraMint,
        recipientTokenAccount: extraRecipientTokenAccount,
      } = await createTestMintAndTokenT22VanillaExt(
        connection,
        wallet.payer,
        seller.publicKey,
        groupAddress,
      );

      const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
        extraMint,
        wallet.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      const { key: extraNftSellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        extraMint,
      );
      const extraPoolAta = await getAssociatedTokenAddress(
        extraMint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      let [
        initReferralBalance,
        initSellerBalance,
        initPaymentEscrowBalance,
        initWalletBalance,
      ] = await Promise.all([
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(seller.publicKey),
        connection.getBalance(solEscrowKey),
        connection.getBalance(wallet.publicKey),
      ]);

      const expectedTotalPrice = 0.5;
      const tx = await program.methods
        .solExtFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: new anchor.BN(
            expectedTotalPrice * LAMPORTS_PER_SOL,
          ),
          allowlistAux: '',
          takerFeeBp: 0,
          makerFeeBp: 150,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: solEscrowKey,
          assetMint: extraMint,
          payerAssetAccount: extraRecipientTokenAccount,
          sellsideEscrowTokenAccount: extraPoolAta,
          ownerTokenAccount: ownerExtraNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          sellState: extraNftSellState,
        })
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = seller.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, seller);

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const expectedMakerFees = expectedTotalPrice * LAMPORTS_PER_SOL * 0.015;
      const expectedReferralFees = expectedMakerFees;
      const [
        sellerBalance,
        referralBalance,
        afterWalletBalance,
        poolEscrowBalance,
        ownerNftTokenAccount,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(solEscrowKey),
        getTokenAccount2022(
          connection,
          ownerExtraNftAtaAddress,
          TOKEN_2022_PROGRAM_ID,
        ),
      ]);

      assertIsBetween(
        sellerBalance,
        initSellerBalance +
          expectedTotalPrice * LAMPORTS_PER_SOL -
          SIGNATURE_FEE_LAMPORTS * 2,
        PRICE_ERROR_RANGE,
      );
      assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
      assert.equal(
        poolEscrowBalance,
        initPaymentEscrowBalance -
          expectedTotalPrice * LAMPORTS_PER_SOL -
          expectedMakerFees,
      );
      assert.equal(afterWalletBalance, initWalletBalance);

      const poolAccountInfo = await program.account.pool.fetch(
        poolData.poolKey,
      );
      assertIsBetween(
        poolAccountInfo.spotPrice.toNumber(),
        (expectedTotalPrice * LAMPORTS_PER_SOL) / 1.0125,
        PRICE_ERROR_RANGE,
      );
      // do not reinvest so sell side asset amount should be 0
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
      assert.equal(Number(ownerNftTokenAccount.amount), 1);
    });

    it('Buyside only transfer hook', async () => {
      const seller = Keypair.generate();
      await airdrop(connection, seller.publicKey, 50);
      const creatorKeypair = Keypair.generate();
      const royaltyTransferHookArgs: TransferHookArgs = {
        transferHookProgramId: LIBREPLEX_ROYALTY_ENFORCEMENT_PROGRAM_ID,
        creatorAddress: creatorKeypair.publicKey,
        royaltyBp: 300,
        legacy: false,
      };
      const { poolData, solEscrowKey, groupAddress } =
        await createPoolWithExampleT22ExtDeposits(
          program,
          connection,
          wallet.payer,
          'buy', // side
          {
            owner: wallet.publicKey,
            cosigner,
            curveType: CurveKind.exp,
            curveDelta: new anchor.BN(125), // 125 bp
            expiry: new anchor.BN(0),
            spotPrice: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
            referralBp: 200,
            reinvestFulfillBuy: false,
            reinvestFulfillSell: false,
          },
          undefined,
          undefined,
          royaltyTransferHookArgs,
        );
      const {
        mint: extraMint,
        recipientTokenAccount: extraRecipientTokenAccount,
      } = await createTestMintAndTokenT22VanillaExt(
        connection,
        wallet.payer,
        seller.publicKey,
        groupAddress,
        undefined,
        royaltyTransferHookArgs,
      );

      const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
        extraMint,
        wallet.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      const { key: extraNftSellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        extraMint,
      );
      const extraPoolAta = await getAssociatedTokenAddress(
        extraMint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      let [
        initReferralBalance,
        initSellerBalance,
        initPaymentEscrowBalance,
        initWalletBalance,
        initCreatorBalance,
      ] = await Promise.all([
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(seller.publicKey),
        connection.getBalance(solEscrowKey),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(creatorKeypair.publicKey),
      ]);

      const expectedTotalPrice = 0.5;
      const sellerRecieves = (expectedTotalPrice * LAMPORTS_PER_SOL) / 1.03; // 3% royalty
      const tx = await program.methods
        .solExtFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: new anchor.BN(sellerRecieves),
          allowlistAux: '',
          takerFeeBp: 0,
          makerFeeBp: 150,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: solEscrowKey,
          assetMint: extraMint,
          payerAssetAccount: extraRecipientTokenAccount,
          sellsideEscrowTokenAccount: extraPoolAta,
          ownerTokenAccount: ownerExtraNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          sellState: extraNftSellState,
        })
        .remainingAccounts(
          await generateRemainingAccounts(
            connection,
            extraMint,
            royaltyTransferHookArgs,
            true, // isFulfill
          ),
        )
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: TRANSFER_HOOK_COMPUTE_UNITS,
          }),
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = seller.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, seller);

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const expectedMakerFees = sellerRecieves * 0.015;
      const expectedReferralFees = expectedMakerFees;
      const [
        sellerBalance,
        referralBalance,
        afterWalletBalance,
        poolEscrowBalance,
        ownerNftTokenAccount,
        afterCreatorBalance,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(solEscrowKey),
        getTokenAccount2022(
          connection,
          ownerExtraNftAtaAddress,
          TOKEN_2022_PROGRAM_ID,
        ),
        connection.getBalance(creatorKeypair.publicKey),
      ]);

      assertIsBetween(
        afterCreatorBalance,
        initCreatorBalance + sellerRecieves * 0.03, // royalty,
        PRICE_ERROR_RANGE,
      );

      assertIsBetween(
        sellerBalance,
        initSellerBalance +
          expectedTotalPrice * LAMPORTS_PER_SOL -
          sellerRecieves * 0.03 - // royalty
          SIGNATURE_FEE_LAMPORTS * 2,
        PRICE_ERROR_RANGE,
      );
      assertIsBetween(
        referralBalance,
        initReferralBalance + expectedReferralFees,
        PRICE_ERROR_RANGE,
      );
      assertIsBetween(
        poolEscrowBalance,
        initPaymentEscrowBalance -
          sellerRecieves -
          expectedMakerFees -
          sellerRecieves * 0.03, // royalty
        PRICE_ERROR_RANGE,
      );
      assert.equal(afterWalletBalance, initWalletBalance);

      const poolAccountInfo = await program.account.pool.fetch(
        poolData.poolKey,
      );
      assertIsBetween(
        poolAccountInfo.spotPrice.toNumber(),
        (expectedTotalPrice * LAMPORTS_PER_SOL) / 1.0125,
        PRICE_ERROR_RANGE,
      );
      // do not reinvest so sell side asset amount should be 0
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
      assert.equal(Number(ownerNftTokenAccount.amount), 1);
    });

    it('Buyside only transfer hook legacy', async () => {
      const seller = Keypair.generate();
      await airdrop(connection, seller.publicKey, 50);
      const creatorKeypair = Keypair.generate();
      const royaltyTransferHookArgs: TransferHookArgs = {
        transferHookProgramId: LIBREPLEX_ROYALTY_ENFORCEMENT_PROGRAM_ID,
        creatorAddress: creatorKeypair.publicKey,
        royaltyBp: 400,
        legacy: true,
      };
      const { poolData, solEscrowKey, groupAddress } =
        await createPoolWithExampleT22ExtDeposits(
          program,
          connection,
          wallet.payer,
          'buy', // side
          {
            owner: wallet.publicKey,
            cosigner,
            curveType: CurveKind.exp,
            curveDelta: new anchor.BN(125), // 125 bp
            expiry: new anchor.BN(0),
            spotPrice: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
            referralBp: 200,
            reinvestFulfillBuy: false,
            reinvestFulfillSell: false,
          },
          undefined,
          undefined,
          royaltyTransferHookArgs,
        );
      const {
        mint: extraMint,
        recipientTokenAccount: extraRecipientTokenAccount,
      } = await createTestMintAndTokenT22VanillaExt(
        connection,
        wallet.payer,
        seller.publicKey,
        groupAddress,
        undefined,
        royaltyTransferHookArgs,
      );

      const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
        extraMint,
        wallet.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      const { key: extraNftSellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        extraMint,
      );
      const extraPoolAta = await getAssociatedTokenAddress(
        extraMint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      let [
        initReferralBalance,
        initSellerBalance,
        initPaymentEscrowBalance,
        initWalletBalance,
        initCreatorBalance,
      ] = await Promise.all([
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(seller.publicKey),
        connection.getBalance(solEscrowKey),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(creatorKeypair.publicKey),
      ]);

      const expectedTotalPrice = 0.5;
      const sellerRecieves = (expectedTotalPrice * LAMPORTS_PER_SOL) / 1.04; // 4% royalty
      const tx = await program.methods
        .solExtFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: new anchor.BN(sellerRecieves),
          allowlistAux: '',
          takerFeeBp: 0,
          makerFeeBp: 150,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: solEscrowKey,
          assetMint: extraMint,
          payerAssetAccount: extraRecipientTokenAccount,
          sellsideEscrowTokenAccount: extraPoolAta,
          ownerTokenAccount: ownerExtraNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          sellState: extraNftSellState,
        })
        .remainingAccounts(
          await generateRemainingAccounts(
            connection,
            extraMint,
            royaltyTransferHookArgs,
            true, // isFulfill
          ),
        )
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: TRANSFER_HOOK_COMPUTE_UNITS,
          }),
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = seller.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, seller);

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const expectedMakerFees = sellerRecieves * 0.015;
      const expectedReferralFees = expectedMakerFees;
      const [
        sellerBalance,
        referralBalance,
        afterWalletBalance,
        poolEscrowBalance,
        ownerNftTokenAccount,
        afterCreatorBalance,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(solEscrowKey),
        getTokenAccount2022(
          connection,
          ownerExtraNftAtaAddress,
          TOKEN_2022_PROGRAM_ID,
        ),
        connection.getBalance(creatorKeypair.publicKey),
      ]);

      assertIsBetween(
        afterCreatorBalance,
        initCreatorBalance + sellerRecieves * 0.04, // royalty,
        PRICE_ERROR_RANGE,
      );

      assertIsBetween(
        sellerBalance,
        initSellerBalance +
          expectedTotalPrice * LAMPORTS_PER_SOL -
          sellerRecieves * 0.04 - // royalty
          SIGNATURE_FEE_LAMPORTS * 2,
        PRICE_ERROR_RANGE,
      );
      assertIsBetween(
        referralBalance,
        initReferralBalance + expectedReferralFees,
        PRICE_ERROR_RANGE,
      );
      assertIsBetween(
        poolEscrowBalance,
        initPaymentEscrowBalance -
          sellerRecieves -
          expectedMakerFees -
          sellerRecieves * 0.04, // royalty
        PRICE_ERROR_RANGE,
      );
      assert.equal(afterWalletBalance, initWalletBalance);

      const poolAccountInfo = await program.account.pool.fetch(
        poolData.poolKey,
      );
      assertIsBetween(
        poolAccountInfo.spotPrice.toNumber(),
        (expectedTotalPrice * LAMPORTS_PER_SOL) / 1.0125,
        PRICE_ERROR_RANGE,
      );
      // do not reinvest so sell side asset amount should be 0
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
      assert.equal(Number(ownerNftTokenAccount.amount), 1);
    });

    it('Buyside only with shared escrow but pool open', async () => {
      const seller = Keypair.generate();
      const buyerSharedEscrow = getM2BuyerSharedEscrow(wallet.publicKey).key;
      await Promise.all([
        airdrop(connection, seller.publicKey, 50),
        airdrop(connection, buyerSharedEscrow, 50),
      ]);
      const { poolData, solEscrowKey, groupAddress } =
        await createPoolWithExampleT22ExtDeposits(
          program,
          connection,
          wallet.payer,
          'buy', // side
          {
            owner: wallet.publicKey,
            cosigner,
            curveType: CurveKind.exp,
            curveDelta: new anchor.BN(125), // 125 bp
            expiry: new anchor.BN(0),
            spotPrice: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
            referralBp: 200,
            reinvestFulfillBuy: false,
            reinvestFulfillSell: false,
          },
          true, // sharedEscrow
          2, // sharedEscrowCount, one more so pool will not be closed
        );
      const {
        mint: extraMint,
        recipientTokenAccount: extraRecipientTokenAccount,
      } = await createTestMintAndTokenT22VanillaExt(
        connection,
        wallet.payer,
        seller.publicKey,
        groupAddress,
      );

      const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
        extraMint,
        wallet.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      const { key: extraNftSellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        extraMint,
      );
      const extraPoolAta = await getAssociatedTokenAddress(
        extraMint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      let [
        initReferralBalance,
        initSellerBalance,
        initWalletBalance,
        initBuyerSharedEscrowBalance,
      ] = await Promise.all([
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(seller.publicKey),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(buyerSharedEscrow),
      ]);

      const expectedTotalPrice = 0.5;
      const tx = await program.methods
        .solExtFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: new anchor.BN(
            expectedTotalPrice * LAMPORTS_PER_SOL,
          ),
          allowlistAux: '',
          takerFeeBp: 0,
          makerFeeBp: 150,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: solEscrowKey,
          assetMint: extraMint,
          payerAssetAccount: extraRecipientTokenAccount,
          sellsideEscrowTokenAccount: extraPoolAta,
          ownerTokenAccount: ownerExtraNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          sellState: extraNftSellState,
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

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const expectedMakerFees = expectedTotalPrice * LAMPORTS_PER_SOL * 0.015;
      const expectedReferralFees = expectedMakerFees;
      const [
        sellerBalance,
        referralBalance,
        poolAtaBalance,
        afterWalletBalance,
        poolEscrowBalance,
        afterSharedEscrowBalance,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(extraPoolAta),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(solEscrowKey),
        connection.getBalance(buyerSharedEscrow),
      ]);

      assert.equal(
        sellerBalance,
        initSellerBalance +
          expectedTotalPrice * LAMPORTS_PER_SOL -
          SIGNATURE_FEE_LAMPORTS * 2,
      );
      assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
      assert.equal(poolAtaBalance, 0);
      assert.equal(poolEscrowBalance, 0); // because it's shared escrow, so the pool escrow is empty
      assert.equal(afterWalletBalance, initWalletBalance);
      assert.notEqual(afterSharedEscrowBalance, 0);
      assert.equal(
        initBuyerSharedEscrowBalance - afterSharedEscrowBalance,
        expectedTotalPrice * LAMPORTS_PER_SOL + expectedMakerFees,
      );

      const poolAccountInfo = await program.account.pool.fetch(
        poolData.poolKey,
      );
      assertIsBetween(
        poolAccountInfo.spotPrice.toNumber(),
        (expectedTotalPrice * LAMPORTS_PER_SOL) / 1.0125,
        PRICE_ERROR_RANGE,
      );
      // do not reinvest so sell side asset amount should be 0
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
    });

    it('Buyside only with shared escrow and close the pool', async () => {
      const seller = Keypair.generate();
      const buyerSharedEscrow = getM2BuyerSharedEscrow(wallet.publicKey).key;
      await Promise.all([
        airdrop(connection, seller.publicKey, 50),
        airdrop(connection, buyerSharedEscrow, 50),
      ]);
      const { poolData, solEscrowKey, groupAddress } =
        await createPoolWithExampleT22ExtDeposits(
          program,
          connection,
          wallet.payer,
          'buy', // side
          {
            owner: wallet.publicKey,
            cosigner,
            curveType: CurveKind.exp,
            curveDelta: new anchor.BN(125), // 125 bp
            expiry: new anchor.BN(0),
            spotPrice: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
            referralBp: 200,
            reinvestFulfillBuy: false,
            reinvestFulfillSell: false,
          },
          true, // sharedEscrow
          1, // sharedEscrowCount, only one so pool will be closed
        );
      const {
        mint: extraMint,
        recipientTokenAccount: extraRecipientTokenAccount,
      } = await createTestMintAndTokenT22VanillaExt(
        connection,
        wallet.payer,
        seller.publicKey,
        groupAddress,
      );

      const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
        extraMint,
        wallet.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      const { key: extraNftSellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        extraMint,
      );
      const extraPoolAta = await getAssociatedTokenAddress(
        extraMint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      let [
        initReferralBalance,
        initSellerBalance,
        initBuyerSharedEscrowBalance,
      ] = await Promise.all([
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(seller.publicKey),
        connection.getBalance(buyerSharedEscrow),
      ]);

      const expectedTotalPrice = 0.5;
      const tx = await program.methods
        .solExtFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: new anchor.BN(
            expectedTotalPrice * LAMPORTS_PER_SOL,
          ),
          allowlistAux: '',
          takerFeeBp: 0,
          makerFeeBp: 150,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: solEscrowKey,
          assetMint: extraMint,
          payerAssetAccount: extraRecipientTokenAccount,
          sellsideEscrowTokenAccount: extraPoolAta,
          ownerTokenAccount: ownerExtraNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          sellState: extraNftSellState,
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

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const expectedMakerFees = expectedTotalPrice * LAMPORTS_PER_SOL * 0.015;
      const expectedReferralFees = expectedMakerFees;
      const [
        sellerBalance,
        referralBalance,
        poolAtaBalance,
        poolEscrowBalance,
        afterSharedEscrowBalance,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(extraPoolAta),
        connection.getBalance(solEscrowKey),
        connection.getBalance(buyerSharedEscrow),
      ]);

      assert.equal(
        sellerBalance,
        initSellerBalance +
          expectedTotalPrice * LAMPORTS_PER_SOL -
          SIGNATURE_FEE_LAMPORTS * 2,
      );
      assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
      assert.equal(poolAtaBalance, 0);
      assert.equal(poolEscrowBalance, 0); // because it's shared escrow, so the pool escrow is empty
      assert.notEqual(afterSharedEscrowBalance, 0);
      assert.equal(
        initBuyerSharedEscrowBalance - afterSharedEscrowBalance,
        expectedTotalPrice * LAMPORTS_PER_SOL + expectedMakerFees,
      );

      const poolAccountInfo = await program.account.pool.fetchNullable(
        poolData.poolKey,
      );
      assert.isNull(poolAccountInfo);
    });

    it('Buyside only with shared escrow but pool open and royalty transfer hook', async () => {
      const seller = Keypair.generate();
      const buyerSharedEscrow = getM2BuyerSharedEscrow(wallet.publicKey).key;
      await Promise.all([
        airdrop(connection, seller.publicKey, 50),
        airdrop(connection, buyerSharedEscrow, 50),
      ]);
      const creatorKeypair = Keypair.generate();
      const royaltyTransferHookArgs: TransferHookArgs = {
        transferHookProgramId: LIBREPLEX_ROYALTY_ENFORCEMENT_PROGRAM_ID,
        creatorAddress: creatorKeypair.publicKey,
        royaltyBp: 300,
        legacy: false,
      };
      const { poolData, solEscrowKey, groupAddress } =
        await createPoolWithExampleT22ExtDeposits(
          program,
          connection,
          wallet.payer,
          'buy', // side
          {
            owner: wallet.publicKey,
            cosigner,
            curveType: CurveKind.exp,
            curveDelta: new anchor.BN(125), // 125 bp
            expiry: new anchor.BN(0),
            spotPrice: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
            referralBp: 200,
            reinvestFulfillBuy: false,
            reinvestFulfillSell: false,
          },
          true, // sharedEscrow
          2, // sharedEscrowCount, one more so pool will not be closed
          royaltyTransferHookArgs,
        );
      const {
        mint: extraMint,
        recipientTokenAccount: extraRecipientTokenAccount,
      } = await createTestMintAndTokenT22VanillaExt(
        connection,
        wallet.payer,
        seller.publicKey,
        groupAddress,
        undefined,
        royaltyTransferHookArgs,
      );

      const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
        extraMint,
        wallet.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      const { key: extraNftSellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        extraMint,
      );
      const extraPoolAta = await getAssociatedTokenAddress(
        extraMint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      let [
        initReferralBalance,
        initSellerBalance,
        initWalletBalance,
        initBuyerSharedEscrowBalance,
        initCreatorBalance,
      ] = await Promise.all([
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(seller.publicKey),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(buyerSharedEscrow),
        connection.getBalance(creatorKeypair.publicKey),
      ]);

      const expectedTotalPrice = 0.5;
      const sellerReceives = (expectedTotalPrice * LAMPORTS_PER_SOL) / 1.03; // 3% royalty
      const tx = await program.methods
        .solExtFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: new anchor.BN(sellerReceives),
          allowlistAux: '',
          takerFeeBp: 0,
          makerFeeBp: 150,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: solEscrowKey,
          assetMint: extraMint,
          payerAssetAccount: extraRecipientTokenAccount,
          sellsideEscrowTokenAccount: extraPoolAta,
          ownerTokenAccount: ownerExtraNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          sellState: extraNftSellState,
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
          ...(await generateRemainingAccounts(
            connection,
            extraMint,
            royaltyTransferHookArgs,
            true, // isFulfill
          )),
        ])
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: TRANSFER_HOOK_COMPUTE_UNITS,
          }),
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = seller.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, seller);

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const expectedMakerFees = sellerReceives * 0.015;
      const expectedReferralFees = expectedMakerFees;
      const [
        sellerBalance,
        referralBalance,
        poolAtaBalance,
        afterWalletBalance,
        poolEscrowBalance,
        afterSharedEscrowBalance,
        afterCreatorBalance,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(extraPoolAta),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(solEscrowKey),
        connection.getBalance(buyerSharedEscrow),
        connection.getBalance(creatorKeypair.publicKey),
      ]);

      assertIsBetween(
        sellerBalance,
        initSellerBalance +
          expectedTotalPrice * LAMPORTS_PER_SOL -
          sellerReceives * 0.03 - // royalty
          SIGNATURE_FEE_LAMPORTS * 2,
        PRICE_ERROR_RANGE,
      );
      assertIsBetween(
        referralBalance,
        initReferralBalance + expectedReferralFees,
        PRICE_ERROR_RANGE,
      );
      assert.equal(poolAtaBalance, 0);
      assert.equal(poolEscrowBalance, 0); // because it's shared escrow, so the pool escrow is empty
      assert.equal(afterWalletBalance, initWalletBalance);
      assert.notEqual(afterSharedEscrowBalance, 0);
      assertIsBetween(
        initBuyerSharedEscrowBalance - afterSharedEscrowBalance,
        expectedTotalPrice * LAMPORTS_PER_SOL + expectedMakerFees,
        PRICE_ERROR_RANGE,
      );

      const poolAccountInfo = await program.account.pool.fetch(
        poolData.poolKey,
      );
      assertIsBetween(
        afterCreatorBalance,
        initCreatorBalance + sellerReceives * 0.03, // royalty
        PRICE_ERROR_RANGE,
      );
      assertIsBetween(
        poolAccountInfo.spotPrice.toNumber(),
        (expectedTotalPrice * LAMPORTS_PER_SOL) / 1.0125,
        PRICE_ERROR_RANGE,
      );
      // do not reinvest so sell side asset amount should be 0
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
    });
  });

  describe('ext_fulfillment', () => {
    it('Two sides', async () => {
      const seller = Keypair.generate();
      await airdrop(connection, seller.publicKey, 50);
      const { mint, poolData, poolAta, sellState, solEscrowKey, groupAddress } =
        await createPoolWithExampleT22ExtDeposits(
          program,
          connection,
          wallet.payer,
          'both', // side
          {
            owner: wallet.publicKey,
            cosigner: cosigner,
            curveType: CurveKind.exp,
            curveDelta: new anchor.BN(300), // 300 basis points
            expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
            lpFeeBp: 200,
          },
        );

      const {
        mint: extraMint,
        recipientTokenAccount: extraRecipientTokenAccount,
      } = await createTestMintAndTokenT22VanillaExt(
        connection,
        wallet.payer,
        seller.publicKey,
        groupAddress,
      );

      const { key: extraNftSellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        extraMint,
      );
      const extraPoolAta = await getAssociatedTokenAddress(
        extraMint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      let [initReferralBalance, initSellerBalance, initBuyerBalance] =
        await Promise.all([
          connection.getBalance(poolData.referral.publicKey),
          connection.getBalance(seller.publicKey),
          connection.getBalance(buyer.publicKey),
        ]);

      const expectedLpFees = LAMPORTS_PER_SOL * 0.02;
      const expectedTakerFees = LAMPORTS_PER_SOL * 0.01;
      const expectedBuyPrices = getSolFulfillBuyPrices({
        totalPriceLamports: LAMPORTS_PER_SOL,
        lpFeeBp: 200,
        takerFeeBp: 100,
        metadataRoyaltyBp: 0,
        buysideCreatorRoyaltyBp: 0,
        makerFeeBp: 0,
      });

      const tx = await program.methods
        .solExtFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: expectedBuyPrices.sellerReceives,
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
          buysideSolEscrowAccount: solEscrowKey,
          assetMint: extraMint,
          payerAssetAccount: extraRecipientTokenAccount,
          sellsideEscrowTokenAccount: extraPoolAta,
          ownerTokenAccount: extraRecipientTokenAccount,
          allowlistAuxAccount: SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          sellState: extraNftSellState,
        })
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = seller.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, seller);

      await sendAndAssertTx(connection, tx, blockhashData, false);

      let tokenAccountRent =
        (await getTokenAccountRent(connection)) +
        IMMUTABLE_OWNER_EXTENSION_LAMPORTS;

      const expectedTxFees = SIGNATURE_FEE_LAMPORTS * 2; // cosigner + payer
      {
        const [
          sellerBalance,
          referralBalance,
          sellStatePDARent,
          poolTokenAccount,
        ] = await Promise.all([
          connection.getBalance(seller.publicKey),
          connection.getBalance(poolData.referral.publicKey),
          getSellStatePDARent(connection),
          getTokenAccount2022(connection, extraPoolAta, TOKEN_2022_PROGRAM_ID),
        ]);

        assert.equal(
          sellerBalance,
          initSellerBalance +
            expectedBuyPrices.sellerReceives.toNumber() -
            expectedTxFees -
            sellStatePDARent, // no token account rent bc seller ata was closed and pool ata opened
        );
        assert.equal(
          referralBalance,
          initReferralBalance + expectedBuyPrices.takerFeePaid.toNumber(),
        );
        assert.equal(Number(poolTokenAccount.amount), 1);
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
        expectedBuyPrices.lpFeePaid.toNumber(),
      );
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 2);

      const buyerNftAtaAddress = await getAssociatedTokenAddress(
        mint,
        buyer.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      {
        const tx = await program.methods
          .solExtFulfillSell({
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
            buysideSolEscrowAccount: solEscrowKey,
            assetMint: mint,
            sellsideEscrowTokenAccount: poolAta,
            payerAssetAccount: buyerNftAtaAddress,
            sellState: sellState,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .transaction();

        const blockhashData = await connection.getLatestBlockhash();
        tx.feePayer = buyer.publicKey;
        tx.recentBlockhash = blockhashData.blockhash;
        tx.partialSign(cosigner, buyer);

        await sendAndAssertTx(connection, tx, blockhashData, false);
      }

      {
        const expectedMakerFees = LAMPORTS_PER_SOL * 0.01;
        const expectedReferralFees = expectedTakerFees + expectedMakerFees;
        const [buyerBalance, referralBalance, buyerAta] = await Promise.all([
          connection.getBalance(buyer.publicKey),
          connection.getBalance(poolData.referral.publicKey),
          getTokenAccount2022(
            connection,
            buyerNftAtaAddress,
            TOKEN_2022_PROGRAM_ID,
          ),
        ]);

        assertIsBetween(
          buyerBalance,
          initBuyerBalance -
            LAMPORTS_PER_SOL -
            expectedLpFees -
            expectedTakerFees -
            expectedTxFees -
            tokenAccountRent,
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
        expectedBuyPrices.lpFeePaid.toNumber() + 0.02 * LAMPORTS_PER_SOL,
        PRICE_ERROR_RANGE,
      );
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);

      const [finalSellerBalance, finalBuyerBalance] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(buyer.publicKey),
      ]);

      assert.isAtMost(
        finalBuyerBalance + finalSellerBalance,
        initBuyerBalance + initSellerBalance,
      );
    });

    it('Two sides royalty transfer hook', async () => {
      const creatorKeypair = Keypair.generate();
      const royaltyTransferHookArgs: TransferHookArgs = {
        transferHookProgramId: LIBREPLEX_ROYALTY_ENFORCEMENT_PROGRAM_ID,
        creatorAddress: creatorKeypair.publicKey,
        royaltyBp: 300,
        legacy: false,
      };
      const seller = Keypair.generate();
      await airdrop(connection, seller.publicKey, 50);
      const { mint, poolData, poolAta, sellState, solEscrowKey, groupAddress } =
        await createPoolWithExampleT22ExtDeposits(
          program,
          connection,
          wallet.payer,
          'both', // side
          {
            owner: wallet.publicKey,
            cosigner: cosigner,
            curveType: CurveKind.exp,
            curveDelta: new anchor.BN(300), // 300 basis points
            expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
            lpFeeBp: 200,
          },
          undefined,
          undefined,
          royaltyTransferHookArgs,
        );

      const {
        mint: extraMint,
        recipientTokenAccount: extraRecipientTokenAccount,
      } = await createTestMintAndTokenT22VanillaExt(
        connection,
        wallet.payer,
        seller.publicKey,
        groupAddress,
        undefined,
        royaltyTransferHookArgs,
      );

      const { key: extraNftSellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        extraMint,
      );
      const extraPoolAta = await getAssociatedTokenAddress(
        extraMint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      let [
        initReferralBalance,
        initSellerBalance,
        initBuyerBalance,
        initCreatorBalance,
      ] = await Promise.all([
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(seller.publicKey),
        connection.getBalance(buyer.publicKey),
        connection.getBalance(creatorKeypair.publicKey),
      ]);

      const expectedLpFees = LAMPORTS_PER_SOL * 0.02;
      const expectedTakerFees = LAMPORTS_PER_SOL * 0.01;
      const expectedBuyPrices = getSolFulfillBuyPrices({
        totalPriceLamports: LAMPORTS_PER_SOL,
        lpFeeBp: 200,
        takerFeeBp: 100,
        metadataRoyaltyBp: 300,
        buysideCreatorRoyaltyBp: 10_000,
        makerFeeBp: 0,
      });

      const tx = await program.methods
        .solExtFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: expectedBuyPrices.sellerReceives,
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
          buysideSolEscrowAccount: solEscrowKey,
          assetMint: extraMint,
          payerAssetAccount: extraRecipientTokenAccount,
          sellsideEscrowTokenAccount: extraPoolAta,
          ownerTokenAccount: extraRecipientTokenAccount,
          allowlistAuxAccount: SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          sellState: extraNftSellState,
        })
        .remainingAccounts(
          await generateRemainingAccounts(
            connection,
            extraMint,
            royaltyTransferHookArgs,
            true, // isFulfill
          ),
        )
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: TRANSFER_HOOK_COMPUTE_UNITS,
          }),
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = seller.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, seller);

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const expectedTxFees = SIGNATURE_FEE_LAMPORTS * 2; // cosigner + payer
      {
        const [
          sellerBalance,
          referralBalance,
          sellStatePDARent,
          poolTokenAccount,
          afterCreatorBalance,
        ] = await Promise.all([
          connection.getBalance(seller.publicKey),
          connection.getBalance(poolData.referral.publicKey),
          getSellStatePDARent(connection),
          getTokenAccount2022(connection, extraPoolAta, TOKEN_2022_PROGRAM_ID),
          connection.getBalance(creatorKeypair.publicKey),
        ]);

        assert.equal(
          afterCreatorBalance,
          initCreatorBalance + expectedBuyPrices.royaltyPaid.toNumber(), // royalty
        );
        assert.equal(
          sellerBalance,
          initSellerBalance +
            expectedBuyPrices.sellerReceives.toNumber() -
            expectedTxFees -
            sellStatePDARent, // no token account rent bc seller ata was closed and pool ata opened
        );
        assert.equal(
          referralBalance,
          initReferralBalance + expectedBuyPrices.takerFeePaid.toNumber(),
        );
        assert.equal(Number(poolTokenAccount.amount), 1);
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
        expectedBuyPrices.lpFeePaid.toNumber(),
      );
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 2);

      const buyerNftAtaAddress = await getAssociatedTokenAddress(
        mint,
        buyer.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      {
        const tx = await program.methods
          .solExtFulfillSell({
            assetAmount: new anchor.BN(1),
            maxPaymentAmount: new anchor.BN(
              LAMPORTS_PER_SOL +
                expectedTakerFees +
                expectedLpFees +
                0.03 * LAMPORTS_PER_SOL, // 3% royalty
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
            buysideSolEscrowAccount: solEscrowKey,
            assetMint: mint,
            sellsideEscrowTokenAccount: poolAta,
            payerAssetAccount: buyerNftAtaAddress,
            sellState: sellState,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .remainingAccounts(
            await generateRemainingAccounts(
              connection,
              mint,
              royaltyTransferHookArgs,
              true, // isFulfill
            ),
          )
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({
              units: TRANSFER_HOOK_COMPUTE_UNITS,
            }),
          ])
          .transaction();

        const blockhashData = await connection.getLatestBlockhash();
        tx.feePayer = buyer.publicKey;
        tx.recentBlockhash = blockhashData.blockhash;
        tx.partialSign(cosigner, buyer);

        await sendAndAssertTx(connection, tx, blockhashData, false);
      }

      {
        const expectedMakerFees = LAMPORTS_PER_SOL * 0.01;
        const expectedReferralFees = expectedTakerFees + expectedMakerFees;
        const expectedRoyaltyFees = LAMPORTS_PER_SOL * 0.03; // 3% royalty
        const [buyerBalance, referralBalance, buyerAta, tokenAccountRent] =
          await Promise.all([
            connection.getBalance(buyer.publicKey),
            connection.getBalance(poolData.referral.publicKey),
            getTokenAccount2022(
              connection,
              buyerNftAtaAddress,
              TOKEN_2022_PROGRAM_ID,
            ),
            connection.getBalance(buyerNftAtaAddress),
          ]);

        assertIsBetween(
          buyerBalance,
          initBuyerBalance -
            LAMPORTS_PER_SOL -
            expectedLpFees -
            expectedTakerFees -
            expectedRoyaltyFees -
            expectedTxFees -
            tokenAccountRent,
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
        expectedBuyPrices.lpFeePaid.toNumber() + 0.02 * LAMPORTS_PER_SOL,
        PRICE_ERROR_RANGE,
      );
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);

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
});
