import {
  generateSigner,
  Umi,
  createAmount,
  PublicKey,
  KeypairSigner,
  OptionOrNullable,
} from '@metaplex-foundation/umi';
import {
  createFungibleAsset,
  Creator,
  findMetadataPda,
  findMasterEditionPda,
  mintV1,
  TokenStandard,
  createV1,
  Collection,
  verifyCollectionV1,
  verifyCreatorV1,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from '@metaplex-foundation/umi-web3js-adapters';
import { PublicKey as Web3PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

export interface Nft {
  mintSigner: KeypairSigner;
  mintAddress: PublicKey;
  tokenAddress: PublicKey;
  metadataAddress: PublicKey;
  masterEditionAddress: PublicKey;
}

export async function umiMintNfts(
  umi: Umi,
  config: {
    numNfts: number;
    creators?: Creator[];
    recipient?: PublicKey;
    collectionAddress?: PublicKey;
    verifyCollection: boolean;
    creatorSigner?: KeypairSigner;
    sftAmount?: number; // if this is set, will mint sft instread of nft
  },
  splTokenProgramId: Web3PublicKey,
): Promise<Nft[]> {
  const nfts: Nft[] = [];

  const splTokenProgram = fromWeb3JsPublicKey(splTokenProgramId);

  // Derive all the NFT accounts.
  for (let i = 0; i < config.numNfts; i++) {
    const mint = generateSigner(umi);
    const metadata = findMetadataPda(umi, { mint: mint.publicKey })[0];
    const edition = findMasterEditionPda(umi, { mint: mint.publicKey })[0];
    const token = fromWeb3JsPublicKey(
      await getAssociatedTokenAddress(
        toWeb3JsPublicKey(mint.publicKey),
        toWeb3JsPublicKey(config.recipient ?? umi.identity.publicKey),
        true,
        splTokenProgramId,
      ),
    );

    nfts.push({
      mintSigner: mint,
      mintAddress: mint.publicKey,
      tokenAddress: token,
      metadataAddress: metadata,
      masterEditionAddress: edition,
    });
  }

  let collection: OptionOrNullable<Collection> = null;
  if (config.collectionAddress) {
    collection = {
      key: config.collectionAddress,
      verified: false,
    };
  }

  // Create all the NFTs.
  try {
    await Promise.all(
      nfts.map(async (nft, i) => {
        if (config.sftAmount === undefined) {
          await createV1(umi, {
            mint: nft.mintSigner,
            name: `TEST #${i}`,
            uri: `nft://${i}.json`,
            sellerFeeBasisPoints: createAmount(100, '%', 2),
            collection,
            creators: config.creators,
            tokenStandard: TokenStandard.NonFungible,
            splTokenProgram,
          }).sendAndConfirm(umi, { send: { skipPreflight: true } });
          await mintV1(umi, {
            mint: nft.mintSigner.publicKey,
            authority: umi.identity,
            amount: 1,
            token: nft.tokenAddress,
            tokenOwner: config.recipient,
            tokenStandard: TokenStandard.NonFungible,
            splTokenProgram,
          }).sendAndConfirm(umi, { send: { skipPreflight: true } });
        } else {
          await createFungibleAsset(umi, {
            mint: nft.mintSigner,
            authority: umi.identity,
            name: `TEST #${i}`,
            uri: `nft://${i}.json`,
            sellerFeeBasisPoints: createAmount(100, '%', 2),
            collection,
            creators: config.creators,
            splTokenProgram,
          }).sendAndConfirm(umi, { send: { skipPreflight: true } });
          await mintV1(umi, {
            mint: nft.mintSigner.publicKey,
            authority: umi.identity,
            amount: config.sftAmount,
            token: nft.tokenAddress,
            tokenOwner: config.recipient,
            tokenStandard: TokenStandard.FungibleAsset,
            splTokenProgram,
          }).sendAndConfirm(umi, { send: { skipPreflight: true } });
        }
        // Verify the collection on the NFT.
        if (config.verifyCollection) {
          await verifyCollectionV1(umi, {
            metadata: nft.metadataAddress,
            collectionMint: config.collectionAddress!,
            authority: umi.identity,
          }).sendAndConfirm(umi);
        }

        if (config.creatorSigner) {
          await verifyCreatorV1(umi, {
            metadata: nft.metadataAddress,
            authority: config.creatorSigner,
          }).sendAndConfirm(umi);
        }
      }),
    );
  } catch (e) {
    console.log(`error creating nfts: ${e}`);
  }

  return nfts;
}

export const umiMintCollection = async (
  umi: Umi,
  config: {
    numNfts: number;
    legacy: boolean;
    recipient?: PublicKey;
    verifyCollection: boolean;
    creators?: Creator[];
  },
  tokenProgramId: Web3PublicKey,
) => {
  const collectionNft = (
    await umiMintNfts(
      umi,
      {
        numNfts: 1,
        creators: config.creators,
        verifyCollection: config.verifyCollection,
      },
      tokenProgramId,
    )
  )[0];

  const collectionMembers = await umiMintNfts(
    umi,
    {
      numNfts: config.numNfts,
      recipient: config.recipient,
      collectionAddress: collectionNft.mintAddress,
      verifyCollection: config.verifyCollection,
      creators: config.creators,
    },
    tokenProgramId,
  );

  return { collection: collectionNft, members: collectionMembers };
};
