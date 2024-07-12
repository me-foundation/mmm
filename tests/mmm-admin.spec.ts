import * as anchor from '@project-serum/anchor';
import { AnchorError } from '@project-serum/anchor';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import {
  IDL,
  Mmm,
  CurveKind,
  AllowlistKind,
  getMMMPoolPDA,
  MMMProgramID,
  getMMMBuysideSolEscrowPDA,
} from '../sdk/src';
import { airdrop, getEmptyAllowLists } from './utils';

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
      expect(poolAccountInfo.spotPrice.toNumber()).toBe(1 * LAMPORTS_PER_SOL);
      expect(poolAccountInfo.curveType).toBe(CurveKind.linear);
      expect(poolAccountInfo.curveDelta.toNumber()).toBe(0);
      expect(poolAccountInfo.reinvestFulfillBuy).toBe(true);
      expect(poolAccountInfo.reinvestFulfillSell).toBe(true);
      expect(poolAccountInfo.expiry.toNumber()).toBe(42);
      expect(poolAccountInfo.lpFeeBp).toBe(200);
      expect(poolAccountInfo.referral.toBase58()).toBe(
        referral.publicKey.toBase58(),
      );
      expect(poolAccountInfo.referralBp).toBe(0);
      expect(poolAccountInfo.cosignerAnnotation).toEqual(new Array(32).fill(0));
      expect(poolAccountInfo.sellsideAssetAmount.toNumber()).toBe(0);
      expect(poolAccountInfo.lpFeeEarned.toNumber()).toBe(0);
      expect(poolAccountInfo.owner).toEqual(wallet.publicKey);
      expect(poolAccountInfo.cosigner).toEqual(cosigner.publicKey);
      expect(poolAccountInfo.uuid).toEqual(uuid.publicKey);
      expect(poolAccountInfo.paymentMint).toEqual(PublicKey.default);
      expect(poolAccountInfo.allowlists).toEqual(allowlists);
    });

    it('lp fee cannot be too large', async () => {
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

      try {
        const txId = await program.methods
          .createPool({
            spotPrice: new anchor.BN(1 * LAMPORTS_PER_SOL),
            curveType: CurveKind.linear,
            curveDelta: new anchor.BN(0),
            reinvestFulfillBuy: true,
            reinvestFulfillSell: true,
            expiry: new anchor.BN(42),
            lpFeeBp: 2_001,
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

        expect(txId).toBeNull();
      } catch (e) {
        // Should be an AnchorError and force convert the type.
        expect(e).toBeInstanceOf(AnchorError);
        const err = e as AnchorError;
        expect(err.error.errorCode.number).toBe(6000);
      }
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
      expect(poolAccountInfo.spotPrice.toNumber()).toBe(2 * LAMPORTS_PER_SOL);
      expect(poolAccountInfo.curveType).toBe(CurveKind.exp);
      expect(poolAccountInfo.curveDelta.toNumber()).toBe(888);
      expect(poolAccountInfo.reinvestFulfillBuy).toBe(true);
      expect(poolAccountInfo.reinvestFulfillSell).toBe(true);
      expect(poolAccountInfo.expiry.toNumber()).toBe(0);
      expect(poolAccountInfo.lpFeeBp).toBe(150);
      expect(poolAccountInfo.referral).toEqual(PublicKey.default);
      expect(poolAccountInfo.referralBp).toEqual(0);
      expect(poolAccountInfo.cosignerAnnotation).toEqual(
        new Array(32).fill(0).map((_, index) => index),
      );
      expect(poolAccountInfo.sellsideAssetAmount.toNumber()).toBe(0);
      expect(poolAccountInfo.lpFeeEarned.toNumber()).toBe(0);
      expect(poolAccountInfo.owner).toEqual(wallet.publicKey);
      expect(poolAccountInfo.cosigner).toEqual(cosigner.publicKey);
      expect(poolAccountInfo.uuid).toEqual(uuid.publicKey);
      expect(poolAccountInfo.paymentMint).toEqual(PublicKey.default);
      expect(poolAccountInfo.allowlists).toEqual(allowlists);
    });
  });

  describe('Can close pool', () => {
    it('happy path', async () => {
      const referral = Keypair.generate();
      const uuid = Keypair.generate();
      const { key: poolKey } = getMMMPoolPDA(
        program.programId,
        wallet.publicKey,
        uuid.publicKey,
      );

      const createPoolArgs = {
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
        allowlists: getEmptyAllowLists(6),
      };

      const closeAndCheckPool = async () => {
        await expect(
          program.account.pool.fetchNullable(poolKey),
        ).resolves.not.toBeNull();
        const { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
          MMMProgramID,
          poolKey,
        );
        await program.methods
          .solClosePool()
          .accountsStrict({
            pool: poolKey,
            owner: wallet.publicKey,
            systemProgram: SystemProgram.programId,
            buysideSolEscrowAccount,
            cosigner: cosigner.publicKey,
          })
          .signers([cosigner])
          .rpc();
        await expect(
          program.account.pool.fetchNullable(poolKey),
        ).resolves.toBeNull();
      };

      await program.methods
        .createPool({
          ...createPoolArgs,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([cosigner])
        .rpc();

      await closeAndCheckPool();

      // create pool again, but payment mint is not default
      await program.methods
        .createPool({
          ...createPoolArgs,
          paymentMint: Keypair.generate().publicKey,
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([cosigner])
        .rpc();

      await closeAndCheckPool();
    });
  });

  describe('Can update allowlists', () => {
    it('happy path', async () => {
      // Ensure cosigner is the only signer of the transaction.
      const wallet = new anchor.Wallet(cosigner);
      const provider = new anchor.AnchorProvider(connection, wallet, {
        commitment: 'processed',
      });

      const program = new anchor.Program(
        IDL,
        MMMProgramID,
        provider,
      ) as anchor.Program<Mmm>;

      await airdrop(connection, cosigner.publicKey, 50);

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
        .rpc();

      const poolAccountInfo = await program.account.pool.fetch(poolKey);

      // All pool values should be the same...
      expect(poolAccountInfo.spotPrice.toNumber()).toBe(1 * LAMPORTS_PER_SOL);
      expect(poolAccountInfo.curveType).toBe(CurveKind.linear);
      expect(poolAccountInfo.curveDelta.toNumber()).toBe(0);
      expect(poolAccountInfo.reinvestFulfillBuy).toBe(true);
      expect(poolAccountInfo.reinvestFulfillSell).toBe(true);
      expect(poolAccountInfo.expiry.toNumber()).toBe(42);
      expect(poolAccountInfo.lpFeeBp).toBe(200);
      expect(poolAccountInfo.referral.toBase58()).toBe(
        referral.publicKey.toBase58(),
      );
      expect(poolAccountInfo.referralBp).toBe(0);
      expect(poolAccountInfo.cosignerAnnotation).toEqual(new Array(32).fill(0));
      expect(poolAccountInfo.sellsideAssetAmount.toNumber()).toBe(0);
      expect(poolAccountInfo.lpFeeEarned.toNumber()).toBe(0);
      expect(poolAccountInfo.owner).toEqual(wallet.publicKey);
      expect(poolAccountInfo.cosigner).toEqual(cosigner.publicKey);
      expect(poolAccountInfo.uuid).toEqual(uuid.publicKey);
      expect(poolAccountInfo.paymentMint).toEqual(PublicKey.default);

      // ...except for the allowlists.
      expect(poolAccountInfo.allowlists).toEqual(newAllowlists);
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
        const txId = await program.methods
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

        expect(txId).toBeNull();
      } catch (_err) {
        // Should be an AnchorError and force convert the type.
        expect(_err).toBeInstanceOf(AnchorError);
        const err = _err as AnchorError;

        expect(err.error.errorMessage).toBe('invalid cosigner');
        expect(err.error.errorCode.number).toBe(6005);

        const poolAccountInfo = await program.account.pool.fetch(poolKey);
        expect(poolAccountInfo.allowlists).toEqual(allowlists);
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
        const txId = await program.methods
          .updateAllowlists({
            allowlists: newAllowlists,
          })
          .accountsStrict({
            cosigner: wallet.publicKey,
            owner: wallet.publicKey,
            pool: poolKey,
          })
          .rpc();

        expect(txId).toBeNull();
      } catch (_err) {
        // Should be an AnchorError and force convert the type.
        expect(_err).toBeInstanceOf(AnchorError);
        const err = _err as AnchorError;

        expect(err.error.errorMessage).toBe('invalid cosigner');
        expect(err.error.errorCode.number).toBe(6005);

        const poolAccountInfo = await program.account.pool.fetch(poolKey);
        expect(poolAccountInfo.allowlists).toEqual(allowlists);
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
        .rpc();

      let poolAccountInfo = await program.account.pool.fetch(poolKey);
      expect(poolAccountInfo.owner).toEqual(wallet.publicKey);
      expect(poolAccountInfo.cosigner).toEqual(wallet.publicKey);

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
      expect(poolAccountInfo.allowlists).toEqual(newAllowlists);
    });

    it('cosigner cannot update pool they are not owner on', async () => {
      const owner2 = Keypair.generate();
      const cosigner2 = Keypair.generate();

      await airdrop(connection, owner2.publicKey, 50);

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

      const referral2 = Keypair.generate();
      const uuid2 = Keypair.generate();

      const { key: poolKey } = getMMMPoolPDA(
        program.programId,
        wallet.publicKey,
        uuid.publicKey,
      );

      const { key: poolKey2 } = getMMMPoolPDA(
        program.programId,
        owner2.publicKey,
        uuid2.publicKey,
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

      // Create second pool, with different owner and cosigner.
      await program.methods
        .createPool({
          spotPrice: new anchor.BN(1 * LAMPORTS_PER_SOL),
          curveType: CurveKind.linear,
          curveDelta: new anchor.BN(0),
          reinvestFulfillBuy: true,
          reinvestFulfillSell: true,
          expiry: new anchor.BN(42),
          lpFeeBp: 200,
          referral: referral2.publicKey,
          cosignerAnnotation: new Array(32).fill(0),
          buysideCreatorRoyaltyBp: 0,

          uuid: uuid2.publicKey,
          paymentMint: PublicKey.default,
          allowlists,
        })
        .accountsStrict({
          owner: owner2.publicKey,
          cosigner: cosigner2.publicKey,
          pool: poolKey2,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner2, cosigner2])
        .rpc();

      try {
        const txId = await program.methods
          .updateAllowlists({
            allowlists: newAllowlists,
          })
          .accountsStrict({
            cosigner: cosigner.publicKey,
            owner: owner2.publicKey, // we pass in the correct owner pubkey because it's unchecked
            pool: poolKey2,
          })
          .signers([cosigner])
          .rpc();

        expect(txId).toBeNull();
      } catch (_err) {
        // Should be an AnchorError and force convert the type.
        expect(_err).toBeInstanceOf(AnchorError);
        const err = _err as AnchorError;

        // Seeds constraint will pass but the has_one constraint will fail with the
        // custom "InvalidOwner" error.
        expect(err.error.errorMessage).toBe('invalid cosigner');
        expect(err.error.errorCode.number).toBe(6005);

        const poolAccountInfo = await program.account.pool.fetch(poolKey);
        expect(poolAccountInfo.allowlists).toEqual(allowlists);
      }
    });
  });
});
