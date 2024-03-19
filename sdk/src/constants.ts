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
  any = 255,
}
