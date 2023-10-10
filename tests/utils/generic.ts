import { AccountLayout } from '@solana/spl-token';
import * as anchor from '@project-serum/anchor';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { assert } from 'chai';
import fs from 'fs';
import path from 'path';
import { AllowlistKind } from '../../sdk/src';

export const SIGNATURE_FEE_LAMPORTS = 5000;
export const LAMPORT_ERROR_RANGE = 500;
export const PRICE_ERROR_RANGE = 50;
export const OCP_COMPUTE_UNITS = 1_400_000;
export const MIP1_COMPUTE_UNITS = 700_000;
const KEYPAIR_PATH = path.join(process.env.HOME!, '/.config/solana/id.json');

let keypair: Keypair | undefined = undefined;
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

// Hard-coded test keypair for use in testing permissioned handlers.
let testAuthorityKeypair: Keypair | undefined = undefined;
export const getTestAuthorityKeypair = () => {
  if (testAuthorityKeypair) {
    return testAuthorityKeypair;
  }
  // read test keypair from env vars
  const keypairFile = fs.readFileSync('tests/test-keypair.json');
  const keypair = Keypair.fromSecretKey(
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

let poolRent = 0;
export const getPoolRent = async (conn: Connection) => {
  if (poolRent) {
    return poolRent;
  }
  poolRent = await conn.getMinimumBalanceForRentExemption(849);
  return poolRent;
};

export const fillAllowlists = (
  allowlists: { kind: AllowlistKind; value: PublicKey }[],
  totalLen: number,
) => {
  if (allowlists.length > totalLen)
    throw new Error(
      `Too many allowlist values in fillAllowlists. Passed in ${allowlists.length}, max is ${totalLen}`,
    );
  return [...allowlists, ...getEmptyAllowLists(totalLen - allowlists.length)];
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
  amountInSol: number,
) => {
  await connection.confirmTransaction({
    ...(await connection.getLatestBlockhash()),
    signature: await connection.requestAirdrop(
      to,
      amountInSol * LAMPORTS_PER_SOL,
    ),
  });
};

export const sendAndAssertTx = async (
  conn: Connection,
  tx: Transaction | VersionedTransaction,
  blockhashData: Awaited<ReturnType<Connection['getLatestBlockhash']>>,
  printTxId: boolean,
) => {
  const serializedTx = tx.serialize();
  const sig = await conn.sendRawTransaction(serializedTx, {
    skipPreflight: true,
  });
  const confirmedTx = await conn.confirmTransaction(
    {
      signature: sig,
      blockhash: blockhashData.blockhash,
      lastValidBlockHeight: blockhashData.lastValidBlockHeight,
    },
    'processed',
  );
  assertTx(sig, confirmedTx);
  if (printTxId) {
    console.log(sig, serializedTx.length);
  }
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

export const assertFailedTx = (
  txHash: string,
  tx: anchor.web3.RpcResponseAndContext<anchor.web3.SignatureResult>,
) => {
  assert.isNotNull(
    tx.value.err,
    `transaction succeeded, while it should have failed. ${JSON.stringify({
      txHash,
      err: tx.value.err,
    })}`,
  );
};
