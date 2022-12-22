import {
  CMT_PROGRAM,
  findFreezeAuthorityPk,
  findMintStatePk,
  MintState,
  PROGRAM_ID as OCP_PROGRAM_ID,
} from '@magiceden-oss/open_creator_protocol';
import {
  Metadata,
  Metaplex,
  sol,
  toMetadata,
  toMetadataAccount,
} from '@metaplex-foundation/js';
import * as anchor from '@project-serum/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { AllowlistKind } from './constants';
import { IDL, Mmm } from './idl/mmm';
import {
  getMMMBuysideSolEscrowPDA,
  getMMMPoolPDA,
  getMMMSellStatePDA,
} from './pda';

export const getEmptyAllowLists = (num: number) => {
  const emptyAllowList = {
    kind: AllowlistKind.empty,
    value: PublicKey.default,
  };
  return new Array(num).fill(emptyAllowList);
};

export const MMMProgramID = new PublicKey(
  'mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc',
);

const dummyKeypair = new anchor.Wallet(new anchor.web3.Keypair());

type MmmMethodsNamespace = anchor.MethodsNamespace<Mmm>;

export class MMMClient {
  static ErrPoolDataEmpty = new Error('pool data is empty');

  private readonly conn: Connection;
  private readonly provider: anchor.Provider;
  private readonly program: anchor.Program<Mmm>;
  private readonly mpl: Metaplex;
  private readonly cosigner: Keypair | undefined = undefined;

  poolData: (anchor.IdlAccounts<Mmm>['pool'] & { pool: PublicKey }) | undefined;

  constructor(conn: Connection, cosigner?: Keypair) {
    this.conn = conn;
    this.provider = new anchor.AnchorProvider(this.conn, dummyKeypair, {
      preflightCommitment: conn.commitment,
      commitment: conn.commitment,
    });
    this.program = new anchor.Program<Mmm>(IDL, MMMProgramID, this.provider);
    if (cosigner) this.cosigner = cosigner;
    this.mpl = new Metaplex(conn);
  }

  signTx(insArr: TransactionInstruction[]): Transaction {
    const tx = new Transaction();
    tx.add(...insArr);
    if (this.cosigner) tx.partialSign(this.cosigner);
    return tx;
  }

  signTxSerialize(insArr: TransactionInstruction[]): Buffer {
    return this.signTx(insArr).serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
  }

  async withPool(pool: PublicKey): Promise<MMMClient> {
    this.poolData = await this.program.account.pool.fetch(pool);
    this.poolData.pool = pool;
    return this;
  }

  withMockPool(
    poolData: anchor.IdlAccounts<Mmm>['pool'] & { pool: PublicKey },
  ): MMMClient {
    this.poolData = poolData;
    return this;
  }

  private async getMintState(
    tokenMint: PublicKey,
  ): Promise<{ mintStateId: PublicKey; mintState: MintState } | undefined> {
    const mintStateId = findMintStatePk(tokenMint);
    try {
      const mintState = await MintState.fromAccountAddress(
        this.conn,
        mintStateId,
      );
      return { mintStateId, mintState };
    } catch (_e) {
      return undefined;
    }
  }

  private getOcpAccounts(ocpMintState: {
    mintStateId: PublicKey;
    mintState: MintState;
  }) {
    const ocpFreezeAuthority = findFreezeAuthorityPk(
      ocpMintState.mintState.policy,
    );
    return {
      ocpMintState: ocpMintState.mintStateId,
      ocpPolicy: ocpMintState.mintState.policy,
      ocpFreezeAuthority,
      ocpProgram: OCP_PROGRAM_ID,
      cmtProgram: CMT_PROGRAM,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    };
  }

  async getNftMetadata(tokenMint: PublicKey): Promise<Metadata> {
    const metadataPda = this.mpl.nfts().pdas().metadata({ mint: tokenMint });
    const metadataAccount = await this.conn.getAccountInfo(metadataPda);
    if (!metadataAccount) {
      throw new Error(
        `No metadata account found for mint ${tokenMint.toBase58()}`,
      );
    }
    return toMetadata(
      toMetadataAccount({
        publicKey: metadataPda,
        ...metadataAccount,
        lamports: sol(metadataAccount.lamports),
      }),
    );
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

  async getInsSolClosePool(): Promise<TransactionInstruction> {
    if (!this.poolData) throw MMMClient.ErrPoolDataEmpty;
    let { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
      MMMProgramID,
      this.poolData.pool,
    );
    let builder = this.program.methods.solClosePool().accountsStrict({
      pool: this.poolData.pool,
      owner: this.poolData.owner,
      cosigner: this.poolData.cosigner,
      buysideSolEscrowAccount,
      systemProgram: SystemProgram.programId,
    });
    return await builder.instruction();
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
    allowlistAuxAccount?: PublicKey,
  ): Promise<TransactionInstruction> {
    if (!this.poolData) throw MMMClient.ErrPoolDataEmpty;
    let { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
      MMMProgramID,
      this.poolData.pool,
    );
    const assetMetadata = this.mpl.nfts().pdas().metadata({ mint: assetMint });
    const ownerTokenAccount = await getAssociatedTokenAddress(
      assetMint,
      this.poolData.owner,
    );
    const { key: sellState } = getMMMSellStatePDA(
      MMMProgramID,
      this.poolData.pool,
      assetMint,
    );
    const sellsideEscrowTokenAccount = await getAssociatedTokenAddress(
      assetMint,
      this.poolData.pool,
      true,
    );

    const ocpMintState = await this.getMintState(assetMint);
    let builder:
      | ReturnType<MmmMethodsNamespace['solOcpFulfillBuy']>
      | ReturnType<MmmMethodsNamespace['solFulfillBuy']>;

    if (ocpMintState) {
      builder = this.program.methods.solOcpFulfillBuy(args).accountsStrict({
        payer,
        owner: this.poolData.owner,
        buysideSolEscrowAccount,
        pool: this.poolData.pool,
        assetMint,
        assetMetadata,
        referral: this.poolData.referral,
        cosigner: this.poolData.cosigner,
        payerAssetAccount: assetTokenAccount,
        ownerTokenAccount,
        sellState,
        sellsideEscrowTokenAccount,
        allowlistAuxAccount: allowlistAuxAccount ?? SystemProgram.programId,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,

        ...this.getOcpAccounts(ocpMintState),
      });
    } else {
      const assetMasterEdition = this.mpl
        .nfts()
        .pdas()
        .masterEdition({ mint: assetMint });

      builder = this.program.methods.solFulfillBuy(args).accountsStrict({
        payer,
        owner: this.poolData.owner,
        buysideSolEscrowAccount,
        pool: this.poolData.pool,
        assetMint,
        assetMasterEdition,
        assetMetadata,
        referral: this.poolData.referral,
        cosigner: this.poolData.cosigner,
        payerAssetAccount: assetTokenAccount,
        ownerTokenAccount,
        sellState,
        sellsideEscrowTokenAccount,
        allowlistAuxAccount: allowlistAuxAccount ?? SystemProgram.programId,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      });
    }

    if (this.poolData.buysideCreatorRoyaltyBp > 0 || ocpMintState) {
      const metadata = await this.getNftMetadata(assetMint);
      if (metadata.creators.length > 0) {
        builder = builder.remainingAccounts(
          metadata.creators.map((v) => ({
            pubkey: v.address,
            isSigner: false,
            isWritable: true,
          })),
        );
      }
    }
    return await builder.instruction();
  }

  async getInsSolFulfillSell(
    args: anchor.IdlTypes<Mmm>['SolFulfillSellArgs'],
    payer: PublicKey,
    assetMint: PublicKey,
    allowlistAuxAccount?: PublicKey,
  ): Promise<TransactionInstruction> {
    if (!this.poolData) throw MMMClient.ErrPoolDataEmpty;
    let { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
      MMMProgramID,
      this.poolData.pool,
    );
    const assetMetadata = this.mpl.nfts().pdas().metadata({ mint: assetMint });

    const { key: sellState } = getMMMSellStatePDA(
      MMMProgramID,
      this.poolData.pool,
      assetMint,
    );
    const sellsideEscrowTokenAccount = await getAssociatedTokenAddress(
      assetMint,
      this.poolData.pool,
      true,
    );
    const payerAssetAccount = await getAssociatedTokenAddress(assetMint, payer);
    const ocpMintState = await this.getMintState(assetMint);
    let builder:
      | ReturnType<MmmMethodsNamespace['solOcpFulfillSell']>
      | ReturnType<MmmMethodsNamespace['solFulfillSell']>;

    if (ocpMintState) {
      builder = this.program.methods
        .solOcpFulfillSell({
          assetAmount: args.assetAmount,
          maxPaymentAmount: args.maxPaymentAmount,
          allowlistAux: args.allowlistAux,
          makerFeeBp: args.makerFeeBp,
          takerFeeBp: args.takerFeeBp,
        })
        .accountsStrict({
          payer,
          owner: this.poolData.owner,
          buysideSolEscrowAccount,
          pool: this.poolData.pool,
          assetMint,
          assetMetadata,
          referral: this.poolData.referral,
          cosigner: this.poolData.cosigner,
          payerAssetAccount,
          sellState,
          sellsideEscrowTokenAccount,
          allowlistAuxAccount: allowlistAuxAccount ?? SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,

          ...this.getOcpAccounts(ocpMintState),
        });
    } else {
      const assetMasterEdition = this.mpl
        .nfts()
        .pdas()
        .masterEdition({ mint: assetMint });
      builder = this.program.methods.solFulfillSell(args).accountsStrict({
        payer,
        owner: this.poolData.owner,
        buysideSolEscrowAccount,
        pool: this.poolData.pool,
        assetMint,
        assetMasterEdition,
        assetMetadata,
        referral: this.poolData.referral,
        cosigner: this.poolData.cosigner,
        payerAssetAccount,
        sellState,
        sellsideEscrowTokenAccount,
        allowlistAuxAccount: allowlistAuxAccount ?? SystemProgram.programId,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      });
    }

    if (args.buysideCreatorRoyaltyBp > 0 || ocpMintState) {
      const metadata = await this.getNftMetadata(assetMint);
      if (metadata.creators.length > 0) {
        builder = builder.remainingAccounts(
          metadata.creators.map((v) => ({
            pubkey: v.address,
            isSigner: false,
            isWritable: true,
          })),
        );
      }
    }
    return await builder.instruction();
  }

  async getInsDepositSell(
    args: anchor.IdlTypes<Mmm>['DepositSellArgs'],
    assetMint: PublicKey,
    allowlistAuxAccount?: PublicKey,
  ): Promise<TransactionInstruction> {
    if (!this.poolData) throw MMMClient.ErrPoolDataEmpty;
    const assetMetadata = this.mpl.nfts().pdas().metadata({ mint: assetMint });

    const { key: sellState } = getMMMSellStatePDA(
      MMMProgramID,
      this.poolData.pool,
      assetMint,
    );
    const sellsideEscrowTokenAccount = await getAssociatedTokenAddress(
      assetMint,
      this.poolData.pool,
      true,
    );
    const assetTokenAccount = await getAssociatedTokenAddress(
      assetMint,
      this.poolData.owner,
    );
    const ocpMintState = await this.getMintState(assetMint);
    let builder:
      | ReturnType<MmmMethodsNamespace['ocpDepositSell']>
      | ReturnType<MmmMethodsNamespace['depositSell']>;

    if (ocpMintState) {
      builder = this.program.methods.ocpDepositSell(args).accountsStrict({
        owner: this.poolData.owner,
        pool: this.poolData.pool,
        assetMint,
        assetMetadata,
        assetTokenAccount,
        cosigner: this.poolData.cosigner,
        sellState,
        sellsideEscrowTokenAccount,
        allowlistAuxAccount: allowlistAuxAccount ?? SystemProgram.programId,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,

        ...this.getOcpAccounts(ocpMintState),
      });
    } else {
      const assetMasterEdition = this.mpl
        .nfts()
        .pdas()
        .masterEdition({ mint: assetMint });
      builder = this.program.methods.depositSell(args).accountsStrict({
        owner: this.poolData.owner,
        pool: this.poolData.pool,
        assetMint,
        assetMasterEdition,
        assetMetadata,
        assetTokenAccount,
        cosigner: this.poolData.cosigner,
        sellState,
        sellsideEscrowTokenAccount,
        allowlistAuxAccount: allowlistAuxAccount ?? SystemProgram.programId,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      });
    }
    return await builder.instruction();
  }

  async getInsWithdrawSell(
    args: anchor.IdlTypes<Mmm>['WithdrawSellArgs'],
    assetMint: PublicKey,
    allowlistAuxAccount?: PublicKey,
  ): Promise<TransactionInstruction> {
    if (!this.poolData) throw MMMClient.ErrPoolDataEmpty;

    const { key: sellState } = getMMMSellStatePDA(
      MMMProgramID,
      this.poolData.pool,
      assetMint,
    );
    const sellsideEscrowTokenAccount = await getAssociatedTokenAddress(
      assetMint,
      this.poolData.pool,
      true,
    );
    const assetTokenAccount = await getAssociatedTokenAddress(
      assetMint,
      this.poolData.owner,
    );

    let { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
      MMMProgramID,
      this.poolData.pool,
    );
    const ocpMintState = await this.getMintState(assetMint);
    let builder:
      | ReturnType<MmmMethodsNamespace['ocpWithdrawSell']>
      | ReturnType<MmmMethodsNamespace['withdrawSell']>;

    if (ocpMintState) {
      const assetMetadata = this.mpl
        .nfts()
        .pdas()
        .metadata({ mint: assetMint });
      builder = this.program.methods.ocpWithdrawSell(args).accountsStrict({
        owner: this.poolData.owner,
        pool: this.poolData.pool,
        assetMint,
        assetTokenAccount,
        assetMetadata,
        cosigner: this.poolData.cosigner,
        sellState,
        sellsideEscrowTokenAccount,
        buysideSolEscrowAccount,
        allowlistAuxAccount: allowlistAuxAccount ?? SystemProgram.programId,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,

        ...this.getOcpAccounts(ocpMintState),
      });
    } else {
      builder = this.program.methods.withdrawSell(args).accountsStrict({
        owner: this.poolData.owner,
        pool: this.poolData.pool,
        assetMint,
        assetTokenAccount,
        cosigner: this.poolData.cosigner,
        sellState,
        sellsideEscrowTokenAccount,
        buysideSolEscrowAccount,
        allowlistAuxAccount: allowlistAuxAccount ?? SystemProgram.programId,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      });
    }
    return await builder.instruction();
  }
}
