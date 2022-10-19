import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {
  getAssociatedTokenAddress,
  getAccount as getTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
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
  getMMMBuysideSolEscrowPDA,
  getMMMSellStatePDA,
} from '../sdk/src';
import {
  createPool,
  getEmptyAllowLists,
  getMetaplexInstance,
  mintCollection,
  mintNfts,
} from './utils';

describe('mmm-deposit', () => {
  const { wallet, connection, opts } = anchor.AnchorProvider.env();
  opts.commitment = 'processed';
  const program = anchor.workspace.Mmm as Program<Mmm>;
  const cosigner = Keypair.generate();

  describe('sol_deposit_buy', () => {
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
        .remainingAccounts([
          { pubkey: cosigner.publicKey, isSigner: true, isWritable: false },
        ])
        .signers([cosigner])
        .rpc();

      assert.equal(
        await connection.getBalance(solEscrowKey),
        2 * LAMPORTS_PER_SOL,
      );
    });
  });

  describe('try_close_pool', () => {
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
        .remainingAccounts([
          { pubkey: cosigner.publicKey, isSigner: true, isWritable: false },
        ])
        .signers([cosigner])
        .rpc();

      assert.equal(
        await connection.getBalance(solEscrowKey),
        2 * LAMPORTS_PER_SOL,
      );

      await program.methods
        .solWithdrawBuy({ paymentAmount: new anchor.BN(1 * LAMPORTS_PER_SOL) })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          buysideSolEscrowAccount: solEscrowKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: cosigner.publicKey, isSigner: true, isWritable: false },
        ])
        .signers([cosigner])
        .rpc();

      assert.equal(
        await connection.getBalance(solEscrowKey),
        1 * LAMPORTS_PER_SOL,
      );
      assert.notEqual(await connection.getBalance(poolKey), 0);

      await program.methods
        .solWithdrawBuy({ paymentAmount: new anchor.BN(1 * LAMPORTS_PER_SOL) })
        .accountsStrict({
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          pool: poolKey,
          buysideSolEscrowAccount: solEscrowKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: cosigner.publicKey, isSigner: true, isWritable: false },
        ])
        .signers([cosigner])
        .rpc();

      assert.equal(await connection.getBalance(solEscrowKey), 0);
      assert.equal(await connection.getBalance(poolKey), 0);
    });
  });

  describe('deposit_sell', () => {
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
        }),
        mintNfts(connection, {
          numNfts: 1,
          creators: [
            { address: creator.publicKey, share: 100, authority: creator },
          ],
          sftAmount: 10,
        }),
      ]);

      const mintAddress1 = nfts[0].mintAddress;
      const mintAddress2 = sfts[0].mintAddress;

      let poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 0);

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
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([cosigner])
        .rpc();

      let nftEscrow = await getTokenAccount(connection, poolAta1);
      assert.equal(Number(nftEscrow.amount), 1);
      assert.equal(nftEscrow.owner.toBase58(), poolKey.toBase58());
      poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 1);
      assert.equal(await connection.getBalance(nfts[0].tokenAddress!), 0);

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
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([cosigner])
        .rpc();

      poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 6);
      nftEscrow = await getTokenAccount(connection, poolAta2);
      assert.equal(Number(nftEscrow.amount), 5);
      assert.deepEqual(nftEscrow.owner, poolKey);
      const sftAccount = await getTokenAccount(
        connection,
        sfts[0].tokenAddress!,
      );
      assert.equal(Number(sftAccount.amount), 5);
      assert.deepEqual(sftAccount.owner, wallet.publicKey);
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
        }),
        mintNfts(connection, {
          numNfts: 1,
          sftAmount: 10,
          collectionAddress: collection.mintAddress,
          verifyCollection: true,
        }),
      ]);

      const mintAddress1 = nfts[0].mintAddress;
      const mintAddress2 = sfts[0].mintAddress;

      let poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 0);

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
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([cosigner])
        .rpc();

      let nftEscrow = await getTokenAccount(connection, poolAta1);
      assert.equal(Number(nftEscrow.amount), 1);
      assert.equal(nftEscrow.owner.toBase58(), poolKey.toBase58());
      poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 1);
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
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([cosigner])
        .rpc();

      poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 6);
      nftEscrow = await getTokenAccount(connection, poolAta2);
      assert.equal(Number(nftEscrow.amount), 5);
      assert.deepEqual(nftEscrow.owner, poolKey);
      const sftAccount = await getTokenAccount(
        connection,
        sfts[0].tokenAddress!,
      );
      assert.equal(Number(sftAccount.amount), 5);
      assert.deepEqual(sftAccount.owner, wallet.publicKey);
    });

    it('correctly verifies mint-only allowlists when depositing items', async () => {
      const metaplexInstance = getMetaplexInstance(connection);
      const [nfts, sfts] = await Promise.all([
        mintNfts(connection, {
          numNfts: 1,
        }),
        mintNfts(connection, {
          numNfts: 1,
          sftAmount: 10,
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
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 0);

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
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([cosigner])
        .rpc();

      let nftEscrow = await getTokenAccount(connection, poolAta1);
      assert.equal(Number(nftEscrow.amount), 1);
      assert.equal(nftEscrow.owner.toBase58(), poolKey.toBase58());
      poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 1);
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
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([cosigner])
        .rpc();

      poolAccountInfo = await program.account.pool.fetch(poolKey);
      assert.equal(poolAccountInfo.sellsideOrdersCount.toNumber(), 6);
      nftEscrow = await getTokenAccount(connection, poolAta2);
      assert.equal(Number(nftEscrow.amount), 5);
      assert.deepEqual(nftEscrow.owner, poolKey);
      const sftAccount = await getTokenAccount(
        connection,
        sfts[0].tokenAddress!,
      );
      assert.equal(Number(sftAccount.amount), 5);
      assert.deepEqual(sftAccount.owner, wallet.publicKey);
    });
  });
});
