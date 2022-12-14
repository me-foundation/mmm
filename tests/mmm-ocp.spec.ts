import * as anchor from '@project-serum/anchor';
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
  IDL,
  MMMProgramID,
  CurveKind,
} from '../sdk/src';
import {
  airdrop,
  assertTx,
  createPool,
  createPoolWithExampleDeposits,
  createTestMintAndTokenOCP,
  getEmptyAllowLists,
  getMetaplexInstance,
  mintCollection,
  mintNfts,
} from './utils';

describe.only('mmm-ocp', () => {
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

  it('can deposit ocp NFTs', async () => {
    const creator = Keypair.generate();
    const nftRes = await createTestMintAndTokenOCP(
      connection,
      wallet.payer,
      creator,
      { receiver: wallet.publicKey, closeAccount: true },
    );

    const poolRes = await createPool(program, {
      owner: wallet.publicKey,
      cosigner,
      allowlists: [{ value: creator.publicKey, kind: AllowlistKind.fvca }],
    });
  });
});
