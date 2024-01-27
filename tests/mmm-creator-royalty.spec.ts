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
  assertTx,
  createPoolWithExampleDeposits,
  createPoolWithExampleDepositsUmi,
  getMetaplexInstance,
  getSellStatePDARent,
  getTokenAccountRent,
  sendAndAssertTx,
  SIGNATURE_FEE_LAMPORTS,
  getTokenAccount2022,
  IMMUTABLE_OWNER_EXTENSION_LAMPORTS,
} from './utils';
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';

describe('mmm-creator-royalty', () => {
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
      it('correctly pays creator royalty', async () => {
        const seller = Keypair.generate();
        const buyer = Keypair.generate();
        const [poolData] = await Promise.all([
          createPoolWithExampleDepositsUmi(
            program,
            [AllowlistKind.mint],
            {
              owner: wallet.publicKey,
              cosigner,
              curveType: CurveKind.linear,
              curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(new anchor.BN(5)), // 0.1 SOL
              expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
              lpFeeBp: 200,
              buysideCreatorRoyaltyBp: 5000,
              reinvestFulfillSell: false,
            },
            'both',
            tokenProgramId,
            seller.publicKey,
          ),
          airdrop(connection, seller.publicKey, 10),
          airdrop(connection, buyer.publicKey, 10),
        ]);

        const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
          toWeb3JsPublicKey(poolData.extraNft.mintAddress),
          wallet.publicKey,
          true,
          tokenProgramId,
        );

        const { key: extraNftSellState } = getMMMSellStatePDA(
          program.programId,
          poolData.poolKey,
          toWeb3JsPublicKey(poolData.extraNft.mintAddress),
        );
        let [
          initReferralBalance,
          initSellerBalance,
          initBuyerBalance,
          initPaymentEscrowBalance,
          initCreatorBalance,
        ] = await Promise.all([
          connection.getBalance(poolData.referral.publicKey),
          connection.getBalance(seller.publicKey),
          connection.getBalance(buyer.publicKey),
          connection.getBalance(poolData.poolPaymentEscrow),
          connection.getBalance(poolData.nftCreator.publicKey),
        ]);

        const tokenAccountRent = await getTokenAccountRent(connection);
        const sellStatePDARent = await getSellStatePDARent(connection);

        const expectedTxFees = SIGNATURE_FEE_LAMPORTS * 2; // cosigner + payer
        const expectedBuyPrices = getSolFulfillBuyPrices({
          totalPriceLamports: LAMPORTS_PER_SOL,
          lpFeeBp: 200,
          takerFeeBp: 100,
          metadataRoyaltyBp: 100,
          buysideCreatorRoyaltyBp: 5000,
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
              assetMetadata: toWeb3JsPublicKey(
                poolData.extraNft.metadataAddress,
              ),
              assetMasterEdition: toWeb3JsPublicKey(
                poolData.extraNft.masterEditionAddress,
              ),
              assetMint: toWeb3JsPublicKey(poolData.extraNft.mintAddress),
              payerAssetAccount: toWeb3JsPublicKey(
                poolData.extraNft.tokenAddress!,
              ),
              sellsideEscrowTokenAccount: poolData.poolAtaExtraNft,
              ownerTokenAccount: ownerExtraNftAtaAddress,
              allowlistAuxAccount: SystemProgram.programId,
              systemProgram: SystemProgram.programId,
              tokenProgram: tokenProgramId,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
              sellState: extraNftSellState,
            })
            .remainingAccounts([
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

          const [
            sellerBalance,
            referralBalance,
            poolAta,
            poolEscrowBalance,
            creatorBalance,
          ] = await Promise.all([
            connection.getBalance(seller.publicKey),
            connection.getBalance(poolData.referral.publicKey),
            getTokenAccount2022(
              connection,
              poolData.poolAtaExtraNft,
              tokenProgramId,
            ),
            connection.getBalance(poolData.poolPaymentEscrow),
            connection.getBalance(poolData.nftCreator.publicKey),
          ]);

          assert.equal(
            sellerBalance,
            initSellerBalance +
              expectedBuyPrices.sellerReceives.toNumber() - // amount seller receives for selling
              expectedTxFees - // signature fees
              sellStatePDARent, // no token account rent bc seller ata was closed and pool ata opened
          );
          assert.equal(
            referralBalance,
            initReferralBalance + expectedBuyPrices.takerFeePaid.toNumber(),
          );
          assert.equal(Number(poolAta.amount), 1);
          assert.equal(
            poolEscrowBalance,
            initPaymentEscrowBalance - LAMPORTS_PER_SOL,
          );
          assert.equal(
            creatorBalance,
            initCreatorBalance + expectedBuyPrices.royaltyPaid.toNumber(),
          );
          initReferralBalance = referralBalance;
          initCreatorBalance = creatorBalance;
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
          toWeb3JsPublicKey(poolData.nft.mintAddress),
          buyer.publicKey,
          true,
          tokenProgramId,
        );
        const { key: nftSellState } = getMMMSellStatePDA(
          program.programId,
          poolData.poolKey,
          toWeb3JsPublicKey(poolData.nft.mintAddress),
        );

        {
          const expectedCreatorFees = LAMPORTS_PER_SOL * 0.01 * 0.25;
          const expectedTakerFees = LAMPORTS_PER_SOL * 0.01;
          const expectedLpFees = LAMPORTS_PER_SOL * 0.02;
          const tx = await program.methods
            .solFulfillSell({
              assetAmount: new anchor.BN(1),
              maxPaymentAmount: new anchor.BN(
                LAMPORTS_PER_SOL +
                  expectedTakerFees +
                  expectedLpFees +
                  expectedCreatorFees,
              ),
              buysideCreatorRoyaltyBp: 2500,
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
              assetMetadata: toWeb3JsPublicKey(poolData.nft.metadataAddress),
              assetMasterEdition: toWeb3JsPublicKey(
                poolData.nft.masterEditionAddress,
              ),
              assetMint: toWeb3JsPublicKey(poolData.nft.mintAddress),
              sellsideEscrowTokenAccount: poolData.poolAtaNft,
              payerAssetAccount: buyerNftAtaAddress,
              allowlistAuxAccount: SystemProgram.programId,
              sellState: nftSellState,
              systemProgram: SystemProgram.programId,
              tokenProgram: tokenProgramId,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
            })
            .remainingAccounts([
              {
                pubkey: poolData.nftCreator.publicKey,
                isSigner: false,
                isWritable: true,
              },
            ])
            .transaction();

          const blockhashData = await connection.getLatestBlockhash();
          tx.feePayer = buyer.publicKey;
          tx.recentBlockhash = blockhashData.blockhash;
          tx.partialSign(cosigner, buyer);

          await sendAndAssertTx(connection, tx, blockhashData, false);
        }

        {
          const expectedCreatorFees = LAMPORTS_PER_SOL * 0.01 * 0.25;
          const expectedTakerFees = LAMPORTS_PER_SOL * 0.01;
          const expectedMakerFees = LAMPORTS_PER_SOL * 0.01;
          const expectedReferralFees = expectedTakerFees + expectedMakerFees;
          const expectedLpFees = LAMPORTS_PER_SOL * 0.02;
          const [buyerBalance, referralBalance, buyerAta, creatorBalace] =
            await Promise.all([
              connection.getBalance(buyer.publicKey),
              connection.getBalance(poolData.referral.publicKey),
              getTokenAccount2022(
                connection,
                buyerNftAtaAddress,
                tokenProgramId,
              ),
              connection.getBalance(poolData.nftCreator.publicKey),
            ]);

          let extension_rent = 0;
          if (tokenProgramId === TOKEN_2022_PROGRAM_ID) {
            extension_rent = IMMUTABLE_OWNER_EXTENSION_LAMPORTS;
          }

          assert.equal(
            buyerBalance,
            initBuyerBalance -
              LAMPORTS_PER_SOL -
              expectedLpFees -
              expectedTakerFees -
              expectedTxFees -
              tokenAccountRent -
              extension_rent - // Metaplex NFT ATAs have the immutable extension
              expectedCreatorFees, // no token account rent bc seller ata was closed and pool ata opened
          );
          assert.equal(
            referralBalance,
            initReferralBalance + expectedReferralFees,
          );
          assert.equal(creatorBalace, initCreatorBalance + expectedCreatorFees);
          assert.equal(Number(buyerAta.amount), 1);
        }

        poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
        assert.equal(
          poolAccountInfo.spotPrice.toNumber(),
          1 * LAMPORTS_PER_SOL,
        );
        assert.equal(
          poolAccountInfo.lpFeeEarned.toNumber(),
          expectedBuyPrices.lpFeePaid.toNumber() + 0.02 * LAMPORTS_PER_SOL,
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
  });
});
