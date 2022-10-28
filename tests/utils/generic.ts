import { AccountLayout } from '@solana/spl-token';
import * as anchor from '@project-serum/anchor';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js';
import { assert } from 'chai';
import fs from 'fs';
import path from 'path';
import { AllowlistKind } from '../../sdk/src';

export const SIGNATURE_FEE_LAMPORTS = 5000;
export const LAMPORT_ERROR_RANGE = 500;
export const PRICE_ERROR_RANGE = 50;
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

export const assertIsBetween = (num: number, center: number, range: number) => {
  assert.isAbove(num, center - range);
  assert.isBelow(num, center + range);
};

let tokenAccountRent = 0;
export const getTokenAccountRent = async (conn: Connection) => {
  if (tokenAccountRent) {
    return tokenAccountRent;
  }
  tokenAccountRent = await conn.getMinimumBalanceForRentExemption(
    AccountLayout.span,
  );
  return tokenAccountRent;
};

let sellStatePDARent = 0;
export const getSellStatePDARent = async (conn: Connection) => {
  if (sellStatePDARent) {
    return sellStatePDARent;
  }
  sellStatePDARent = await conn.getMinimumBalanceForRentExemption(
    344, // see SellState::LEN
  );
  return sellStatePDARent;
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

export const assertTx = (
  txHash: string,
  tx: anchor.web3.RpcResponseAndContext<anchor.web3.SignatureResult>,
) => {
  assert.isNull(
    tx.value.err,
    `transaction failed ${JSON.stringify({ txHash, err: tx.value.err })}`,
  );
};
