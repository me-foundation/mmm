import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { AllowlistKind, CurveKind, getMMMPoolPDA, Mmm } from '../../sdk/src';
import { getEmptyAllowLists } from './generic';

export const createPool = async (
  program: Program<Mmm>,
  args: {
    owner: PublicKey;
    cosigner?: Keypair;
    allowlists?: ReturnType<typeof getEmptyAllowLists>;
    spotPrice?: anchor.BN;
    curveType?: CurveKind;
    curveDelta?: anchor.BN;
    reinvest?: boolean;
    expiry?: anchor.BN;
    lpFeeBp?: number;
    referral?: PublicKey;
    referralBp?: number;
    cosignerAnnotation?: number[];
    uuid?: PublicKey;
    paymentMint?: PublicKey;
  },
) => {
  const referral = Keypair.generate();
  const uuid = Keypair.generate();
  const { key: poolKey } = getMMMPoolPDA(
    program.programId,
    args.owner,
    uuid.publicKey,
  );
  const allowlists = [
    { kind: AllowlistKind.fvca, value: referral.publicKey },
    ...getEmptyAllowLists(5),
  ];
  const defaults = {
    spotPrice: new anchor.BN(1 * LAMPORTS_PER_SOL),
    curveType: CurveKind.linear,
    curveDelta: new anchor.BN(0),
    reinvest: true,
    expiry: new anchor.BN(42),
    lpFeeBp: 200,
    referral: referral.publicKey,
    referralBp: 300,
    cosignerAnnotation: new Array(32).fill(0),

    owner: args.owner,
    cosigner: args.cosigner?.publicKey ?? PublicKey.default,
    uuid: uuid.publicKey,
    paymentMint: PublicKey.default,
    allowlists,
  };
  const { owner, cosigner: _, ...overrides } = args;
  const finalArgs = { ...defaults, ...overrides };
  let builder = program.methods.createPool(finalArgs).accountsStrict({
    owner: args.owner,
    cosigner: finalArgs.cosigner,
    pool: poolKey,
    systemProgram: SystemProgram.programId,
  });
  if (args.cosigner) {
    builder = builder
      .remainingAccounts([
        { pubkey: args.cosigner.publicKey, isSigner: true, isWritable: false },
      ])
      .signers([args.cosigner]);
  }
  await builder.rpc();

  return { referral, uuid, poolKey };
};
