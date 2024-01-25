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
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { assert } from 'chai';
import {
  Mmm,
  AllowlistKind,
  getMMMBuysideSolEscrowPDA,
  getMMMSellStatePDA,
  IDL,
  MMMProgramID,
  CurveKind,
} from '../sdk/src';
import {
  airdrop,
  createPool,
  createPoolWithExampleDeposits,
  getEmptyAllowLists,
  getMetadataURI,
  getMetaplexInstance,
  getPoolRent,
  mintCollection,
  mintNfts,
  sendAndAssertTx,
} from './utils';

describe.skip('mmm-deposit', () => {
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
    describe(`sol_deposit_buy: ${tokenProgramId}`, () => {
      it('transfers users SOL into escrow account', async () => {
        const { poolKey } = await createPool(program, {
          owner: wallet.publicKey,
          cosigner,
        });

        const { key: solEscrowKey } = getMMMBuysideSolEscrowPDA(
          program.programId,
          poolKey,
        );
        await program.methods
          .solDepositBuy({ paymentAmount: new anchor.BN(2 * LAMPORTS_PER_SOL) })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolKey,
            buysideSolEscrowAccount: solEscrowKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([cosigner])
          .rpc();

        assert.equal(
          await connection.getBalance(solEscrowKey),
          2 * LAMPORTS_PER_SOL,
        );

        const poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(
          poolAccountInfo.buysidePaymentAmount.toNumber(),
          2 * LAMPORTS_PER_SOL,
        );
      });
    });
  });

  TOKEN_PROGRAM_IDS.forEach((tokenProgramId) => {
    describe(`try_close_pool: ${tokenProgramId}`, () => {
      it('closes the pool ONLY when escrow is empty', async () => {
        const { poolKey } = await createPool(program, {
          owner: wallet.publicKey,
          cosigner,
        });

        const { key: solEscrowKey } = getMMMBuysideSolEscrowPDA(
          program.programId,
          poolKey,
        );
        await program.methods
          .solDepositBuy({ paymentAmount: new anchor.BN(2 * LAMPORTS_PER_SOL) })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolKey,
            buysideSolEscrowAccount: solEscrowKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([cosigner])
          .rpc();

        assert.equal(
          await connection.getBalance(solEscrowKey),
          2 * LAMPORTS_PER_SOL,
        );

        await program.methods
          .solWithdrawBuy({
            paymentAmount: new anchor.BN(1 * LAMPORTS_PER_SOL),
          })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolKey,
            buysideSolEscrowAccount: solEscrowKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([cosigner])
          .rpc();

        assert.equal(
          await connection.getBalance(solEscrowKey),
          1 * LAMPORTS_PER_SOL,
        );
        assert.notEqual(await connection.getBalance(poolKey), 0);

        await program.methods
          .solWithdrawBuy({
            paymentAmount: new anchor.BN(1 * LAMPORTS_PER_SOL),
          })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolKey,
            buysideSolEscrowAccount: solEscrowKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([cosigner])
          .rpc();

        assert.equal(await connection.getBalance(solEscrowKey), 0);
        assert.equal(await connection.getBalance(poolKey), 0);
      });

      describe('closes pool when the sol escrow balance is low', () => {
        const checkPoolClosedAfterTrade = async ({
          poolData,
          seller,
        }: {
          poolData: Awaited<ReturnType<typeof createPoolWithExampleDeposits>>;
          seller: Keypair;
        }) => {
          const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
            poolData.extraNft.mintAddress,
            wallet.publicKey,
          );
          const metaplexInstance = getMetaplexInstance(connection);

          {
            const { key: sellState } = getMMMSellStatePDA(
              program.programId,
              poolData.poolKey,
              poolData.extraNft.mintAddress,
            );
            const tx = await program.methods
              .solFulfillBuy({
                assetAmount: new anchor.BN(1),
                minPaymentAmount: new anchor.BN(9 * LAMPORTS_PER_SOL),
                allowlistAux: '',
                makerFeeBp: 0,
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

            await sendAndAssertTx(connection, tx, blockhashData, false);
          }

          assert.equal(
            await connection.getBalance(poolData.poolPaymentEscrow),
            0,
          );
          assert.equal(await connection.getBalance(poolData.poolKey), 0);
        };

        const checkPoolClosedAfterWithdraw = async ({
          poolKey,
          withdrawAmount,
          poolShouldBeClosed,
        }: {
          poolKey: PublicKey;
          withdrawAmount: number;
          poolShouldBeClosed: boolean;
        }) => {
          const { key: solEscrowKey } = getMMMBuysideSolEscrowPDA(
            program.programId,
            poolKey,
          );
          await program.methods
            .solDepositBuy({
              paymentAmount: new anchor.BN(2 * LAMPORTS_PER_SOL),
            })
            .accountsStrict({
              owner: wallet.publicKey,
              cosigner: cosigner.publicKey,
              pool: poolKey,
              buysideSolEscrowAccount: solEscrowKey,
              systemProgram: SystemProgram.programId,
            })
            .signers([cosigner])
            .rpc();

          assert.equal(
            await connection.getBalance(solEscrowKey),
            2 * LAMPORTS_PER_SOL,
          );

          await program.methods
            .solWithdrawBuy({
              paymentAmount: new anchor.BN(withdrawAmount),
            })
            .accountsStrict({
              owner: wallet.publicKey,
              cosigner: cosigner.publicKey,
              pool: poolKey,
              buysideSolEscrowAccount: solEscrowKey,
              systemProgram: SystemProgram.programId,
            })
            .signers([cosigner])
            .rpc();

          if (poolShouldBeClosed) {
            assert.equal(await connection.getBalance(solEscrowKey), 0);
            assert.equal(await connection.getBalance(poolKey), 0);
          } else {
            assert.notEqual(await connection.getBalance(solEscrowKey), 0);
            assert.equal(
              await connection.getBalance(poolKey),
              await getPoolRent(connection),
            );
          }
        };

        it('fulfill buy - amount below rent', async () => {
          const seller = Keypair.generate();
          const [poolData] = await Promise.all([
            createPoolWithExampleDeposits(
              program,
              connection,
              [AllowlistKind.mcc],
              {
                owner: wallet.publicKey,
                cosigner,
                // set spot price to 10 lamports under the 10 SOL that is deposited
                spotPrice: new anchor.BN(10 * LAMPORTS_PER_SOL).sub(
                  new anchor.BN(10),
                ),
                curveType: CurveKind.linear,
                curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(
                  new anchor.BN(10),
                ),
                expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
                reinvestFulfillBuy: false,
                reinvestFulfillSell: false,
              },
              'buy',
              tokenProgramId,
              seller.publicKey,
            ),
            airdrop(connection, seller.publicKey, 10),
          ]);
          await checkPoolClosedAfterTrade({
            poolData,
            seller,
          });
        });

        it('withdraw buy - amount below rent', async () => {
          const { poolKey } = await createPool(program, {
            owner: wallet.publicKey,
            cosigner,
          });

          await checkPoolClosedAfterWithdraw({
            poolKey,
            withdrawAmount: 2 * LAMPORTS_PER_SOL - 200,
            poolShouldBeClosed: true,
          });
        });

        it('fulfill buy - amount below 1% but more than 0 data rent', async () => {
          const seller = Keypair.generate();
          const [poolData] = await Promise.all([
            createPoolWithExampleDeposits(
              program,
              connection,
              [AllowlistKind.mcc],
              {
                owner: wallet.publicKey,
                cosigner,
                // default deposit 10 SOL, so we set spot price such that amount left is less than 1% of spot
                spotPrice: new anchor.BN(10 * LAMPORTS_PER_SOL).sub(
                  new anchor.BN(90000000),
                ),
                curveType: CurveKind.linear,
                curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(
                  new anchor.BN(10),
                ),
                expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
                reinvestFulfillBuy: false,
                reinvestFulfillSell: false,
              },
              'buy',
              tokenProgramId,
              seller.publicKey,
            ),
            airdrop(connection, seller.publicKey, 10),
          ]);

          await checkPoolClosedAfterTrade({
            poolData,
            seller,
          });
        });

        it('withdraw buy - amount below 1% but more than 0 data rent', async () => {
          const { poolKey } = await createPool(program, {
            owner: wallet.publicKey,
            cosigner,
          });

          await checkPoolClosedAfterWithdraw({
            poolKey,
            withdrawAmount: 2 * LAMPORTS_PER_SOL - 9000000,
            poolShouldBeClosed: true,
          });
        });

        it('withdraw buy - should not close pool if reinvest flag is true and pool has nfts', async () => {
          const poolData = await createPoolWithExampleDeposits(
            program,
            connection,
            [AllowlistKind.mcc],
            {
              owner: wallet.publicKey,
              cosigner,
              spotPrice: new anchor.BN(10 * LAMPORTS_PER_SOL).sub(
                new anchor.BN(90000000),
              ),
              curveType: CurveKind.linear,
              curveDelta: new anchor.BN(LAMPORTS_PER_SOL).div(
                new anchor.BN(10),
              ),
              expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
              reinvestFulfillBuy: true,
              reinvestFulfillSell: true,
            },
            'sell',
            tokenProgramId,
          );
          await checkPoolClosedAfterWithdraw({
            poolKey: poolData.poolKey,
            withdrawAmount: 2 * LAMPORTS_PER_SOL - 9000000,
            poolShouldBeClosed: false,
          });
        });
      });
    });
  });

  TOKEN_PROGRAM_IDS.forEach((tokenProgramId) => {
    describe(`deposit_sell ${tokenProgramId}`, () => {
      it('correctly verifies fvca-only allowlists when depositing items', async () => {
        const creator = Keypair.generate();
        const metaplexInstance = getMetaplexInstance(connection);
        const [{ poolKey }, nfts, sfts] = await Promise.all([
          createPool(program, {
            owner: wallet.publicKey,
            cosigner,
            allowlists: [
              { kind: AllowlistKind.fvca, value: creator.publicKey },
              ...getEmptyAllowLists(5),
            ],
          }),
          mintNfts(connection, {
            numNfts: 1,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
            recipient: wallet.publicKey,
          }),
          mintNfts(connection, {
            numNfts: 1,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
            sftAmount: 10,
            recipient: wallet.publicKey,
          }),
        ]);

        const mintAddress1 = nfts[0].mintAddress;
        const mintAddress2 = sfts[0].mintAddress;

        let poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);

        const poolAta1 = await getAssociatedTokenAddress(
          mintAddress1,
          poolKey,
          true,
        );
        const { key: sellState1 } = getMMMSellStatePDA(
          program.programId,
          poolKey,
          mintAddress1,
        );
        await program.methods
          .depositSell({ assetAmount: new anchor.BN(1), allowlistAux: '' })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolKey,
            assetMetadata: metaplexInstance
              .nfts()
              .pdas()
              .metadata({ mint: mintAddress1 }),
            assetMasterEdition: metaplexInstance
              .nfts()
              .pdas()
              .masterEdition({ mint: mintAddress1 }),
            assetMint: mintAddress1,
            assetTokenAccount: nfts[0].tokenAddress!,
            sellsideEscrowTokenAccount: poolAta1,
            allowlistAuxAccount: SystemProgram.programId,
            sellState: sellState1,
            systemProgram: SystemProgram.programId,
            tokenProgram: tokenProgramId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([cosigner])
          .rpc();

        let nftEscrow = await getTokenAccount(connection, poolAta1);
        assert.equal(Number(nftEscrow.amount), 1);
        assert.equal(nftEscrow.owner.toBase58(), poolKey.toBase58());
        poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
        assert.equal(await connection.getBalance(nfts[0].tokenAddress!), 0);

        const sellState1AccountInfo = await program.account.sellState.fetch(
          sellState1,
        );
        assert.equal(sellState1AccountInfo.pool.toBase58(), poolKey.toBase58());
        assert.equal(
          sellState1AccountInfo.poolOwner.toBase58(),
          wallet.publicKey.toBase58(),
        );
        assert.equal(
          sellState1AccountInfo.assetMint.toBase58(),
          mintAddress1.toBase58(),
        );
        assert.equal(sellState1AccountInfo.assetAmount.toNumber(), 1);
        assert.deepEqual(
          sellState1AccountInfo.cosignerAnnotation,
          new Array(32).fill(0),
        );

        const poolAta2 = await getAssociatedTokenAddress(
          mintAddress2,
          poolKey,
          true,
        );
        let { key: sellState2 } = getMMMSellStatePDA(
          program.programId,
          poolKey,
          mintAddress2,
        );
        await program.methods
          .depositSell({ assetAmount: new anchor.BN(5), allowlistAux: '' })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolKey,
            assetMetadata: metaplexInstance
              .nfts()
              .pdas()
              .metadata({ mint: mintAddress2 }),
            assetMasterEdition: metaplexInstance
              .nfts()
              .pdas()
              .masterEdition({ mint: mintAddress2 }),
            assetMint: mintAddress2,
            assetTokenAccount: sfts[0].tokenAddress!,
            sellsideEscrowTokenAccount: poolAta2,
            allowlistAuxAccount: SystemProgram.programId,
            sellState: sellState2,
            systemProgram: SystemProgram.programId,
            tokenProgram: tokenProgramId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([cosigner])
          .rpc();

        poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 6);
        nftEscrow = await getTokenAccount(connection, poolAta2);
        assert.equal(Number(nftEscrow.amount), 5);
        assert.deepEqual(nftEscrow.owner.toBase58(), poolKey.toBase58());
        const sftAccount = await getTokenAccount(
          connection,
          sfts[0].tokenAddress!,
        );
        assert.equal(Number(sftAccount.amount), 5);
        assert.deepEqual(
          sftAccount.owner.toBase58(),
          wallet.publicKey.toBase58(),
        );

        const sellState2AccountInfo = await program.account.sellState.fetch(
          sellState2,
        );
        assert.equal(sellState2AccountInfo.pool.toBase58(), poolKey.toBase58());
        assert.equal(
          sellState2AccountInfo.poolOwner.toBase58(),
          wallet.publicKey.toBase58(),
        );
        assert.equal(
          sellState2AccountInfo.assetMint.toBase58(),
          mintAddress2.toBase58(),
        );
        assert.equal(sellState2AccountInfo.assetAmount.toNumber(), 5);
        assert.deepEqual(
          sellState2AccountInfo.cosignerAnnotation,
          new Array(32).fill(0),
        );
      });

      it('correctly verifies mcc-only allowlists when depositing items', async () => {
        const metaplexInstance = getMetaplexInstance(connection);
        const { collection } = await mintCollection(connection, {
          numNfts: 0,
          legacy: true,
          verifyCollection: true,
        });
        const [{ poolKey }, nfts, sfts] = await Promise.all([
          createPool(program, {
            owner: wallet.publicKey,
            cosigner,
            allowlists: [
              { kind: AllowlistKind.mcc, value: collection.mintAddress },
              ...getEmptyAllowLists(5),
            ],
          }),
          mintNfts(connection, {
            numNfts: 1,
            collectionAddress: collection.mintAddress,
            verifyCollection: true,
            recipient: wallet.publicKey,
          }),
          mintNfts(connection, {
            numNfts: 1,
            sftAmount: 10,
            collectionAddress: collection.mintAddress,
            verifyCollection: true,
            recipient: wallet.publicKey,
          }),
        ]);

        const mintAddress1 = nfts[0].mintAddress;
        const mintAddress2 = sfts[0].mintAddress;

        let poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);

        const poolAta1 = await getAssociatedTokenAddress(
          mintAddress1,
          poolKey,
          true,
        );
        const { key: sellState1 } = getMMMSellStatePDA(
          program.programId,
          poolKey,
          mintAddress1,
        );
        await program.methods
          .depositSell({ assetAmount: new anchor.BN(1), allowlistAux: '' })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolKey,
            assetMetadata: metaplexInstance
              .nfts()
              .pdas()
              .metadata({ mint: mintAddress1 }),
            assetMasterEdition: metaplexInstance
              .nfts()
              .pdas()
              .masterEdition({ mint: mintAddress1 }),
            assetMint: mintAddress1,
            assetTokenAccount: nfts[0].tokenAddress!,
            sellsideEscrowTokenAccount: poolAta1,
            allowlistAuxAccount: SystemProgram.programId,
            sellState: sellState1,
            systemProgram: SystemProgram.programId,
            tokenProgram: tokenProgramId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([cosigner])
          .rpc();

        let nftEscrow = await getTokenAccount(connection, poolAta1);
        assert.equal(Number(nftEscrow.amount), 1);
        assert.equal(nftEscrow.owner.toBase58(), poolKey.toBase58());
        poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
        assert.equal(await connection.getBalance(nfts[0].tokenAddress!), 0);

        const poolAta2 = await getAssociatedTokenAddress(
          mintAddress2,
          poolKey,
          true,
        );
        const { key: sellState2 } = getMMMSellStatePDA(
          program.programId,
          poolKey,
          mintAddress2,
        );
        await program.methods
          .depositSell({ assetAmount: new anchor.BN(5), allowlistAux: '' })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolKey,
            assetMetadata: metaplexInstance
              .nfts()
              .pdas()
              .metadata({ mint: mintAddress2 }),
            assetMasterEdition: metaplexInstance
              .nfts()
              .pdas()
              .masterEdition({ mint: mintAddress2 }),
            assetMint: mintAddress2,
            assetTokenAccount: sfts[0].tokenAddress!,
            sellsideEscrowTokenAccount: poolAta2,
            allowlistAuxAccount: SystemProgram.programId,
            sellState: sellState2,
            systemProgram: SystemProgram.programId,
            tokenProgram: tokenProgramId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([cosigner])
          .rpc();

        poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 6);
        nftEscrow = await getTokenAccount(connection, poolAta2);
        assert.equal(Number(nftEscrow.amount), 5);
        assert.deepEqual(nftEscrow.owner.toBase58(), poolKey.toBase58());
        const sftAccount = await getTokenAccount(
          connection,
          sfts[0].tokenAddress!,
        );
        assert.equal(Number(sftAccount.amount), 5);
        assert.deepEqual(
          sftAccount.owner.toBase58(),
          wallet.publicKey.toBase58(),
        );
      });

      it('correctly verifies metadata+mcc allowlists when depositing items', async () => {
        const metaplexInstance = getMetaplexInstance(connection);
        const { collection } = await mintCollection(connection, {
          numNfts: 0,
          legacy: true,
          verifyCollection: true,
        });
        const [{ poolKey }, nfts, sfts] = await Promise.all([
          createPool(program, {
            owner: wallet.publicKey,
            cosigner,
            allowlists: [
              { kind: AllowlistKind.mcc, value: collection.mintAddress },
              { kind: AllowlistKind.metadata, value: collection.mintAddress },
              ...getEmptyAllowLists(4),
            ],
          }),
          mintNfts(connection, {
            numNfts: 1,
            collectionAddress: collection.mintAddress,
            verifyCollection: true,
            recipient: wallet.publicKey,
          }),
          mintNfts(connection, {
            numNfts: 1,
            sftAmount: 10,
            collectionAddress: collection.mintAddress,
            verifyCollection: true,
            recipient: wallet.publicKey,
          }),
        ]);

        const mintAddress1 = nfts[0].mintAddress;
        const mintAddress2 = sfts[0].mintAddress;

        let poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);

        const poolAta1 = await getAssociatedTokenAddress(
          mintAddress1,
          poolKey,
          true,
        );
        const { key: sellState1 } = getMMMSellStatePDA(
          program.programId,
          poolKey,
          mintAddress1,
        );
        const depositSellCall = (aux: string) =>
          program.methods
            .depositSell({
              assetAmount: new anchor.BN(1),
              allowlistAux: aux,
            })
            .accountsStrict({
              owner: wallet.publicKey,
              cosigner: cosigner.publicKey,
              pool: poolKey,
              assetMetadata: metaplexInstance
                .nfts()
                .pdas()
                .metadata({ mint: mintAddress1 }),
              assetMasterEdition: metaplexInstance
                .nfts()
                .pdas()
                .masterEdition({ mint: mintAddress1 }),
              assetMint: mintAddress1,
              assetTokenAccount: nfts[0].tokenAddress!,
              sellsideEscrowTokenAccount: poolAta1,
              allowlistAuxAccount: SystemProgram.programId,
              sellState: sellState1,
              systemProgram: SystemProgram.programId,
              tokenProgram: tokenProgramId,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
            })
            .signers([cosigner])
            .rpc();
        try {
          await depositSellCall('wrong-aux');
          assert.fail('Should have failed with wrong aux');
        } catch (e) {
          console.log(`Failed in metadata-uri check test as expected: ${e}`);
        }

        await depositSellCall(getMetadataURI(0));

        let nftEscrow = await getTokenAccount(connection, poolAta1);
        assert.equal(Number(nftEscrow.amount), 1);
        assert.equal(nftEscrow.owner.toBase58(), poolKey.toBase58());
        poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
        assert.equal(await connection.getBalance(nfts[0].tokenAddress!), 0);
      });

      it('correctly verifies mint-only allowlists when depositing items', async () => {
        const metaplexInstance = getMetaplexInstance(connection);
        const [nfts, sfts] = await Promise.all([
          mintNfts(connection, {
            numNfts: 1,
            recipient: wallet.publicKey,
          }),
          mintNfts(connection, {
            numNfts: 1,
            sftAmount: 10,
            recipient: wallet.publicKey,
          }),
        ]);
        const mintAddress1 = nfts[0].mintAddress;
        const mintAddress2 = sfts[0].mintAddress;
        const { poolKey } = await createPool(program, {
          owner: wallet.publicKey,
          cosigner,
          allowlists: [
            { kind: AllowlistKind.mint, value: mintAddress1 },
            { kind: AllowlistKind.mint, value: mintAddress2 },
            ...getEmptyAllowLists(4),
          ],
        });

        let poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);

        const poolAta1 = await getAssociatedTokenAddress(
          mintAddress1,
          poolKey,
          true,
        );
        const { key: sellState1 } = getMMMSellStatePDA(
          program.programId,
          poolKey,
          mintAddress1,
        );
        await program.methods
          .depositSell({ assetAmount: new anchor.BN(1), allowlistAux: '' })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolKey,
            assetMetadata: metaplexInstance
              .nfts()
              .pdas()
              .metadata({ mint: mintAddress1 }),
            assetMasterEdition: metaplexInstance
              .nfts()
              .pdas()
              .masterEdition({ mint: mintAddress1 }),
            assetMint: mintAddress1,
            assetTokenAccount: nfts[0].tokenAddress!,
            sellsideEscrowTokenAccount: poolAta1,
            allowlistAuxAccount: SystemProgram.programId,
            sellState: sellState1,
            systemProgram: SystemProgram.programId,
            tokenProgram: tokenProgramId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([cosigner])
          .rpc();

        let nftEscrow = await getTokenAccount(connection, poolAta1);
        assert.equal(Number(nftEscrow.amount), 1);
        assert.equal(nftEscrow.owner.toBase58(), poolKey.toBase58());
        poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
        assert.equal(await connection.getBalance(nfts[0].tokenAddress!), 0);

        const poolAta2 = await getAssociatedTokenAddress(
          mintAddress2,
          poolKey,
          true,
        );
        const { key: sellState2 } = getMMMSellStatePDA(
          program.programId,
          poolKey,
          mintAddress2,
        );
        await program.methods
          .depositSell({ assetAmount: new anchor.BN(5), allowlistAux: '' })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolKey,
            assetMetadata: metaplexInstance
              .nfts()
              .pdas()
              .metadata({ mint: mintAddress2 }),
            assetMasterEdition: metaplexInstance
              .nfts()
              .pdas()
              .masterEdition({ mint: mintAddress2 }),
            assetMint: mintAddress2,
            assetTokenAccount: sfts[0].tokenAddress!,
            sellsideEscrowTokenAccount: poolAta2,
            allowlistAuxAccount: SystemProgram.programId,
            sellState: sellState2,
            systemProgram: SystemProgram.programId,
            tokenProgram: tokenProgramId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([cosigner])
          .rpc();

        poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 6);
        nftEscrow = await getTokenAccount(connection, poolAta2);
        assert.equal(Number(nftEscrow.amount), 5);
        assert.deepEqual(nftEscrow.owner.toBase58(), poolKey.toBase58());
        const sftAccount = await getTokenAccount(
          connection,
          sfts[0].tokenAddress!,
        );
        assert.equal(Number(sftAccount.amount), 5);
        assert.deepEqual(
          sftAccount.owner.toBase58(),
          wallet.publicKey.toBase58(),
        );
      });
    });
  });
});
