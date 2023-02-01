import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID as MIGRATION_VALIDATOR_PROGRAM_ID } from '@metaplex-foundation/mpl-migration-validator';

export function findMigrationState(collectionMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('migration'), collectionMint.toBuffer()],
    MIGRATION_VALIDATOR_PROGRAM_ID,
  )[0];
}

export function findMigrationProgramAsSigner(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('signer')],
    MIGRATION_VALIDATOR_PROGRAM_ID,
  )[0];
}
