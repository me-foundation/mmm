// import { generateSigner, sol, Umi } from '@metaplex-foundation/umi';
// import * as anchor from '@project-serum/anchor';
// import {
//   createUmi,
//   getPubKey,
//   setupTreeAndListing,
//   verifyOwnership,
// } from './utils';
// // import { BN } from 'bn.js';

// describe('cnft tests', async () => {
//   const endpoint = 'http://localhost:8899';
//   const conn = new anchor.web3.Connection(endpoint, 'processed');
//   let umi: Umi;

//   beforeAll(async () => {
//     umi = await createUmi(endpoint, sol(3));
//   });

//   it.only('cnft fulfill buy', async () => {
//     const umi = await createUmi(endpoint, sol(3));
//     const seller = generateSigner(umi);
//     await umi.rpc.airdrop(seller.publicKey, sol(1));
//     await umi.rpc.airdrop(seller.publicKey, sol(10));

//     const {
//       merkleTree,
//       escrowedProof,
//       leafIndex,
//       metadata,
//       getBubblegumTreeRef,
//       getCnftRef,
//     } = await setupTreeAndListing(umi, seller);

//     const merkleyTreePubkey = getPubKey(merkleTree);

//     console.log('merkleyTreePubkey', merkleyTreePubkey.toBase58());
//     // const expectedAssetId = await getLeafAssetId(
//     //   merkleyTreePubkey,
//     //   new BN(leafIndex),
//     // );

//     // expect(sts?.toJSON()).toMatchObject({
//     //   assetId: expectedAssetId.toBase58(),
//     //   buyerPrice: '100000000000',
//     //   index: 0,
//     //   merkleTree: merkleyTreePubkey.toBase58(),
//     //   paymentMint: '11111111111111111111111111111111',
//     //   seller: seller.publicKey.toString(),
//     //   sellerReferral: 'autMW8SgBkVYeBgqYiTuJZnkvDZMVU2MHJh9Jh7CSQ2',
//     // });

//     // Verify that M3 program owns the cNFT.
//     await verifyOwnership(
//       umi,
//       merkleTree,
//       seller.publicKey, // !!!! this should be the pool
//       leafIndex,
//       metadata,
//       [],
//     );
//   });
// });
