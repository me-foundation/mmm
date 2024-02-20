import {
  findMintStatePk,
  MintState,
} from '@magiceden-oss/open_creator_protocol';
import { Metaplex } from '@metaplex-foundation/js';
import { Creator, Metadata, TokenStandard } from 'old-mpl-token-metadata';
import { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import { Mint, unpackMint } from '@solana/spl-token';

export class MetadataProviderError extends Error {
  name = 'MetadataProviderError';
  constructor(msg: string) {
    super(msg);
  }
}

export interface MintStateWithAddress {
  mintState: MintState;
  mintStateAddress: PublicKey;
}

/**
 * Interface for providing metadata for a given mint
 */
export interface MetadataProvider {
  get creators(): Creator[];
  get tokenStandard(): TokenStandard | undefined;
  get ruleset(): PublicKey | undefined;
  get mintState(): MintStateWithAddress | undefined;
  get mintAddress(): PublicKey;
  get tokenProgram(): PublicKey;
  get sellerFeeBasisPoints(): number;
}

export class RpcMetadataProvider implements MetadataProvider {
  constructor(
    private readonly mint: PublicKey,
    public readonly metadataAccount: Metadata,
    public readonly mintAccount: Mint & { tokenProgramId: PublicKey },
    public readonly mintStateAccount: MintStateWithAddress | undefined,
  ) {
    if (!mint.equals(metadataAccount.mint)) {
      throw new MetadataProviderError('mint and metadata mismatch');
    }
  }

  static async loadFromRpc(
    mint: PublicKey,
    connection: Connection,
  ): Promise<RpcMetadataProvider> {
    const mpl = new Metaplex(connection);
    const metadataAddress = mpl.nfts().pdas().metadata({ mint });
    const mintStateAddress = findMintStatePk(mint);
    const [metadataAi, mintStateAi, mintAi] =
      await connection.getMultipleAccountsInfo([
        metadataAddress,
        mintStateAddress,
        mint,
      ]);

    if (!metadataAi) {
      throw new MetadataProviderError('metadata not found');
    }
    if (!mintAi) {
      throw new MetadataProviderError('mint not found');
    }
    return RpcMetadataProvider.loadFromAccountInfos(mint, mintStateAddress, {
      metadata: metadataAi,
      mint: mintAi,
      mintState: mintStateAi,
    });
  }

  static loadFromAccountInfos(
    mint: PublicKey,
    mintStateAddress: PublicKey,
    accounts: {
      mint: AccountInfo<Buffer>;
      metadata: AccountInfo<Buffer>;
      mintState: AccountInfo<Buffer> | null;
    },
  ): RpcMetadataProvider {
    return new RpcMetadataProvider(
      mint,
      Metadata.fromAccountInfo(accounts.metadata)[0],
      {
        ...unpackMint(mint, accounts.mint, accounts.mint.owner),
        tokenProgramId: accounts.mint.owner,
      },
      parseMintState(mintStateAddress, accounts.mint),
    );
  }

  get creators(): Creator[] {
    return this.metadataAccount.data.creators ?? [];
  }

  get tokenStandard(): TokenStandard | undefined {
    return this.metadataAccount.tokenStandard ?? undefined;
  }

  get ruleset(): PublicKey | undefined {
    return this.metadataAccount.programmableConfig?.ruleSet ?? undefined;
  }

  get mintState(): MintStateWithAddress | undefined {
    return this.mintStateAccount;
  }

  get mintAddress(): PublicKey {
    return this.mint;
  }

  get tokenProgram(): PublicKey {
    return this.mintAccount.tokenProgramId;
  }

  get sellerFeeBasisPoints(): number {
    return this.metadataAccount.data.sellerFeeBasisPoints;
  }
}

function parseMintState(
  mintStateId: PublicKey,
  mintStateAccountInfo: AccountInfo<Buffer> | null,
): MintStateWithAddress | undefined {
  if (!mintStateAccountInfo) {
    return undefined;
  }
  try {
    const mintState = MintState.fromAccountInfo(mintStateAccountInfo)[0];
    return { mintStateAddress: mintStateId, mintState };
  } catch (_e) {
    return undefined;
  }
}
