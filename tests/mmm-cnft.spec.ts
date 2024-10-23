import * as anchor from '@project-serum/anchor';
import { generateSigner, sol, Umi } from '@metaplex-foundation/umi';
import {
  createUmi,
  getPubKey,
  setupTreeAndListing,
  verifyOwnership,
} from './utils';

describe('cnft tests', () => {
  const endpoint = 'http://localhost:8899';
  const conn = new anchor.web3.Connection(endpoint, 'processed');
  let umi: Umi;

  beforeAll(async () => {
    umi = await createUmi(endpoint, sol(3));
  });

  it.only('cnft fulfill buy', async () => {
    const umi = await createUmi(endpoint, sol(3));
    const seller = generateSigner(umi);
    await umi.rpc.airdrop(seller.publicKey, sol(1));
    await umi.rpc.airdrop(seller.publicKey, sol(10));

    const {
      merkleTree,
      escrowedProof,
      leafIndex,
      metadata,
      getBubblegumTreeRef,
      getCnftRef,
    } = await setupTreeAndListing(umi, seller);

    const merkleyTreePubkey = getPubKey(merkleTree);

    console.log('merkleyTreePubkey', merkleyTreePubkey.toBase58());

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
