import {
  ExtensionType,
  getExtensionData,
  getExtraAccountMetaAddress,
  getExtraAccountMetas,
  getMetadataPointerState,
  getMint,
  getTransferHook,
  Mint,
  resolveExtraAccountMeta,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { unpack } from '@solana/spl-token-metadata';
import { AccountMeta, Connection, PublicKey } from '@solana/web3.js';

export interface TransferHookProvider {
  isTransferHookProgramAllowed(): boolean;
  getAccountMetaList(connection: Connection): Promise<AccountMeta[]>;
  getRemainingAccounts(isFulfill: boolean): Promise<AccountMeta[]>;
}

const LIBREPLEX_ROYALTY_ENFORCEMENT_PREFIX = '_ro_';
// legacy for backwards compatibility
const LIBREPLEX_ROYALTY_ENFORCEMENT_CREATOR_PREFIX_LEGACY = '_roa_';
const LIBREPLEX_ROYALTY_ENFORCEMENT_BP_KEY_LEGACY = '_ros_';

export class LibreplexRoyaltyProvider implements TransferHookProvider {
  private TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
    'CZ1rQoAHSqWBoAEfqGsiLhgbM59dDrCWk3rnG5FXaoRV',
  ); // libreplex royalty enforcement program id

  constructor(
    private readonly connection: Connection,
    private readonly mint: Mint,
  ) {}

  static async loadFromRpc(
    mintAddress: PublicKey,
    connection: Connection,
  ): Promise<LibreplexRoyaltyProvider> {
    const mint = await getMint(
      connection,
      mintAddress,
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    );

    return new LibreplexRoyaltyProvider(connection, mint);
  }

  async getRemainingAccounts(isFulfill: boolean): Promise<AccountMeta[]> {
    if (!this.isTransferHookProgramAllowed()) {
      return [];
    }

    const royaltyInfo = this.getLibreplexRoyaltyInfo();
    if (!royaltyInfo) {
      return [];
    }

    return [
      ...(isFulfill
        ? [
            {
              pubkey: royaltyInfo.creatorAddress,
              isWritable: true,
              isSigner: false,
            },
          ]
        : []),
      ...(await this.getAccountMetaList(this.connection)),
    ];
  }

  async getAccountMetaList(connection: Connection): Promise<AccountMeta[]> {
    if (!this.isTransferHookProgramAllowed()) {
      return [];
    }

    const validateStateAccount = getExtraAccountMetaAddress(
      this.mint.address,
      this.TRANSFER_HOOK_PROGRAM_ID,
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
        this.TRANSFER_HOOK_PROGRAM_ID,
      );
      previousMetas.push(accountMeta);
    }

    return [
      {
        pubkey: this.TRANSFER_HOOK_PROGRAM_ID,
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
    return (
      getTransferHook(this.mint)?.programId.equals(
        this.TRANSFER_HOOK_PROGRAM_ID,
      ) ?? false
    );
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
      LibreplexRoyaltyProvider.getLibreplexRoyaltyInfo(
        tokenMetadata.additionalMetadata,
      ) ||
      LibreplexRoyaltyProvider.getLibreplexRoyaltyInfoLegacy(
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
