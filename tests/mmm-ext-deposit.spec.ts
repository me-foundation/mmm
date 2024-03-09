import * as anchor from '@project-serum/anchor';
import {
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { assert, expect } from 'chai';
import {
  Mmm,
  AllowlistKind,
  getMMMSellStatePDA,
  IDL,
  MMMProgramID,
} from '../sdk/src';
import {
  airdrop,
  createPool,
  createTestGroupMemberMint,
  createTestGroupMintExt,
  createTestMintAndTokenT22VanillaExt,
  getEmptyAllowLists,
  getTokenAccount2022,
} from './utils';

describe('mmm-ext-deposit', () => {
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

  describe('ext_deposit_sell', () => {
    it('correctly verifies depositing nfts with group allowlist', async () => {
      const { groupKeyPair } = await createTestGroupMintExt(
        connection,
        wallet.payer,
      );
      const { mint, recipientTokenAccount } =
        await createTestMintAndTokenT22VanillaExt(
          connection,
          wallet.payer,
          undefined,
          groupKeyPair,
        );

      const poolData = await createPool(program, {
        owner: wallet.publicKey,
        cosigner,
        allowlists: [
          {
            kind: AllowlistKind.metadata,
            value: mint,
          },
          {
            kind: AllowlistKind.group,
            value: groupKeyPair.publicKey,
          },
          ...getEmptyAllowLists(4),
        ],
      });

      const poolAta = await getAssociatedTokenAddress(
        mint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        mint,
      );

      assert.equal(await connection.getBalance(poolAta), 0);
      assert.equal(await connection.getBalance(sellState), 0);
      let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);

      await program.methods
        .extDepositSell({
          assetAmount: new anchor.BN(1),
          allowlistAux: 'example.com',
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolData.poolKey,
          assetMint: mint,
          assetTokenAccount: recipientTokenAccount,
          sellsideEscrowTokenAccount: poolAta,
          sellState,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([cosigner])
        .rpc({ skipPreflight: true });

      let nftEscrow = await getTokenAccount2022(
        connection,
        poolAta,
        TOKEN_2022_PROGRAM_ID,
      );
      assert.equal(Number(nftEscrow.amount), 1);
      assert.equal(nftEscrow.owner.toBase58(), poolData.poolKey.toBase58());
      poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
      assert.equal(await connection.getBalance(recipientTokenAccount), 0);

      const sellStateAccountInfo = await program.account.sellState.fetch(
        sellState,
      );
      assert.equal(
        sellStateAccountInfo.pool.toBase58(),
        poolData.poolKey.toBase58(),
      );
      assert.equal(
        sellStateAccountInfo.poolOwner.toBase58(),
        wallet.publicKey.toBase58(),
      );
      assert.equal(sellStateAccountInfo.assetMint.toBase58(), mint.toBase58());
      assert.equal(sellStateAccountInfo.assetAmount.toNumber(), 1);
      assert.deepEqual(
        sellStateAccountInfo.cosignerAnnotation,
        new Array(32).fill(0),
      );

      const { mint: mint2, recipientTokenAccount: recipientTokenAccount2 } =
        await createTestMintAndTokenT22VanillaExt(
          connection,
          wallet.payer,
          undefined,
          groupKeyPair,
        );
      const poolAta2 = await getAssociatedTokenAddress(
        mint2,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );
      let { key: sellState2 } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        mint2,
      );
      await program.methods
        .extDepositSell({
          assetAmount: new anchor.BN(1),
          allowlistAux: '',
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolData.poolKey,
          assetMint: mint2,
          assetTokenAccount: recipientTokenAccount2,
          sellsideEscrowTokenAccount: poolAta2,
          sellState: sellState2,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([cosigner])
        .rpc({ skipPreflight: true });

      let nftEscrow2 = await getTokenAccount2022(
        connection,
        poolAta2,
        TOKEN_2022_PROGRAM_ID,
      );
      assert.equal(Number(nftEscrow2.amount), 1);
      assert.equal(nftEscrow2.owner.toBase58(), poolData.poolKey.toBase58());
      poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      // should increment by 1
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 2);
      assert.equal(await connection.getBalance(recipientTokenAccount2), 0);

      const sellStateAccountInfo2 = await program.account.sellState.fetch(
        sellState2,
      );
      assert.equal(
        sellStateAccountInfo2.pool.toBase58(),
        poolData.poolKey.toBase58(),
      );
      assert.equal(
        sellStateAccountInfo2.poolOwner.toBase58(),
        wallet.publicKey.toBase58(),
      );
      assert.equal(
        sellStateAccountInfo2.assetMint.toBase58(),
        mint2.toBase58(),
      );
      assert.equal(sellStateAccountInfo2.assetAmount.toNumber(), 1);
      assert.deepEqual(
        sellStateAccountInfo2.cosignerAnnotation,
        new Array(32).fill(0),
      );
    });

    it('correctly verifies depositing nfts with ANY allowlist', async () => {
      const { groupKeyPair } = await createTestGroupMintExt(
        connection,
        wallet.payer,
      );
      const { mint, recipientTokenAccount } =
        await createTestMintAndTokenT22VanillaExt(
          connection,
          wallet.payer,
          undefined,
          groupKeyPair,
        );

      const poolData = await createPool(program, {
        owner: wallet.publicKey,
        cosigner,
        allowlists: [
          {
            kind: AllowlistKind.any,
            value: PublicKey.default,
          },
          ...getEmptyAllowLists(5),
        ],
      });

      const poolAta = await getAssociatedTokenAddress(
        mint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        mint,
      );

      assert.equal(await connection.getBalance(poolAta), 0);
      assert.equal(await connection.getBalance(sellState), 0);
      let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);

      await program.methods
        .extDepositSell({
          assetAmount: new anchor.BN(1),
          allowlistAux: '',
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolData.poolKey,
          assetMint: mint,
          assetTokenAccount: recipientTokenAccount,
          sellsideEscrowTokenAccount: poolAta,
          sellState,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([cosigner])
        .rpc({ skipPreflight: true });

      let nftEscrow = await getTokenAccount2022(
        connection,
        poolAta,
        TOKEN_2022_PROGRAM_ID,
      );
      assert.equal(Number(nftEscrow.amount), 1);
      assert.equal(nftEscrow.owner.toBase58(), poolData.poolKey.toBase58());
      poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
      assert.equal(await connection.getBalance(recipientTokenAccount), 0);

      const sellStateAccountInfo = await program.account.sellState.fetch(
        sellState,
      );
      assert.equal(
        sellStateAccountInfo.pool.toBase58(),
        poolData.poolKey.toBase58(),
      );
      assert.equal(
        sellStateAccountInfo.poolOwner.toBase58(),
        wallet.publicKey.toBase58(),
      );
      assert.equal(sellStateAccountInfo.assetMint.toBase58(), mint.toBase58());
      assert.equal(sellStateAccountInfo.assetAmount.toNumber(), 1);
      assert.deepEqual(
        sellStateAccountInfo.cosignerAnnotation,
        new Array(32).fill(0),
      );

      const { mint: mint2, recipientTokenAccount: recipientTokenAccount2 } =
        await createTestMintAndTokenT22VanillaExt(
          connection,
          wallet.payer,
          undefined,
          groupKeyPair,
        );
      const poolAta2 = await getAssociatedTokenAddress(
        mint2,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );
      let { key: sellState2 } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        mint2,
      );
      await program.methods
        .extDepositSell({
          assetAmount: new anchor.BN(1),
          allowlistAux: '',
        })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolData.poolKey,
          assetMint: mint2,
          assetTokenAccount: recipientTokenAccount2,
          sellsideEscrowTokenAccount: poolAta2,
          sellState: sellState2,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([cosigner])
        .rpc({ skipPreflight: true });

      let nftEscrow2 = await getTokenAccount2022(
        connection,
        poolAta2,
        TOKEN_2022_PROGRAM_ID,
      );
      assert.equal(Number(nftEscrow2.amount), 1);
      assert.equal(nftEscrow2.owner.toBase58(), poolData.poolKey.toBase58());
      poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      // should increment by 1
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 2);
      assert.equal(await connection.getBalance(recipientTokenAccount2), 0);

      const sellStateAccountInfo2 = await program.account.sellState.fetch(
        sellState2,
      );
      assert.equal(
        sellStateAccountInfo2.pool.toBase58(),
        poolData.poolKey.toBase58(),
      );
      assert.equal(
        sellStateAccountInfo2.poolOwner.toBase58(),
        wallet.publicKey.toBase58(),
      );
      assert.equal(
        sellStateAccountInfo2.assetMint.toBase58(),
        mint2.toBase58(),
      );
      assert.equal(sellStateAccountInfo2.assetAmount.toNumber(), 1);
      assert.deepEqual(
        sellStateAccountInfo2.cosignerAnnotation,
        new Array(32).fill(0),
      );
    });

    it('failed to verify depositing with wrong allowlist aux', async () => {
      const { groupKeyPair } = await createTestGroupMintExt(
        connection,
        wallet.payer,
      );
      const { mint, recipientTokenAccount } =
        await createTestMintAndTokenT22VanillaExt(
          connection,
          wallet.payer,
          undefined,
          groupKeyPair,
        );

      const poolData = await createPool(program, {
        owner: wallet.publicKey,
        cosigner,
        allowlists: [
          {
            kind: AllowlistKind.metadata,
            value: mint,
          },
          {
            kind: AllowlistKind.group,
            value: groupKeyPair.publicKey,
          },
          ...getEmptyAllowLists(4),
        ],
      });

      const poolAta = await getAssociatedTokenAddress(
        mint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        mint,
      );

      assert.equal(await connection.getBalance(poolAta), 0);
      assert.equal(await connection.getBalance(sellState), 0);
      let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);

      try {
        await program.methods
          .extDepositSell({
            assetAmount: new anchor.BN(1),
            allowlistAux: 'wrong-aux',
          })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolData.poolKey,
            assetMint: mint,
            assetTokenAccount: recipientTokenAccount,
            sellsideEscrowTokenAccount: poolAta,
            sellState,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([cosigner])
          .rpc({ skipPreflight: true });
      } catch (err) {
        assertProgramError(err, 'Unexpected metadata uri');
      }
    });

    it('failed to verify depositing nfts with external group member pointer', async () => {
      const { groupKeyPair } = await createTestGroupMintExt(
        connection,
        wallet.payer,
      );
      const { groupMemberKeyPair } = await createTestGroupMemberMint(
        connection,
        wallet.payer,
        groupKeyPair,
      );
      const { mint, recipientTokenAccount } =
        await createTestMintAndTokenT22VanillaExt(
          connection,
          wallet.payer,
          undefined,
          groupKeyPair,
          groupMemberKeyPair,
        );

      const poolData = await createPool(program, {
        owner: wallet.publicKey,
        cosigner,
        allowlists: [
          {
            kind: AllowlistKind.metadata,
            value: mint,
          },
          {
            kind: AllowlistKind.group,
            value: groupKeyPair.publicKey,
          },
          ...getEmptyAllowLists(4),
        ],
      });

      const poolAta = await getAssociatedTokenAddress(
        mint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        mint,
      );

      assert.equal(await connection.getBalance(poolAta), 0);
      assert.equal(await connection.getBalance(sellState), 0);
      let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);

      try {
        await program.methods
          .extDepositSell({
            assetAmount: new anchor.BN(1),
            allowlistAux: '',
          })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolData.poolKey,
            assetMint: mint,
            assetTokenAccount: recipientTokenAccount,
            sellsideEscrowTokenAccount: poolAta,
            sellState,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([cosigner])
          .rpc({ skipPreflight: true });
      } catch (err) {
        assertProgramError(err, 'Invalid token member extensions');
      }
    });

    it('failed to verify depositing nfts with disallowed group', async () => {
      const { groupKeyPair } = await createTestGroupMintExt(
        connection,
        wallet.payer,
      );
      const { mint, recipientTokenAccount } =
        await createTestMintAndTokenT22VanillaExt(
          connection,
          wallet.payer,
          undefined,
          groupKeyPair,
        );

      const poolData = await createPool(program, {
        owner: wallet.publicKey,
        cosigner,
        allowlists: [
          {
            kind: AllowlistKind.metadata,
            value: mint,
          },
          {
            kind: AllowlistKind.group,
            value: mint, // unexpected group address
          },
          ...getEmptyAllowLists(4),
        ],
      });

      const poolAta = await getAssociatedTokenAddress(
        mint,
        poolData.poolKey,
        true,
        TOKEN_2022_PROGRAM_ID,
      );

      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        mint,
      );

      assert.equal(await connection.getBalance(poolAta), 0);
      assert.equal(await connection.getBalance(sellState), 0);
      let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);

      try {
        await program.methods
          .extDepositSell({
            assetAmount: new anchor.BN(1),
            allowlistAux: '',
          })
          .accountsStrict({
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            pool: poolData.poolKey,
            assetMint: mint,
            assetTokenAccount: recipientTokenAccount,
            sellsideEscrowTokenAccount: poolAta,
            sellState,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([cosigner])
          .rpc({ skipPreflight: true });
      } catch (err) {
        assertProgramError(err, 'invalid allowlists');
      }
    });
  });
});

function assertProgramError(_err: unknown, message: string) {
  expect(_err).to.be.instanceOf(anchor.ProgramError);
  const err = _err as anchor.ProgramError;

  assert.strictEqual(err.msg, message);
}
