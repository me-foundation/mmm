import {
  AssetV1,
  CollectionV1,
  createCollectionV1,
  createV1,
  fetchAssetV1,
  fetchCollectionV1,
  MPL_CORE_PROGRAM_ID,
  mplCore,
  PluginAuthorityPair,
  pluginAuthorityPair,
  ruleSet,
} from '@metaplex-foundation/mpl-core';
import {
  generateSigner,
  sol,
  publicKey,
  PublicKey,
  KeypairSigner,
  Umi,
} from '@metaplex-foundation/umi';
import assert from 'assert';
import { createUmi } from '@metaplex-foundation/umi-bundle-tests';

// TODO: move to shared oss library
export interface AssetV1Result {
  asset: AssetV1;
  collection?: CollectionV1;
}

export interface CollectionConfig {
  collection?: KeypairSigner;
  name?: string;
  uri?: string;
  plugins?: PluginAuthorityPair[];
}

export interface AssetConfig {
  asset?: KeypairSigner;
  name?: string;
  uri?: string;
  owner?: PublicKey;
  collection?: PublicKey;
  plugins?: PluginAuthorityPair[];
}

export interface CreateCoreAssetArgs {
  collectionConfig?: CollectionConfig;
  assetConfig?: AssetConfig;
}

export async function createTestMplCoreAsset(
  ownerAddress: PublicKey,
  args: CreateCoreAssetArgs = {}, // default no collection attached
): Promise<AssetV1Result> {
  const umi = (await createUmi('http://localhost:8899', undefined, sol(1))).use(
    mplCore(),
  );

  let collectionPublicKey: PublicKey | undefined = undefined;
  if (args.collectionConfig) {
    collectionPublicKey = await createTestMplCoreCollection(
      umi,
      args.collectionConfig,
    );
  }

  const assetConfig = args.assetConfig;
  const assetSigner = generateSigner(umi);
  collectionPublicKey = assetConfig?.collection ?? collectionPublicKey;

  await createV1(umi, {
    asset: assetConfig?.asset ?? assetSigner,
    name: assetConfig?.name ?? 'Test asset',
    uri: assetConfig?.uri ?? 'https://example.com/my-nft.json',
    owner: publicKey(ownerAddress),
    collection: assetConfig?.collection ?? collectionPublicKey,
    plugins: assetConfig?.plugins ?? [getDefaultAssetRoyaltyPlugin()],
  }).sendAndConfirm(umi);

  const asset = await fetchAssetV1(umi, assetSigner.publicKey);
  assert.equal(asset.owner, ownerAddress);
  assert.equal(asset.header.owner, MPL_CORE_PROGRAM_ID);

  const collection = collectionPublicKey
    ? await fetchCollectionV1(umi, collectionPublicKey)
    : undefined;

  if (collection) {
    assert.equal(asset.updateAuthority.type, 'Collection');
    assert.equal(asset.updateAuthority.address, collection!.publicKey);
  }

  return {
    asset: asset,
    ...(collection ? { collection } : {}),
  };
}

export async function createTestMplCoreCollection(
  umi: Umi,
  config: CollectionConfig,
): Promise<PublicKey> {
  const collectionSigner = generateSigner(umi);

  await createCollectionV1(umi, {
    collection: config.collection ?? collectionSigner,
    name: config.name ?? 'My NFT',
    uri: config.uri ?? 'https://example.com/my-nft.json',
    plugins: config.plugins ?? [getDefaultCollectionRoyaltyPlugin()],
  }).sendAndConfirm(umi);
  return collectionSigner.publicKey;
}

export async function getTestMplCoreAsset(assetAddress: PublicKey) {
  const umi = await createUmi('http://localhost:8899');
  umi.use(mplCore());
  const assetV1 = await fetchAssetV1(umi, assetAddress);
  return assetV1;
}

export function getDefaultAssetRoyaltyPlugin(): PluginAuthorityPair {
  return pluginAuthorityPair({
    type: 'Royalties',
    data: {
      basisPoints: 200,
      creators: [
        {
          address: publicKey('11111111111111111111111111111111'),
          percentage: 30,
        },
        {
          address: publicKey('11111111111111111111111111111112'),
          percentage: 70,
        },
      ],
      ruleSet: ruleSet('None'),
    },
  });
}

export function getDefaultCollectionRoyaltyPlugin(): PluginAuthorityPair {
  return pluginAuthorityPair({
    type: 'Royalties',
    data: {
      basisPoints: 500,
      creators: [
        {
          address: publicKey('11111111111111111111111111111111'),
          percentage: 20,
        },
        {
          address: publicKey('11111111111111111111111111111112'),
          percentage: 80,
        },
      ],
      ruleSet: ruleSet('None'), // Compatibility rule set
    },
  });
}
