import * as anchor from '@project-serum/anchor';
import { generateSigner, sol, Umi } from '@metaplex-foundation/umi';
import {
  airdrop,
  createPool,
  createUmi,
  getPubKey,
  setupTree,
  verifyOwnership,
} from './utils';
import {
  getM2BuyerSharedEscrow,
  getMMMBuysideSolEscrowPDA,
  IDL,
  Mmm,
  MMMProgramID,
} from '../sdk/src';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';

async function createCNftCollectionOffer(
  program: anchor.Program<Mmm>,
  poolArgs: Parameters<typeof createPool>[1],
  sharedEscrow?: boolean,
  sharedEscrowCount?: number,
) {
  const poolData = await createPool(program, {
    ...poolArgs,
  });

  const poolKey = poolData.poolKey;
  const { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
    program.programId,
    poolData.poolKey,
  );

  await program.methods
    .solDepositBuy({ paymentAmount: new anchor.BN(10 * LAMPORTS_PER_SOL) })
    .accountsStrict({
      owner: poolArgs.owner,
      cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
      pool: poolKey,
      buysideSolEscrowAccount,
      systemProgram: SystemProgram.programId,
    })
    .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
    .rpc({ skipPreflight: true });

  if (sharedEscrow) {
    const sharedEscrowAccount = getM2BuyerSharedEscrow(poolArgs.owner).key;
    await program.methods
      .setSharedEscrow({
        sharedEscrowCount: new anchor.BN(sharedEscrowCount || 2),
      })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        sharedEscrowAccount,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc();
  }

  return {
    buysideSolEscrowAccount,
    poolData,
  };
}

describe('cnft tests', () => {
  const endpoint = 'http://localhost:8899';
  const buyer = new anchor.Wallet(Keypair.generate());
  const connection = new anchor.web3.Connection(endpoint, 'processed');
  const provider = new anchor.AnchorProvider(connection, buyer, {
    commitment: 'processed',
  });

  let umi: Umi;
  const program = new anchor.Program(
    IDL,
    MMMProgramID,
    provider,
  ) as anchor.Program<Mmm>;
  const cosigner = Keypair.generate();

  beforeAll(async () => {
    umi = await createUmi(endpoint, sol(3));
    airdrop(connection, buyer.publicKey, 100);
    airdrop(connection, cosigner.publicKey, 100);
  });

  it.only('cnft fulfill buy', async () => {
    const umi = await createUmi(endpoint, sol(3));
    const seller = generateSigner(umi);
    await umi.rpc.airdrop(seller.publicKey, sol(1));

    // 1. Create a tree.
    const {
      merkleTree,
      escrowedProof,
      leafIndex,
      metadata,
      getBubblegumTreeRef,
      getCnftRef,
      baseFulfillBuyArgs,
    } = await setupTree(umi, seller);

    const merkleyTreePubkey = getPubKey(merkleTree);

    console.log('merkleyTreePubkey', merkleyTreePubkey.toBase58());

    // 2. Create an offer.
    console.log(`buyer: ${buyer.publicKey.toBase58()}`);
    const { buysideSolEscrowAccount, poolData } =
      await createCNftCollectionOffer(program, {
        owner: new PublicKey(buyer.publicKey),
        cosigner,
      });

    console.log(`poolData: ${JSON.stringify(poolData)}`);

    // Verify that buyer now owns the cNFT.
    await verifyOwnership(
      umi,
      merkleTree,
      seller.publicKey,
      leafIndex,
      metadata,
      [],
    );
  });
});
