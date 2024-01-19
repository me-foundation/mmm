import {
  CMT_PROGRAM,
  findFreezeAuthorityPk,
  PROGRAM_ID as OCP_PROGRAM_ID,
} from '@magiceden-oss/open_creator_protocol';
import { Metaplex } from '@metaplex-foundation/js';
import {
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
  TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata';
import { PROGRAM_ID as AUTH_RULES_PROGRAM_ID } from '@metaplex-foundation/mpl-token-auth-rules';
import * as anchor from '@coral-xyz/anchor';
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
  getTokenRecordPDA,
} from './pda';
import {
  MetadataProvider,
  MintStateWithAddress,
  RpcMetadataProvider,
  rpcMetadataProviderGenerator,
} from './metadataProvider';

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
  private readonly metadataProviderGenerator: (
    conn: Connection,
  ) => MetadataProvider;

  poolData: (anchor.IdlAccounts<Mmm>['pool'] & { pool: PublicKey }) | undefined;

  constructor(
    conn: Connection,
    cosigner?: Keypair,
    metadataProviderGenerator?: (conn: Connection) => MetadataProvider,
  ) {
    this.conn = conn;
    this.provider = new anchor.AnchorProvider(this.conn, dummyKeypair, {
      preflightCommitment: conn.commitment,
      commitment: conn.commitment,
    });
    this.program = new anchor.Program<Mmm>(IDL, MMMProgramID, this.provider);
    if (cosigner) this.cosigner = cosigner;
    this.mpl = new Metaplex(conn);
    this.metadataProviderGenerator =
      metadataProviderGenerator ?? rpcMetadataProviderGenerator;
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

  private getOcpAccounts(ocpMintState: MintStateWithAddress) {
    const ocpFreezeAuthority = findFreezeAuthorityPk(
      ocpMintState.mintState.policy,
    );
    return {
      ocpMintState: ocpMintState.mintStateAddress,
      ocpPolicy: ocpMintState.mintState.policy,
      ocpFreezeAuthority,
      ocpProgram: OCP_PROGRAM_ID,
      cmtProgram: CMT_PROGRAM,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    };
  }

  private getMip1Accounts(mip1AccountArgs: {
    ruleset: PublicKey | undefined;
    mint: PublicKey;
    ownerTokenAccount: PublicKey;
    destinationTokenAccount: PublicKey;
  }) {
    const { key: ownerTokenRecord } = getTokenRecordPDA(
      mip1AccountArgs.mint,
      mip1AccountArgs.ownerTokenAccount,
    );
    const { key: destinationTokenRecord } = getTokenRecordPDA(
      mip1AccountArgs.mint,
      mip1AccountArgs.destinationTokenAccount,
    );
    return {
      ownerTokenRecord,
      destinationTokenRecord,
      authorizationRules: mip1AccountArgs.ruleset ?? TOKEN_METADATA_PROGRAM_ID,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      authorizationRulesProgram: AUTH_RULES_PROGRAM_ID,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    };
  }

  async getInsCreatePool(
    args: anchor.IdlTypes<Mmm>['CreatePoolArgs'],
    owner: PublicKey,
    cosigner: PublicKey,
  ): Promise<TransactionInstruction> {
    const { key: poolKey } = getMMMPoolPDA(MMMProgramID, owner, args.uuid);
    let builder = this.program.methods.createPool(args).accounts({
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
    let builder = this.program.methods.updatePool(args).accounts({
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
    let builder = this.program.methods.solDepositBuy(args).accounts({
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
    let builder = this.program.methods.solWithdrawBuy(args).accounts({
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

    const metadataProvider = this.metadataProviderGenerator(this.conn);
    await metadataProvider.load(assetMint);
    const ocpMintState = metadataProvider.getMintState(assetMint);
    const tokenStandard = metadataProvider.getTokenStandard(assetMint);
    let builder:
      | ReturnType<MmmMethodsNamespace['solOcpFulfillBuy']>
      | ReturnType<MmmMethodsNamespace['solFulfillBuy']>
      | ReturnType<MmmMethodsNamespace['solMip1FulfillBuy']>;

    if (ocpMintState) {
      builder = this.program.methods.solOcpFulfillBuy(args).accounts({
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
      if (tokenStandard === TokenStandard.ProgrammableNonFungible) {
        const ruleset = metadataProvider.getRuleset(assetMint);
        const {
          ownerTokenRecord: tokenOwnerTokenRecord,
          destinationTokenRecord: poolOwnerTokenRecord,
          ...filteredMip1Accounts
        } = this.getMip1Accounts({
          ruleset,
          mint: assetMint,
          ownerTokenAccount: assetTokenAccount,
          destinationTokenAccount: ownerTokenAccount,
        });
        const poolTokenRecord = getTokenRecordPDA(
          assetMint,
          sellsideEscrowTokenAccount,
        ).key;
        builder = this.program.methods.solMip1FulfillBuy(args).accounts({
          payer,
          owner: this.poolData.owner,
          buysideSolEscrowAccount,
          pool: this.poolData.pool,
          assetMint,
          assetMetadata,
          assetMasterEdition,
          referral: this.poolData.referral,
          cosigner: this.poolData.cosigner,
          payerAssetAccount: assetTokenAccount,
          ownerTokenAccount,
          sellState,
          sellsideEscrowTokenAccount,
          allowlistAuxAccount: allowlistAuxAccount ?? SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          tokenOwnerTokenRecord,
          poolOwnerTokenRecord,
          poolTokenRecord,
          ...filteredMip1Accounts,
        });
      } else {
        builder = this.program.methods.solFulfillBuy(args).accounts({
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
    }

    if (
      this.poolData.buysideCreatorRoyaltyBp > 0 ||
      ocpMintState ||
      tokenStandard === TokenStandard.ProgrammableNonFungible
    ) {
      const creators = metadataProvider.getCreators(assetMint);
      if (creators.length > 0) {
        builder = builder.remainingAccounts(
          creators.map((v) => ({
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
    const metadataProvider = this.metadataProviderGenerator(this.conn);
    await metadataProvider.load(assetMint);
    const ocpMintState = metadataProvider.getMintState(assetMint);
    const tokenStandard = metadataProvider.getTokenStandard(assetMint);
    let builder:
      | ReturnType<MmmMethodsNamespace['solOcpFulfillSell']>
      | ReturnType<MmmMethodsNamespace['solFulfillSell']>
      | ReturnType<MmmMethodsNamespace['solMip1FulfillSell']>;

    if (ocpMintState) {
      builder = this.program.methods
        .solOcpFulfillSell({
          assetAmount: args.assetAmount,
          maxPaymentAmount: args.maxPaymentAmount,
          allowlistAux: args.allowlistAux,
          makerFeeBp: args.makerFeeBp,
          takerFeeBp: args.takerFeeBp,
        })
        .accounts({
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
      if (tokenStandard === TokenStandard.ProgrammableNonFungible) {
        const ruleset = metadataProvider.getRuleset(assetMint);
        builder = this.program.methods
          .solMip1FulfillSell({
            assetAmount: args.assetAmount,
            maxPaymentAmount: args.maxPaymentAmount,
            allowlistAux: args.allowlistAux,
            makerFeeBp: args.makerFeeBp,
            takerFeeBp: args.takerFeeBp,
          })
          .accounts({
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

            ...this.getMip1Accounts({
              ruleset,
              mint: assetMint,
              ownerTokenAccount: sellsideEscrowTokenAccount,
              destinationTokenAccount: payerAssetAccount,
            }),
          });
      } else {
        builder = this.program.methods.solFulfillSell(args).accounts({
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
    }

    if (
      args.buysideCreatorRoyaltyBp > 0 ||
      ocpMintState ||
      tokenStandard === TokenStandard.ProgrammableNonFungible
    ) {
      const creators = metadataProvider.getCreators(assetMint);
      if (creators.length > 0) {
        builder = builder.remainingAccounts(
          creators.map((v) => ({
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

    const metadataProvider = this.metadataProviderGenerator(this.conn);
    await metadataProvider.load(assetMint);
    const ocpMintState = metadataProvider.getMintState(assetMint);
    let builder:
      | ReturnType<MmmMethodsNamespace['ocpDepositSell']>
      | ReturnType<MmmMethodsNamespace['depositSell']>
      | ReturnType<MmmMethodsNamespace['mip1DepositSell']>;

    if (ocpMintState) {
      builder = this.program.methods.ocpDepositSell(args).accounts({
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
      const tokenStandard = metadataProvider.getTokenStandard(assetMint);
      if (tokenStandard === TokenStandard.ProgrammableNonFungible) {
        const ruleset = metadataProvider.getRuleset(assetMint);
        builder = this.program.methods.mip1DepositSell(args).accounts({
          owner: this.poolData.owner,
          cosigner: this.poolData.cosigner,
          pool: this.poolData.pool,
          assetMint,
          assetMasterEdition,
          assetMetadata,
          assetTokenAccount,
          sellsideEscrowTokenAccount,
          sellState,
          allowlistAuxAccount: allowlistAuxAccount ?? SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,

          ...this.getMip1Accounts({
            ruleset,
            mint: assetMint,
            ownerTokenAccount: assetTokenAccount,
            destinationTokenAccount: sellsideEscrowTokenAccount,
          }),
        });
      } else {
        builder = this.program.methods.depositSell(args).accounts({
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
    const assetMetadata = this.mpl.nfts().pdas().metadata({ mint: assetMint });

    const metadataProvider = this.metadataProviderGenerator(this.conn);
    await metadataProvider.load(assetMint);
    const ocpMintState = metadataProvider.getMintState(assetMint);
    let builder:
      | ReturnType<MmmMethodsNamespace['ocpWithdrawSell']>
      | ReturnType<MmmMethodsNamespace['withdrawSell']>
      | ReturnType<MmmMethodsNamespace['mip1WithdrawSell']>;

    if (ocpMintState) {
      builder = this.program.methods.ocpWithdrawSell(args).accounts({
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
      const tokenStandard = metadataProvider.getTokenStandard(assetMint);
      if (tokenStandard === TokenStandard.ProgrammableNonFungible) {
        const assetMasterEdition = this.mpl
          .nfts()
          .pdas()
          .masterEdition({ mint: assetMint });
        const ruleset = metadataProvider.getRuleset(assetMint);
        builder = this.program.methods.mip1WithdrawSell(args).accounts({
          owner: this.poolData.owner,
          pool: this.poolData.pool,
          assetMint,
          assetTokenAccount,
          assetMetadata,
          assetMasterEdition,
          cosigner: this.poolData.cosigner,
          sellState,
          sellsideEscrowTokenAccount,
          buysideSolEscrowAccount,
          allowlistAuxAccount: allowlistAuxAccount ?? SystemProgram.programId,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,

          ...this.getMip1Accounts({
            ruleset,
            mint: assetMint,
            ownerTokenAccount: sellsideEscrowTokenAccount,
            destinationTokenAccount: assetTokenAccount,
          }),
        });
      } else {
        builder = this.program.methods.withdrawSell(args).accounts({
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
    }
    return await builder.instruction();
  }

  async getInsCloseIfBalanceInvalid(
    authority: PublicKey,
  ): Promise<TransactionInstruction> {
    if (!this.poolData) throw MMMClient.ErrPoolDataEmpty;
    let { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
      MMMProgramID,
      this.poolData.pool,
    );
    let builder = this.program.methods.closeIfBalanceInvalid().accountsStrict({
      pool: this.poolData.pool,
      owner: this.poolData.owner,
      buysideSolEscrowAccount,
      authority,
      systemProgram: SystemProgram.programId,
    });
    return await builder.instruction();
  }
}
