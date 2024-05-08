import * as anchor from '@project-serum/anchor';
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from '@solana/web3.js';
import {
  AllowlistKind,
  CurveKind,
  IDL,
  MMMProgramID,
  Mmm,
  getMMMBuysideSolEscrowPDA,
  getMMMSellStatePDA,
  getSolFulfillBuyPrices,
} from '../sdk/src';
import {
  PRICE_ERROR_RANGE,
  SIGNATURE_FEE_LAMPORTS,
  airdrop,
  assertIsBetween,
  createPool,
  createPoolWithExampleMplCoreDeposits,
  createTestMplCoreAsset,
  getEmptyAllowLists,
  getSellStatePDARent,
  getTestMplCoreAsset,
  sendAndAssertTx,
} from './utils';
import { publicKey } from '@metaplex-foundation/umi';
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import {
  AssetV1,
  CollectionV1,
  MPL_CORE_PROGRAM_ID,
  pluginAuthorityPair,
  ruleSet,
} from '@metaplex-foundation/mpl-core';
import { assert, expect } from 'chai';
import { ProgramError } from '@project-serum/anchor';

describe('mmm-mpl-core', () => {
  const { connection } = anchor.AnchorProvider.env();
  const wallet = new anchor.Wallet(Keypair.generate());
  const creator1 = Keypair.generate();
  const creator2 = Keypair.generate();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: 'processed',
  });
  const program = new anchor.Program(
    IDL,
    MMMProgramID,
    provider,
  ) as anchor.Program<Mmm>;
  const cosigner = Keypair.generate();

  async function executeDepositSell(asset: AssetV1, collection?: CollectionV1) {
    const allowlists = [
      {
        value: toWeb3JsPublicKey(collection!.publicKey),
        kind: AllowlistKind.mpl_core_collection,
      },
      ...getEmptyAllowLists(5),
    ];
    const poolData = await createPool(program, {
      owner: wallet.publicKey,
      cosigner,
      allowlists,
    });

    const { key: sellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      toWeb3JsPublicKey(asset.publicKey),
    );

    const tx = await program.methods
      .mplCoreDepositSell({
        allowlistAux: null,
      })
      .accountsStrict({
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        pool: poolData.poolKey,
        asset: asset.publicKey,
        sellState,
        collection: collection ? collection.publicKey : SystemProgram.programId,
        systemProgram: SystemProgram.programId,
        assetProgram: MPL_CORE_PROGRAM_ID,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_000_000,
        }),
      ])
      .transaction();

    const blockhashData = await connection.getLatestBlockhash();
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = blockhashData.blockhash;
    tx.partialSign(cosigner, wallet.payer);

    await sendAndAssertTx(connection, tx, blockhashData, false);

    const [refreshedAsset, sellStateAccount] = await Promise.all([
      getTestMplCoreAsset(asset.publicKey),
      program.account.sellState.fetch(sellState),
    ]);
    assert.equal(sellStateAccount.assetAmount.toNumber(), 1);
    assert.equal(
      sellStateAccount.assetMint.toString(),
      asset.publicKey.toString(),
    );
    assert.equal(refreshedAsset.owner.toString(), poolData.poolKey.toString());

    return { poolData, sellState };
  }

  beforeEach(async () => {
    await airdrop(connection, wallet.publicKey, 20);
    await airdrop(connection, creator1.publicKey, 10);
    await airdrop(connection, creator2.publicKey, 10);
  });

  describe('deposit & withdraw Sell', () => {
    it('can deposit & withdraw sell - asset with collection', async () => {
      const { asset, collection } = await createTestMplCoreAsset(
        publicKey(wallet.publicKey),
        {
          collectionConfig: {}, // use default collection config
        },
      );

      const allowlists = [
        {
          value: toWeb3JsPublicKey(collection!.publicKey),
          kind: AllowlistKind.mpl_core_collection,
        },
        ...getEmptyAllowLists(5),
      ];
      const poolData = await createPool(program, {
        owner: wallet.publicKey,
        cosigner,
        allowlists,
      });

      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        toWeb3JsPublicKey(asset.publicKey),
      );

      await program.methods
        .mplCoreDepositSell({
          allowlistAux: null,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolData.poolKey,
          asset: asset.publicKey,
          sellState,
          collection: collection!.publicKey,
          systemProgram: SystemProgram.programId,
          assetProgram: MPL_CORE_PROGRAM_ID,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_000_000,
          }),
        ])
        .signers([cosigner])
        .rpc({ skipPreflight: true });

      const [refreshedAsset, sellStateAccount] = await Promise.all([
        getTestMplCoreAsset(asset.publicKey),
        program.account.sellState.fetch(sellState),
      ]);

      // Verify sell state account
      assert.equal(sellStateAccount.assetAmount.toNumber(), 1);
      assert.equal(
        sellStateAccount.assetMint.toString(),
        asset.publicKey.toString(),
      );

      // Verify asset account.
      assert.equal(
        refreshedAsset.owner.toString(),
        poolData.poolKey.toString(),
      );

      // Withdraw
      let { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
        MMMProgramID,
        poolData.poolKey,
      );

      await program.methods
        .mplCoreWithdrawSell()
        .accounts({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolData.poolKey,
          asset: asset.publicKey,
          collection: collection!.publicKey,
          sellState,
          buysideSolEscrowAccount,
          systemProgram: SystemProgram.programId,
          assetProgram: MPL_CORE_PROGRAM_ID,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_000_000,
          }),
        ])
        .signers([cosigner])
        .rpc({ skipPreflight: true });

      const refreshedAssetAfterWithdraw = await getTestMplCoreAsset(
        asset.publicKey,
      );

      // Verify asset account.
      assert.equal(
        refreshedAssetAfterWithdraw.owner.toString(),
        wallet.publicKey.toString(),
      );
    });

    it("can't deposit sell - asset from other collection", async () => {
      const { asset, collection } = await createTestMplCoreAsset(
        publicKey(wallet.publicKey),
        {
          collectionConfig: {}, // use default collection config
        },
      );

      const poolData = await createPool(program, {
        owner: wallet.publicKey,
        cosigner,
        allowlists: [
          {
            value: Keypair.generate().publicKey, // different collection
            kind: AllowlistKind.mpl_core_collection,
          },
          ...getEmptyAllowLists(5),
        ],
      });

      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        toWeb3JsPublicKey(asset.publicKey),
      );

      try {
        await program.methods
          .mplCoreDepositSell({
            allowlistAux: null,
          })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolData.poolKey,
            asset: asset.publicKey,
            sellState,
            collection: collection!.publicKey,
            systemProgram: SystemProgram.programId,
            assetProgram: MPL_CORE_PROGRAM_ID,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({
              units: 1_000_000,
            }),
          ])
          .signers([cosigner])
          .rpc({ skipPreflight: true });
      } catch (e) {
        expect(e).to.be.instanceOf(ProgramError);
        const err = e as ProgramError;

        assert.strictEqual(err.msg, 'invalid allowlists');
        assert.strictEqual(err.code, 6001);
      }

      const refreshedAsset = await getTestMplCoreAsset(asset.publicKey);

      // Verify asset account.
      assert.equal(
        refreshedAsset.owner.toString(),
        wallet.publicKey.toString(),
      );
    });

    it("can't deposit sell - no collection", async () => {
      const { asset } = await createTestMplCoreAsset(
        publicKey(wallet.publicKey),
        {
          collectionConfig: undefined, // no collection attached
        },
      );

      const poolData = await createPool(program, {
        owner: wallet.publicKey,
        cosigner,
        ...getEmptyAllowLists(6),
      });

      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        toWeb3JsPublicKey(asset.publicKey),
      );

      try {
        await program.methods
          .mplCoreDepositSell({
            allowlistAux: null,
          })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolData.poolKey,
            asset: asset.publicKey,
            sellState,
            collection: SystemProgram.programId, // no collection
            systemProgram: SystemProgram.programId,
            assetProgram: MPL_CORE_PROGRAM_ID,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({
              units: 1_000_000,
            }),
          ])
          .signers([cosigner])
          .rpc({ skipPreflight: true });
      } catch (e) {
        expect(e).to.be.instanceOf(ProgramError);
        const err = e as ProgramError;

        assert.strictEqual(err.msg, 'invalid allowlists');
        assert.strictEqual(err.code, 6001);
      }

      const refreshedAsset = await getTestMplCoreAsset(asset.publicKey);

      // Verify asset account.
      assert.equal(
        refreshedAsset.owner.toString(),
        wallet.publicKey.toString(),
      );
    });

    it('cant deposit sell - denylist', async () => {
      const { asset, collection } = await createTestMplCoreAsset(
        publicKey(wallet.publicKey),
        {
          collectionConfig: {
            plugins: [
              pluginAuthorityPair({
                type: 'Royalties',
                data: {
                  basisPoints: 500,
                  creators: [
                    {
                      address: publicKey(creator1.publicKey),
                      percentage: 20,
                    },
                    {
                      address: publicKey(creator2.publicKey),
                      percentage: 80,
                    },
                  ],
                  ruleSet: ruleSet('ProgramDenyList', [
                    [
                      publicKey(MMMProgramID),
                      publicKey(SystemProgram.programId),
                    ],
                  ]),
                },
              }),
            ],
          },
          assetConfig: {
            plugins: [],
          },
        },
      );

      const poolData = await createPool(program, {
        owner: wallet.publicKey,
        cosigner,
        allowlists: [
          {
            value: Keypair.generate().publicKey, // different collection
            kind: AllowlistKind.mpl_core_collection,
          },
          ...getEmptyAllowLists(5),
        ],
      });

      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        toWeb3JsPublicKey(asset.publicKey),
      );

      try {
        await program.methods
          .mplCoreDepositSell({
            allowlistAux: null,
          })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolData.poolKey,
            asset: asset.publicKey,
            sellState,
            collection: collection!.publicKey,
            systemProgram: SystemProgram.programId,
            assetProgram: MPL_CORE_PROGRAM_ID,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({
              units: 1_000_000,
            }),
          ])
          .signers([cosigner])
          .rpc({ skipPreflight: true });
      } catch (e) {
        expect(e).to.be.instanceOf(ProgramError);
        const err = e as ProgramError;

        assert.strictEqual(err.msg, 'invalid allowlists');
        assert.strictEqual(err.code, 6001);
      }

      const refreshedAsset = await getTestMplCoreAsset(asset.publicKey);

      // Verify asset account.
      assert.equal(
        refreshedAsset.owner.toString(),
        wallet.publicKey.toString(),
      );
    });
  });

  describe('fulfill sell', () => {
    it('can fulfill sell - asset level royalty', async () => {
      const { asset, collection } = await createTestMplCoreAsset(
        publicKey(wallet.publicKey),
        {
          collectionConfig: {
            plugins: [
              pluginAuthorityPair({
                type: 'Royalties',
                data: {
                  basisPoints: 500,
                  creators: [
                    {
                      address: publicKey(creator1.publicKey),
                      percentage: 20,
                    },
                    {
                      address: publicKey(creator2.publicKey),
                      percentage: 80,
                    },
                  ],
                  ruleSet: ruleSet('None'),
                },
              }),
            ],
          },
          assetConfig: {
            plugins: [
              pluginAuthorityPair({
                type: 'Royalties',
                data: {
                  basisPoints: 200,
                  creators: [
                    {
                      address: publicKey(creator1.publicKey),
                      percentage: 30,
                    },
                    {
                      address: publicKey(creator2.publicKey),
                      percentage: 70,
                    },
                  ],
                  ruleSet: ruleSet('None'),
                },
              }),
            ],
          },
        },
      );

      const { poolData, sellState } = await executeDepositSell(
        asset,
        collection,
      );

      // Fulfill sell
      const buyer = Keypair.generate();
      await airdrop(connection, buyer.publicKey, 10);
      const { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
        MMMProgramID,
        poolData.poolKey,
      );

      const [
        initSellerBalance,
        initBuyerBalance,
        initCreator1Balance,
        initCreator2Balance,
        initBuyerSolEscrowAccountBalance,
      ] = await Promise.all([
        connection.getBalance(wallet.publicKey),
        connection.getBalance(buyer.publicKey),
        connection.getBalance(creator1.publicKey),
        connection.getBalance(creator2.publicKey),
        connection.getBalance(buysideSolEscrowAccount),
      ]);

      let expectedTakerFees = 1 * LAMPORTS_PER_SOL * 0.01;
      const tx = await program.methods
        .mplCoreFulfillSell({
          assetAmount: new anchor.BN(1),
          maxPaymentAmount: new anchor.BN(
            1.02 * LAMPORTS_PER_SOL + expectedTakerFees,
          ),
          buysideCreatorRoyaltyBp: 10000,
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
          asset: asset.publicKey,
          collection: collection!.publicKey,
          sellState,
          buysideSolEscrowAccount,
          systemProgram: SystemProgram.programId,
          assetProgram: MPL_CORE_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: creator1.publicKey,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: creator2.publicKey,
            isSigner: false,
            isWritable: true,
          },
        ])
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_000_000,
          }),
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = buyer.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, buyer);

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const refreshedAssetAfterFulfill = await getTestMplCoreAsset(
        asset.publicKey,
      );

      // Verify asset account.
      assert.equal(
        refreshedAssetAfterFulfill.owner.toString(),
        buyer.publicKey.toString(),
      );

      // verify post balances
      const [
        buyerBalance,
        sellerBalance,
        creator1Balance,
        creator2Balance,
        buyerSolEscrowAccountBalance,
      ] = await Promise.all([
        connection.getBalance(buyer.publicKey),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(creator1.publicKey),
        connection.getBalance(creator2.publicKey),
        connection.getBalance(buysideSolEscrowAccount),
      ]);

      const expectedTxFees = SIGNATURE_FEE_LAMPORTS * 2; // cosigner + payer
      const sellStatePDARent = await getSellStatePDARent(connection);

      assert.equal(
        creator1Balance,
        initCreator1Balance + 1 * LAMPORTS_PER_SOL * 0.02 * 0.3, // 30% of the royalty
      );
      assert.equal(
        creator2Balance,
        initCreator2Balance + 1 * LAMPORTS_PER_SOL * 0.02 * 0.7, // 70% of the royalty
      );

      assert.equal(
        buyerBalance,
        initBuyerBalance -
          1.02 * LAMPORTS_PER_SOL -
          expectedTxFees -
          expectedTakerFees,
      );
      assert.equal(sellerBalance, initSellerBalance + sellStatePDARent);

      assert.equal(
        buyerSolEscrowAccountBalance,
        initBuyerSolEscrowAccountBalance + 1 * LAMPORTS_PER_SOL,
      );

      // Check pool state
      const poolAccount = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccount.sellsideAssetAmount.toNumber(), 0);
    });

    it('can fulfill sell - collection level royalty & allowlist', async () => {
      const { asset, collection } = await createTestMplCoreAsset(
        publicKey(wallet.publicKey),
        {
          collectionConfig: {
            plugins: [
              pluginAuthorityPair({
                type: 'Royalties',
                data: {
                  basisPoints: 500,
                  creators: [
                    {
                      address: publicKey(creator1.publicKey),
                      percentage: 20,
                    },
                    {
                      address: publicKey(creator2.publicKey),
                      percentage: 80,
                    },
                  ],
                  ruleSet: ruleSet('ProgramAllowList', [
                    [
                      publicKey(MMMProgramID),
                      publicKey(SystemProgram.programId),
                    ],
                  ]),
                },
              }),
            ],
          },
          assetConfig: {
            plugins: [],
          },
        },
      );

      const { poolData, sellState } = await executeDepositSell(
        asset,
        collection,
      );

      // Fulfill sell
      const buyer = Keypair.generate();
      await airdrop(connection, buyer.publicKey, 10);
      const { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
        MMMProgramID,
        poolData.poolKey,
      );

      const [
        initSellerBalance,
        initBuyerBalance,
        initCreator1Balance,
        initCreator2Balance,
        initBuyerSolEscrowAccountBalance,
      ] = await Promise.all([
        connection.getBalance(wallet.publicKey),
        connection.getBalance(buyer.publicKey),
        connection.getBalance(creator1.publicKey),
        connection.getBalance(creator2.publicKey),
        connection.getBalance(buysideSolEscrowAccount),
      ]);

      let expectedTakerFees = 1 * LAMPORTS_PER_SOL * 0.01;
      const tx = await program.methods
        .mplCoreFulfillSell({
          assetAmount: new anchor.BN(1),
          maxPaymentAmount: new anchor.BN(
            1.05 * LAMPORTS_PER_SOL + expectedTakerFees,
          ),
          buysideCreatorRoyaltyBp: 10000,
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
          asset: asset.publicKey,
          collection: collection!.publicKey,
          sellState,
          buysideSolEscrowAccount,
          systemProgram: SystemProgram.programId,
          assetProgram: MPL_CORE_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: creator1.publicKey,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: creator2.publicKey,
            isSigner: false,
            isWritable: true,
          },
        ])
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_000_000,
          }),
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = buyer.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;

      tx.partialSign(cosigner, buyer);

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const refreshedAssetAfterFulfill = await getTestMplCoreAsset(
        asset.publicKey,
      );

      // Verify asset account.
      assert.equal(
        refreshedAssetAfterFulfill.owner.toString(),
        buyer.publicKey.toString(),
      );

      // verify post balances
      const [
        buyerBalance,
        sellerBalance,
        creator1Balance,
        creator2Balance,
        buyerSolEscrowAccountBalance,
      ] = await Promise.all([
        connection.getBalance(buyer.publicKey),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(creator1.publicKey),
        connection.getBalance(creator2.publicKey),
        connection.getBalance(buysideSolEscrowAccount),
      ]);

      const expectedTxFees = SIGNATURE_FEE_LAMPORTS * 2; // cosigner + payer
      const sellStatePDARent = await getSellStatePDARent(connection);

      assert.equal(
        creator1Balance,
        initCreator1Balance + 1 * LAMPORTS_PER_SOL * 0.05 * 0.2, // 20% of the royalty
      );
      assert.equal(
        creator2Balance,
        initCreator2Balance + 1 * LAMPORTS_PER_SOL * 0.05 * 0.8, // 80% of the royalty
      );

      assert.equal(
        buyerBalance,
        initBuyerBalance -
          1.05 * LAMPORTS_PER_SOL -
          expectedTxFees -
          expectedTakerFees,
      );
      assert.equal(sellerBalance, initSellerBalance + sellStatePDARent);

      assert.equal(
        buyerSolEscrowAccountBalance,
        initBuyerSolEscrowAccountBalance + 1 * LAMPORTS_PER_SOL,
      );

      // Check pool state
      const poolAccount = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccount.sellsideAssetAmount.toNumber(), 0);
    });

    it('can fulfill sell - no royalty', async () => {
      const { asset, collection } = await createTestMplCoreAsset(
        publicKey(wallet.publicKey),
        {
          collectionConfig: {
            plugins: [],
          },
          assetConfig: {
            plugins: [],
          },
        },
      );

      const { poolData, sellState } = await executeDepositSell(
        asset,
        collection,
      );

      // Fulfill sell
      const buyer = Keypair.generate();
      await airdrop(connection, buyer.publicKey, 10);
      const { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
        MMMProgramID,
        poolData.poolKey,
      );

      const [
        initSellerBalance,
        initBuyerBalance,
        initBuyerSolEscrowAccountBalance,
      ] = await Promise.all([
        connection.getBalance(wallet.publicKey),
        connection.getBalance(buyer.publicKey),
        connection.getBalance(buysideSolEscrowAccount),
      ]);

      let expectedTakerFees = 1 * LAMPORTS_PER_SOL * 0.01;
      const tx = await program.methods
        .mplCoreFulfillSell({
          assetAmount: new anchor.BN(1),
          maxPaymentAmount: new anchor.BN(
            1.01 * LAMPORTS_PER_SOL + expectedTakerFees,
          ),
          buysideCreatorRoyaltyBp: 10000,
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
          asset: asset.publicKey,
          collection: collection!.publicKey,
          sellState,
          buysideSolEscrowAccount,
          systemProgram: SystemProgram.programId,
          assetProgram: MPL_CORE_PROGRAM_ID,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_000_000,
          }),
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = buyer.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;

      tx.partialSign(cosigner, buyer);

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const refreshedAssetAfterFulfill = await getTestMplCoreAsset(
        asset.publicKey,
      );

      // Verify asset account.
      assert.equal(
        refreshedAssetAfterFulfill.owner.toString(),
        buyer.publicKey.toString(),
      );

      // verify post balances
      const [buyerBalance, sellerBalance, buyerSolEscrowAccountBalance] =
        await Promise.all([
          connection.getBalance(buyer.publicKey),
          connection.getBalance(wallet.publicKey),
          connection.getBalance(buysideSolEscrowAccount),
        ]);

      const expectedTxFees = SIGNATURE_FEE_LAMPORTS * 2; // cosigner + payer
      const sellStatePDARent = await getSellStatePDARent(connection);

      assert.equal(
        buyerBalance,
        initBuyerBalance -
          1 * LAMPORTS_PER_SOL -
          expectedTxFees -
          expectedTakerFees,
      );
      assert.equal(sellerBalance, initSellerBalance + sellStatePDARent);

      assert.equal(
        buyerSolEscrowAccountBalance,
        initBuyerSolEscrowAccountBalance + 1 * LAMPORTS_PER_SOL,
      );

      // Check pool state
      const poolAccount = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccount.sellsideAssetAmount.toNumber(), 0);
    });
  });

  describe('fulfill buy', () => {
    it('can fulfill buy - collection royalty & reinvest', async () => {
      const spotPrice = 0.5;
      const seller = Keypair.generate();
      await airdrop(connection, seller.publicKey, 10);
      const {
        asset,
        collection,
        poolData,
        sellState,
        buysideSolEscrowAccount,
      } = await createPoolWithExampleMplCoreDeposits(
        program,
        {
          owner: wallet.publicKey,
          cosigner,
          curveType: CurveKind.exp,
          curveDelta: new anchor.BN(125), // 125 bp
          expiry: new anchor.BN(0),
          spotPrice: new anchor.BN(spotPrice * LAMPORTS_PER_SOL),
          referralBp: 200,
          reinvestFulfillBuy: true,
          reinvestFulfillSell: false,
          buysideCreatorRoyaltyBp: 10000,
        },
        'buy',
        seller.publicKey,
        {
          collectionConfig: {
            plugins: [
              pluginAuthorityPair({
                type: 'Royalties',
                data: {
                  basisPoints: 500,
                  creators: [
                    {
                      address: publicKey(creator1.publicKey),
                      percentage: 20,
                    },
                    {
                      address: publicKey(creator2.publicKey),
                      percentage: 80,
                    },
                  ],
                  ruleSet: ruleSet('None'),
                },
              }),
            ],
          },
          assetConfig: {
            plugins: [],
          },
        },
      );

      // Fulfill buy
      const [
        initBuyerBalance,
        initSellerBalance,
        initCreator1Balance,
        initCreator2Balance,
        initBuyerSolEscrowAccountBalance,
      ] = await Promise.all([
        connection.getBalance(wallet.publicKey),
        connection.getBalance(seller.publicKey),
        connection.getBalance(creator1.publicKey),
        connection.getBalance(creator2.publicKey),
        connection.getBalance(buysideSolEscrowAccount),
      ]);

      const expectedBuyPrices = getSolFulfillBuyPrices({
        totalPriceLamports: spotPrice * LAMPORTS_PER_SOL,
        lpFeeBp: 0,
        takerFeeBp: 100,
        metadataRoyaltyBp: 500,
        buysideCreatorRoyaltyBp: 10_000,
        makerFeeBp: 100,
      });
      const tx = await program.methods
        .mplCoreFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: new anchor.BN(expectedBuyPrices.sellerReceives),
          allowlistAux: '',
          takerFeeBp: 100,
          makerFeeBp: 0,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount,
          asset: asset.publicKey,
          sellState,
          collection: collection!.publicKey,
          systemProgram: SystemProgram.programId,
          assetProgram: MPL_CORE_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: creator1.publicKey,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: creator2.publicKey,
            isSigner: false,
            isWritable: true,
          },
        ])
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_000_000,
          }),
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = seller.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;

      tx.partialSign(cosigner, seller);

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const refreshedAssetAfterFulfill = await getTestMplCoreAsset(
        asset.publicKey,
      );

      // Verify asset account.
      assert.equal(
        refreshedAssetAfterFulfill.owner.toString(),
        poolData.poolKey.toString(),
      );

      // verify post balances
      const [
        sellerBalance,
        buyerBalance,
        creator1Balance,
        creator2Balance,
        buyerSolEscrowAccountBalance,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(creator1.publicKey),
        connection.getBalance(creator2.publicKey),
        connection.getBalance(buysideSolEscrowAccount),
      ]);

      const expectedTxFees = SIGNATURE_FEE_LAMPORTS * 2; // cosigner + payer
      const sellStatePDARent = await getSellStatePDARent(connection);

      assertIsBetween(
        creator1Balance,
        initCreator1Balance + expectedBuyPrices.royaltyPaid * 0.2, // 20% of the royalty
        PRICE_ERROR_RANGE,
      );

      assertIsBetween(
        creator2Balance,
        initCreator2Balance + expectedBuyPrices.royaltyPaid * 0.8, // 80% of the royalty
        PRICE_ERROR_RANGE,
      );

      assert.equal(buyerBalance, initBuyerBalance);

      assert.equal(
        sellerBalance,
        initSellerBalance +
          spotPrice * LAMPORTS_PER_SOL -
          expectedTxFees -
          expectedBuyPrices.takerFeePaid -
          sellStatePDARent -
          expectedBuyPrices.royaltyPaid,
      );

      assert.equal(
        buyerSolEscrowAccountBalance,
        initBuyerSolEscrowAccountBalance - spotPrice * LAMPORTS_PER_SOL,
      );

      // Check pool state
      const poolAccount = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccount.sellsideAssetAmount.toNumber(), 1);
    });

    it('can fulfill buy - asset royalty & not reinvest', async () => {
      const spotPrice = 0.5;
      const seller = Keypair.generate();
      await airdrop(connection, seller.publicKey, 10);
      const {
        asset,
        collection,
        poolData,
        sellState,
        buysideSolEscrowAccount,
      } = await createPoolWithExampleMplCoreDeposits(
        program,
        {
          owner: wallet.publicKey,
          cosigner,
          curveType: CurveKind.exp,
          curveDelta: new anchor.BN(125), // 125 bp
          expiry: new anchor.BN(0),
          spotPrice: new anchor.BN(spotPrice * LAMPORTS_PER_SOL),
          referralBp: 200,
          reinvestFulfillBuy: false,
          reinvestFulfillSell: false,
          buysideCreatorRoyaltyBp: 10000,
        },
        'buy',
        seller.publicKey,
        {
          collectionConfig: {
            plugins: [],
          },
          assetConfig: {
            plugins: [
              pluginAuthorityPair({
                type: 'Royalties',
                data: {
                  basisPoints: 500,
                  creators: [
                    {
                      address: publicKey(creator1.publicKey),
                      percentage: 20,
                    },
                    {
                      address: publicKey(creator2.publicKey),
                      percentage: 80,
                    },
                  ],
                  ruleSet: ruleSet('None'),
                },
              }),
            ],
          },
        },
      );

      // Fulfill buy
      const [
        initBuyerBalance,
        initSellerBalance,
        initCreator1Balance,
        initCreator2Balance,
        initBuyerSolEscrowAccountBalance,
      ] = await Promise.all([
        connection.getBalance(wallet.publicKey),
        connection.getBalance(seller.publicKey),
        connection.getBalance(creator1.publicKey),
        connection.getBalance(creator2.publicKey),
        connection.getBalance(buysideSolEscrowAccount),
      ]);

      const expectedBuyPrices = getSolFulfillBuyPrices({
        totalPriceLamports: spotPrice * LAMPORTS_PER_SOL,
        lpFeeBp: 0,
        takerFeeBp: 100,
        metadataRoyaltyBp: 500,
        buysideCreatorRoyaltyBp: 10_000,
        makerFeeBp: 0,
      });
      const tx = await program.methods
        .mplCoreFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: new anchor.BN(expectedBuyPrices.sellerReceives),
          allowlistAux: '',
          takerFeeBp: 100,
          makerFeeBp: 0,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount,
          asset: asset.publicKey,
          collection: collection!.publicKey,
          sellState,
          systemProgram: SystemProgram.programId,
          assetProgram: MPL_CORE_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: creator1.publicKey,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: creator2.publicKey,
            isSigner: false,
            isWritable: true,
          },
        ])
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_000_000,
          }),
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = seller.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;

      tx.partialSign(cosigner, seller);

      await sendAndAssertTx(connection, tx, blockhashData, false);

      const refreshedAssetAfterFulfill = await getTestMplCoreAsset(
        asset.publicKey,
      );

      // Verify asset account.
      assert.equal(
        refreshedAssetAfterFulfill.owner.toString(),
        wallet.publicKey.toString(),
      );

      // verify post balances
      const [
        sellerBalance,
        buyerBalance,
        creator1Balance,
        creator2Balance,
        buyerSolEscrowAccountBalance,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(creator1.publicKey),
        connection.getBalance(creator2.publicKey),
        connection.getBalance(buysideSolEscrowAccount),
      ]);

      const expectedTxFees = SIGNATURE_FEE_LAMPORTS * 2; // cosigner + payer
      const sellStatePDARent = await getSellStatePDARent(connection);

      assertIsBetween(
        creator1Balance,
        initCreator1Balance + expectedBuyPrices.royaltyPaid * 0.2, // 20% of the royalty
        PRICE_ERROR_RANGE,
      );

      assertIsBetween(
        creator2Balance,
        initCreator2Balance + expectedBuyPrices.royaltyPaid * 0.8, // 80% of the royalty
        PRICE_ERROR_RANGE,
      );

      assert.equal(buyerBalance, initBuyerBalance);

      assert.equal(
        sellerBalance,
        initSellerBalance +
          spotPrice * LAMPORTS_PER_SOL -
          expectedTxFees -
          expectedBuyPrices.takerFeePaid -
          expectedBuyPrices.royaltyPaid,
      );

      assert.equal(
        buyerSolEscrowAccountBalance,
        initBuyerSolEscrowAccountBalance - spotPrice * LAMPORTS_PER_SOL,
      );

      // Check pool state
      const poolAccount = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccount.sellsideAssetAmount.toNumber(), 0);
    });

    it('cant fulfill buy - different collection', async () => {
      const spotPrice = 0.5;
      const seller = Keypair.generate();
      await airdrop(connection, seller.publicKey, 10);
      const {
        asset,
        collection,
        poolData,
        sellState,
        buysideSolEscrowAccount,
      } = await createPoolWithExampleMplCoreDeposits(
        program,
        {
          owner: wallet.publicKey,
          cosigner,
          curveType: CurveKind.exp,
          curveDelta: new anchor.BN(125), // 125 bp
          expiry: new anchor.BN(0),
          spotPrice: new anchor.BN(spotPrice * LAMPORTS_PER_SOL),
          referralBp: 200,
          reinvestFulfillBuy: true,
          reinvestFulfillSell: false,
          buysideCreatorRoyaltyBp: 10000,
          allowlists: [
            {
              value: Keypair.generate().publicKey,
              kind: AllowlistKind.mpl_core_collection, // different collection
            },
            ...getEmptyAllowLists(5),
          ],
        },
        'buy',
        seller.publicKey,
        {
          collectionConfig: {
            plugins: [
              pluginAuthorityPair({
                type: 'Royalties',
                data: {
                  basisPoints: 500,
                  creators: [
                    {
                      address: publicKey(creator1.publicKey),
                      percentage: 20,
                    },
                    {
                      address: publicKey(creator2.publicKey),
                      percentage: 80,
                    },
                  ],
                  ruleSet: ruleSet('None'),
                },
              }),
            ],
          },
          assetConfig: {
            plugins: [],
          },
        },
      );

      // Fulfill buy
      const buyer = Keypair.generate();
      await airdrop(connection, buyer.publicKey, 10);
      try {
        await program.methods
          .mplCoreFulfillBuy({
            assetAmount: new anchor.BN(1),
            minPaymentAmount: new anchor.BN(0),
            allowlistAux: '',
            takerFeeBp: 100,
            makerFeeBp: 0,
          })
          .accountsStrict({
            payer: seller.publicKey,
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            referral: poolData.referral.publicKey,
            pool: poolData.poolKey,
            buysideSolEscrowAccount,
            asset: asset.publicKey,
            sellState,
            collection: collection!.publicKey,
            systemProgram: SystemProgram.programId,
            assetProgram: MPL_CORE_PROGRAM_ID,
          })
          .remainingAccounts([
            {
              pubkey: creator1.publicKey,
              isSigner: false,
              isWritable: true,
            },
            {
              pubkey: creator2.publicKey,
              isSigner: false,
              isWritable: true,
            },
          ])
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({
              units: 1_000_000,
            }),
          ])
          .signers([cosigner, seller])
          .rpc({ skipPreflight: true });
      } catch (e) {
        expect(e).to.be.instanceOf(ProgramError);
        const err = e as ProgramError;

        assert.strictEqual(err.msg, 'invalid allowlists');
        assert.strictEqual(err.code, 6001);
      }

      const refreshedAssetAfterFulfill = await getTestMplCoreAsset(
        asset.publicKey,
      );

      // Verify asset account.
      assert.equal(
        refreshedAssetAfterFulfill.owner.toString(),
        seller.publicKey.toString(),
      );
    });
  });
});
