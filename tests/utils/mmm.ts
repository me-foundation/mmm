import {
  CMT_PROGRAM,
  PROGRAM_ID as OCP_PROGRAM_ID,
} from '@magiceden-oss/open_creator_protocol';
import {
  assertAccountExists,
  createAmount,
  generateSigner,
  percentAmount,
  publicKey,
  Program as UmiProgram,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-tests';
import {
  createNft,
  createV1,
  TokenStandard,
  mplTokenMetadata,
  fetchDigitalAsset,
} from '@metaplex-foundation/mpl-token-metadata';
import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
  toWeb3JsKeypair,
  fromWeb3JsKeypair,
} from '@metaplex-foundation/umi-web3js-adapters';
import { PROGRAM_ID as AUTHORIZATION_RULES_PROGRAM_ID } from '@metaplex-foundation/mpl-token-auth-rules';
import {
  AllowlistKind,
  CurveKind,
  getMMMBuysideSolEscrowPDA,
  getMMMPoolPDA,
  getMMMSellStatePDA,
  getTokenRecordPDA,
  Mmm,
} from '../../sdk/src';
import {
  fillAllowlists,
  getEmptyAllowLists,
  getKeypair,
  MIP1_COMPUTE_UNITS,
  OCP_COMPUTE_UNITS,
} from './generic';
import { createProgrammableNft } from './mip1';
import { getMetaplexInstance, mintCollection, mintNfts } from './nfts';
import { umiMintNfts, Nft } from './umiNfts';
import { createTestMintAndTokenOCP } from './ocp';

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
);

interface PoolData {
  referral: anchor.web3.Keypair;
  uuid: anchor.web3.Keypair;
  poolKey: anchor.web3.PublicKey;
  nft: Nft;
  sft: Nft;
  extraNft: Nft;
  extraSft: Nft;
  poolAtaNft: PublicKey;
  poolAtaSft: PublicKey;
  poolAtaExtraSft: PublicKey;
  poolAtaExtraNft: PublicKey;
  poolPaymentEscrow: anchor.web3.PublicKey;
  nftCreator: anchor.web3.Keypair;
}

export const createPool = async (
  program: Program<Mmm>,
  args: {
    owner: PublicKey;
    cosigner?: Keypair;
    allowlists?: ReturnType<typeof getEmptyAllowLists>;
    spotPrice?: anchor.BN;
    curveType?: CurveKind;
    curveDelta?: anchor.BN;
    reinvestFulfillBuy?: boolean;
    reinvestFulfillSell?: boolean;
    expiry?: anchor.BN;
    lpFeeBp?: number;
    referral?: PublicKey;
    referralBp?: number;
    cosignerAnnotation?: number[];
    uuid?: PublicKey;
    paymentMint?: PublicKey;
    buysideCreatorRoyaltyBp?: number;
  },
) => {
  const referral = Keypair.generate();
  const uuid = Keypair.generate();
  const { key: poolKey } = getMMMPoolPDA(
    program.programId,
    args.owner,
    uuid.publicKey,
  );
  const allowlists = [
    { kind: AllowlistKind.fvca, value: referral.publicKey },
    ...getEmptyAllowLists(5),
  ];
  const defaults = {
    spotPrice: new anchor.BN(1 * LAMPORTS_PER_SOL),
    curveType: CurveKind.linear,
    curveDelta: new anchor.BN(0),
    reinvestFulfillBuy: true,
    reinvestFulfillSell: true,
    expiry: new anchor.BN(0),
    lpFeeBp: 200,
    referral: referral.publicKey,
    referralBp: 300,
    cosignerAnnotation: new Array(32).fill(0),
    buysideCreatorRoyaltyBp: 0,

    owner: args.owner,
    cosigner: args.cosigner?.publicKey ?? args.owner,
    uuid: uuid.publicKey,
    paymentMint: PublicKey.default,
    allowlists,
  };
  const { owner, cosigner: _, ...overrides } = args;
  const finalArgs = { ...defaults, ...overrides };
  let builder = program.methods.createPool(finalArgs).accountsStrict({
    owner: args.owner,
    cosigner: finalArgs.cosigner,
    pool: poolKey,
    systemProgram: SystemProgram.programId,
  });
  if (args.cosigner) {
    builder = builder.signers([args.cosigner]);
  }
  await builder.rpc();

  return { referral, uuid, poolKey };
};

export const createPoolWithExampleDeposits = async (
  program: Program<Mmm>,
  connection: Connection,
  kinds: AllowlistKind[],
  poolArgs: Parameters<typeof createPool>[1],
  side: 'buy' | 'sell' | 'both',
  tokenProgramId: PublicKey,
  nftRecipient?: PublicKey,
) => {
  const metaplexInstance = getMetaplexInstance(connection);
  const creator = Keypair.generate();

  const [nfts, sfts, extraNft, extraSft, allowlistValue] = await (async () => {
    const kindToUse = kinds[0];
    switch (kindToUse) {
      case AllowlistKind.any:
      case AllowlistKind.mint:
        return Promise.all([
          mintNfts(connection, {
            numNfts: 1,
            recipient: poolArgs.owner,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
          }),
          mintNfts(connection, {
            numNfts: 1,
            sftAmount: 10,
            recipient: poolArgs.owner,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
          }),
          mintNfts(connection, {
            numNfts: 1,
            recipient: nftRecipient,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
          }),
          mintNfts(connection, {
            numNfts: 1,
            sftAmount: 10,
            recipient: nftRecipient,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
          }),
          null,
        ]);
      case AllowlistKind.fvca:
        return Promise.all([
          mintNfts(connection, {
            numNfts: 1,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
            recipient: poolArgs.owner,
          }),
          mintNfts(connection, {
            numNfts: 1,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
            sftAmount: 10,
            recipient: poolArgs.owner,
          }),
          mintNfts(connection, {
            numNfts: 1,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
            recipient: nftRecipient,
          }),
          mintNfts(connection, {
            numNfts: 1,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
            sftAmount: 10,
            recipient: nftRecipient,
          }),
          creator.publicKey,
        ]);
      case AllowlistKind.mcc:
        const { collection } = await mintCollection(connection, {
          numNfts: 0,
          legacy: true,
          verifyCollection: true,
        });
        return Promise.all([
          mintNfts(connection, {
            numNfts: 1,
            collectionAddress: collection.mintAddress,
            verifyCollection: true,
            recipient: poolArgs.owner,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
          }),
          mintNfts(connection, {
            numNfts: 1,
            sftAmount: 10,
            collectionAddress: collection.mintAddress,
            verifyCollection: true,
            recipient: poolArgs.owner,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
          }),
          mintNfts(connection, {
            numNfts: 1,
            collectionAddress: collection.mintAddress,
            verifyCollection: true,
            recipient: nftRecipient,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
          }),
          mintNfts(connection, {
            numNfts: 1,
            sftAmount: 10,
            collectionAddress: collection.mintAddress,
            verifyCollection: true,
            recipient: nftRecipient,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
          }),
          collection.mintAddress,
        ]);
      default:
        throw new Error(
          `unsupported allowlist kind passed while minting test nfts: ${kindToUse}`,
        );
    }
  })();

  const mintAddressNft = nfts[0].mintAddress;
  const mintAddressSft = sfts[0].mintAddress;

  const allowlists = fillAllowlists(
    kinds
      .map((kind) => {
        switch (kind) {
          case AllowlistKind.fvca:
            return [{ kind: AllowlistKind.fvca, value: allowlistValue! }];
          case AllowlistKind.mcc:
            return [{ kind: AllowlistKind.mcc, value: allowlistValue! }];
          case AllowlistKind.mint:
            return [
              { kind: AllowlistKind.mint, value: mintAddressNft },
              { kind: AllowlistKind.mint, value: mintAddressSft },
              { kind: AllowlistKind.mint, value: extraNft[0].mintAddress },
              { kind: AllowlistKind.mint, value: extraSft[0].mintAddress },
            ];
          case AllowlistKind.metadata:
            return [
              {
                kind: AllowlistKind.metadata,
                value: nfts[0].metadataAddress,
              },
            ];
          case AllowlistKind.any:
            return [{ kind: AllowlistKind.any, value: PublicKey.default }];
          default:
            throw new Error(
              `unsupported allowlist kind while building allowlist: ${kind}`,
            );
        }
      })
      .flat(),
    6,
  );

  const poolData = await createPool(program, {
    ...poolArgs,
    allowlists,
  });
  const poolKey = poolData.poolKey;

  const poolAtaNft = await getAssociatedTokenAddress(
    mintAddressNft,
    poolKey,
    true,
    tokenProgramId,
  );
  const poolAtaSft = await getAssociatedTokenAddress(
    mintAddressSft,
    poolKey,
    true,
    tokenProgramId,
  );
  const poolAtaExtraNft = await getAssociatedTokenAddress(
    extraNft[0].mintAddress,
    poolKey,
    true,
    tokenProgramId,
  );
  const poolAtaExtraSft = await getAssociatedTokenAddress(
    extraSft[0].mintAddress,
    poolKey,
    true,
    tokenProgramId,
  );

  if (side === 'both' || side === 'sell') {
    const { key: sellState1 } = getMMMSellStatePDA(
      program.programId,
      poolKey,
      mintAddressNft,
    );
    await program.methods
      .depositSell({ assetAmount: new anchor.BN(1), allowlistAux: '' })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        assetMetadata: metaplexInstance
          .nfts()
          .pdas()
          .metadata({ mint: mintAddressNft }),
        assetMasterEdition: metaplexInstance
          .nfts()
          .pdas()
          .masterEdition({ mint: mintAddressNft }),
        assetMint: mintAddressNft,
        assetTokenAccount: nfts[0].tokenAddress!,
        allowlistAuxAccount: SystemProgram.programId,
        sellState: sellState1,
        sellsideEscrowTokenAccount: poolAtaNft,
        systemProgram: SystemProgram.programId,
        tokenProgram: tokenProgramId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc({ skipPreflight: true });

    const { key: sellState2 } = getMMMSellStatePDA(
      program.programId,
      poolKey,
      mintAddressSft,
    );
    await program.methods
      .depositSell({ assetAmount: new anchor.BN(5), allowlistAux: '' })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        assetMetadata: metaplexInstance
          .nfts()
          .pdas()
          .metadata({ mint: mintAddressSft }),
        assetMasterEdition: metaplexInstance
          .nfts()
          .pdas()
          .masterEdition({ mint: mintAddressSft }),
        assetMint: mintAddressSft,
        assetTokenAccount: sfts[0].tokenAddress!,
        allowlistAuxAccount: SystemProgram.programId,
        sellState: sellState2,
        sellsideEscrowTokenAccount: poolAtaSft,
        systemProgram: SystemProgram.programId,
        tokenProgram: tokenProgramId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc({ skipPreflight: true });
  }

  const { key: solEscrowKey } = getMMMBuysideSolEscrowPDA(
    program.programId,
    poolKey,
  );
  if (side === 'both' || side === 'buy') {
    await program.methods
      .solDepositBuy({ paymentAmount: new anchor.BN(10 * LAMPORTS_PER_SOL) })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        buysideSolEscrowAccount: solEscrowKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc({ skipPreflight: true });
  }

  return {
    nft: nfts[0],
    sft: sfts[0],
    extraNft: extraNft[0],
    extraSft: extraSft[0],
    poolAtaNft,
    poolAtaSft,
    poolAtaExtraSft,
    poolAtaExtraNft,
    poolPaymentEscrow: solEscrowKey,
    nftCreator: creator,
    ...poolData,
  };
};

export const createPoolWithExampleOcpDeposits = async (
  program: Program<Mmm>,
  connection: Connection,
  poolArgs: Parameters<typeof createPool>[1],
  side: 'buy' | 'sell' | 'both',
  tokenProgramId: PublicKey,
  nftRecipient?: PublicKey,
  policy?: PublicKey,
) => {
  const creator = Keypair.generate();

  const [depositNft, extraNft] = await Promise.all(
    [poolArgs.owner, nftRecipient ?? poolArgs.owner].map((v) =>
      createTestMintAndTokenOCP(
        connection,
        getKeypair(),
        creator,
        {
          receiver: v,
          closeAccount: true,
        },
        tokenProgramId,
        policy,
      ),
    ),
  );
  const mintAddressNft = depositNft.mintAddress;

  const allowlists = [
    { kind: AllowlistKind.fvca, value: creator.publicKey },
    ...getEmptyAllowLists(5),
  ];
  const poolData = await createPool(program, {
    ...poolArgs,
    allowlists,
  });
  const poolKey = poolData.poolKey;

  const poolAtaNft = await getAssociatedTokenAddress(
    mintAddressNft,
    poolKey,
    true,
  );
  const poolAtaExtraNft = await getAssociatedTokenAddress(
    extraNft.mintAddress,
    poolKey,
    true,
  );

  if (side === 'both' || side === 'sell') {
    const { key: sellState } = getMMMSellStatePDA(
      program.programId,
      poolKey,
      mintAddressNft,
    );
    await program.methods
      .ocpDepositSell({
        assetAmount: new anchor.BN(1),
        allowlistAux: null,
      })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolData.poolKey,
        assetMetadata: depositNft.metadataAddress,
        assetMint: depositNft.mintAddress,
        assetTokenAccount: depositNft.tokenAddress,
        sellsideEscrowTokenAccount: poolAtaNft,
        sellState: sellState,
        allowlistAuxAccount: SystemProgram.programId,

        ocpMintState: depositNft.ocpMintState,
        ocpPolicy: depositNft.ocpPolicy,
        ocpFreezeAuthority: depositNft.ocpFreezeAuth,
        ocpProgram: OCP_PROGRAM_ID,
        cmtProgram: CMT_PROGRAM,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: tokenProgramId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: OCP_COMPUTE_UNITS }),
      ])
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc({ skipPreflight: true });
  }

  const { key: solEscrowKey } = getMMMBuysideSolEscrowPDA(
    program.programId,
    poolKey,
  );
  if (side === 'both' || side === 'buy') {
    await program.methods
      .solDepositBuy({ paymentAmount: new anchor.BN(10 * LAMPORTS_PER_SOL) })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        buysideSolEscrowAccount: solEscrowKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc({ skipPreflight: true });
  }

  return {
    nft: depositNft,
    extraNft,
    poolAtaNft,
    poolAtaExtraNft,
    poolPaymentEscrow: solEscrowKey,
    nftCreator: creator,
    ...poolData,
  };
};

export async function createPoolWithExampleDepositsUmi(
  program: Program<Mmm>,
  connection: Connection,
  kinds: AllowlistKind[],
  poolArgs: Parameters<typeof createPool>[1],
  side: 'buy' | 'sell' | 'both',
  tokenProgramId: PublicKey,
  nftRecipient: PublicKey,
): Promise<PoolData> {
  const umi = (await createUmi('http://127.0.0.1:8899')).use(
    mplTokenMetadata(),
  );

  const mint = generateSigner(umi);
  await createNft(umi, {
    mint,
    tokenOwner: umi.identity.publicKey,
    name: 'test',
    uri: `nft://0.json`,
    sellerFeeBasisPoints: createAmount(100, '%', 2),
    collection: null,
    creators: null,
    splTokenProgram: fromWeb3JsPublicKey(tokenProgramId),
  }).sendAndConfirm(umi, { send: { skipPreflight: true } });

  const creator = generateSigner(umi);

  const token2022Program: UmiProgram = {
    name: 'splToken2022',
    publicKey: publicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
    getErrorFromCode: () => null,
    getErrorFromName: () => null,
    isOnCluster: () => true,
  };
  umi.programs.add(token2022Program);

  const kindToUse = kinds[0];

  const nfts: Nft[] = [];
  const sfts: Nft[] = [];
  const extraNfts: Nft[] = [];
  const extraSfts: Nft[] = [];
  let allowlistValue = null;

  try {
    switch (kindToUse) {
      case AllowlistKind.any:
      case AllowlistKind.mint:
        nfts.push(
          ...(await umiMintNfts(
            umi,
            {
              nftNumber: 1,
              recipient: fromWeb3JsPublicKey(poolArgs.owner),
              creators: [
                { address: creator.publicKey, share: 100, verified: false },
              ],
            },
            tokenProgramId,
          )),
        );
        sfts.push(
          ...(await umiMintNfts(
            umi,
            {
              nftNumber: 1,
              recipient: fromWeb3JsPublicKey(poolArgs.owner),
              creators: [
                { address: creator.publicKey, share: 100, verified: false },
              ],
              sftAmount: 10,
            },
            tokenProgramId,
          )),
        );
        extraNfts.push(
          ...(await umiMintNfts(
            umi,
            {
              nftNumber: 1,
              recipient: fromWeb3JsPublicKey(nftRecipient),
              creators: [
                { address: creator.publicKey, share: 100, verified: false },
              ],
            },
            tokenProgramId,
          )),
        );
        extraSfts.push(
          ...(await umiMintNfts(
            umi,
            {
              nftNumber: 1,
              recipient: fromWeb3JsPublicKey(nftRecipient),
              creators: [
                { address: creator.publicKey, share: 100, verified: false },
              ],
              sftAmount: 10,
            },
            tokenProgramId,
          )),
        );
        break;
      default:
        console.log("don't know how to handle this kind");
        throw new Error(
          `unsupported allowlist kind passed while minting test nfts: ${kindToUse}`,
        );
    }
  } catch (e) {
    console.log(`error minting nfts: ${e}`);
  }

  const mintAddressNft = toWeb3JsPublicKey(nfts[0].mintAddress);
  const metadataAddressNft = toWeb3JsPublicKey(nfts[0].metadataAddress);
  const editionAddressNft = toWeb3JsPublicKey(nfts[0].masterEditionAddress);
  const mintAddressSft = toWeb3JsPublicKey(sfts[0].mintAddress);
  const metadataAddressSft = toWeb3JsPublicKey(sfts[0].metadataAddress);
  const editionAddressSft = toWeb3JsPublicKey(sfts[0].masterEditionAddress);

  const allowlists = fillAllowlists(
    kinds
      .map((kind) => {
        switch (kind) {
          case AllowlistKind.fvca:
            return [{ kind: AllowlistKind.fvca, value: allowlistValue! }];
          case AllowlistKind.mcc:
            return [{ kind: AllowlistKind.mcc, value: allowlistValue! }];
          case AllowlistKind.mint:
            return [
              { kind: AllowlistKind.mint, value: mintAddressNft },
              { kind: AllowlistKind.mint, value: mintAddressSft },
              {
                kind: AllowlistKind.mint,
                value: toWeb3JsPublicKey(extraNfts[0].mintAddress),
              },
              {
                kind: AllowlistKind.mint,
                value: toWeb3JsPublicKey(extraSfts[0].mintAddress),
              },
            ];
          case AllowlistKind.metadata:
            return [
              {
                kind: AllowlistKind.metadata,
                value: toWeb3JsPublicKey(nfts[0].metadataAddress),
              },
            ];
          case AllowlistKind.any:
            return [{ kind: AllowlistKind.any, value: PublicKey.default }];
          default:
            throw new Error(
              `unsupported allowlist kind while building allowlist: ${kind}`,
            );
        }
      })
      .flat(),
    6,
  );

  const poolData = await createPool(program, {
    ...poolArgs,
    allowlists,
  });
  const poolKey = poolData.poolKey;

  const poolAtaNft = await getAssociatedTokenAddress(
    mintAddressNft,
    poolKey,
    true,
    tokenProgramId,
  );
  const poolAtaSft = await getAssociatedTokenAddress(
    mintAddressSft,
    poolKey,
    true,
    tokenProgramId,
  );
  const poolAtaExtraNft = await getAssociatedTokenAddress(
    toWeb3JsPublicKey(extraNfts[0].mintAddress),
    poolKey,
    true,
    tokenProgramId,
  );
  const poolAtaExtraSft = await getAssociatedTokenAddress(
    toWeb3JsPublicKey(extraSfts[0].mintAddress),
    poolKey,
    true,
    tokenProgramId,
  );

  if (side === 'both' || side === 'sell') {
    const { key: sellState1 } = getMMMSellStatePDA(
      program.programId,
      poolKey,
      mintAddressNft,
    );
    await program.methods
      .depositSell({ assetAmount: new anchor.BN(1), allowlistAux: '' })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        assetMetadata: metadataAddressNft,
        assetMasterEdition: editionAddressNft,
        assetMint: mintAddressNft,
        assetTokenAccount: nfts[0].tokenAddress!,
        allowlistAuxAccount: SystemProgram.programId,
        sellState: sellState1,
        sellsideEscrowTokenAccount: poolAtaNft,
        systemProgram: SystemProgram.programId,
        tokenProgram: tokenProgramId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc({ skipPreflight: true });

    const { key: sellState2 } = getMMMSellStatePDA(
      program.programId,
      poolKey,
      mintAddressSft,
    );
    await program.methods
      .depositSell({ assetAmount: new anchor.BN(5), allowlistAux: '' })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        assetMetadata: metadataAddressSft,
        assetMasterEdition: editionAddressSft,
        assetMint: mintAddressSft,
        assetTokenAccount: sfts[0].tokenAddress!,
        allowlistAuxAccount: SystemProgram.programId,
        sellState: sellState2,
        sellsideEscrowTokenAccount: poolAtaSft,
        systemProgram: SystemProgram.programId,
        tokenProgram: tokenProgramId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc({ skipPreflight: true });
  }

  const { key: solEscrowKey } = getMMMBuysideSolEscrowPDA(
    program.programId,
    poolKey,
  );
  if (side === 'both' || side === 'buy') {
    await program.methods
      .solDepositBuy({ paymentAmount: new anchor.BN(10 * LAMPORTS_PER_SOL) })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        buysideSolEscrowAccount: solEscrowKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc({ skipPreflight: true });
  }

  return {
    nft: nfts[0],
    sft: sfts[0],
    extraNft: extraNfts[0],
    extraSft: extraSfts[0],
    poolAtaNft: poolAtaNft,
    poolAtaSft: poolAtaSft,
    poolAtaExtraSft,
    poolAtaExtraNft,
    poolPaymentEscrow: solEscrowKey,
    nftCreator: toWeb3JsKeypair(creator),
    ...poolData,
  };
}

export const createPoolWithExampleMip1Deposits = async (
  program: Program<Mmm>,
  connection: Connection,
  poolArgs: Parameters<typeof createPool>[1],
  side: 'buy' | 'sell' | 'both',
  nftCreator: Keypair,
  tokenProgramId: PublicKey,
  nftRecipient?: PublicKey,
  ruleset?: PublicKey,
) => {
  const [depositNft, extraNft] = await Promise.all(
    [poolArgs.owner, nftRecipient ?? poolArgs.owner].map((v) =>
      createProgrammableNft(connection, nftCreator, v, tokenProgramId, ruleset),
    ),
  );
  const mintAddressNft = depositNft.mintAddress;

  const allowlists = [
    { kind: AllowlistKind.fvca, value: nftCreator.publicKey },
    ...getEmptyAllowLists(5),
  ];
  const poolData = await createPool(program, {
    ...poolArgs,
    allowlists,
  });
  const poolKey = poolData.poolKey;

  const poolAtaNft = await getAssociatedTokenAddress(
    mintAddressNft,
    poolKey,
    true,
  );
  const poolAtaExtraNft = await getAssociatedTokenAddress(
    extraNft.mintAddress,
    poolKey,
    true,
  );

  if (side === 'both' || side === 'sell') {
    const { key: sellState } = getMMMSellStatePDA(
      program.programId,
      poolKey,
      mintAddressNft,
    );
    await program.methods
      .mip1DepositSell({
        assetAmount: new anchor.BN(1),
        allowlistAux: null,
      })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolData.poolKey,
        assetMetadata: depositNft.metadataAddress,
        assetMint: depositNft.mintAddress,
        assetTokenAccount: depositNft.tokenAddress,
        assetMasterEdition: depositNft.masterEditionAddress,
        sellsideEscrowTokenAccount: poolAtaNft,
        sellState: sellState,
        allowlistAuxAccount: SystemProgram.programId,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        authorizationRules: ruleset ?? TOKEN_METADATA_PROGRAM_ID,
        authorizationRulesProgram: AUTHORIZATION_RULES_PROGRAM_ID,
        ownerTokenRecord: getTokenRecordPDA(
          depositNft.mintAddress,
          depositNft.tokenAddress,
        ).key,
        destinationTokenRecord: getTokenRecordPDA(
          depositNft.mintAddress,
          poolAtaNft,
        ).key,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: tokenProgramId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: MIP1_COMPUTE_UNITS }),
      ])
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc({ skipPreflight: true });
  }

  const { key: solEscrowKey } = getMMMBuysideSolEscrowPDA(
    program.programId,
    poolKey,
  );
  if (side === 'both' || side === 'buy') {
    await program.methods
      .solDepositBuy({ paymentAmount: new anchor.BN(10 * LAMPORTS_PER_SOL) })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        buysideSolEscrowAccount: solEscrowKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc({ skipPreflight: true });
  }

  return {
    nft: depositNft,
    extraNft,
    poolAtaNft,
    poolAtaExtraNft,
    poolPaymentEscrow: solEscrowKey,
    nftCreator,
    ...poolData,
  };
};
