import { MPL_TOKEN_METADATA_PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import { PublicKey } from '@solana/web3.js';
import { PREFIXES } from './constants';
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';

export const getMMMPoolPDA = (
  programId: PublicKey,
  owner: PublicKey,
  uuid: PublicKey,
) => {
  const [key, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(PREFIXES.POOL), owner.toBuffer(), uuid.toBuffer()],
    programId,
  );
  return { key, bump };
};

export const getMMMSellStatePDA = (
  programId: PublicKey,
  pool: PublicKey,
  asset_mint: PublicKey,
) => {
  const [key, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(PREFIXES.SELL_STATE), pool.toBuffer(), asset_mint.toBuffer()],
    programId,
  );
  return { key, bump };
};

export const getMMMBuysideSolEscrowPDA = (
  programId: PublicKey,
  pool: PublicKey,
) => {
  const [key, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(PREFIXES.BUYSIDE_SOL_ESCROW), pool.toBuffer()],
    programId,
  );
  return { key, bump };
};

export const getTokenRecordPDA = (mint: PublicKey, tokenAccount: PublicKey) => {
  const [key, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      toWeb3JsPublicKey(TOKEN_METADATA_PROGRAM_ID).toBuffer(),
      mint.toBuffer(),
      Buffer.from('token_record'),
      tokenAccount.toBuffer(),
    ],
    toWeb3JsPublicKey(TOKEN_METADATA_PROGRAM_ID),
  );

  return { key, bump };
};

export const M2_PREFIX = 'm2';
export const M2_PROGRAM = new PublicKey(
  'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K',
);
export const M2_AUCTION_HOUSE = new PublicKey(
  'E8cU1WiRWjanGxmn96ewBgk9vPTcL6AEZ1t6F6fkgUWe',
);

export function getM2BuyerSharedEscrow(wallet: PublicKey) {
  const [key, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(M2_PREFIX), M2_AUCTION_HOUSE.toBuffer(), wallet.toBuffer()],
    M2_PROGRAM,
  );
  return { key, bump };
}
