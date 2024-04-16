import {
  ExtensionType,
  getExtensionData,
  getExtraAccountMetaAddress,
  getExtraAccountMetas,
  getMetadataPointerState,
  getTransferHook,
  Mint,
  resolveExtraAccountMeta,
} from '@solana/spl-token';
import { unpack } from '@solana/spl-token-metadata';
import { AccountMeta, Connection, PublicKey } from '@solana/web3.js';
import {
  LIBPREPLEX_ROYALTY_PROGRAM_ID,
  LIBREPLEX_ROYALTY_ENFORCEMENT_BP_KEY_LEGACY,
  LIBREPLEX_ROYALTY_ENFORCEMENT_CREATOR_PREFIX_LEGACY,
  LIBREPLEX_ROYALTY_ENFORCEMENT_PREFIX,
} from './constants';

const ALLOWED_TRANSFER_HOOK_PROGRAM_IDS: PublicKey[] = [
  LIBPREPLEX_ROYALTY_PROGRAM_ID,
];

export interface RemainingAccountArgs {
  shouldIncludeCreator?: boolean;
}

export interface TransferHookProvider {
  isTransferHookProgramAllowed(): boolean;
  getAccountMetaList(connection: Connection): Promise<AccountMeta[]>;
  getRemainingAccounts(args: RemainingAccountArgs): Promise<AccountMeta[]>;
}

export class MintExtTransferHookProvider implements TransferHookProvider {
  private readonly transferHookProgramId: PublicKey | undefined;

  constructor(
    private readonly connection: Connection,
    private readonly mint: Mint,
  ) {
    this.transferHookProgramId = getTransferHook(this.mint)?.programId;
  }

  static async loadFromRpc(
    mint: Mint,
    connection: Connection,
  ): Promise<MintExtTransferHookProvider> {
    return new MintExtTransferHookProvider(connection, mint);
  }

  async getRemainingAccounts(
    args: RemainingAccountArgs,
  ): Promise<AccountMeta[]> {
    if (!this.isTransferHookProgramAllowed()) {
      return [];
    }

    const accountMetaList = await this.getAccountMetaList(this.connection);
    if (this.transferHookProgramId?.equals(LIBPREPLEX_ROYALTY_PROGRAM_ID)) {
      const royaltyInfo = this.getLibreplexRoyaltyInfo();
      if (!royaltyInfo) {
        return [];
      }

      return [
        ...(args.shouldIncludeCreator
          ? [
              {
                pubkey: royaltyInfo.creatorAddress,
                isWritable: true,
                isSigner: false,
              },
            ]
          : []),
        ...accountMetaList,
      ];
    }
    return [];
  }

  async getAccountMetaList(connection: Connection): Promise<AccountMeta[]> {
    if (!this.transferHookProgramId) {
      return [];
    }

    const validateStateAccount = getExtraAccountMetaAddress(
      this.mint.address,
      this.transferHookProgramId,
    );

    const accountInfo = await connection.getAccountInfo(validateStateAccount);
    if (accountInfo === null) {
      throw new Error('validateStateAccount account not found');
    }
    const extraAccountMetas = getExtraAccountMetas(accountInfo);
    const previousMetas: AccountMeta[] = [];
    for (const extraAccountMeta of extraAccountMetas) {
      const accountMeta = await resolveExtraAccountMeta(
        connection,
        extraAccountMeta,
        previousMetas,
        accountInfo.data,
        this.transferHookProgramId,
      );
      previousMetas.push(accountMeta);
    }

    return [
      {
        pubkey: this.transferHookProgramId,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: validateStateAccount,
        isSigner: false,
        isWritable: true,
      },
      ...previousMetas,
    ];
  }

  isTransferHookProgramAllowed(): boolean {
    return this.transferHookProgramId
      ? ALLOWED_TRANSFER_HOOK_PROGRAM_IDS.includes(this.transferHookProgramId)
      : false;
  }

  private getLibreplexRoyaltyInfo():
    | { creatorAddress: PublicKey; sfbp: number }
    | undefined {
    const metadataPointer = getMetadataPointerState(this.mint);
    if (
      !metadataPointer ||
      !metadataPointer.metadataAddress?.equals(this.mint.address)
    ) {
      return undefined;
    }

    const metadata = getExtensionData(
      ExtensionType.TokenMetadata,
      this.mint.tlvData,
    );
    if (!metadata) {
      return undefined;
    }
    const tokenMetadata = unpack(metadata);
    if (tokenMetadata.additionalMetadata.length === 0) {
      return undefined;
    }
    const royaltyInfo =
      MintExtTransferHookProvider.getLibreplexRoyaltyInfo(
        tokenMetadata.additionalMetadata,
      ) ||
      MintExtTransferHookProvider.getLibreplexRoyaltyInfoLegacy(
        tokenMetadata.additionalMetadata,
      );
    if (!royaltyInfo) {
      return undefined;
    }

    return {
      creatorAddress: new PublicKey(royaltyInfo[0]),
      sfbp: Number(royaltyInfo[1]),
    };
  }

  static getLibreplexRoyaltyInfo(
    additionalMetadata: [string, string][],
  ): [string, string] | undefined {
    const royaltyInfo = additionalMetadata.find(
      (v) =>
        v[0].startsWith(LIBREPLEX_ROYALTY_ENFORCEMENT_PREFIX) &&
        v[0] !== LIBREPLEX_ROYALTY_ENFORCEMENT_PREFIX,
    );
    if (!royaltyInfo || Number(royaltyInfo[1]) < 0) {
      return undefined;
    }

    return [
      royaltyInfo[0].substring(LIBREPLEX_ROYALTY_ENFORCEMENT_PREFIX.length),
      royaltyInfo[1],
    ];
  }

  static getLibreplexRoyaltyInfoLegacy(
    additionalMetadata: [string, string][],
  ): [string, string] | undefined {
    const creatorInfo = additionalMetadata.find(
      (v) =>
        v[0].startsWith(LIBREPLEX_ROYALTY_ENFORCEMENT_CREATOR_PREFIX_LEGACY) &&
        v[0] !== LIBREPLEX_ROYALTY_ENFORCEMENT_CREATOR_PREFIX_LEGACY,
    );
    if (!creatorInfo || Number(creatorInfo[1]) !== 100) {
      return undefined;
    }

    const basisPoints = additionalMetadata.find(
      (v) => v[0] === LIBREPLEX_ROYALTY_ENFORCEMENT_BP_KEY_LEGACY,
    );
    if (!basisPoints || Number(basisPoints[1]) < 0) {
      return undefined;
    }

    return [
      creatorInfo[0].substring(
        LIBREPLEX_ROYALTY_ENFORCEMENT_CREATOR_PREFIX_LEGACY.length,
      ),
      basisPoints[1],
    ];
  }
}
