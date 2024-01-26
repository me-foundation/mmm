import {
  CreatorInput,
  keypairIdentity,
  Metaplex,
  PublicKey,
  token as getSplTokenAmount,
  Amount,
  CreateCompressedNftOutput,
} from '@metaplex-foundation/js';
import { Connection, Signer } from '@solana/web3.js';
import { getKeypair } from './generic';
import { umiMintNfts } from './umiNfts';

export const getMetaplexInstance = (conn: Connection) => {
  return Metaplex.make(conn).use(keypairIdentity(getKeypair()));
};

export const getMetadataURI = (index: number): string => {
  return `nft://${index}.json`;
};

export const mintNfts = async (
  conn: Connection,
  config: {
    numNfts: number;
    recipient?: PublicKey;
    isCollection?: boolean;
    collectionAddress?: PublicKey;
    verifyCollection?: boolean;
    collectionIsSized?: boolean;
    creators?: CreatorInput[];
    sftAmount?: number; // if this is set, will mint sft instread of nft
  },
) => {
  const metaplexInstance = getMetaplexInstance(conn);
  let collectionSigner = (() => {
    if (config.verifyCollection) {
      const kp = getKeypair();
      return { publicKey: kp.publicKey, secretKey: kp.secretKey };
    }
    return undefined;
  })();

  const sftAmount = config.sftAmount;
  if (sftAmount === undefined) {
    return Promise.all(
      Array(0, config.numNfts).map((_, index) =>
        metaplexInstance.nfts().create(
          {
            name: `TEST #${index}`,
            uri: getMetadataURI(index),
            sellerFeeBasisPoints: 100,
            isCollection: config.isCollection,
            tokenOwner: config.recipient,
            collection: config.collectionAddress,
            collectionAuthority: collectionSigner,
            collectionIsSized: config.collectionIsSized,
            creators: config.creators,
          },
          { confirmOptions: { skipPreflight: true, commitment: 'processed' } },
        ),
      ),
    );
  } else {
    return Promise.all(
      Array(0, config.numNfts).map((_, index) =>
        metaplexInstance.nfts().createSft(
          {
            name: `TEST #${index}`,
            uri: `nft://${index}.json`,
            sellerFeeBasisPoints: 100,
            isCollection: config.isCollection,
            tokenOwner: config.recipient ?? getKeypair().publicKey,
            collection: config.collectionAddress,
            collectionAuthority: collectionSigner,
            collectionIsSized: config.collectionIsSized,
            creators: config.creators,
            tokenAmount: getSplTokenAmount(sftAmount),
          },
          { confirmOptions: { skipPreflight: true, commitment: 'processed' } },
        ),
      ),
    );
  }
};

export const mintCollection = async (
  conn: Connection,
  config: {
    numNfts: number;
    legacy: boolean;
    recipient?: PublicKey;
    verifyCollection: boolean;
    creators?: CreatorInput[];
  },
) => {
  const collectionNft = (
    await mintNfts(conn, {
      numNfts: 1,
      isCollection: true,
      collectionIsSized: !config.legacy,
    })
  )[0];

  const collectionMembers = await mintNfts(conn, {
    numNfts: config.numNfts,
    recipient: config.recipient,
    collectionAddress: collectionNft.mintAddress,
    verifyCollection: config.verifyCollection,
    creators: config.creators,
  });

  return { collection: collectionNft, members: collectionMembers };
};
