import * as anchor from '@project-serum/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
  Keypair,
  LAMPORTS_PER_SOL,
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
} from '../sdk/src';
import {
  SIGNATURE_FEE_LAMPORTS,
  airdrop,
  assertTx,
  createPoolWithExampleDeposits,
  getMetaplexInstance,
  getSellStatePDARent,
  getTokenAccountRent,
} from './utils';

describe('mmm-fulfill-linear', () => {
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

  it('Buyside only for shared-escrow', async () => {
    const seller = Keypair.generate();
    const buyerSharedEscrow = getM2BuyerSharedEscrow(wallet.publicKey)[0];
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
        seller.publicKey,
        true, // sharedEscrow
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
});
