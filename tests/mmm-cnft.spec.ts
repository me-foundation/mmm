import * as anchor from '@project-serum/anchor';
import { isSome, publicKey, sol, Umi } from '@metaplex-foundation/umi';
import {
  airdrop,
  assertIsBetween,
  createPool,
  createUmi,
  DEFAULT_TEST_SETUP_TREE_PARAMS,
  getCreatorRoyaltiesArgs,
  getEmptyAllowLists,
  getPubKey,
  PRICE_ERROR_RANGE,
  setupTree,
  SIGNATURE_FEE_LAMPORTS,
  verifyOwnership,
} from './utils';
import {
  AllowlistKind,
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
import { assert } from 'chai';

async function createCNftCollectionOffer(
  program: anchor.Program<Mmm>,
  poolArgs: Parameters<typeof createPool>[1],
  sharedEscrow?: boolean,
  sharedEscrowCount?: number,
) {
  const poolData = await createPool(program, {
    ...poolArgs,
    reinvestFulfillBuy: false,
    buysideCreatorRoyaltyBp: 10_000,
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
  const seller = new anchor.Wallet(Keypair.generate());
  const connection = new anchor.web3.Connection(endpoint, 'confirmed');
  let provider = new anchor.AnchorProvider(connection, buyer, {
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

  it('cnft fulfill buy - happy path', async () => {
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
      collectionKey,
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
        allowlists: [
          {
            kind: AllowlistKind.mcc,
            value: collectionKey,
          },
          ...getEmptyAllowLists(5),
        ],
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
      lpFeeBp: 0,
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

    // get balances before fulfill buy
    const [
      buyerBefore,
      sellerBefore,
      buyerSolEscrowAccountBalanceBefore,
      creator1Before,
      creator2Before,
    ] = await Promise.all([
      connection.getBalance(buyer.publicKey),
      connection.getBalance(seller.publicKey),
      connection.getBalance(buysideSolEscrowAccount),
      connection.getBalance(creatorAccounts[0].pubkey),
      connection.getBalance(creatorAccounts[1].pubkey),
    ]);

    console.log(`buyerBefore: ${buyerBefore}`);
    console.log(`sellerBefore: ${sellerBefore}`);
    console.log(
      `buyerSolEscrowAccountBalanceBefore: ${buyerSolEscrowAccountBalanceBefore}`,
    );
    console.log(`creator1Before: ${creator1Before}`);
    console.log(`creator2Before: ${creator2Before}`);

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
          minPaymentAmount: new BN(expectedBuyPrices.sellerReceives),
          makerFeeBp: 0,
          takerFeeBp: 100,
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

    // Get balances after fulfill buy
    const [
      buyerAfter,
      sellerAfter,
      buyerSolEscrowAccountBalanceAfter,
      creator1After,
      creator2After,
    ] = await Promise.all([
      connection.getBalance(buyer.publicKey),
      connection.getBalance(seller.publicKey),
      connection.getBalance(buysideSolEscrowAccount),
      connection.getBalance(creatorAccounts[0].pubkey),
      connection.getBalance(creatorAccounts[1].pubkey),
    ]);

    console.log(`buyerAfter: ${buyerAfter}`);
    console.log(`sellerAfter: ${sellerAfter}`);
    console.log(
      `buyerSolEscrowAccountBalanceAfter: ${buyerSolEscrowAccountBalanceAfter}`,
    );
    console.log(`creator1After: ${creator1After}`);
    console.log(`creator2After: ${creator2After}`);

    const expectedTxFees = SIGNATURE_FEE_LAMPORTS * 3; // cosigner + seller + payer (due to provider is under buyer)

    assert.equal(buyerBefore, buyerAfter + expectedTxFees);

    assert.equal(
      buyerSolEscrowAccountBalanceBefore,
      buyerSolEscrowAccountBalanceAfter + spotPrice * LAMPORTS_PER_SOL,
    );

    // In production it should be seller buy tx fee, but with this test set up, buyer pays
    // tx fee due to provider is initiated under buyer.
    assert.equal(
      sellerAfter,
      sellerBefore +
        spotPrice * LAMPORTS_PER_SOL -
        expectedBuyPrices.takerFeePaid.toNumber() -
        expectedBuyPrices.royaltyPaid.toNumber(),
    );

    assertIsBetween(
      creator1After,
      creator1Before +
        (expectedBuyPrices.royaltyPaid.toNumber() *
          metadata.creators[0].share) /
          100,
      PRICE_ERROR_RANGE,
    );

    assertIsBetween(
      creator2After,
      creator2Before +
        (expectedBuyPrices.royaltyPaid.toNumber() *
          metadata.creators[1].share) /
          100,
      PRICE_ERROR_RANGE,
    );
  });

  // TODO: Add test for
  // 1. Wrong metadata args (like collection)
  // 2. trucate canopy
  // 3. reinvest = true
  it('cnft fulfill buy - incorrect collection fail allowlist check', async () => {
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
      collectionKey,
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
        allowlists: [
          {
            kind: AllowlistKind.mcc,
            value: collectionKey,
          },
          ...getEmptyAllowLists(5),
        ],
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
      lpFeeBp: 0,
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

    // get balances before fulfill buy
    const [
      buyerBefore,
      sellerBefore,
      buyerSolEscrowAccountBalanceBefore,
      creator1Before,
      creator2Before,
    ] = await Promise.all([
      connection.getBalance(buyer.publicKey),
      connection.getBalance(seller.publicKey),
      connection.getBalance(buysideSolEscrowAccount),
      connection.getBalance(creatorAccounts[0].pubkey),
      connection.getBalance(creatorAccounts[1].pubkey),
    ]);

    console.log(`buyerBefore: ${buyerBefore}`);
    console.log(`sellerBefore: ${sellerBefore}`);
    console.log(
      `buyerSolEscrowAccountBalanceBefore: ${buyerSolEscrowAccountBalanceBefore}`,
    );
    console.log(`creator1Before: ${creator1Before}`);
    console.log(`creator2Before: ${creator2Before}`);

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
          minPaymentAmount: new BN(expectedBuyPrices.sellerReceives),
          makerFeeBp: 0,
          takerFeeBp: 100,
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
                  key: SystemProgram.programId, // !!!! WRONG COLLECTION
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
      expect(e).toBeInstanceOf(anchor.AnchorError);
      const err = e as anchor.AnchorError;

      assert.strictEqual(
        err.message,
        'AnchorError occurred. Error Code: InvalidAllowLists. Error Number: 6001. Error Message: invalid allowlists.',
      );
    }

    console.log(`seller: ${seller.publicKey}`);
    console.log(`buyer: ${buyer.publicKey}`);
    console.log(`nft: ${JSON.stringify(nft)}`);
    // Verify that seller still owns the cNFT.
    await verifyOwnership(
      umi,
      merkleTree,
      publicKey(seller.publicKey),
      leafIndex,
      metadata,
      [],
    );

    // Get balances after fulfill buy
    const [
      buyerAfter,
      sellerAfter,
      buyerSolEscrowAccountBalanceAfter,
      creator1After,
      creator2After,
    ] = await Promise.all([
      connection.getBalance(buyer.publicKey),
      connection.getBalance(seller.publicKey),
      connection.getBalance(buysideSolEscrowAccount),
      connection.getBalance(creatorAccounts[0].pubkey),
      connection.getBalance(creatorAccounts[1].pubkey),
    ]);

    console.log(`buyerAfter: ${buyerAfter}`);
    console.log(`sellerAfter: ${sellerAfter}`);
    console.log(
      `buyerSolEscrowAccountBalanceAfter: ${buyerSolEscrowAccountBalanceAfter}`,
    );
    console.log(`creator1After: ${creator1After}`);
    console.log(`creator2After: ${creator2After}`);

    assert.equal(buyerBefore, buyerAfter);

    assert.equal(
      buyerSolEscrowAccountBalanceBefore,
      buyerSolEscrowAccountBalanceAfter,
    );

    // In production it should be seller buy tx fee, but with this test set up, buyer pays
    // tx fee due to provider is initiated under buyer.
    assert.equal(sellerAfter, sellerBefore);

    assert.equal(creator1After, creator1Before);

    assert.equal(creator2After, creator2Before);
  });
});
