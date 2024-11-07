import {
  MPL_BUBBLEGUM_PROGRAM_ID,
  TokenProgramVersion,
  TokenStandard,
  UseMethod,
} from '@metaplex-foundation/mpl-bubblegum';
import { AccountMeta, PublicKey } from '@solana/web3.js';
import { PREFIXES } from './constants';
import { BN } from '@project-serum/anchor';
import { Creator } from 'old-mpl-token-metadata';

export interface CNFT {
  nftIndex: number;
  proofs: PublicKey[];
}

export interface BubblegumTreeRef {
  merkleTree: PublicKey;
  // The Merkle root for the tree. Can be retrieved from off-chain data store.
  root: PublicKey;
  // The Keccak256 hash of the NFTs existing metadata (without the verified flag for the creator changed).
  // The metadata is retrieved from off-chain data store
  // Hash(Hash(metadataArgs), seller_fee_basis_points)
  dataHash: PublicKey;
  // The Keccak256 hash of the NFTs existing creators array (without the verified flag for the creator changed).
  // The creators array is retrieved from off-chain data store.
  creatorHash: PublicKey;
  // The Keccak256 hash of the NFT metadata:
  // Hash(metadataArgs)
  metadataHash: number[];
  // A nonce ("number used once") value used to make the Merkle tree leaves unique.
  // This is the value of num_minted for the tree stored in the TreeConfig account at the time the NFT was minted.
  // The unique value for each asset can be retrieved from off-chain data store.
  nonce: number;
}

export interface BubblegumNftArgs {
  tree: BubblegumTreeRef;
  nft: CNFT;
}

export function getBubblegumAuthorityPDA(
  merkleRollPubKey: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [merkleRollPubKey.toBuffer()],
    new PublicKey(MPL_BUBBLEGUM_PROGRAM_ID),
  );
}

export function getByteArray(key: PublicKey): Array<number> {
  return Array.from(key.toBuffer());
}

export const getMMMCnftSellStatePDA = (
  programId: PublicKey,
  pool: PublicKey,
  merkleTree: PublicKey,
  index: number,
) => {
  const [key, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(PREFIXES.SELL_STATE),
      pool.toBuffer(),
      merkleTree.toBuffer(),
      new BN(index).toBuffer('le', 4),
    ],
    programId,
  );
  return { key, bump };
};

// get "proof path" from asset proof, these are the accounts that need to be passed to the program as remaining accounts
// may also be empty if tree is small enough, and canopy depth is large enough
export function getProofPath(
  proofs: PublicKey[],
  canopyDepth?: number,
): AccountMeta[] {
  return proofs
    .map((pubkey: PublicKey) => ({
      pubkey,
      isSigner: false,
      isWritable: false,
    }))
    .slice(0, proofs.length - (!!canopyDepth ? canopyDepth : 0));
}

export interface CreatorRoyaltyConfig {
  creators: Creator[];
  sellerFeeBasisPoints: number;
}

// Function to convert a simple enum value to the IDL structure
export function convertToDecodeTokenStandardEnum(tokenStandard: TokenStandard) {
  TokenStandard;
  switch (tokenStandard) {
    case TokenStandard.NonFungible:
      return { nonFungible: {} };
    case TokenStandard.FungibleAsset:
      return { fungibleAsset: {} };
    case TokenStandard.Fungible:
      return { fungible: {} };
    case TokenStandard.NonFungibleEdition:
      return { nonfungibleEdition: {} };
    default:
      throw new Error('Unknown TokenStandard value');
  }
}

// Function to convert UseMethod to the DecodeEnum format
export function convertToDecodeUseMethodEnum(useMethod: UseMethod) {
  switch (useMethod) {
    case UseMethod.Burn:
      return { burn: {} };
    case UseMethod.Multiple:
      return { multiple: {} };
    case UseMethod.Single:
      return { single: {} };
    default:
      throw new Error('Unknown UseMethod value');
  }
}

export function convertToDecodeTokenProgramVersion(
  tokenProgramVersion: TokenProgramVersion,
) {
  switch (tokenProgramVersion) {
    case TokenProgramVersion.Original:
      return { original: {} };
    case TokenProgramVersion.Token2022:
      return { token2022: {} };
    default:
      throw new Error('Unknown TokenProgramVersion value');
  }
}
