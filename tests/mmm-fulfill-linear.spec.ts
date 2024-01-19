import * as anchor from '@project-serum/anchor';
import {
  getAssociatedTokenAddress,
  getAccount as getTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
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
  getSolFulfillBuyPrices,
} from '../sdk/src';
import {
  airdrop,
  assertFailedTx,
  assertIsBetween,
  assertTx,
  createPoolWithExampleDeposits,
  getMetadataURI,
  getMetaplexInstance,
  getSellStatePDARent,
  getTokenAccountRent,
  LAMPORT_ERROR_RANGE,
  sendAndAssertTx,
  SIGNATURE_FEE_LAMPORTS,
} from './utils';

describe('mmm-fulfill-linear', () => {
  const TOKEN_PROGRAM_IDS = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

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

  TOKEN_PROGRAM_IDS.forEach((tokenProgramId) => {
    describe(`Token program: ${tokenProgramId}`, () => {
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
              curveType: CurveKind.linear,
              curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(
                new anchor.BN(10),
              ), // 0.1 SOL
              expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
              reinvestFulfillBuy: true,
              reinvestFulfillSell: true,
            },
            'sell',
            tokenProgramId,
          ),
          airdrop(connection, buyer.publicKey, 10),
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
          const expectedTakerFees = 1.1 * LAMPORTS_PER_SOL * 0.01;
          const tx = await program.methods
            .solFulfillSell({
              assetAmount: new anchor.BN(1),
              maxPaymentAmount: new anchor.BN(
                1.1 * LAMPORTS_PER_SOL + expectedTakerFees,
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
              tokenProgram: tokenProgramId,
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
          const expectedTakerFees = 1.1 * LAMPORTS_PER_SOL * 0.01;
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
              1.1 * LAMPORTS_PER_SOL -
              expectedTxFees -
              expectedTakerFees,
          );
          assert.equal(
            referralBalance,
            initReferralBalance + expectedReferralFees,
          );
          assert.equal(poolAtaBalance, 0);
          assert.equal(poolEscrowBalance, 1.1 * LAMPORTS_PER_SOL);
          assertIsBetween(
            afterWalletBalance,
            initWalletBalance + tokenAccountRent + sellStatePDARent,
            LAMPORT_ERROR_RANGE,
          );
          assert.equal(sellStateBalance, 0);

          initReferralBalance = referralBalance;
          initBuyerBalance = buyerBalance;
        }

        let poolAccountInfo = await program.account.pool.fetch(
          poolData.poolKey,
        );
        assert.equal(
          poolAccountInfo.spotPrice.toNumber(),
          1.1 * LAMPORTS_PER_SOL,
        );
        assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 5);
        assert.equal(
          poolAccountInfo.buysidePaymentAmount.toNumber(),
          1.1 * LAMPORTS_PER_SOL,
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
              curveType: CurveKind.linear,
              curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(
                new anchor.BN(10),
              ), // 0.1 SOL
              spotPrice: new anchor.BN(2.1 * LAMPORTS_PER_SOL),
              reinvestFulfillBuy: false,
              reinvestFulfillSell: false,
              expiry: new anchor.BN(0),
              lpFeeBp: 200,
              referral: poolData.referral.publicKey,
              cosignerAnnotation: new Array(32)
                .fill(0)
                .map((_, index) => index),
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
          const expectedTakerFees = 4.5 * LAMPORTS_PER_SOL * 0.015;
          const tx = await program.methods
            .solFulfillSell({
              assetAmount: new anchor.BN(2),
              maxPaymentAmount: new anchor.BN(
                4.5 * LAMPORTS_PER_SOL + expectedTakerFees,
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
              tokenProgram: tokenProgramId,
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
          const expectedTakerFees = 4.5 * LAMPORTS_PER_SOL * 0.015;
          const expectedMakerFees = 4.5 * LAMPORTS_PER_SOL * 0.02;
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
              4.5 * LAMPORTS_PER_SOL -
              expectedTxFees -
              expectedTakerFees,
          );
          assert.equal(
            referralBalance,
            initReferralBalance + expectedReferralFees,
          );
          assert.equal(poolAtaBalance, tokenAccountRent);
          assert.equal(poolEscrowBalance, 1.1 * LAMPORTS_PER_SOL);
          assert.equal(
            afterWalletBalance,
            initWalletBalance + 4.5 * LAMPORTS_PER_SOL - expectedMakerFees,
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
        assert.equal(
          poolAccountInfo.spotPrice.toNumber(),
          2.3 * LAMPORTS_PER_SOL,
        );
        assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 3);
        assert.equal(
          poolAccountInfo.buysidePaymentAmount.toNumber(),
          1.1 * LAMPORTS_PER_SOL,
        );

        {
          initWalletBalance = await connection.getBalance(wallet.publicKey);
          const { key: sellState } = getMMMSellStatePDA(
            program.programId,
            poolData.poolKey,
            poolData.sft.mintAddress,
          );
          const tx = await program.methods
            .solFulfillSell({
              assetAmount: new anchor.BN(1),
              maxPaymentAmount: new anchor.BN(2.4 * LAMPORTS_PER_SOL),
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
              tokenProgram: tokenProgramId,
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
          const expectedMakerFees = 2.4 * LAMPORTS_PER_SOL * 0.04;
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
              2.4 * LAMPORTS_PER_SOL -
              (expectedTxFees - tokenAccountRent), // token account has already been created
          );
          assert.equal(
            referralBalance,
            initReferralBalance + expectedReferralFees,
          );
          assert.equal(poolAtaBalance, tokenAccountRent);
          assert.equal(poolEscrowBalance, 1.1 * LAMPORTS_PER_SOL);
          assert.equal(
            afterWalletBalance,
            initWalletBalance + 2.4 * LAMPORTS_PER_SOL - expectedMakerFees,
          );

          initReferralBalance = referralBalance;
          initBuyerBalance = buyerBalance;
        }

        poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
        assert.equal(
          poolAccountInfo.spotPrice.toNumber(),
          2.4 * LAMPORTS_PER_SOL,
        );
        assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 2);
        assert.equal(
          poolAccountInfo.buysidePaymentAmount.toNumber(),
          1.1 * LAMPORTS_PER_SOL,
        );
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
              curveType: CurveKind.linear,
              curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(
                new anchor.BN(10),
              ), // 0.1 SOL
              expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
              referralBp: 200,
              reinvestFulfillBuy: false,
              reinvestFulfillSell: false,
            },
            'buy',
            tokenProgramId,
            seller.publicKey,
          ),
          airdrop(connection, seller.publicKey, 10),
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
              tokenProgram: tokenProgramId,
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
          ] = await Promise.all([
            connection.getBalance(seller.publicKey),
            connection.getBalance(poolData.referral.publicKey),
            connection.getBalance(poolData.poolAtaSft),
            connection.getBalance(poolData.poolPaymentEscrow),
            connection.getBalance(wallet.publicKey),
          ]);
          assert.equal(
            sellerBalance,
            initSellerBalance +
              2.7 * LAMPORTS_PER_SOL -
              (SIGNATURE_FEE_LAMPORTS * 2 + tokenAccountRent) -
              expectedTakerFees,
          );
          assert.equal(
            referralBalance,
            initReferralBalance + expectedReferralFees,
          );
          assert.equal(poolAtaBalance, 0);
          assert.equal(
            poolEscrowBalance,
            7.3 * LAMPORTS_PER_SOL - totalMakerFees,
          );
          assert.equal(afterWalletBalance, initWalletBalance);

          initReferralBalance = referralBalance;
          initSellerBalance = sellerBalance;
        }

        let poolAccountInfo = await program.account.pool.fetch(
          poolData.poolKey,
        );
        assert.equal(
          poolAccountInfo.spotPrice.toNumber(),
          0.7 * LAMPORTS_PER_SOL,
        );
        assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
        assert.equal(
          poolAccountInfo.buysidePaymentAmount.toNumber(),
          7.3 * LAMPORTS_PER_SOL - totalMakerFees,
        );

        const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
          poolData.extraNft.mintAddress,
          wallet.publicKey,
        );

        {
          // update pool to reinvest = true and price to 0.5
          // since spot price < escrow, LP fees are paid
          await program.methods
            .updatePool({
              curveType: CurveKind.linear,
              curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(
                new anchor.BN(10),
              ), // 0.1 SOL
              spotPrice: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
              reinvestFulfillBuy: true,
              reinvestFulfillSell: true,
              expiry: new anchor.BN(0),
              lpFeeBp: 200,
              referral: poolData.referral.publicKey,
              cosignerAnnotation: new Array(32)
                .fill(0)
                .map((_, index) => index),
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
              minPaymentAmount: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
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
              tokenProgram: tokenProgramId,
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
          const expectedMakerFees = 0.5 * LAMPORTS_PER_SOL * 0.015;
          const expectedReferralFees = expectedMakerFees;
          totalMakerFees += expectedMakerFees;
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
              0.5 * LAMPORTS_PER_SOL -
              (SIGNATURE_FEE_LAMPORTS * 2 +
                tokenAccountRent * 0 +
                sellStatePDARent), // reinvest thus we don't need to pay the owner_token_account rent
          );
          assert.equal(
            referralBalance,
            initReferralBalance + expectedReferralFees,
          );
          assert.equal(poolAtaBalance, tokenAccountRent);
          assert.equal(
            poolEscrowBalance,
            6.8 * LAMPORTS_PER_SOL - totalMakerFees,
          );
          assert.equal(afterWalletBalance, initWalletBalance);
          assert.equal(Number(poolAta.amount), 1);
          assert.equal(poolAta.owner.toBase58(), poolData.poolKey.toBase58());
          assert.equal(
            poolAta.mint.toBase58(),
            poolData.extraNft.mintAddress.toBase58(),
          );

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
        assert.equal(
          poolAccountInfo.spotPrice.toNumber(),
          0.4 * LAMPORTS_PER_SOL,
        );
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
        assert.equal(
          poolAccountInfo.buysidePaymentAmount.toNumber(),
          6.8 * LAMPORTS_PER_SOL - totalMakerFees,
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
              curveType: CurveKind.linear,
              curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(new anchor.BN(5)), // 0.1 SOL
              expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
              referralBp: 100,
              lpFeeBp: 200,
            },
            'both',
            tokenProgramId,
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

        const expectedBuyPrices = getSolFulfillBuyPrices({
          totalPriceLamports: LAMPORTS_PER_SOL,
          lpFeeBp: 200,
          takerFeeBp: 100,
          metadataRoyaltyBp: 0,
          buysideCreatorRoyaltyBp: 0,
          makerFeeBp: 0,
        });
        {
          const tx = await program.methods
            .solFulfillBuy({
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
              tokenProgram: tokenProgramId,
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
              expectedBuyPrices.sellerReceives.toNumber() -
              expectedTxFees -
              sellStatePDARent, // no token account rent bc seller ata was closed and pool ata opened
          );
          assert.equal(
            referralBalance,
            initReferralBalance + expectedBuyPrices.takerFeePaid.toNumber(),
          );
          assert.equal(Number(poolAta.amount), 1);
          initReferralBalance = referralBalance;
        }

        let poolAccountInfo = await program.account.pool.fetch(
          poolData.poolKey,
        );
        assert.equal(
          poolAccountInfo.spotPrice.toNumber(),
          0.8 * LAMPORTS_PER_SOL,
        );
        assert.equal(
          poolAccountInfo.lpFeeEarned.toNumber(),
          expectedBuyPrices.lpFeePaid.toNumber(),
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
        const expectedSellLpFees = LAMPORTS_PER_SOL * 0.02;
        const expectedSellTakerFees = LAMPORTS_PER_SOL * 0.01;

        {
          const tx = await program.methods
            .solFulfillSell({
              assetAmount: new anchor.BN(1),
              maxPaymentAmount: new anchor.BN(
                LAMPORTS_PER_SOL + expectedSellTakerFees + expectedSellLpFees,
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
              tokenProgram: tokenProgramId,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
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
          const expectedReferralFees =
            expectedSellTakerFees + expectedMakerFees;
          const [buyerBalance, referralBalance, buyerAta] = await Promise.all([
            connection.getBalance(buyer.publicKey),
            connection.getBalance(poolData.referral.publicKey),
            getTokenAccount(connection, buyerNftAtaAddress),
          ]);

          assert.equal(
            buyerBalance,
            initBuyerBalance -
              LAMPORTS_PER_SOL -
              expectedSellLpFees -
              expectedSellTakerFees -
              expectedTxFees -
              tokenAccountRent, // no token account rent bc seller ata was closed and pool ata opened
          );
          assert.equal(
            referralBalance,
            initReferralBalance + expectedReferralFees,
          );
          assert.equal(Number(buyerAta.amount), 1);
        }

        poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
        assert.equal(
          poolAccountInfo.spotPrice.toNumber(),
          1 * LAMPORTS_PER_SOL,
        );
        assert.equal(
          poolAccountInfo.lpFeeEarned.toNumber(),
          expectedSellLpFees + expectedBuyPrices.lpFeePaid.toNumber(),
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

      it('BuySide with URI aux', async () => {
        const seller = Keypair.generate();
        const metaplexInstance = getMetaplexInstance(connection);
        const [poolData] = await Promise.all([
          createPoolWithExampleDeposits(
            program,
            connection,
            // Must match MCC as well as validating URI against allowlist aux.
            [AllowlistKind.mcc, AllowlistKind.metadata],
            {
              owner: wallet.publicKey,
              cosigner,
              curveType: CurveKind.linear,
              curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(
                new anchor.BN(10),
              ), // 0.1 SOL
              expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
              referralBp: 200,
              reinvestFulfillBuy: false,
              reinvestFulfillSell: false,
            },
            'buy',
            tokenProgramId,
            seller.publicKey,
          ),
          airdrop(connection, seller.publicKey, 10),
        ]);

        const ownerExtraSftAtaAddress = await getAssociatedTokenAddress(
          poolData.extraSft.mintAddress,
          wallet.publicKey,
        );

        {
          const expectedTakerFees = 2.7 * LAMPORTS_PER_SOL * 0.04;
          const { key: sellState } = getMMMSellStatePDA(
            program.programId,
            poolData.poolKey,
            poolData.extraSft.mintAddress,
          );

          const fulfillBuyCall = (allowlistAux: string) => {
            return program.methods
              .solFulfillBuy({
                assetAmount: new anchor.BN(3),
                minPaymentAmount: new anchor.BN(
                  2.7 * LAMPORTS_PER_SOL - expectedTakerFees,
                ),
                allowlistAux: allowlistAux,
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
                tokenProgram: tokenProgramId,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                rent: SYSVAR_RENT_PUBKEY,
              })
              .transaction();
          };
          const failingUriTx = await fulfillBuyCall('some-different-uri');

          const executeTx = async (tx: anchor.web3.Transaction) => {
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

            return { txId, confirmedTx };
          };

          const { txId, confirmedTx } = await executeTx(failingUriTx);

          assertFailedTx(txId, confirmedTx);
          assert.equal(await connection.getBalance(sellState), 0);

          const { txId: successTxId, confirmedTx: successTx } = await executeTx(
            await fulfillBuyCall(getMetadataURI(0)),
          );

          assertTx(successTxId, successTx);
        }
      });
    });
  });
});
