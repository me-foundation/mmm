import * as anchor from '@project-serum/anchor';
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from '@solana/web3.js';
import {
  AllowlistKind,
  IDL,
  MMMProgramID,
  Mmm,
  getMMMBuysideSolEscrowPDA,
  getMMMSellStatePDA,
} from '../sdk/src';
import {
  SIGNATURE_FEE_LAMPORTS,
  airdrop,
  createPool,
  createTestMplCoreAsset,
  getEmptyAllowLists,
  getSellStatePDARent,
  getTestMplCoreAsset,
  sendAndAssertTx,
} from './utils';
import { publicKey } from '@metaplex-foundation/umi';
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import {
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

  beforeEach(async () => {
    await airdrop(connection, wallet.publicKey, 10);
    await airdrop(connection, creator1.publicKey, 10);
    await airdrop(connection, creator2.publicKey, 10);
  });

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
    assert.equal(refreshedAsset.owner.toString(), poolData.poolKey.toString());

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
    assert.equal(refreshedAsset.owner.toString(), wallet.publicKey.toString());
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
    assert.equal(refreshedAsset.owner.toString(), wallet.publicKey.toString());
  });

  it.only('can fulfill sell - happy path', async () => {
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
      .signers([cosigner, buyer])
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
});
