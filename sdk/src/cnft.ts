import { PublicKey } from '@solana/web3.js';

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

export interface CnftDepositSellArgs {
  nft: BubblegumNftArgs;
  seller: PublicKey;
  nftDelegate: PublicKey; // delegate for the NFT, required to be correctly for cNFT transfers
  price: number;
}
