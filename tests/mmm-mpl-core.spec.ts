import * as anchor from '@project-serum/anchor';
import { ComputeBudgetProgram, Keypair, SystemProgram } from '@solana/web3.js';
import {
  AllowlistKind,
  IDL,
  MMMProgramID,
  Mmm,
  getMMMSellStatePDA,
} from '../sdk/src';
import {
  airdrop,
  createPool,
  createTestMplCoreAsset,
  getEmptyAllowLists,
  getTestMplCoreAsset,
} from './utils';
import { publicKey } from '@metaplex-foundation/umi';
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { assert, expect } from 'chai';
import { ProgramError } from '@project-serum/anchor';

describe('mmm-mpl-core', () => {
  const { connection } = anchor.AnchorProvider.env();
  const wallet = new anchor.Wallet(Keypair.generate());
  const creator = Keypair.generate();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  const program = new anchor.Program(
    IDL,
    MMMProgramID,
    provider,
  ) as anchor.Program<Mmm>;
  const cosigner = Keypair.generate();

  beforeEach(async () => {
    await airdrop(connection, wallet.publicKey, 10);
    await airdrop(connection, creator.publicKey, 10);
  });

  it('can deposit sell - asset with collection', async () => {
    const { asset, collection } = await createTestMplCoreAsset(
      publicKey(wallet.publicKey),
      {
        collectionConfig: {}, // use default collection config
      },
    );

    const allowlists = [
      {
        value: toWeb3JsPublicKey(collection!.publicKey),
        kind: AllowlistKind.update_authority,
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
        assetAmount: new anchor.BN(1),
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
  });

  it.only("can't deposit sell - asset from other collection", async () => {
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
          kind: AllowlistKind.update_authority,
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
          assetAmount: new anchor.BN(1),
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
          assetAmount: new anchor.BN(1),
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
});
