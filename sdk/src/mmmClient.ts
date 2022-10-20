import { withdrawFromFeeAccountOperationHandler } from '@metaplex-foundation/js';
import * as anchor from '@project-serum/anchor';
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from '@solana/web3.js';
import { AllowlistKind, CurveKind } from './constants';
import { Mmm, IDL } from './idl/mmm';
import { getMMMBuysideSolEscrowPDA, getMMMPoolPDA } from './pda';

interface Wallet {
  signTransaction(tx: Transaction): Promise<Transaction>;
  signAllTransactions(txs: Transaction[]): Promise<Transaction[]>;
  publicKey: PublicKey;
}

class AnchorCompliantWallet {
  wallet: Wallet;
  constructor(wallet: Wallet) {
    this.wallet = wallet;
  }
  async signTransaction(tx: Transaction): Promise<Transaction> {
    return this.wallet.signTransaction(tx);
  }
  async signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
    return this.wallet.signAllTransactions(txs);
  }
  get publicKey(): PublicKey {
    return this.wallet!!.publicKey!;
  }
}

const getEmptyAllowLists = (num: number) => {
  const emptyAllowList = {
    kind: AllowlistKind.empty,
    value: PublicKey.default,
  };
  return new Array(num).fill(emptyAllowList);
};

export const MMMProgramID = new PublicKey(
  'mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc',
);

export class MMMClient {
  private readonly conn: Connection;
  private readonly provider: anchor.Provider;
  private readonly wallet: Wallet;
  private readonly program: anchor.Program<Mmm>;
  private poolData: (anchor.IdlAccounts<Mmm>['pool'] & {pool: PublicKey}) | undefined;

  static ErrPoolDataEmpty = new Error('pool data is empty');

  constructor(conn: Connection, wallet?: Wallet) {
    this.conn = conn;
    this.wallet = wallet ?? new anchor.Wallet(new anchor.web3.Keypair());
    this.provider = new anchor.AnchorProvider(
      this.conn,
      new AnchorCompliantWallet(this.wallet),
      {
        preflightCommitment: conn.commitment,
        commitment: conn.commitment,
      },
    );
    this.program = new anchor.Program<Mmm>(IDL, MMMProgramID, this.provider);
  }

  async getInsCreatePool(
    args: anchor.IdlTypes<Mmm>['CreatePoolArgs'],
    owner: PublicKey,
    cosigner: PublicKey,
  ): Promise<TransactionInstruction> {
    const { key: poolKey } = getMMMPoolPDA(MMMProgramID, owner, args.uuid);
    let builder = this.program.methods.createPool(args).accountsStrict({
      pool: poolKey,
      owner,
      cosigner,
      systemProgram: SystemProgram.programId,
    });
    return await builder.instruction();
  }

  async withPool(pool: PublicKey): Promise<MMMClient> {
    this.poolData = await this.program.account.pool.fetch(pool);
    this.poolData.pool = pool;
    return this;
  }

  async getInsUpdatePool(
    args: anchor.IdlTypes<Mmm>['UpdatePoolArgs'],
  ): Promise<TransactionInstruction> {
    if (!this.poolData) throw MMMClient.ErrPoolDataEmpty;
    let builder = this.program.methods.updatePool(args).accountsStrict({
      pool: this.poolData.pool,
      owner: this.poolData.owner,
      cosigner: this.poolData.cosigner,
    });
    return await builder.instruction();
  }

  async getInsSolDepositBuy(
    args: anchor.IdlTypes<Mmm>['SolDepositBuyArgs'],
  ): Promise<TransactionInstruction> {
    if (!this.poolData) throw MMMClient.ErrPoolDataEmpty;
    let { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
      MMMProgramID,
      this.poolData.pool,
    );
    let builder = this.program.methods.solDepositBuy(args).accountsStrict({
      pool: this.poolData.pool,
      owner: this.poolData.owner,
      cosigner: this.poolData.cosigner,
      buysideSolEscrowAccount: buysideSolEscrowAccount,
      systemProgram: SystemProgram.programId,
    });
    return await builder.instruction();
  }

  async getInsSolWithdrawBuy(
    args: anchor.IdlTypes<Mmm>['SolWithdrawBuyArgs'],
  ): Promise<TransactionInstruction> {
    if (!this.poolData) throw MMMClient.ErrPoolDataEmpty;
    let { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
      MMMProgramID,
      this.poolData.pool,
    );
    let builder = this.program.methods.solWithdrawBuy(args).accountsStrict({
      pool: this.poolData.pool,
      owner: this.poolData.owner,
      cosigner: this.poolData.cosigner,
      buysideSolEscrowAccount: buysideSolEscrowAccount,
      systemProgram: SystemProgram.programId,
    });
    return await builder.instruction();
  }

  async getInsSolFulfillBuy(
    args: anchor.IdlTypes<Mmm>['SolFulfillBuyArgs'],
    payer: PublicKey,
    assetMint: PublicKey,
    assetTokenAccount: PublicKey,
  ): Promise<TransactionInstruction> {
    let { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
      MMMProgramID,
      this.poolData.pool,
    );
    let builder = this.program.methods.solFulfillBuy(args).accountsStrict({
      payer,
      owner: this.poolData.owner,
      buysideSolEscrowAccount,
      pool: this.poolData.pool,
      referral: this.poolData.referral,
      cosigner: this.poolData.cosigner,
      buysideSolEscrowAccount: buysideSolEscrowAccount,
      payerAssetAccount: assetTokenAccount,
      systemProgram: SystemProgram.programId,
    });
    return await builder.instruction();
  }
}
