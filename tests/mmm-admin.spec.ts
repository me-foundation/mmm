import * as anchor from '@project-serum/anchor';
import { AnchorError } from '@project-serum/anchor';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { assert, expect } from 'chai';
import {
  IDL,
  Mmm,
  CurveKind,
  AllowlistKind,
  getMMMPoolPDA,
  MMMProgramID,
} from '../sdk/src';
import { airdrop, getEmptyAllowLists, getTestAuthorityKeypair } from './utils';

describe('mmm-admin', () => {
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

  describe('Can create sol mmm', () => {
    it('happy path', async () => {
      const referral = Keypair.generate();
      const uuid = Keypair.generate();
      const { key: poolKey } = getMMMPoolPDA(
        program.programId,
        wallet.publicKey,
        uuid.publicKey,
      );
      const allowlists = [
        { kind: AllowlistKind.fvca, value: referral.publicKey },
        { kind: AllowlistKind.mint, value: cosigner.publicKey },
        { kind: AllowlistKind.mcc, value: wallet.publicKey },
        ...getEmptyAllowLists(3),
      ];

      await program.methods
        .createPool({
          spotPrice: new anchor.BN(1 * LAMPORTS_PER_SOL),
          curveType: CurveKind.linear,
          curveDelta: new anchor.BN(0),
          reinvestFulfillBuy: true,
          reinvestFulfillSell: true,
          expiry: new anchor.BN(42),
          lpFeeBp: 200,
          referral: referral.publicKey,
          cosignerAnnotation: new Array(32).fill(0),
          buysideCreatorRoyaltyBp: 0,

          uuid: uuid.publicKey,
          paymentMint: PublicKey.default,
          allowlists,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([cosigner])
        .rpc();

      const poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.equal(poolAccountInfo.spotPrice.toNumber(), 1 * LAMPORTS_PER_SOL);
      assert.equal(poolAccountInfo.curveType, CurveKind.linear);
      assert.equal(poolAccountInfo.curveDelta.toNumber(), 0);
      assert.isTrue(poolAccountInfo.reinvestFulfillBuy);
      assert.isTrue(poolAccountInfo.reinvestFulfillSell);
      assert.equal(poolAccountInfo.expiry.toNumber(), 42);
      assert.equal(poolAccountInfo.lpFeeBp, 200);
      assert.equal(
        poolAccountInfo.referral.toBase58(),
        referral.publicKey.toBase58(),
      );
      assert.equal(poolAccountInfo.referralBp, 0);
      assert.deepEqual(
        poolAccountInfo.cosignerAnnotation,
        new Array(32).fill(0),
      );
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.deepEqual(poolAccountInfo.owner, wallet.publicKey);
      assert.deepEqual(poolAccountInfo.cosigner, cosigner.publicKey);
      assert.deepEqual(poolAccountInfo.uuid, uuid.publicKey);
      assert.deepEqual(poolAccountInfo.paymentMint, PublicKey.default);
      assert.deepEqual(poolAccountInfo.allowlists, allowlists);
    });
  });

  describe('Can update sol mmm', () => {
    it('happy path', async () => {
      const referral = Keypair.generate();
      const uuid = Keypair.generate();
      const { key: poolKey } = getMMMPoolPDA(
        program.programId,
        wallet.publicKey,
        uuid.publicKey,
      );
      const allowlists = [
        { kind: AllowlistKind.fvca, value: referral.publicKey },
        { kind: AllowlistKind.mint, value: cosigner.publicKey },
        { kind: AllowlistKind.mcc, value: wallet.publicKey },
        ...getEmptyAllowLists(3),
      ];

      await program.methods
        .createPool({
          spotPrice: new anchor.BN(1 * LAMPORTS_PER_SOL),
          curveType: CurveKind.linear,
          curveDelta: new anchor.BN(0),
          reinvestFulfillBuy: true,
          reinvestFulfillSell: true,
          expiry: new anchor.BN(42),
          lpFeeBp: 200,
          referral: referral.publicKey,
          cosignerAnnotation: new Array(32).fill(0),
          buysideCreatorRoyaltyBp: 0,

          uuid: uuid.publicKey,
          paymentMint: PublicKey.default,
          allowlists,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([cosigner])
        .rpc();

      await program.methods
        .updatePool({
          spotPrice: new anchor.BN(2 * LAMPORTS_PER_SOL),
          curveType: CurveKind.exp,
          curveDelta: new anchor.BN(888),
          reinvestFulfillBuy: true,
          reinvestFulfillSell: true,
          expiry: new anchor.BN(0),
          lpFeeBp: 150,
          referral: PublicKey.default,
          cosignerAnnotation: new Array(32).fill(0).map((_, index) => index),
          buysideCreatorRoyaltyBp: 0,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
        })
        .signers([cosigner])
        .rpc();

      const poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.equal(poolAccountInfo.spotPrice.toNumber(), 2 * LAMPORTS_PER_SOL);
      assert.equal(poolAccountInfo.curveType, CurveKind.exp);
      assert.equal(poolAccountInfo.curveDelta.toNumber(), 888);
      assert.isTrue(poolAccountInfo.reinvestFulfillBuy);
      assert.isTrue(poolAccountInfo.reinvestFulfillSell);
      assert.equal(poolAccountInfo.expiry.toNumber(), 0);
      assert.equal(poolAccountInfo.lpFeeBp, 150);
      assert.deepEqual(poolAccountInfo.referral, PublicKey.default);
      assert.equal(poolAccountInfo.referralBp, 0);
      assert.deepEqual(
        poolAccountInfo.cosignerAnnotation,
        new Array(32).fill(0).map((_, index) => index),
      );
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.deepEqual(poolAccountInfo.owner, wallet.publicKey);
      assert.deepEqual(poolAccountInfo.cosigner, cosigner.publicKey);
      assert.deepEqual(poolAccountInfo.uuid, uuid.publicKey);
      assert.deepEqual(poolAccountInfo.paymentMint, PublicKey.default);
      assert.deepEqual(poolAccountInfo.allowlists, allowlists);
    });
  });

  describe('Can update allowlists', () => {
    it('happy path', async () => {
      const fvca = Keypair.generate();
      const newFcva = Keypair.generate();

      const allowlists = [
        { kind: AllowlistKind.fvca, value: fvca.publicKey },
        { kind: AllowlistKind.mint, value: cosigner.publicKey },
        { kind: AllowlistKind.mcc, value: wallet.publicKey },
        ...getEmptyAllowLists(3),
      ];

      const newAllowlists = [
        { kind: AllowlistKind.fvca, value: newFcva.publicKey },
        { kind: AllowlistKind.mint, value: cosigner.publicKey },
        { kind: AllowlistKind.mcc, value: wallet.publicKey },
        ...getEmptyAllowLists(3),
      ];

      const referral = Keypair.generate();
      const uuid = Keypair.generate();

      const { key: poolKey } = getMMMPoolPDA(
        program.programId,
        wallet.publicKey,
        uuid.publicKey,
      );

      await program.methods
        .createPool({
          spotPrice: new anchor.BN(1 * LAMPORTS_PER_SOL),
          curveType: CurveKind.linear,
          curveDelta: new anchor.BN(0),
          reinvestFulfillBuy: true,
          reinvestFulfillSell: true,
          expiry: new anchor.BN(42),
          lpFeeBp: 200,
          referral: referral.publicKey,
          cosignerAnnotation: new Array(32).fill(0),
          buysideCreatorRoyaltyBp: 0,

          uuid: uuid.publicKey,
          paymentMint: PublicKey.default,
          allowlists,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([cosigner])
        .rpc();

      await program.methods
        .updateAllowlists({
          allowlists: newAllowlists,
        })
        .accountsStrict({
          cosigner: cosigner.publicKey,
          owner: wallet.publicKey,
          pool: poolKey,
        })
        .signers([cosigner])
        .rpc();

      const poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.deepEqual(poolAccountInfo.allowlists, newAllowlists);
    });

    it('invalid authority cannot update', async () => {
      const inavlidAuthorityKeypair = Keypair.generate();

      const fvca = Keypair.generate();
      const newFcva = Keypair.generate();

      const allowlists = [
        { kind: AllowlistKind.fvca, value: fvca.publicKey },
        { kind: AllowlistKind.mint, value: cosigner.publicKey },
        { kind: AllowlistKind.mcc, value: wallet.publicKey },
        ...getEmptyAllowLists(3),
      ];

      const newAllowlists = [
        { kind: AllowlistKind.fvca, value: newFcva.publicKey },
        { kind: AllowlistKind.mint, value: cosigner.publicKey },
        { kind: AllowlistKind.mcc, value: wallet.publicKey },
        ...getEmptyAllowLists(3),
      ];

      const referral = Keypair.generate();
      const uuid = Keypair.generate();

      const { key: poolKey } = getMMMPoolPDA(
        program.programId,
        wallet.publicKey,
        uuid.publicKey,
      );

      await program.methods
        .createPool({
          spotPrice: new anchor.BN(1 * LAMPORTS_PER_SOL),
          curveType: CurveKind.linear,
          curveDelta: new anchor.BN(0),
          reinvestFulfillBuy: true,
          reinvestFulfillSell: true,
          expiry: new anchor.BN(42),
          lpFeeBp: 200,
          referral: referral.publicKey,
          cosignerAnnotation: new Array(32).fill(0),
          buysideCreatorRoyaltyBp: 0,

          uuid: uuid.publicKey,
          paymentMint: PublicKey.default,
          allowlists,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([cosigner])
        .rpc();

      try {
        await program.methods
          .updateAllowlists({
            allowlists: newAllowlists,
          })
          .accountsStrict({
            cosigner: inavlidAuthorityKeypair.publicKey,
            owner: wallet.publicKey,
            pool: poolKey,
          })
          .signers([inavlidAuthorityKeypair])
          .rpc();

        assert.ok(false, 'Should have thrown error');
      } catch (_err) {
        // Should be an AnchorError and force convert the type.
        expect(_err).to.be.instanceOf(AnchorError);
        const err = _err as AnchorError;

        assert.strictEqual(err.error.errorMessage, 'invalid owner');
        assert.strictEqual(err.error.errorCode.number, 6007);

        const poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.deepEqual(poolAccountInfo.allowlists, allowlists);
      }
    });

    it('owner cannot update when cosigner is present', async () => {
      const fvca = Keypair.generate();
      const newFcva = Keypair.generate();

      const allowlists = [
        { kind: AllowlistKind.fvca, value: fvca.publicKey },
        { kind: AllowlistKind.mint, value: cosigner.publicKey },
        { kind: AllowlistKind.mcc, value: wallet.publicKey },
        ...getEmptyAllowLists(3),
      ];

      const newAllowlists = [
        { kind: AllowlistKind.fvca, value: newFcva.publicKey },
        { kind: AllowlistKind.mint, value: cosigner.publicKey },
        { kind: AllowlistKind.mcc, value: wallet.publicKey },
        ...getEmptyAllowLists(3),
      ];

      const referral = Keypair.generate();
      const uuid = Keypair.generate();

      const { key: poolKey } = getMMMPoolPDA(
        program.programId,
        wallet.publicKey,
        uuid.publicKey,
      );

      await program.methods
        .createPool({
          spotPrice: new anchor.BN(1 * LAMPORTS_PER_SOL),
          curveType: CurveKind.linear,
          curveDelta: new anchor.BN(0),
          reinvestFulfillBuy: true,
          reinvestFulfillSell: true,
          expiry: new anchor.BN(42),
          lpFeeBp: 200,
          referral: referral.publicKey,
          cosignerAnnotation: new Array(32).fill(0),
          buysideCreatorRoyaltyBp: 0,

          uuid: uuid.publicKey,
          paymentMint: PublicKey.default,
          allowlists,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([cosigner])
        .rpc();

      try {
        await program.methods
          .updateAllowlists({
            allowlists: newAllowlists,
          })
          .accountsStrict({
            cosigner: wallet.publicKey,
            owner: wallet.publicKey,
            pool: poolKey,
          })
          .rpc();

        assert.ok(false, 'Should have thrown error');
      } catch (_err) {
        // Should be an AnchorError and force convert the type.
        expect(_err).to.be.instanceOf(AnchorError);
        const err = _err as AnchorError;

        assert.strictEqual(err.error.errorMessage, 'invalid owner');
        assert.strictEqual(err.error.errorCode.number, 6007);

        const poolAccountInfo = await program.account.pool.fetch(poolKey);
        assert.deepEqual(poolAccountInfo.allowlists, allowlists);
      }
    });

    it('owner can update when no cosigner', async () => {
      const fvca = Keypair.generate();
      const newFcva = Keypair.generate();

      const allowlists = [
        { kind: AllowlistKind.fvca, value: fvca.publicKey },
        { kind: AllowlistKind.mint, value: cosigner.publicKey },
        { kind: AllowlistKind.mcc, value: wallet.publicKey },
        ...getEmptyAllowLists(3),
      ];

      const newAllowlists = [
        { kind: AllowlistKind.fvca, value: newFcva.publicKey },
        { kind: AllowlistKind.mint, value: cosigner.publicKey },
        { kind: AllowlistKind.mcc, value: wallet.publicKey },
        ...getEmptyAllowLists(3),
      ];

      const referral = Keypair.generate();
      const uuid = Keypair.generate();

      const { key: poolKey } = getMMMPoolPDA(
        program.programId,
        wallet.publicKey,
        uuid.publicKey,
      );

      await program.methods
        .createPool({
          spotPrice: new anchor.BN(1 * LAMPORTS_PER_SOL),
          curveType: CurveKind.linear,
          curveDelta: new anchor.BN(0),
          reinvestFulfillBuy: true,
          reinvestFulfillSell: true,
          expiry: new anchor.BN(42),
          lpFeeBp: 200,
          referral: referral.publicKey,
          cosignerAnnotation: new Array(32).fill(0),
          buysideCreatorRoyaltyBp: 0,

          uuid: uuid.publicKey,
          paymentMint: PublicKey.default,
          allowlists,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: wallet.publicKey,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([])
        .rpc();

      let poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.deepEqual(poolAccountInfo.owner, wallet.publicKey);
      assert.deepEqual(poolAccountInfo.cosigner, wallet.publicKey);

      await program.methods
        .updateAllowlists({
          allowlists: newAllowlists,
        })
        .accountsStrict({
          cosigner: wallet.publicKey,
          owner: wallet.publicKey,
          pool: poolKey,
        })
        .rpc();

      poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.deepEqual(poolAccountInfo.allowlists, newAllowlists);
    });
  });
});
