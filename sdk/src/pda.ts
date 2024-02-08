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
