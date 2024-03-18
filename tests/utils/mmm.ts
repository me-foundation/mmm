import {
  CMT_PROGRAM,
  PROGRAM_ID as OCP_PROGRAM_ID,
} from '@magiceden-oss/open_creator_protocol';
import {
  generateSigner,
  OptionOrNullable,
  publicKey,
  some,
  PublicKey as UmiPublicKey,
  Program as UmiProgram,
  none,
  createSignerFromKeypair,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-tests';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
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
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
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
  getM2BuyerSharedEscrow,
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
import { createProgrammableNftUmi } from './mip1';
import {
  createTestGroupMintExt,
  createTestMintAndTokenT22VanillaExt,
  getMetaplexInstance,
  mintCollection,
  mintNfts,
} from './nfts';
import { umiMintNfts, Nft, umiMintCollection } from './umiNfts';
import { createTestMintAndTokenOCP } from './ocp';

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
);

export interface PoolData {
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
  await builder.rpc({ skipPreflight: true });

  return { referral, uuid, poolKey };
};

// create pool for T22 extension
export const createPoolWithExampleT22ExtDeposits = async (
  program: Program<Mmm>,
  connection: Connection,
  payer: Keypair,
  side: 'buy' | 'sell' | 'both' | 'none',
  poolArgs: Parameters<typeof createPool>[1],
  sharedEscrow?: boolean,
  sharedEscrowCount?: number,
) => {
  const { groupAddress } = await createTestGroupMintExt(connection, payer);
  const { mint, recipientTokenAccount } =
    await createTestMintAndTokenT22VanillaExt(
      connection,
      payer,
      poolArgs.owner,
      groupAddress,
    );

  const poolData = await createPool(program, {
    allowlists: [
      {
        kind: AllowlistKind.metadata,
        value: mint,
      },
      {
        kind: AllowlistKind.group,
        value: groupAddress,
      },
      ...getEmptyAllowLists(4),
    ],
    ...poolArgs,
  });

  const poolAta = await getAssociatedTokenAddress(
    mint,
    poolData.poolKey,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  const { key: sellState } = getMMMSellStatePDA(
    program.programId,
    poolData.poolKey,
    mint,
  );

  if (!sharedEscrow && (side === 'both' || side === 'sell')) {
    await program.methods
      .extDepositSell({
        assetAmount: new anchor.BN(1),
        allowlistAux: 'example.com',
      })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey!,
        pool: poolData.poolKey,
        assetMint: mint,
        assetTokenAccount: recipientTokenAccount,
        sellsideEscrowTokenAccount: poolAta,
        sellState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([poolArgs.cosigner!])
      .rpc({ skipPreflight: true });
  }

  const { key: solEscrowKey } = getMMMBuysideSolEscrowPDA(
    program.programId,
    poolData.poolKey,
  );

  if (!sharedEscrow && (side === 'both' || side === 'buy')) {
    await program.methods
      .solDepositBuy({ paymentAmount: new anchor.BN(10 * LAMPORTS_PER_SOL) })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolData.poolKey,
        buysideSolEscrowAccount: solEscrowKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc({ skipPreflight: true });
  }

  if (sharedEscrow) {
    const sharedEscrowAccount = getM2BuyerSharedEscrow(poolArgs.owner).key;
    await program.methods
      .setSharedEscrow({
        sharedEscrowCount: new anchor.BN(sharedEscrowCount || 2),
      })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolData.poolKey,
        sharedEscrowAccount,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc();
  }

  return {
    mint,
    recipientTokenAccount,
    poolData,
    poolAta,
    sellState,
    solEscrowKey,
    groupAddress,
  };
};

export const createPoolWithExampleDeposits = async (
  program: Program<Mmm>,
  connection: Connection,
  kinds: AllowlistKind[],
  poolArgs: Parameters<typeof createPool>[1],
  side: 'buy' | 'sell' | 'both',
  tokenProgramId: PublicKey,
  nftRecipient?: PublicKey,
  sharedEscrow?: boolean,
  sharedEscrowCount?: number,
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

  if (!sharedEscrow && (side === 'both' || side === 'sell')) {
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
  if (!sharedEscrow && (side === 'both' || side === 'buy')) {
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

  if (sharedEscrow) {
    const sharedEscrowAccount = getM2BuyerSharedEscrow(poolArgs.owner).key;
    await program.methods
      .setSharedEscrow({
        sharedEscrowCount: new anchor.BN(sharedEscrowCount || 2),
      })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        sharedEscrowAccount,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc();
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
  nftRecipient?: PublicKey,
  policy?: PublicKey,
  sharedEscrow?: boolean,
  sharedEscrowCount?: number,
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

  if (!sharedEscrow && (side === 'both' || side === 'sell')) {
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
        tokenProgram: TOKEN_PROGRAM_ID,
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
  if (!sharedEscrow && (side === 'both' || side === 'buy')) {
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

  if (sharedEscrow) {
    const sharedEscrowAccount = getM2BuyerSharedEscrow(poolArgs.owner).key;
    await program.methods
      .setSharedEscrow({
        sharedEscrowCount: new anchor.BN(sharedEscrowCount || 2),
      })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        sharedEscrowAccount,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc();
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
  kinds: AllowlistKind[],
  poolArgs: Parameters<typeof createPool>[1],
  side: 'buy' | 'sell' | 'both',
  tokenProgramId: PublicKey,
  nftRecipient: PublicKey,
): Promise<PoolData> {
  const umi = (await createUmi('http://127.0.0.1:8899')).use(
    mplTokenMetadata(),
  );

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
  let allowlistValue: PublicKey;
  let collection: Nft | null = null;

  try {
    // Mint NFTs
    if (kindToUse === AllowlistKind.mcc) {
      // Mint the collection parent.
      collection = (
        await umiMintCollection(
          umi,
          {
            numNfts: 0,
            verifyCollection: false,
            legacy: true,
          },
          tokenProgramId,
        )
      ).collection;
    }

    nfts.push(
      ...(await umiMintNfts(
        umi,
        {
          numNfts: 1,
          recipient: fromWeb3JsPublicKey(poolArgs.owner),
          creatorSigner: creator,
          creators: [
            { address: creator.publicKey, share: 100, verified: false },
          ],
          verifyCollection: kindToUse === AllowlistKind.mcc, // only verify collection if we're using mcc
          collectionAddress: collection ? collection.mintAddress : undefined,
        },
        tokenProgramId,
      )),
    );
    sfts.push(
      ...(await umiMintNfts(
        umi,
        {
          numNfts: 1,
          recipient: fromWeb3JsPublicKey(poolArgs.owner),
          creatorSigner: creator,
          creators: [
            { address: creator.publicKey, share: 100, verified: false },
          ],
          sftAmount: 10,
          verifyCollection: kindToUse === AllowlistKind.mcc,
          collectionAddress: collection ? collection.mintAddress : undefined,
        },
        tokenProgramId,
      )),
    );
    extraNfts.push(
      ...(await umiMintNfts(
        umi,
        {
          numNfts: 1,
          recipient: fromWeb3JsPublicKey(nftRecipient),
          creators: [
            { address: creator.publicKey, share: 100, verified: false },
          ],
          creatorSigner: creator,
          verifyCollection: kindToUse === AllowlistKind.mcc,
          collectionAddress: collection ? collection.mintAddress : undefined,
        },
        tokenProgramId,
      )),
    );
    extraSfts.push(
      ...(await umiMintNfts(
        umi,
        {
          numNfts: 1,
          recipient: fromWeb3JsPublicKey(nftRecipient),
          creators: [
            { address: creator.publicKey, share: 100, verified: false },
          ],
          creatorSigner: creator,
          sftAmount: 10,
          verifyCollection: kindToUse === AllowlistKind.mcc,
          collectionAddress: collection ? collection.mintAddress : undefined,
        },
        tokenProgramId,
      )),
    );

    switch (kindToUse) {
      case AllowlistKind.any:
      case AllowlistKind.mint:
        allowlistValue = PublicKey.default;
        break;
      case AllowlistKind.fvca:
        allowlistValue = toWeb3JsPublicKey(creator.publicKey);
        break;
      case AllowlistKind.mcc:
        allowlistValue = toWeb3JsPublicKey(collection!.mintAddress);
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
  poolArgs: Parameters<typeof createPool>[1],
  side: 'buy' | 'sell' | 'both',
  nftCreator: Keypair,
  tokenProgramId: PublicKey,
  nftRecipient?: PublicKey,
  ruleset?: PublicKey,
  sharedEscrow?: boolean,
  sharedEscrowCount?: number,
) => {
  const umi = (await createUmi('http://127.0.0.1:8899')).use(
    mplTokenMetadata(),
  );

  const token2022Program: UmiProgram = {
    name: 'splToken2022',
    publicKey: publicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
    getErrorFromCode: () => null,
    getErrorFromName: () => null,
    isOnCluster: () => true,
  };

  umi.programs.add(token2022Program);

  const creatorSigner = createSignerFromKeypair(
    umi,
    fromWeb3JsKeypair(nftCreator),
  );

  let rs: OptionOrNullable<UmiPublicKey>;
  if (ruleset) {
    rs = some(fromWeb3JsPublicKey(ruleset));
  } else {
    rs = none();
  }

  const [depositNft, extraNft] = await Promise.all(
    [poolArgs.owner, nftRecipient ?? poolArgs.owner].map((v) =>
      createProgrammableNftUmi(umi, creatorSigner, v, tokenProgramId, rs),
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
    tokenProgramId,
  );
  const poolAtaExtraNft = await getAssociatedTokenAddress(
    extraNft.mintAddress,
    poolKey,
    true,
    tokenProgramId,
  );

  if (!sharedEscrow && (side === 'both' || side === 'sell')) {
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
  if (!sharedEscrow && (side === 'both' || side === 'buy')) {
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

  if (sharedEscrow) {
    const sharedEscrowAccount = getM2BuyerSharedEscrow(poolArgs.owner).key;
    await program.methods
      .setSharedEscrow({
        sharedEscrowCount: new anchor.BN(sharedEscrowCount || 2),
      })
      .accountsStrict({
        owner: poolArgs.owner,
        cosigner: poolArgs.cosigner?.publicKey ?? poolArgs.owner,
        pool: poolKey,
        sharedEscrowAccount,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc();
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
