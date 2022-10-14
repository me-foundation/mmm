import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import { AllowlistKind, PREFIXES } from '../../sdk/src';

const KEYPAIR_PATH = path.join(process.env.HOME!, '/.config/solana/id.json');

let keypair;
export const getKeypair = () => {
  if (keypair) {
    return keypair;
  }
  const keypairFile = fs.readFileSync(KEYPAIR_PATH);
  keypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(keypairFile.toString())),
  );
  return keypair;
};

export const getEmptyAllowLists = (num: number) => {
  const emptyAllowList = {
    kind: AllowlistKind.empty,
    value: PublicKey.default,
  };
  return new Array(num).fill(emptyAllowList);
};

export const airdrop = async (
  connection: Connection,
  to: PublicKey,
  amount: number,
) => {
  await connection.confirmTransaction({
    ...(await connection.getLatestBlockhash()),
    signature: await connection.requestAirdrop(to, amount * LAMPORTS_PER_SOL),
  });
};
