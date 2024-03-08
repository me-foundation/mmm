import * as anchor from '@project-serum/anchor';
import {
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { Keypair, SYSVAR_RENT_PUBKEY, SystemProgram } from '@solana/web3.js';
import { assert } from 'chai';
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
    it('correctly verifies ANY allowlist when depositing nfts', async () => {
      const { mint, recipientTokenAccount } =
        await createTestMintAndTokenT22VanillaExt(connection, wallet.payer);

      const poolData = await createPool(program, {
        owner: wallet.publicKey,
        cosigner,
        allowlists: [
          {
            kind: AllowlistKind.metadata,
            value: mint,
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

      console.log('start depositting', mint.toBase58());
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
        .rpc();

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
    });
  });
});
