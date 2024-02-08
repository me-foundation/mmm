import {
  findMintStatePk,
  MintState,
} from '@magiceden-oss/open_creator_protocol';
import { Metaplex } from '@metaplex-foundation/js';
import { Creator, Metadata, TokenStandard } from 'old-mpl-token-metadata';
import { Connection, PublicKey } from '@solana/web3.js';

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

export abstract class MetadataProvider {
  abstract load(mint: PublicKey): Promise<void>;
  abstract getCreators(mint: PublicKey): Creator[];
  abstract getTokenStandard(mint: PublicKey): TokenStandard | undefined;
  abstract getRuleset(mint: PublicKey): PublicKey | undefined;
  abstract getMintState(mint: PublicKey): MintStateWithAddress | undefined;
  abstract getLoadedMint(): PublicKey | undefined;

  checkMetadataMint(mint: PublicKey) {
    const loadedMint = this.getLoadedMint();
    if (!loadedMint) {
      throw new MetadataProviderError('no metadata loaded');
    }
    if (!loadedMint.equals(mint)) {
      throw new MetadataProviderError('mint mismatch');
    }
  }
}

export class RpcMetadataProvider extends MetadataProvider {
  private connection: Connection;
  private mpl: Metaplex;
  mintState: MintStateWithAddress | undefined;
  metadata: Metadata | undefined;

  constructor(conn: Connection) {
    super();
    this.connection = conn;
    this.mpl = new Metaplex(conn);
  }

  async load(mint: PublicKey) {
    const metadataAddress = this.mpl.nfts().pdas().metadata({ mint });
    [this.metadata, this.mintState] = await Promise.all([
      Metadata.fromAccountAddress(this.connection, metadataAddress),
      getMintState(this.connection, mint),
    ]);
  }

  getCreators(mint: PublicKey): Creator[] {
    this.checkMetadataMint(mint);
    return this.metadata!.data.creators ?? [];
  }

  getTokenStandard(mint: PublicKey): TokenStandard | undefined {
    this.checkMetadataMint(mint);
    return this.metadata!.tokenStandard ?? undefined;
  }

  getRuleset(mint: PublicKey): PublicKey | undefined {
    this.checkMetadataMint(mint);
    return this.metadata!.programmableConfig?.ruleSet ?? undefined;
  }

  getMintState(mint: PublicKey): MintStateWithAddress | undefined {
    // check metadata as a proxy check to make sure mint was loaded corrrectly
    this.checkMetadataMint(mint);
    return this.mintState;
  }

  getLoadedMint(): PublicKey | undefined {
    return this.metadata?.mint;
  }
}

async function getMintState(
  connection: Connection,
  tokenMint: PublicKey,
): Promise<MintStateWithAddress | undefined> {
  const mintStateId = findMintStatePk(tokenMint);
  try {
    const mintState = await MintState.fromAccountAddress(
      connection,
      mintStateId,
    );
    return { mintStateAddress: mintStateId, mintState };
  } catch (_e) {
    return undefined;
  }
}

export function rpcMetadataProviderGenerator(connection: Connection) {
  return new RpcMetadataProvider(connection);
}
