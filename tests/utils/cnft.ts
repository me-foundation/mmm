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
} from '@metaplex-foundation/mpl-bubblegum';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import {
  Context,
  generateSigner,
  KeypairSigner,
  none,
  Pda,
  PublicKey,
  publicKey,
  sol,
  SolAmount,
  Umi,
  PublicKey as UmiPublicKey,
} from '@metaplex-foundation/umi';
import { createUmi as baseCreateUmi } from '@metaplex-foundation/umi-bundle-tests';
import { BubblegumTreeRef, CNFT } from '../../sdk/src';
import { PublicKey as Web3PubKey } from '@solana/web3.js';

export const ME_TREASURY = new Web3PubKey(
  'rFqFJ9g7TGBD8Ed7TPDnvGKZ5pWLPDyxLcvcH2eRCtt',
);

export const treasury = publicKey(ME_TREASURY.toBase58());

export const createUmi = async (endpoint?: string, airdropAmount?: SolAmount) =>
  (await baseCreateUmi(endpoint, undefined, airdropAmount))
    .use(mplTokenMetadata())
    .use(mplBubblegum());

export const createTree = async (
  context: Context,
  input: Partial<Parameters<typeof baseCreateTree>[1]> = {},
): Promise<PublicKey> => {
  const merkleTree = generateSigner(context);
  const builder = await baseCreateTree(context, {
    merkleTree,
    maxDepth: 14,
    maxBufferSize: 64,
    ...input,
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
  const metadata: MetadataArgsArgs = {
    name: 'My NFT',
    uri: 'https://example.com/my-nft.json',
    sellerFeeBasisPoints: 500, // 5%
    collection: none(),
    creators: leafCreators,
    ...input.metadata,
  };

  await baseMintV1(context, {
    ...input,
    metadata,
    leafOwner,
  }).sendAndConfirm(context);

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

// This is Hash(metadataArgs). Useful for verifying sellers fee basis points are valid.
// NOTE: this does not perform any checks on the hash, it is recommended to use getMetadataHashChecked
// in production!!
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

  const currentProof = getMerkleProof(
    [...preMints.map((m) => m.leaf), publicKey(escrowedLeaf)],
    5,
    publicKey(escrowedLeaf),
  );

  const merkleTreeAccount = await fetchMerkleTree(umi, merkleTree);

  await verifyLeaf(umi, {
    merkleTree,
    root: getCurrentRoot(merkleTreeAccount.tree),
    leaf: escrowedLeaf,
    index: leafIndex,
    proof: currentProof,
  }).sendAndConfirm(umi);

  return { currentProof };
}

export async function setupTree(
  umi: Umi,
  seller: KeypairSigner,
): Promise<{
  merkleTree: UmiPublicKey;
  leaf: UmiPublicKey;
  escrowedProof: UmiPublicKey[];
  creators: Creator[];
  leafIndex: number;
  metadata: MetadataArgsArgs;
  creatorsHash: UmiPublicKey;
  getBubblegumTreeRef: () => Promise<BubblegumTreeRef>;
  getCnftRef: (proof: UmiPublicKey[]) => CNFT;
  baseFulfillBuyArgs: (seller: KeypairSigner, price?: number) => any;
}> {
  const maxDepth = 5;
  const merkleTree = await createTree(umi, {
    maxDepth,
    maxBufferSize: 8,
  });

  const creatorSigners = await getCreatorPair(umi);
  const unverifiedCreators = await initUnverifiedCreatorsArray(creatorSigners);

  const { metadata, leaf, leafIndex, creatorsHash } = await mint(umi, {
    merkleTree,
    leafOwner: seller.publicKey,
    creators: unverifiedCreators,
  });

  // Verify creator A
  await verifyCreator(umi, {
    leafOwner: seller.publicKey,
    creator: creatorSigners[0],
    merkleTree,
    root: getCurrentRoot((await fetchMerkleTree(umi, merkleTree)).tree),
    nonce: leafIndex,
    index: leafIndex,
    metadata,
    proof: [],
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
    owner: seller.publicKey,
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
    proofs: proof.map(getPubKey),
  });

  const proof = getMerkleProof([updatedLeaf], maxDepth, updatedLeaf);

  const baseFulfillBuyArgs = async (
    seller: KeypairSigner,
    price: number = 100,
  ) => ({
    nft: {
      tree: await getBubblegumTreeRef(),
      nft: getCnftRef(escrowedProof),
    },
    seller: getPubKey(seller.publicKey),
    price,
    makerFeeBasisPoints: 0,
    takerFeeBasisPoints: 0,
    creatorRoyalties: {
      creators: updatedMetadata.creators.map((c) => ({
        ...c,
        address: getPubKey(c.address),
      })),
      sellerFeeBasisPoints: 500, // 5% royalty
    },
  });

  // Verify that seller owns the cNFT.
  const { currentProof: escrowedProof } = await verifyOwnership(
    umi,
    merkleTree,
    seller.publicKey,
    leafIndex,
    updatedMetadata,
    [],
  );

  return {
    merkleTree,
    leaf,
    escrowedProof,
    leafIndex,
    metadata: updatedMetadata,
    creatorsHash,
    creators: updatedMetadata.creators,
    getBubblegumTreeRef,
    getCnftRef,
    baseFulfillBuyArgs,
  };
}
