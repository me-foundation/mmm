import {
  CMT_PROGRAM,
  PROGRAM_ID as OCP_PROGRAM_ID,
} from '@magiceden-oss/open_creator_protocol';
import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
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
import { createTestMintAndTokenOCP } from './ocp';
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import { PROGRAM_ID as AUTHORIZATION_RULES_PROGRAM_ID } from '@metaplex-foundation/mpl-token-auth-rules';

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
  nftRecipient?: PublicKey,
) => {
  const metaplexInstance = getMetaplexInstance(connection);
  const creator = Keypair.generate();
  const [nfts, sfts, extraNft, extraSft, allowlistValue] = await (async () => {
    const kindToUse = kinds[0];
    switch (kindToUse) {
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
  );
  const poolAtaSft = await getAssociatedTokenAddress(
    mintAddressSft,
    poolKey,
    true,
  );
  const poolAtaExtraNft = await getAssociatedTokenAddress(
    extraNft[0].mintAddress,
    poolKey,
    true,
  );
  const poolAtaExtraSft = await getAssociatedTokenAddress(
    extraSft[0].mintAddress,
    poolKey,
    true,
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
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc();

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
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([...(poolArgs.cosigner ? [poolArgs.cosigner] : [])])
      .rpc();
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

export const createPoolWithExampleMip1Deposits = async (
  program: Program<Mmm>,
  connection: Connection,
  poolArgs: Parameters<typeof createPool>[1],
  side: 'buy' | 'sell' | 'both',
  nftCreator: Keypair,
  nftRecipient?: PublicKey,
  ruleset?: PublicKey,
) => {
  const [depositNft, extraNft] = await Promise.all(
    [poolArgs.owner, nftRecipient ?? poolArgs.owner].map((v) =>
      createProgrammableNft(connection, nftCreator, v, ruleset),
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
        tokenProgram: TOKEN_PROGRAM_ID,
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
