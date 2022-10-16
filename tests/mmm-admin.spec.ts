import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { assert } from 'chai';
import { Mmm, CurveKind, AllowlistKind, getMMMPoolPDA } from '../sdk/src';
import { getEmptyAllowLists } from './utils';

describe('mmm-admin', () => {
  const { wallet, connection, opts } = anchor.AnchorProvider.env();
  opts.commitment = 'processed';
  const program = anchor.workspace.Mmm as Program<Mmm>;
  const cosigner = Keypair.generate();

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
          reinvest: true,
          expiry: new anchor.BN(42),
          lpFeeBp: 200,
          referral: referral.publicKey,
          referralBp: 300,
          cosignerAnnotation: new Array(32).fill(0),

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
      assert.isTrue(poolAccountInfo.reinvest);
      assert.equal(poolAccountInfo.expiry.toNumber(), 42);
      assert.equal(poolAccountInfo.lpFeeBp, 200);
      assert.equal(
        poolAccountInfo.referral.toBase58(),
        referral.publicKey.toBase58(),
      );
      assert.equal(poolAccountInfo.referralBp, 300);
      assert.deepEqual(
        poolAccountInfo.cosignerAnnotation,
        new Array(32).fill(0),
      );
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 0);
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
          reinvest: true,
          expiry: new anchor.BN(42),
          lpFeeBp: 200,
          referral: referral.publicKey,
          referralBp: 300,
          cosignerAnnotation: new Array(32).fill(0),

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
          reinvest: true,
          expiry: new anchor.BN(0),
          lpFeeBp: 150,
          referral: PublicKey.default,
          referralBp: 200,
          cosignerAnnotation: new Array(32).fill(0).map((_, index) => index),
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
        })
        .remainingAccounts([
          { pubkey: cosigner.publicKey, isSigner: true, isWritable: false },
        ])
        .signers([cosigner])
        .rpc();

      const poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.equal(poolAccountInfo.spotPrice.toNumber(), 2 * LAMPORTS_PER_SOL);
      assert.equal(poolAccountInfo.curveType, CurveKind.exp);
      assert.equal(poolAccountInfo.curveDelta.toNumber(), 888);
      assert.isTrue(poolAccountInfo.reinvest);
      assert.equal(poolAccountInfo.expiry.toNumber(), 0);
      assert.equal(poolAccountInfo.lpFeeBp, 150);
      assert.deepEqual(poolAccountInfo.referral, PublicKey.default);
      assert.equal(poolAccountInfo.referralBp, 200);
      assert.deepEqual(
        poolAccountInfo.cosignerAnnotation,
        new Array(32).fill(0).map((_, index) => index),
      );
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 0);
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), 0);
      assert.deepEqual(poolAccountInfo.owner, wallet.publicKey);
      assert.deepEqual(poolAccountInfo.cosigner, cosigner.publicKey);
      assert.deepEqual(poolAccountInfo.uuid, uuid.publicKey);
      assert.deepEqual(poolAccountInfo.paymentMint, PublicKey.default);
      assert.deepEqual(poolAccountInfo.allowlists, allowlists);
    });
  });
});
