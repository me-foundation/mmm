import {
  generateSigner,
  Umi,
  createAmount,
  PublicKey,
  KeypairSigner,
} from '@metaplex-foundation/umi';
import {
  createFungibleAsset,
  createNft,
  Creator,
  findMetadataPda,
  findMasterEditionPda,
  mintV1,
  TokenStandard,
  createV1,
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
    nftNumber: number;
    creators: Creator[];
    recipient?: PublicKey;
    sftAmount?: number; // if this is set, will mint sft instread of nft
  },
  splTokenProgramId: Web3PublicKey,
): Promise<Nft[]> {
  const nfts: Nft[] = [];

  const splTokenProgram = fromWeb3JsPublicKey(splTokenProgramId);

  // Derive all the NFT accounts.
  for (let i = 0; i < config.nftNumber; i++) {
    const mint = generateSigner(umi);
    const metadata = findMetadataPda(umi, { mint: mint.publicKey })[0];
    const edition = findMasterEditionPda(umi, { mint: mint.publicKey })[0];
    const token = fromWeb3JsPublicKey(
      await getAssociatedTokenAddress(
        toWeb3JsPublicKey(mint.publicKey),
        toWeb3JsPublicKey(config.recipient!),
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
            collection: null,
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
            collection: null,
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
      }),
    );
  } catch (e) {
    console.log(`error creating nfts: ${e}`);
  }

  return nfts;
}
