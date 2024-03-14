import * as anchor from '@project-serum/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { assert } from 'chai';
import { Mmm, IDL, MMMProgramID } from '../sdk/src';
import {
  airdrop,
  createPoolWithExampleExtDeposits,
  getTokenAccount2022,
  SIGNATURE_FEE_LAMPORTS,
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

  it('Withdraw payment', async () => {
    const {
      mint,
      recipientTokenAccount,
      poolData,
      poolAta,
      sellState,
      solEscrowKey,
      groupAddress,
    } = await createPoolWithExampleExtDeposits(
      program,
      connection,
      wallet.payer,
      'buy',
      {
        owner: wallet.publicKey,
        cosigner,
      },
    );

    const initWalletBalance = await connection.getBalance(wallet.publicKey);
    const poolRent = await connection.getBalance(poolData.poolKey);
    await program.methods
      .solWithdrawBuy({
        paymentAmount: new anchor.BN(100 * LAMPORTS_PER_SOL),
      })
      .accountsStrict({
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        pool: poolData.poolKey,
        buysideSolEscrowAccount: solEscrowKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([cosigner])
      .rpc();

    assert.equal(await connection.getBalance(poolData.poolKey), 0);
    const walletBalance = await connection.getBalance(wallet.publicKey);
    assert.equal(
      walletBalance,
      initWalletBalance +
        10 * LAMPORTS_PER_SOL + // amount initially deposited
        poolRent - // pool rent
        2 * SIGNATURE_FEE_LAMPORTS, // signature fees
    );
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
    } = await createPoolWithExampleExtDeposits(
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
});
