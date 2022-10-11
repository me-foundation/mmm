import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { IDL } from '../sdk/lib/idl/mmm';

const mmm_PROGRAM_ID = new PublicKey(
  'mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc',
);

const airdrop = async (
  connection: Connection,
  to: PublicKey,
  amount: number,
) => {
  await connection.confirmTransaction({
    ...(await connection.getLatestBlockhash()),
    signature: await connection.requestAirdrop(to, amount * LAMPORTS_PER_SOL),
  });
};

const getmmmAddress = async (
  namespace: PublicKey,
  root: Uint8Array | number[],
) => {
  return await PublicKey.findProgramAddress(
    [Buffer.from('mmm'), namespace.toBuffer(), Buffer.from(root)],
    mmm_PROGRAM_ID,
  );
};

describe('mmm', () => {
  const connection = new Connection('http://localhost:8899');

  const provider = anchor.AnchorProvider.local();
  const wallet = provider.wallet.publicKey;
  provider.opts.commitment = 'processed';
  const program = new Program(IDL, mmm_PROGRAM_ID, provider);

  // before(async () => {
  //   await airdrop(connection, wallet.publicKey, 10);
  // });

  describe('Can create mmm', () => {
    it('happy path', async () => {
      const [mmmAddress] = await getmmmAddress(
        wallet,
        new Array(32).fill(0),
      );

      const tx = await program.methods
        .createmmm({
          root: new Array(32).fill(0),
          uri: '123',
        })
        .accounts({
          mmm: mmmAddress,
          payer: wallet,
          namespace: wallet,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      const blockhashInfo = await connection.getLatestBlockhash();
      tx.feePayer = wallet;
      tx.recentBlockhash = blockhashInfo.blockhash;
      tx.lastValidBlockHeight = blockhashInfo.lastValidBlockHeight;

      await provider.wallet.signTransaction(tx);
      await program.provider.sendAndConfirm?.(tx);
    });
  });
  before(async () => {});
});
