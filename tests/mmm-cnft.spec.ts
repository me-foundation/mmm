import * as anchor from '@project-serum/anchor';
import { publicKey, sol, Umi } from '@metaplex-foundation/umi';
import {
  airdrop,
  createPool,
  createUmi,
  getPubKey,
  setupTree,
  verifyOwnership,
} from './utils';
import {
  getBubblegumAuthorityPDA,
  getByteArray,
  getM2BuyerSharedEscrow,
  getMMMBuysideSolEscrowPDA,
  getMMMCnftSellStatePDA,
  getProofPath,
  getSolFulfillBuyPrices,
  IDL,
  Mmm,
  MMMProgramID,
} from '../sdk/src';
import {
  AccountMeta,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import {
  findLeafAssetIdPda,
  MPL_BUBBLEGUM_PROGRAM_ID,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from '@metaplex-foundation/mpl-bubblegum';
import { BN } from '@project-serum/anchor';
import { ConcurrentMerkleTreeAccount } from '@solana/spl-account-compression';

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

const SOL = new PublicKey('So11111111111111111111111111111111111111112');

describe('cnft tests', () => {
  const endpoint = 'http://localhost:8899';
  const buyer = new anchor.Wallet(Keypair.generate());
  const seller = new anchor.Wallet(Keypair.generate());
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
    airdrop(connection, seller.publicKey, 100);
    airdrop(connection, cosigner.publicKey, 100);
  });

  it.only('cnft fulfill buy', async () => {
    const umi = await createUmi(endpoint, sol(3));
    // 1. Create a tree.
    const {
      merkleTree,
      escrowedProof,
      leafIndex,
      metadata,
      getBubblegumTreeRef,
      getCnftRef,
      nft,
      creatorRoyalties,
    } = await setupTree(umi, publicKey(seller.publicKey));

    const merkleyTreePubkey = getPubKey(merkleTree);

    // 2. Create an offer.
    const { buysideSolEscrowAccount, poolData } =
      await createCNftCollectionOffer(program, {
        owner: new PublicKey(buyer.publicKey),
        cosigner,
      });

    const [treeAuthority, _] = getBubblegumAuthorityPDA(
      new PublicKey(nft.tree.merkleTree),
    );

    const [assetId, bump] = findLeafAssetIdPda(umi, {
      merkleTree,
      leafIndex,
    });

    const { key: sellState } = getMMMCnftSellStatePDA(
      program.programId,
      poolData.poolKey,
      new PublicKey(nft.tree.merkleTree),
      nft.nft.nftIndex,
    );

    const spotPrice = 10;
    const expectedBuyPrices = getSolFulfillBuyPrices({
      totalPriceLamports: spotPrice * LAMPORTS_PER_SOL,
      lpFeeBp: 0,
      takerFeeBp: 100,
      metadataRoyaltyBp: 500,
      buysideCreatorRoyaltyBp: 10_000,
      makerFeeBp: 100,
    });

    const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(
      connection,
      nft.tree.merkleTree,
    );

    console.log(`merkleTree: ${nft.tree.merkleTree}`);
    console.log(`proofs: ${nft.nft.proofs}`);
    console.log(`canopyDepth: ${treeAccount.getCanopyDepth()}`);

    const proofPath: AccountMeta[] = getProofPath(
      nft.nft.proofs,
      treeAccount.getCanopyDepth(),
    );

    await program.methods
      .cnftFulfillBuy({
        root: getByteArray(nft.tree.root),
        metadataHash: getByteArray(nft.tree.dataHash),
        creatorHash: getByteArray(nft.tree.creatorHash),
        nonce: new BN(nft.tree.nonce),
        index: nft.nft.nftIndex,
        buyerPrice: new BN(spotPrice * LAMPORTS_PER_SOL),
        paymentMint: SOL,
        assetAmount: new BN(1),
        minPaymentAmount: new BN(expectedBuyPrices.sellerReceives),
        allowlistAux: '',
        makerFeeBp: 0,
        takerFeeBp: 0,
      })
      .accountsStrict({
        payer: new PublicKey(seller.publicKey),
        owner: buyer.publicKey,
        cosigner: cosigner.publicKey,
        referral: poolData.referral.publicKey,
        pool: poolData.poolKey,
        buysideSolEscrowAccount,
        treeAuthority,
        merkleTree: nft.tree.merkleTree,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        bubblegumProgram: MPL_BUBBLEGUM_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        sellState,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([...proofPath])
      .signers([cosigner, seller.payer])
      .rpc();

    console.log(`seller: ${seller.publicKey}`);
    console.log(`buyer: ${buyer.publicKey}`);
    console.log(`nft: ${JSON.stringify(nft)}`);
    // Verify that buyer now owns the cNFT.
    await verifyOwnership(
      umi,
      merkleTree,
      publicKey(buyer.publicKey),
      leafIndex,
      metadata,
      [],
    );
  });
});
