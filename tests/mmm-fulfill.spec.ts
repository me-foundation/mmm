import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
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
import { Mmm, AllowlistKind, CurveKind } from '../sdk/src';
import {
  airdrop,
  assertIsBetween,
  createPoolWithExampleDeposits,
  getMetaplexInstance,
  getTokenAccountRent,
  LAMPORT_ERROR_RANGE,
  SIGNATURE_FEE_LAMPORTS,
} from './utils';

describe('mmm-fulfill', () => {
  const { wallet, connection, opts } = anchor.AnchorProvider.env();
  opts.commitment = 'processed';
  const program = anchor.workspace.Mmm as Program<Mmm>;
  const cosigner = Keypair.generate();

  describe('Linear curve', () => {
    it('Sellside only', async () => {
      const buyer = Keypair.generate();
      const metaplexInstance = getMetaplexInstance(connection);
      const [poolData] = await Promise.all([
        createPoolWithExampleDeposits(
          program,
          connection,
          AllowlistKind.fvca,
          {
            owner: wallet.publicKey,
            cosigner,
            curveType: CurveKind.linear,
            curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(new anchor.BN(10)), // 0.1 SOL
            expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
            reinvestFulfillBuy: true,
            reinvestFulfillSell: true,
          },
          'sell',
        ),
        airdrop(connection, buyer.publicKey, 10),
      ]);

      const buyerNftAtaAddress = await getAssociatedTokenAddress(
        poolData.nft.mintAddress,
        buyer.publicKey,
      );
      let initWalletBalance = await connection.getBalance(wallet.publicKey);
      let initReferralBalance = await connection.getBalance(
        poolData.referral.publicKey,
      );
      let initBuyerBalance = await connection.getBalance(buyer.publicKey);

      {
        const tx = await program.methods
          .solFulfillSell({
            assetAmount: new anchor.BN(1),
            maxPaymentAmount: new anchor.BN(1 * LAMPORTS_PER_SOL),
            buysideCreatorRoyaltyBp: 0,
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
        await connection.confirmTransaction(
          {
            signature: txId,
            blockhash: blockhashData.blockhash,
            lastValidBlockHeight: blockhashData.lastValidBlockHeight,
          },
          'processed',
        );
      }

      const tokenAccountRent = await getTokenAccountRent(connection);

      const expectedTxFees =
        SIGNATURE_FEE_LAMPORTS * 2 + // cosigner + payer
        tokenAccountRent; // token account
      {
        const expectedReferralFees = 1 * LAMPORTS_PER_SOL * 0.03;
        const [
          buyerBalance,
          referralBalance,
          poolAtaBalance,
          poolEscrowBalance,
          afterWalletBalance,
        ] = await Promise.all([
          connection.getBalance(buyer.publicKey),
          connection.getBalance(poolData.referral.publicKey),
          connection.getBalance(poolData.poolAtaNft),
          connection.getBalance(poolData.poolPaymentEscrow),
          connection.getBalance(wallet.publicKey),
        ]);
        assert.equal(
          buyerBalance,
          initBuyerBalance -
            1 * LAMPORTS_PER_SOL -
            expectedTxFees -
            expectedReferralFees,
        );
        assert.equal(
          referralBalance,
          initReferralBalance + expectedReferralFees,
        );
        assert.equal(poolAtaBalance, 0);
        assert.equal(poolEscrowBalance, 1 * LAMPORTS_PER_SOL);
        assertIsBetween(
          afterWalletBalance,
          initWalletBalance + tokenAccountRent,
          LAMPORT_ERROR_RANGE,
        );

        initReferralBalance = referralBalance;
        initBuyerBalance = buyerBalance;
      }

      let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(
        poolAccountInfo.spotPrice.toNumber(),
        1.1 * LAMPORTS_PER_SOL,
      );
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 5);

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
            curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(new anchor.BN(10)), // 0.1 SOL
            spotPrice: new anchor.BN(2.1 * LAMPORTS_PER_SOL),
            reinvestFulfillBuy: false,
            reinvestFulfillSell: false,
            expiry: new anchor.BN(0),
            lpFeeBp: 200,
            referral: poolData.referral.publicKey,
            referralBp: 300,
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
        const tx = await program.methods
          .solFulfillSell({
            assetAmount: new anchor.BN(2),
            maxPaymentAmount: new anchor.BN(4.3 * LAMPORTS_PER_SOL),
            buysideCreatorRoyaltyBp: 0,
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
        await connection.confirmTransaction(
          {
            signature: txId,
            blockhash: blockhashData.blockhash,
            lastValidBlockHeight: blockhashData.lastValidBlockHeight,
          },
          'processed',
        );
      }

      {
        const expectedReferralFees = 4.3 * LAMPORTS_PER_SOL * 0.03;
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
            4.3 * LAMPORTS_PER_SOL -
            expectedTxFees -
            expectedReferralFees,
        );
        assert.equal(
          referralBalance,
          initReferralBalance + expectedReferralFees,
        );
        assert.equal(poolAtaBalance, tokenAccountRent);
        assert.equal(poolEscrowBalance, 1 * LAMPORTS_PER_SOL);
        assert.equal(
          afterWalletBalance,
          initWalletBalance + 4.3 * LAMPORTS_PER_SOL,
        );

        initReferralBalance = referralBalance;
        initBuyerBalance = buyerBalance;
      }

      poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(
        poolAccountInfo.spotPrice.toNumber(),
        2.3 * LAMPORTS_PER_SOL,
      );
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 3);

      {
        initWalletBalance = await connection.getBalance(wallet.publicKey);
        const tx = await program.methods
          .solFulfillSell({
            assetAmount: new anchor.BN(1),
            maxPaymentAmount: new anchor.BN(4.3 * LAMPORTS_PER_SOL),
            buysideCreatorRoyaltyBp: 0,
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
        await connection.confirmTransaction(
          {
            signature: txId,
            blockhash: blockhashData.blockhash,
            lastValidBlockHeight: blockhashData.lastValidBlockHeight,
          },
          'processed',
        );
      }

      {
        const expectedReferralFees = 2.3 * LAMPORTS_PER_SOL * 0.03;
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
            2.3 * LAMPORTS_PER_SOL -
            (expectedTxFees - tokenAccountRent) - // token account has already been created
            expectedReferralFees,
        );
        assert.equal(
          referralBalance,
          initReferralBalance + expectedReferralFees,
        );
        assert.equal(poolAtaBalance, tokenAccountRent);
        assert.equal(poolEscrowBalance, 1 * LAMPORTS_PER_SOL);
        assert.equal(
          afterWalletBalance,
          initWalletBalance + 2.3 * LAMPORTS_PER_SOL,
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
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 2);
    });

    it('Buyside only', async () => {
      const seller = Keypair.generate();
      const metaplexInstance = getMetaplexInstance(connection);
      const [poolData] = await Promise.all([
        createPoolWithExampleDeposits(
          program,
          connection,
          AllowlistKind.mcc,
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
          seller.publicKey,
        ),
        airdrop(connection, seller.publicKey, 10),
      ]);

      const ownerSftAtaAddress = await getAssociatedTokenAddress(
        poolData.sft.mintAddress,
        wallet.publicKey,
      );
      let initWalletBalance = await connection.getBalance(wallet.publicKey);
      let initReferralBalance = await connection.getBalance(
        poolData.referral.publicKey,
      );
      let initSellerBalance = await connection.getBalance(seller.publicKey);

      {
        const tx = await program.methods
          .solFulfillBuy({
            assetAmount: new anchor.BN(3),
            minPaymentAmount: new anchor.BN(2.7 * LAMPORTS_PER_SOL),
          })
          .accountsStrict({
            payer: seller.publicKey,
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
            payerAssetAccount: poolData.sft.tokenAddress!,
            sellsideEscrowTokenAccount: poolData.poolAtaSft,
            ownerTokenAccount: ownerSftAtaAddress,
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
        await connection.confirmTransaction(
          {
            signature: txId,
            blockhash: blockhashData.blockhash,
            lastValidBlockHeight: blockhashData.lastValidBlockHeight,
          },
          'processed',
        );
      }

      const tokenAccountRent = await getTokenAccountRent(connection);
      const expectedTxFees =
        SIGNATURE_FEE_LAMPORTS * 2 + // cosigner + payer
        tokenAccountRent; // owner sft tooken account
      {
        const expectedReferralFees = 2.7 * LAMPORTS_PER_SOL * 0.02;
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
            expectedTxFees -
            expectedReferralFees,
        );
        assert.equal(
          referralBalance,
          initReferralBalance + expectedReferralFees,
        );
        assert.equal(poolAtaBalance, 0);
        assert.equal(poolEscrowBalance, 7.3 * LAMPORTS_PER_SOL);
        assert.equal(afterWalletBalance, initWalletBalance);

        initReferralBalance = referralBalance;
        initSellerBalance = sellerBalance;
      }

      let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(
        poolAccountInfo.spotPrice.toNumber(),
        0.7 * LAMPORTS_PER_SOL,
      );
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 3);

      const ownerNftAtaAddress = await getAssociatedTokenAddress(
        poolData.nft.mintAddress,
        wallet.publicKey,
      );

      {
        // update pool to reinvest = true and price to 0.5
        // since spot price < escrow, LP fees are paid
        await program.methods
          .updatePool({
            curveType: CurveKind.linear,
            curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(new anchor.BN(10)), // 0.1 SOL
            spotPrice: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
            reinvestFulfillBuy: true,
            reinvestFulfillSell: true,
            expiry: new anchor.BN(0),
            lpFeeBp: 200,
            referral: poolData.referral.publicKey,
            referralBp: 300,
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
        const tx = await program.methods
          .solFulfillBuy({
            assetAmount: new anchor.BN(1),
            minPaymentAmount: new anchor.BN(0.5 * LAMPORTS_PER_SOL),
          })
          .accountsStrict({
            payer: seller.publicKey,
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
            payerAssetAccount: poolData.nft.tokenAddress!,
            sellsideEscrowTokenAccount: poolData.poolAtaNft,
            ownerTokenAccount: ownerNftAtaAddress,
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
        await connection.confirmTransaction(
          {
            signature: txId,
            blockhash: blockhashData.blockhash,
            lastValidBlockHeight: blockhashData.lastValidBlockHeight,
          },
          'processed',
        );
      }

      {
        const expectedReferralFees = 0.5 * LAMPORTS_PER_SOL * 0.03;
        const expectedLpFees = 0.5 * LAMPORTS_PER_SOL * 0.02;
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
          connection.getBalance(poolData.poolAtaNft),
          connection.getBalance(poolData.poolPaymentEscrow),
          connection.getBalance(wallet.publicKey),
          getTokenAccount(connection, poolData.poolAtaNft),
        ]);
        assert.equal(
          sellerBalance,
          initSellerBalance +
            0.5 * LAMPORTS_PER_SOL -
            expectedTxFees -
            expectedReferralFees -
            expectedLpFees,
        );
        assert.equal(
          referralBalance,
          initReferralBalance + expectedReferralFees,
        );
        assert.equal(poolAtaBalance, tokenAccountRent);
        assert.equal(poolEscrowBalance, 6.8 * LAMPORTS_PER_SOL);
        assert.equal(afterWalletBalance, initWalletBalance + expectedLpFees);
        assert.equal(Number(poolAta.amount), 1);
        assert.deepEqual(poolAta.owner.toBase58(), poolData.poolKey.toBase58());
        assert.deepEqual(
          poolAta.mint.toBase58(),
          poolData.nft.mintAddress.toBase58(),
        );

        initReferralBalance = referralBalance;
        initSellerBalance = sellerBalance;
      }

      poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(
        poolAccountInfo.spotPrice.toNumber(),
        0.4 * LAMPORTS_PER_SOL,
      );
      assert.equal(
        poolAccountInfo.lpFeeEarned.toNumber(),
        0.5 * LAMPORTS_PER_SOL * 0.02,
      );
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 4);
    });
  });
});
