import * as anchor from '@project-serum/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { ComputeBudgetProgram, Keypair, SystemProgram } from '@solana/web3.js';
import { assert } from 'chai';
import { Mmm, IDL, MMMProgramID } from '../sdk/src';
import {
  airdrop,
  createPoolWithExampleT22ExtDeposits,
  generateRemainingAccounts,
  getTokenAccount2022,
  LIBREPLEX_ROYALTY_ENFORCEMENT_PROGRAM_ID,
  TRANSFER_HOOK_COMPUTE_UNITS,
  TransferHookArgs,
} from './utils';

describe('mmm-ext-withdraw', () => {
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

  it('Withdraw assets', async () => {
    const {
      mint,
      recipientTokenAccount,
      poolData,
      poolAta,
      sellState,
      solEscrowKey,
      groupAddress,
    } = await createPoolWithExampleT22ExtDeposits(
      program,
      connection,
      wallet.payer,
      'sell',
      {
        owner: wallet.publicKey,
        cosigner,
      },
    );

    await program.methods
      .extWithdrawSell({ assetAmount: new anchor.BN(1), allowlistAux: null })
      .accountsStrict({
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        pool: poolData.poolKey,
        assetMint: mint,
        assetTokenAccount: recipientTokenAccount,
        sellsideEscrowTokenAccount: poolAta,
        buysideSolEscrowAccount: solEscrowKey,
        allowlistAuxAccount: SystemProgram.programId,
        sellState: sellState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([cosigner])
      .rpc({ skipPreflight: true });

    const ownerNftAta = await getTokenAccount2022(
      connection,
      recipientTokenAccount,
      TOKEN_2022_PROGRAM_ID,
    );
    assert.equal(Number(ownerNftAta.amount), 1);
    assert.equal(ownerNftAta.owner.toBase58(), wallet.publicKey.toBase58());
  });

  it('Withdraw assets with royanty enforcement transfer hook', async () => {
    const creatorKeypair = Keypair.generate();
    const royaltyTransferHookArgs: TransferHookArgs = {
      transferHookProgramId: LIBREPLEX_ROYALTY_ENFORCEMENT_PROGRAM_ID,
      creatorAddress: creatorKeypair.publicKey,
      royaltyBp: 300,
      legacy: false,
    };
    const {
      mint,
      recipientTokenAccount,
      poolData,
      poolAta,
      sellState,
      solEscrowKey,
      groupAddress,
    } = await createPoolWithExampleT22ExtDeposits(
      program,
      connection,
      wallet.payer,
      'sell',
      {
        owner: wallet.publicKey,
        cosigner,
      },
      undefined,
      undefined,
      royaltyTransferHookArgs,
    );

    await program.methods
      .extWithdrawSell({ assetAmount: new anchor.BN(1), allowlistAux: null })
      .accountsStrict({
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        pool: poolData.poolKey,
        assetMint: mint,
        assetTokenAccount: recipientTokenAccount,
        sellsideEscrowTokenAccount: poolAta,
        buysideSolEscrowAccount: solEscrowKey,
        allowlistAuxAccount: SystemProgram.programId,
        sellState: sellState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(
        await generateRemainingAccounts(
          connection,
          mint,
          royaltyTransferHookArgs,
        ),
      )
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: TRANSFER_HOOK_COMPUTE_UNITS,
        }),
      ])
      .signers([cosigner])
      .rpc({ skipPreflight: true });

    const ownerNftAta = await getTokenAccount2022(
      connection,
      recipientTokenAccount,
      TOKEN_2022_PROGRAM_ID,
    );
    assert.equal(Number(ownerNftAta.amount), 1);
    assert.equal(ownerNftAta.owner.toBase58(), wallet.publicKey.toBase58());
  });

  it('Withdraw assets with royanty enforcement transfer hook legacy', async () => {
    const creatorKeypair = Keypair.generate();
    const royaltyTransferHookArgs: TransferHookArgs = {
      transferHookProgramId: LIBREPLEX_ROYALTY_ENFORCEMENT_PROGRAM_ID,
      creatorAddress: creatorKeypair.publicKey,
      royaltyBp: 300,
      legacy: true,
    };
    const {
      mint,
      recipientTokenAccount,
      poolData,
      poolAta,
      sellState,
      solEscrowKey,
      groupAddress,
    } = await createPoolWithExampleT22ExtDeposits(
      program,
      connection,
      wallet.payer,
      'sell',
      {
        owner: wallet.publicKey,
        cosigner,
      },
      undefined,
      undefined,
      royaltyTransferHookArgs,
    );

    await program.methods
      .extWithdrawSell({ assetAmount: new anchor.BN(1), allowlistAux: null })
      .accountsStrict({
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        pool: poolData.poolKey,
        assetMint: mint,
        assetTokenAccount: recipientTokenAccount,
        sellsideEscrowTokenAccount: poolAta,
        buysideSolEscrowAccount: solEscrowKey,
        allowlistAuxAccount: SystemProgram.programId,
        sellState: sellState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(
        await generateRemainingAccounts(
          connection,
          mint,
          royaltyTransferHookArgs,
        ),
      )
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: TRANSFER_HOOK_COMPUTE_UNITS,
        }),
      ])
      .signers([cosigner])
      .rpc({ skipPreflight: true });

    const ownerNftAta = await getTokenAccount2022(
      connection,
      recipientTokenAccount,
      TOKEN_2022_PROGRAM_ID,
    );
    assert.equal(Number(ownerNftAta.amount), 1);
    assert.equal(ownerNftAta.owner.toBase58(), wallet.publicKey.toBase58());
  });
});
