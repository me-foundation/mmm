import { PublicKey } from '@solana/web3.js';

export const PREFIXES = {
  POOL: 'mmm_pool',
  BUYSIDE_SOL_ESCROW: 'mmm_buyside_sol_escrow_account',
  SELL_STATE: 'mmm_sell_state',
};

export enum CurveKind {
  linear = 0,
  exp = 1,
}

export enum AllowlistKind {
  empty = 0,
  fvca = 1,
  mint = 2,
  mcc = 3,
  metadata = 4,
  group = 5,
  mpl_core_collection = 6,
  any = 255,
}

// Libreplex royalty enforcement program
export const LIBREPLEX_ROYALTY_ENFORCEMENT_PREFIX = '_ro_';
// legacy for backwards compatibility
export const LIBREPLEX_ROYALTY_ENFORCEMENT_CREATOR_PREFIX_LEGACY = '_roa_';
export const LIBREPLEX_ROYALTY_ENFORCEMENT_BP_KEY_LEGACY = '_ros_';

export const LIBPREPLEX_ROYALTY_PROGRAM_ID = new PublicKey(
  'CZ1rQoAHSqWBoAEfqGsiLhgbM59dDrCWk3rnG5FXaoRV',
);
