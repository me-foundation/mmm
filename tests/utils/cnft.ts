import {
  Creator,
  MetadataArgsArgs,
  mplBubblegum,
  createTree as baseCreateTree,
  mintV1 as baseMintV1,
  fetchMerkleTree,
  findLeafAssetIdPda,
  hashLeaf,
  hashMetadataCreators,
  verifyCreator,
  getCurrentRoot,
  hashMetadataData,
  hash,
  getMetadataArgsSerializer,
  getMerkleProof,
  verifyLeaf,
  MerkleTree,
  mintToCollectionV1,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  createNft,
  mplTokenMetadata,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  Context,
  generateSigner,
  isOption,
  isSome,
  KeypairSigner,
  none,
  Pda,
  percentAmount,
  PublicKey,
  publicKey,
  sol,
  SolAmount,
  Umi,
  PublicKey as UmiPublicKey,
} from '@metaplex-foundation/umi';
import { createUmi as baseCreateUmi } from '@metaplex-foundation/umi-bundle-tests';
import { BubblegumTreeRef, CNFT, CreatorRoyaltyConfig } from '../../sdk/src';
import {
  AccountMeta,
  Connection,
  PublicKey as Web3PubKey,
} from '@solana/web3.js';
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api';

export const ME_TREASURY = new Web3PubKey(
  'rFqFJ9g7TGBD8Ed7TPDnvGKZ5pWLPDyxLcvcH2eRCtt',
);

export const createUmi = async (endpoint?: string, airdropAmount?: SolAmount) =>
  (await baseCreateUmi(endpoint, { commitment: 'confirmed' }, airdropAmount))
    .use(mplTokenMetadata())
    .use(mplBubblegum())
    .use(dasApi());

export const createTree = async (
  context: Context,
  input: Partial<Parameters<typeof baseCreateTree>[1]> = {},
): Promise<PublicKey> => {
  const merkleTree = generateSigner(context);
  const builder = await baseCreateTree(context, {
    merkleTree,
    maxDepth: input.maxDepth ?? 14,
    maxBufferSize: input.maxBufferSize ?? 64,
    canopyDepth: input.canopyDepth,
  });
  await builder.sendAndConfirm(context);
  return merkleTree.publicKey;
};

export async function getCreatorPair(umi: Umi): Promise<KeypairSigner[]> {
  const creator1 = generateSigner(umi);
  const creator2 = generateSigner(umi);
  await umi.rpc.airdrop(creator1.publicKey, sol(1));
  await umi.rpc.airdrop(creator2.publicKey, sol(1));
  return [creator1, creator2];
}

export async function initUnverifiedCreatorsArray(
  creators: KeypairSigner[],
): Promise<Creator[]> {
  return [
    {
      address: creators[0].publicKey,
      verified: false,
      share: 60,
    },
    {
      address: creators[1].publicKey,
      verified: false,
      share: 40,
    },
  ];
}

export const mint = async (
  context: Context,
  input: Omit<Parameters<typeof baseMintV1>[1], 'metadata' | 'leafOwner'> & {
    leafIndex?: number | bigint;
    metadata?: Partial<Parameters<typeof baseMintV1>[1]['metadata']>;
    leafOwner?: PublicKey;
    creators?: Parameters<typeof baseMintV1>[1]['metadata']['creators'];
    collection?: Parameters<typeof baseMintV1>[1]['metadata']['collection'];
  },
): Promise<{
  metadata: MetadataArgsArgs;
  assetId: Pda;
  leaf: PublicKey;
  leafIndex: number;
  creatorsHash: PublicKey;
}> => {
  const merkleTree = publicKey(input.merkleTree, false);
  const leafOwner = input.leafOwner ?? context.identity.publicKey;
  const leafIndex = Number(
    input.leafIndex ??
      (await fetchMerkleTree(context, merkleTree)).tree.activeIndex,
  );
  const leafCreators = input.creators ?? [];
  const collection = input.collection
    ? isOption(input.collection)
      ? isSome(input.collection)
        ? input.collection.value
        : undefined
      : input.collection
    : undefined;

  const metadata: MetadataArgsArgs = {
    name: 'My NFT',
    uri: 'https://example.com/my-nft.json',
    sellerFeeBasisPoints: 500, // 5%
    collection: collection
      ? {
          key: collection.key,
          verified: collection.verified,
        }
      : none(),
    creators: leafCreators,
    ...input.metadata,
  };

  if (collection) {
    await mintToCollectionV1(context, {
      ...input,
      leafOwner,
      collectionMint: collection.key,
      metadata,
    }).sendAndConfirm(context);
  } else {
    await baseMintV1(context, {
      ...input,
      metadata,
      leafOwner,
    }).sendAndConfirm(context);
  }

  return {
    metadata,
    assetId: findLeafAssetIdPda(context, { merkleTree, leafIndex }),
    leafIndex,
    leaf: publicKey(
      hashLeaf(context, {
        merkleTree,
        owner: publicKey(leafOwner, false),
        delegate: publicKey(input.leafDelegate ?? leafOwner, false),
        leafIndex,
        metadata,
      }),
    ),
    creatorsHash: publicKey(hashMetadataCreators(leafCreators)),
  };
};

export function hashMetadataArgsArgs(metadata: MetadataArgsArgs): Uint8Array {
  return hash(getMetadataArgsSerializer().serialize(metadata));
}

export function bufferToArray(buffer: Buffer): number[] {
  const nums: number[] = [];
  for (let i = 0; i < buffer.length; i++) {
    nums.push(buffer[i]);
  }
  return nums;
}

export function getPubKey(umiKey: UmiPublicKey) {
  return new Web3PubKey(umiKey.toString());
}

/**
 * Verifies that the expectedOwner owns the leaf at the given leafIndex.
 * @param umi
 * @param merkleTree
 * @param expectedOwner
 * @param leafIndex
 * @param metadata current metadata of the leaf
 * @param preMints
 * @returns the **truncated** proof used for verification.
 */
export async function verifyOwnership(
  umi: Umi,
  merkleTree: UmiPublicKey,
  expectedOwner: UmiPublicKey,
  leafIndex: number,
  metadata: MetadataArgsArgs,
  preMints: { leaf: UmiPublicKey }[],
): Promise<{ currentProof: UmiPublicKey<string>[] }> {
  const escrowedLeaf = hashLeaf(umi, {
    merkleTree,
    owner: expectedOwner,
    leafIndex,
    metadata,
  });
  const merkleTreeAccount = await fetchMerkleTree(umi, merkleTree);

  const currentProof = getTruncatedMerkleProof(
    getCanopyDepth(merkleTreeAccount),
    [...preMints.map((m) => m.leaf), publicKey(escrowedLeaf)],
    merkleTreeAccount.treeHeader.maxDepth,
    publicKey(escrowedLeaf),
  );

  const { result } = await verifyLeaf(umi, {
    merkleTree,
    root: getCurrentRoot(merkleTreeAccount.tree),
    leaf: escrowedLeaf,
    index: leafIndex,
    proof: currentProof,
  }).sendAndConfirm(umi);

  return { currentProof };
}

export const DEFAULT_TEST_SETUP_TREE_PARAMS = {
  maxDepth: 14,
  maxBufferSize: 64,
  canopyDepth: 9,
};

export async function setupTree(
  umi: Umi,
  seller: PublicKey,
  treeParams: {
    maxDepth: number;
    maxBufferSize: number;
    canopyDepth: number;
  },
) {
  const merkleTree = await createTree(umi, {
    maxDepth: treeParams.maxDepth,
    maxBufferSize: treeParams.maxBufferSize,
    canopyDepth: treeParams.canopyDepth,
  });

  const creatorSigners = await getCreatorPair(umi);
  const unverifiedCreators = await initUnverifiedCreatorsArray(creatorSigners);

  const collectionMint = generateSigner(umi);
  await createNft(umi, {
    mint: collectionMint,
    name: 'My Collection',
    uri: 'https://example.com/my-collection.json',
    sellerFeeBasisPoints: percentAmount(5), // %
    isCollection: true,
  }).sendAndConfirm(umi);

  const { metadata, leaf, leafIndex, creatorsHash, assetId } = await mint(umi, {
    merkleTree,
    leafOwner: seller,
    creators: unverifiedCreators,
    collection: {
      key: publicKey(collectionMint),
      verified: true,
    },
  });

  const verifyCreatorProofTruncated = getTruncatedMerkleProof(
    treeParams.canopyDepth,
    [leaf],
    treeParams.maxDepth,
    leaf,
  );
  // Verify creator A

  await verifyCreator(umi, {
    leafOwner: seller,
    creator: creatorSigners[0],
    merkleTree,
    root: getCurrentRoot((await fetchMerkleTree(umi, merkleTree)).tree),
    nonce: leafIndex,
    index: leafIndex,
    metadata,
    proof: verifyCreatorProofTruncated,
  }).sendAndConfirm(umi);

  const updatedMetadata = {
    ...metadata,
    creators: [
      { address: creatorSigners[0].publicKey, verified: true, share: 60 },
      { address: creatorSigners[1].publicKey, verified: false, share: 40 },
    ],
  };
  const leafDataPostVerification = hashLeaf(umi, {
    merkleTree,
    owner: seller,
    leafIndex,
    metadata: updatedMetadata,
  });
  const updatedLeaf = publicKey(leafDataPostVerification);
  // Make sure that the leaf is updated with the verifie creator.
  const merkleTreeAccount = await fetchMerkleTree(umi, merkleTree);
  expect(merkleTreeAccount.tree.rightMostPath.leaf).toEqual(updatedLeaf);

  const getBubblegumTreeRef = async () => ({
    merkleTree: getPubKey(merkleTree),
    root: new Web3PubKey(
      getCurrentRoot((await fetchMerkleTree(umi, merkleTree)).tree),
    ),
    dataHash: new Web3PubKey(hashMetadataData(updatedMetadata)),
    metadataHash: bufferToArray(
      Buffer.from(hashMetadataArgsArgs(updatedMetadata)),
    ),
    creatorHash: new Web3PubKey(hashMetadataCreators(updatedMetadata.creators)),
    nonce: leafIndex,
  });

  const getCnftRef = (proof: UmiPublicKey[]) => ({
    nftIndex: leafIndex,
    fullProof: proof.map(getPubKey),
  });

  const fullProof = getMerkleProof(
    [updatedLeaf],
    treeParams.maxDepth,
    updatedLeaf,
  );

  // Verify that seller owns the cNFT.
  const { currentProof: sellerProof } = await verifyOwnership(
    umi,
    merkleTree,
    seller,
    leafIndex,
    updatedMetadata,
    [],
  );

  return {
    merkleTree,
    leaf,
    sellerProof,
    leafIndex,
    metadata: updatedMetadata,
    creatorsHash,
    creators: updatedMetadata.creators,
    getBubblegumTreeRef,
    getCnftRef,
    nft: {
      tree: await getBubblegumTreeRef(),
      nft: getCnftRef(fullProof),
    },
    creatorRoyalties: {
      creators: updatedMetadata.creators.map((c) => ({
        ...c,
        address: getPubKey(c.address),
      })),
      sellerFeeBasisPoints: 500, // 5% royalty
    },
    collectionKey: new Web3PubKey(collectionMint.publicKey),
  };
}

export function getCreatorRoyaltiesArgs(
  royaltySelection: CreatorRoyaltyConfig,
): {
  accounts: AccountMeta[];
  creatorShares: number[];
  creatorVerified: boolean[];
  sellerFeeBasisPoints: number;
} {
  const creatorShares: number[] = [];
  const creatorVerified: boolean[] = [];
  const accounts: AccountMeta[] = royaltySelection.creators.map((creator) => {
    creatorShares.push(creator.share);
    creatorVerified.push(creator.verified);
    return {
      pubkey: creator.address,
      isSigner: false,
      isWritable: true, // so that we can pay creator fees
    };
  });

  return {
    accounts,
    creatorShares,
    creatorVerified,
    sellerFeeBasisPoints: royaltySelection.sellerFeeBasisPoints,
  };
}

export function truncateMerkleProof(proof: PublicKey[], canopyDepth: number) {
  return proof.slice(0, canopyDepth === 0 ? undefined : -canopyDepth);
}

export function getTruncatedMerkleProof(
  canopyDepth: number,
  leaves: PublicKey[],
  maxDepth: number,
  leaf: PublicKey,
  index?: number | undefined,
) {
  const proof = getMerkleProof(leaves, maxDepth, leaf, index);
  return truncateMerkleProof(proof, canopyDepth);
}

// Utility method to calculate the canopy depth from a metaplex MerkleTree type
export function getCanopyDepth(merkleTreeAccount: MerkleTree) {
  return Math.log2(merkleTreeAccount.canopy.length + 2) - 1;
}
