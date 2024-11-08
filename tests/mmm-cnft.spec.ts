import * as anchor from '@project-serum/anchor';
import { isSome, publicKey, sol, Umi } from '@metaplex-foundation/umi';
import {
  airdrop,
  createPool,
  createUmi,
  DEFAULT_TEST_SETUP_TREE_PARAMS,
  getCreatorRoyaltiesArgs,
  getPubKey,
  setupTree,
  verifyOwnership,
} from './utils';
import {
  convertToDecodeTokenProgramVersion,
  convertToDecodeTokenStandardEnum,
  convertToDecodeUseMethodEnum,
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
  SendTransactionError,
  SystemProgram,
} from '@solana/web3.js';
import {
  findLeafAssetIdPda,
  getAssetWithProof,
  getMetadataArgsSerializer,
  MetadataArgs,
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
    reinvestFulfillBuy: false,
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
  const connection = new anchor.web3.Connection(endpoint, 'confirmed');
  const provider = new anchor.AnchorProvider(connection, buyer, {
    commitment: 'confirmed',
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

    console.log(`buyer: ${buyer.publicKey}`);
    console.log(`seller: ${seller.publicKey}`);
    // 1. Create a tree.
    const {
      merkleTree,
      sellerProof, //already truncated
      leafIndex,
      metadata,
      getBubblegumTreeRef,
      getCnftRef,
      nft,
      creatorRoyalties,
    } = await setupTree(
      umi,
      publicKey(seller.publicKey),
      DEFAULT_TEST_SETUP_TREE_PARAMS,
    );

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

    // const asset = await umi.rpc.getAsset(assetId);
    // console.log(`asset: ${JSON.stringify(asset)}`);
    // const assetWithProof = await getAssetWithProof(umi, assetId);
    // console.log(`assetWithProof: ${JSON.stringify(assetWithProof)}`);

    const { key: sellState } = getMMMCnftSellStatePDA(
      program.programId,
      poolData.poolKey,
      new PublicKey(nft.tree.merkleTree),
      nft.nft.nftIndex,
    );

    const spotPrice = 1;
    const expectedBuyPrices = getSolFulfillBuyPrices({
      totalPriceLamports: spotPrice * LAMPORTS_PER_SOL,
      lpFeeBp: 200,
      takerFeeBp: 100,
      metadataRoyaltyBp: 500,
      buysideCreatorRoyaltyBp: 10_000,
      makerFeeBp: 0,
    });

    const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(
      connection,
      nft.tree.merkleTree,
    );

    console.log(`merkleTree: ${nft.tree.merkleTree}`);
    console.log(`proofs: ${nft.nft.fullProof}`);
    console.log(`canopyDepth: ${treeAccount.getCanopyDepth()}`);

    const proofPath: AccountMeta[] = getProofPath(
      nft.nft.fullProof,
      treeAccount.getCanopyDepth(),
    );
    console.log(`nft.nft.proofs.length: ${nft.nft.fullProof.length}`);
    console.log(`proofPath.length: ${proofPath.length}`);

    console.log(`proofPath: ${JSON.stringify(proofPath)}`);

    const {
      accounts: creatorAccounts,
      creatorShares,
      creatorVerified,
      sellerFeeBasisPoints,
    } = getCreatorRoyaltiesArgs(creatorRoyalties);
    console.log(`got creator royalties`);

    try {
      const metadataSerializer = getMetadataArgsSerializer();
      const metadataArgs: MetadataArgs = metadataSerializer.deserialize(
        metadataSerializer.serialize(metadata),
      )[0];

      console.log(`metadataArgs: ${JSON.stringify(metadataArgs)}`);
      console.log(
        `${JSON.stringify(
          convertToDecodeTokenProgramVersion(metadataArgs.tokenProgramVersion),
        )}`,
      );

      console.log(`expectedBuyPrices: {
        sellerReceives: ${expectedBuyPrices.sellerReceives.toString(10)},
        lpFeePaid: ${expectedBuyPrices.lpFeePaid.toString(10)},
        royaltyPaid: ${expectedBuyPrices.royaltyPaid.toString(10)},
        takerFeePaid: ${expectedBuyPrices.takerFeePaid.toString(10)},
        makerFeePaid: ${expectedBuyPrices.makerFeePaid.toString(10)}
      }`);

      const fulfillBuyTxnSig = await program.methods
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
          takerFeeBp: 100,
          creatorShares,
          creatorVerified,
          sellerFeeBasisPoints,
          metadataArgs: {
            name: metadataArgs.name,
            symbol: metadataArgs.symbol,
            uri: metadataArgs.uri,
            sellerFeeBasisPoints: metadataArgs.sellerFeeBasisPoints,
            primarySaleHappened: metadataArgs.primarySaleHappened,
            isMutable: metadataArgs.isMutable,
            editionNonce: isSome(metadataArgs.editionNonce)
              ? metadataArgs.editionNonce.value
              : null,
            tokenStandard: isSome(metadataArgs.tokenStandard)
              ? convertToDecodeTokenStandardEnum(
                  metadataArgs.tokenStandard.value,
                )
              : null,
            collection: isSome(metadataArgs.collection)
              ? {
                  verified: metadataArgs.collection.value.verified,
                  key: new PublicKey(metadataArgs.collection.value.key),
                }
              : null, // Ensure it's a struct or null
            uses: isSome(metadataArgs.uses)
              ? {
                  useMethod: convertToDecodeUseMethodEnum(
                    metadataArgs.uses.value.useMethod,
                  ),
                  remaining: metadataArgs.uses.value.remaining,
                  total: metadataArgs.uses.value.total,
                }
              : null,
            tokenProgramVersion: convertToDecodeTokenProgramVersion(
              metadataArgs.tokenProgramVersion,
            ),
            creators: metadataArgs.creators.map((c) => ({
              address: new PublicKey(c.address),
              verified: c.verified,
              share: c.share,
            })),
          },
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
        .remainingAccounts([...creatorAccounts, ...proofPath])
        .signers([cosigner, seller.payer])
        // note: skipPreflight causes some weird error.
        // so just surround in this try-catch to get the logs
        .rpc(/* { skipPreflight: true } */);
      console.log(`fulfillBuyTxnSig: ${fulfillBuyTxnSig}`);
    } catch (e) {
      if (e instanceof SendTransactionError) {
        const err = e as SendTransactionError;
        console.log(
          `err.logs: ${JSON.stringify(
            await err.getLogs(provider.connection),
            null,
            2,
          )}`,
        );
      }
      throw e;
    }

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
