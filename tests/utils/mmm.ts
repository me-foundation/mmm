import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  AllowlistKind,
  CurveKind,
  getMMMBuysideSolEscrowPDA,
  getMMMPoolPDA,
  getMMMSellStatePDA,
  Mmm,
} from '../../sdk/src';
import { getEmptyAllowLists } from './generic';
import { getMetaplexInstance, mintCollection, mintNfts } from './nfts';

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
  kind: AllowlistKind,
  poolArgs: Parameters<typeof createPool>[1],
  side: 'buy' | 'sell' | 'both',
  nftRecipient?: PublicKey,
) => {
  const metaplexInstance = getMetaplexInstance(connection);
  const [nfts, sfts, extraNft, extraSft, allowlistValue] = await(async () => {
    switch (kind) {
      case AllowlistKind.mint:
        return Promise.all([
          mintNfts(connection, {
            numNfts: 1,
          }),
          mintNfts(connection, {
            numNfts: 1,
            sftAmount: 10,
          }),
          mintNfts(connection, {
            numNfts: 1,
            recipient: nftRecipient,
          }),
          mintNfts(connection, {
            numNfts: 1,
            sftAmount: 10,
            recipient: nftRecipient,
          }),
          null,
        ]);
      case AllowlistKind.fvca:
        const creator = Keypair.generate();
        return Promise.all([
          mintNfts(connection, {
            numNfts: 1,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
          }),
          mintNfts(connection, {
            numNfts: 1,
            creators: [
              { address: creator.publicKey, share: 100, authority: creator },
            ],
            sftAmount: 10,
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
          }),
          mintNfts(connection, {
            numNfts: 1,
            sftAmount: 10,
            collectionAddress: collection.mintAddress,
            verifyCollection: true,
          }),
          mintNfts(connection, {
            numNfts: 1,
            collectionAddress: collection.mintAddress,
            verifyCollection: true,
            recipient: nftRecipient,
          }),
          mintNfts(connection, {
            numNfts: 1,
            sftAmount: 10,
            collectionAddress: collection.mintAddress,
            verifyCollection: true,
            recipient: nftRecipient,
          }),
          collection.mintAddress,
        ]);
      default:
        throw new Error('unsupported allowlist kind');
    }
  })();

  const mintAddressNft = nfts[0].mintAddress;
  const mintAddressSft = sfts[0].mintAddress;

  const allowlists = (() => {
    switch (kind) {
      case AllowlistKind.fvca:
        return [
          { kind: AllowlistKind.fvca, value: allowlistValue! },
          ...getEmptyAllowLists(5),
        ];
      case AllowlistKind.mcc:
        return [
          { kind: AllowlistKind.mcc, value: allowlistValue! },
          ...getEmptyAllowLists(5),
        ];
      case AllowlistKind.mint:
        return [
          { kind: AllowlistKind.mint, value: mintAddressNft },
          { kind: AllowlistKind.mint, value: mintAddressSft },
          { kind: AllowlistKind.mint, value: extraNft[0].mintAddress },
          { kind: AllowlistKind.mint, value: extraSft[0].mintAddress },
          ...getEmptyAllowLists(2),
        ];
    }
  })();

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
    ...poolData,
  };
};
