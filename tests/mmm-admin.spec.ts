import * as anchor from '@project-serum/anchor';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { assert } from 'chai';
import {
  IDL,
  Mmm,
  CurveKind,
  AllowlistKind,
  getMMMPoolPDA,
  MMMProgramID,
  getDynamicAllowlistPDA,
} from '../sdk/src';
import { airdrop, getEmptyAllowLists } from './utils';

describe('mmm-admin', () => {
  const { connection } = anchor.AnchorProvider.env();
  console.log('Connection:', connection);
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
        .accounts({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
          dynamicAllowlist: null,
          authority: null,
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
        .accounts({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
          dynamicAllowlist: null,
          authority: null,
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

  describe('Can create & update dynamic allowlist account', () => {
    it('happy path', async () => {
      const fvca = Keypair.generate();
      const newFcva = Keypair.generate();
      const cosignerAnnotation = new Array(32).fill(0);

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

      const { key: dynamicAllowlist } = getDynamicAllowlistPDA(
        program.programId,
        wallet.publicKey,
        cosignerAnnotation,
      );

      await program.methods
        .createDynamicAllowlist({
          cosignerAnnotation,
          allowlists,
        })
        .accounts({
          authority: wallet.publicKey,
          dynamicAllowlist,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const dynamicAllowlistAccountInfo =
        await program.account.dynamicAllowlist.fetch(dynamicAllowlist);

      assert.equal(
        dynamicAllowlistAccountInfo.authority.toBase58(),
        wallet.publicKey.toBase58(),
      );
      assert.deepEqual(
        dynamicAllowlistAccountInfo.cosignerAnnotation,
        cosignerAnnotation,
      );
      assert.deepEqual(dynamicAllowlistAccountInfo.allowlists, allowlists);

      await program.methods
        .updateDynamicAllowlist({
          cosignerAnnotation,
          allowlists: newAllowlists,
        })
        .accounts({
          authority: wallet.publicKey,
          dynamicAllowlist,
        })
        .rpc();

      const updatedDynamicAllowlistAccountInfo =
        await program.account.dynamicAllowlist.fetch(dynamicAllowlist);

      assert.equal(
        updatedDynamicAllowlistAccountInfo.authority.toBase58(),
        wallet.publicKey.toBase58(),
      );
      assert.deepEqual(
        updatedDynamicAllowlistAccountInfo.cosignerAnnotation,
        cosignerAnnotation,
      );
      assert.deepEqual(
        updatedDynamicAllowlistAccountInfo.allowlists,
        newAllowlists,
      );
    });
  });

  describe('Can create sol mmm w/ dynamic allowlist', () => {
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

      const cosignerAnnotation = new Array(32).fill(1);

      const { key: dynamicAllowlist } = getDynamicAllowlistPDA(
        program.programId,
        wallet.publicKey,
        cosignerAnnotation,
      );

      // The value of the pool's allowlist once the dynamic allowlist is set.
      // This is a single address pointing to the dynamic allowlist PDA.
      const dynamicAllowlistPointer = [
        { kind: AllowlistKind.dynamic, value: dynamicAllowlist },
        ...getEmptyAllowLists(5),
      ];

      await program.methods
        .createDynamicAllowlist({
          cosignerAnnotation,
          allowlists,
        })
        .accounts({
          authority: wallet.publicKey,
          dynamicAllowlist,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const dynamicAllowlistAccountInfo =
        await program.account.dynamicAllowlist.fetch(dynamicAllowlist);

      assert.equal(
        dynamicAllowlistAccountInfo.authority.toBase58(),
        wallet.publicKey.toBase58(),
      );
      assert.deepEqual(
        dynamicAllowlistAccountInfo.cosignerAnnotation,
        cosignerAnnotation,
      );
      assert.deepEqual(dynamicAllowlistAccountInfo.allowlists, allowlists);

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
          cosignerAnnotation,
          buysideCreatorRoyaltyBp: 0,
          uuid: uuid.publicKey,
          paymentMint: PublicKey.default,
          allowlists,
        })
        .accounts({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
          dynamicAllowlist,
          authority: wallet.publicKey,
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
      assert.deepEqual(poolAccountInfo.cosignerAnnotation, cosignerAnnotation);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.deepEqual(poolAccountInfo.owner, wallet.publicKey);
      assert.deepEqual(poolAccountInfo.cosigner, cosigner.publicKey);
      assert.deepEqual(poolAccountInfo.uuid, uuid.publicKey);
      assert.deepEqual(poolAccountInfo.paymentMint, PublicKey.default);
      assert.deepEqual(poolAccountInfo.allowlists, dynamicAllowlistPointer);
    });
  });
});
