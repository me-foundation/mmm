import { PublicKey } from '@solana/web3.js';
import { PREFIXES } from './constants';

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
