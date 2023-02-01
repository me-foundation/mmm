import * as anchor from '@project-serum/anchor';
import {
  getAssociatedTokenAddress,
  getAccount as getTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { assert } from 'chai';
import {
  Mmm,
  AllowlistKind,
  getMMMBuysideSolEscrowPDA,
  getMMMSellStatePDA,
  IDL,
  MMMProgramID,
  CurveKind,
  getTokenRecordPDA,
} from '../sdk/src';
import {
  airdrop,
  createDefaultTokenAuthorizationRules,
  createPool,
  createPoolWithExampleMip1Deposits,
  createProgrammableNft,
  getEmptyAllowLists,
  getSellStatePDARent,
  getTokenAccountRent,
  getTokenRecordRent,
  MIP1_COMPUTE_UNITS,
  sendAndAssertTx,
  SIGNATURE_FEE_LAMPORTS,
} from './utils';
import { PROGRAM_ID as AUTH_RULES_PROGRAM_ID } from '@metaplex-foundation/mpl-token-auth-rules';
import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import { before } from 'mocha';

describe('mmm-mip1', () => {
  const { connection } = anchor.AnchorProvider.env();
  const wallet = new anchor.Wallet(Keypair.generate());
  const nftCreator = Keypair.generate();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: 'processed',
  });
  const program = new anchor.Program(
    IDL,
    MMMProgramID,
    provider,
  ) as anchor.Program<Mmm>;
  const cosigner = Keypair.generate();
  let defaultRules: PublicKey;
  const DEFAULT_ACCOUNTS = {
    tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    authorizationRulesProgram: AUTH_RULES_PROGRAM_ID,
    instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    rent: SYSVAR_RENT_PUBKEY,
  };

  before(async () => {
    await airdrop(connection, nftCreator.publicKey, 10);
    const rulesRes = await createDefaultTokenAuthorizationRules(
      connection,
      nftCreator,
      'test',
    );
    defaultRules = rulesRes.ruleSetAddress;
  });

  beforeEach(async () => {
    await airdrop(connection, wallet.publicKey, 50);
  });

  it('can deposit and withdraw mip1 NFTs - happy path', async () => {
    const nftRes = await createProgrammableNft(
      connection,
      nftCreator,
      wallet.publicKey,
      defaultRules,
    );

    const poolData = await createPool(program, {
      owner: wallet.publicKey,
      cosigner,
      allowlists: [
        { value: nftCreator.publicKey, kind: AllowlistKind.fvca },
        ...getEmptyAllowLists(5),
      ],
    });
    const poolAta = await getAssociatedTokenAddress(
      nftRes.mintAddress,
      poolData.poolKey,
      true,
    );

    const { key: sellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      nftRes.mintAddress,
    );

    assert.equal(await connection.getBalance(poolAta), 0);
    assert.equal(await connection.getBalance(sellState), 0);
    let poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);

    await program.methods
      .mip1DepositSell({
        assetAmount: new anchor.BN(1),
        allowlistAux: null,
      })
      .accountsStrict({
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        pool: poolData.poolKey,
        assetMetadata: nftRes.metadataAddress,
        assetMint: nftRes.mintAddress,
        assetMasterEdition: nftRes.masterEditionAddress,
        assetTokenAccount: nftRes.tokenAddress,
        sellsideEscrowTokenAccount: poolAta,
        sellState,
        allowlistAuxAccount: SystemProgram.programId,
        authorizationRules: defaultRules,
        ownerTokenRecord: getTokenRecordPDA(
          nftRes.mintAddress,
          nftRes.tokenAddress,
        ).key,
        destinationTokenRecord: getTokenRecordPDA(nftRes.mintAddress, poolAta)
          .key,

        ...DEFAULT_ACCOUNTS,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: MIP1_COMPUTE_UNITS }),
      ])
      .signers([cosigner])
      .rpc({ skipPreflight: true });

    const [poolTokenEscrow, sellStateAccountInfo] = await Promise.all([
      getTokenAccount(connection, poolAta),
      program.account.sellState.fetch(sellState),
    ]);
    assert.equal(Number(poolTokenEscrow.amount), 1);
    assert.equal(poolTokenEscrow.owner.toBase58(), poolData.poolKey.toBase58());
    assert.equal(
      poolTokenEscrow.mint.toBase58(),
      nftRes.mintAddress.toBase58(),
    );
    assert.equal(
      sellStateAccountInfo.assetMint.toBase58(),
      nftRes.mintAddress.toBase58(),
    );
    assert.equal(sellStateAccountInfo.assetAmount.toNumber(), 1);
    poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
    assert.equal(await connection.getBalance(nftRes.tokenAddress), 0);

    const { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
      program.programId,
      poolData.poolKey,
    );
    await program.methods
      .mip1WithdrawSell({ assetAmount: new anchor.BN(1), allowlistAux: null })
      .accountsStrict({
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        pool: poolData.poolKey,
        assetMint: nftRes.mintAddress,
        assetMetadata: nftRes.metadataAddress,
        assetMasterEdition: nftRes.masterEditionAddress,
        assetTokenAccount: nftRes.tokenAddress,
        sellsideEscrowTokenAccount: poolAta,
        buysideSolEscrowAccount,
        allowlistAuxAccount: SystemProgram.programId,
        sellState,
        authorizationRules: defaultRules,
        ownerTokenRecord: getTokenRecordPDA(nftRes.mintAddress, poolAta).key,
        destinationTokenRecord: getTokenRecordPDA(
          nftRes.mintAddress,
          nftRes.tokenAddress,
        ).key,

        ...DEFAULT_ACCOUNTS,
      })
      .signers([cosigner])
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: MIP1_COMPUTE_UNITS }),
      ])
      .rpc({ skipPreflight: true });

    const ownerTokenAccount = await getTokenAccount(
      connection,
      nftRes.tokenAddress,
    );
    assert.equal(Number(ownerTokenAccount.amount), 1);
    assert.equal(
      ownerTokenAccount.owner.toBase58(),
      wallet.publicKey.toBase58(),
    );
    assert.equal(
      ownerTokenAccount.mint.toBase58(),
      nftRes.mintAddress.toBase58(),
    );
    // pool should now be closed as a consequence of having no NFTs and no payment
    assert.equal(await connection.getBalance(poolData.poolKey), 0);
  });

  it('can fulfill sell - happy path', async () => {
    const buyer = Keypair.generate();
    const [poolData] = await Promise.all([
      createPoolWithExampleMip1Deposits(
        program,
        connection,
        {
          owner: wallet.publicKey,
          cosigner,
          spotPrice: new anchor.BN(1.5 * LAMPORTS_PER_SOL),
          curveDelta: new anchor.BN(500),
          curveType: CurveKind.exp,
          reinvestFulfillSell: false,
        },
        'sell',
        nftCreator,
        undefined,
        defaultRules,
      ),
      airdrop(connection, buyer.publicKey, 10),
    ]);

    const buyerNftAtaAddress = await getAssociatedTokenAddress(
      poolData.nft.mintAddress,
      buyer.publicKey,
    );
    assert.equal(await connection.getBalance(buyerNftAtaAddress), 0);

    const [
      initBuyerBalance,
      initWalletBalance,
      initCreatorBalance,
      initReferralBalance,
      tokenAccountRent,
      sellStateAccountRent,
      poolAccountRent,
    ] = await Promise.all([
      connection.getBalance(buyer.publicKey),
      connection.getBalance(wallet.publicKey),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      getTokenAccountRent(connection),
      getSellStatePDARent(connection),
      connection.getBalance(poolData.poolKey),
    ]);

    const { key: sellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      poolData.nft.mintAddress,
    );

    // sale price should be 1.5 * 1.05 = 1.575 SOL
    // with taker fee and royalties should be 1.575 * (1 + 0.02 + 0.015) = 1.630125 SOL
    const tx = await program.methods
      .solMip1FulfillSell({
        assetAmount: new anchor.BN(1),
        maxPaymentAmount: new anchor.BN(1.630125 * LAMPORTS_PER_SOL),
        allowlistAux: null,
        makerFeeBp: 150,
        takerFeeBp: 200,
      })
      .accountsStrict({
        payer: buyer.publicKey,
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        referral: poolData.referral.publicKey,
        pool: poolData.poolKey,
        buysideSolEscrowAccount: poolData.poolPaymentEscrow,
        assetMetadata: poolData.nft.metadataAddress,
        assetMint: poolData.nft.mintAddress,
        assetMasterEdition: poolData.nft.masterEditionAddress,
        sellsideEscrowTokenAccount: poolData.poolAtaNft,
        payerAssetAccount: buyerNftAtaAddress,
        allowlistAuxAccount: SystemProgram.programId,
        sellState,
        authorizationRules: defaultRules,
        ownerTokenRecord: getTokenRecordPDA(
          poolData.nft.mintAddress,
          poolData.poolAtaNft,
        ).key,
        destinationTokenRecord: getTokenRecordPDA(
          poolData.nft.mintAddress,
          buyerNftAtaAddress,
        ).key,
        ...DEFAULT_ACCOUNTS,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: MIP1_COMPUTE_UNITS,
        }),
      ])
      .remainingAccounts([
        {
          pubkey: poolData.nftCreator.publicKey,
          isSigner: false,
          isWritable: true,
        },
      ])
      .transaction();

    const blockhashData = await connection.getLatestBlockhash();
    tx.feePayer = buyer.publicKey;
    tx.recentBlockhash = blockhashData.blockhash;
    tx.partialSign(cosigner, buyer);
    await sendAndAssertTx(connection, tx, blockhashData, false);

    const expectedTakerFees = 1.575 * LAMPORTS_PER_SOL * 0.02;
    const expectedMakerFees = 1.575 * LAMPORTS_PER_SOL * 0.015;
    const expectedReferralFees = expectedMakerFees + expectedTakerFees;
    const expectedRoyalties = 1.575 * LAMPORTS_PER_SOL * 0.015;
    const [
      buyerBalance,
      walletBalance,
      creatorBalance,
      referralBalance,
      poolBalance,
      buyerAta,
      tokenRecordRent,
    ] = await Promise.all([
      connection.getBalance(buyer.publicKey),
      connection.getBalance(wallet.publicKey),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      connection.getBalance(poolData.poolKey),
      getTokenAccount(connection, buyerNftAtaAddress),
      getTokenRecordRent(connection),
    ]);

    assert.equal(
      buyerBalance,
      initBuyerBalance -
        1.575 * LAMPORTS_PER_SOL -
        SIGNATURE_FEE_LAMPORTS * 2 -
        tokenAccountRent -
        tokenRecordRent -
        expectedTakerFees -
        expectedRoyalties,
    );
    assert.equal(
      walletBalance,
      initWalletBalance +
        1.575 * LAMPORTS_PER_SOL +
        poolAccountRent + // pool is closed because it is empty
        tokenAccountRent +
        sellStateAccountRent -
        expectedMakerFees,
    );
    assert.equal(creatorBalance, initCreatorBalance + expectedRoyalties);
    assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
    assert.equal(poolBalance, 0);
    assert.equal(Number(buyerAta.amount), 1);
    assert.equal(buyerAta.owner.toBase58(), buyer.publicKey.toBase58());
    assert.equal(buyerAta.mint.toBase58(), poolData.nft.mintAddress.toBase58());
  });

  it('can fulfill buy - happy path', async () => {
    const seller = Keypair.generate();
    const [poolData] = await Promise.all([
      createPoolWithExampleMip1Deposits(
        program,
        connection,
        {
          owner: wallet.publicKey,
          cosigner,
          spotPrice: new anchor.BN(2.2 * LAMPORTS_PER_SOL),
          curveDelta: new anchor.BN(1 * LAMPORTS_PER_SOL),
          curveType: CurveKind.linear,
          reinvestFulfillBuy: true,
        },
        'buy',
        nftCreator,
        seller.publicKey,
        defaultRules,
      ),
      airdrop(connection, seller.publicKey, 10),
    ]);

    const [
      initSellerBalance,
      initPaymentEscrowBalance,
      initCreatorBalance,
      initReferralBalance,
      sellStateAccountRent,
    ] = await Promise.all([
      connection.getBalance(seller.publicKey),
      connection.getBalance(poolData.poolPaymentEscrow),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      getSellStatePDARent(connection),
    ]);

    const { key: sellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      poolData.extraNft.mintAddress,
    );

    const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
      poolData.extraNft.mintAddress,
      wallet.publicKey,
    );

    // sale price should be 2.2 SOL
    // with taker fee and royalties should be 2.2 * (1 - 0.005 - 0.015) = 2.156 SOL
    const tx = await program.methods
      .solMip1FulfillBuy({
        assetAmount: new anchor.BN(1),
        minPaymentAmount: new anchor.BN(2.156 * LAMPORTS_PER_SOL),
        allowlistAux: null,
        makerFeeBp: 350,
        takerFeeBp: 50,
      })
      .accountsStrict({
        payer: seller.publicKey,
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        referral: poolData.referral.publicKey,
        pool: poolData.poolKey,
        buysideSolEscrowAccount: poolData.poolPaymentEscrow,
        assetMetadata: poolData.extraNft.metadataAddress,
        assetMint: poolData.extraNft.mintAddress,
        assetMasterEdition: poolData.extraNft.masterEditionAddress,
        payerAssetAccount: poolData.extraNft.tokenAddress,
        sellsideEscrowTokenAccount: poolData.poolAtaExtraNft,
        ownerTokenAccount: ownerExtraNftAtaAddress,
        allowlistAuxAccount: SystemProgram.programId,
        sellState,
        tokenOwnerTokenRecord: getTokenRecordPDA(
          poolData.extraNft.mintAddress,
          poolData.extraNft.tokenAddress,
        ).key,
        poolTokenRecord: getTokenRecordPDA(
          poolData.extraNft.mintAddress,
          poolData.poolAtaExtraNft,
        ).key,
        poolOwnerTokenRecord: getTokenRecordPDA(
          poolData.extraNft.mintAddress,
          ownerExtraNftAtaAddress,
        ).key,
        authorizationRules: defaultRules,
        ...DEFAULT_ACCOUNTS,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: MIP1_COMPUTE_UNITS }),
      ])
      .remainingAccounts([
        {
          pubkey: poolData.nftCreator.publicKey,
          isSigner: false,
          isWritable: true,
        },
      ])
      .transaction();

    const blockhashData = await connection.getLatestBlockhash();
    tx.feePayer = seller.publicKey;
    tx.recentBlockhash = blockhashData.blockhash;
    tx.partialSign(cosigner, seller);
    await sendAndAssertTx(connection, tx, blockhashData, false);

    const expectedTakerFees = 2.2 * LAMPORTS_PER_SOL * 0.005;
    const expectedMakerFees = 2.2 * LAMPORTS_PER_SOL * 0.035;
    const expectedReferralFees = expectedMakerFees + expectedTakerFees;
    const expectedRoyalties = 2.2 * LAMPORTS_PER_SOL * 0.015;
    const [
      sellerBalance,
      paymentEscrowBalance,
      creatorBalance,
      referralBalance,
      poolEscrowAta,
      tokenRecordRent,
    ] = await Promise.all([
      connection.getBalance(seller.publicKey),
      connection.getBalance(poolData.poolPaymentEscrow),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      getTokenAccount(connection, poolData.poolAtaExtraNft),
      getTokenRecordRent(connection),
    ]);

    assert.equal(
      sellerBalance,
      initSellerBalance +
        2.2 * LAMPORTS_PER_SOL -
        SIGNATURE_FEE_LAMPORTS * 2 -
        tokenRecordRent -
        expectedTakerFees -
        expectedRoyalties -
        sellStateAccountRent,
    );
    assert.equal(
      paymentEscrowBalance,
      initPaymentEscrowBalance - 2.2 * LAMPORTS_PER_SOL - expectedMakerFees,
    );
    assert.equal(creatorBalance, initCreatorBalance + expectedRoyalties);
    assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
    assert.equal(Number(poolEscrowAta.amount), 1);
    assert.equal(poolEscrowAta.owner.toBase58(), poolData.poolKey.toBase58());
    assert.equal(
      poolEscrowAta.mint.toBase58(),
      poolData.extraNft.mintAddress.toBase58(),
    );

    const poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
    assert.equal(poolAccountInfo.spotPrice.toNumber(), 1.2 * LAMPORTS_PER_SOL);
    const sellStateAccountInfo = await program.account.sellState.fetch(
      sellState,
    );
    assert.equal(
      sellStateAccountInfo.pool.toBase58(),
      poolData.poolKey.toBase58(),
    );
    assert.equal(
      sellStateAccountInfo.assetMint.toBase58(),
      poolData.extraNft.mintAddress.toBase58(),
    );
    assert.equal(sellStateAccountInfo.assetAmount.toNumber(), 1);
  });

  it('can fulfill two sided - happy path', async () => {
    const seller = Keypair.generate();
    const buyer = Keypair.generate();
    const [poolData] = await Promise.all([
      createPoolWithExampleMip1Deposits(
        program,
        connection,
        {
          owner: wallet.publicKey,
          cosigner,
          spotPrice: new anchor.BN(2.5 * LAMPORTS_PER_SOL),
          curveDelta: new anchor.BN(2500),
          curveType: CurveKind.exp,
          reinvestFulfillBuy: false,
          reinvestFulfillSell: true,
          lpFeeBp: 100,
          buysideCreatorRoyaltyBp: 123, // this does not matter for ocp
        },
        'both',
        nftCreator,
        seller.publicKey,
        defaultRules,
      ),
      airdrop(connection, seller.publicKey, 10),
      airdrop(connection, buyer.publicKey, 10),
    ]);

    let [
      initWalletBalance,
      initBuyerBalance,
      initSellerBalance,
      initCreatorBalance,
      initReferralBalance,
      initPaymentEscrowBalance,
      tokenAccountRent,
      sellStateAccountRent,
      tokenRecordRent,
    ] = await Promise.all([
      connection.getBalance(wallet.publicKey),
      connection.getBalance(buyer.publicKey),
      connection.getBalance(seller.publicKey),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      connection.getBalance(poolData.poolPaymentEscrow),
      getTokenAccountRent(connection),
      getSellStatePDARent(connection),
      getTokenRecordRent(connection),
    ]);
    let cumulativeLpFees = 0;

    {
      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        poolData.extraNft.mintAddress,
      );

      const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
        poolData.extraNft.mintAddress,
        wallet.publicKey,
      );

      // sale price should be 2.5 SOL
      // with taker fee and royalties should be 2.5 * (1 - 0.003 - 0.01 - 0.015) = 2.43 SOL
      const tx = await program.methods
        .solMip1FulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: new anchor.BN(2.43 * LAMPORTS_PER_SOL),
          allowlistAux: null,
          makerFeeBp: 250,
          takerFeeBp: 30,
        })
        .accountsStrict({
          payer: seller.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: poolData.poolPaymentEscrow,
          assetMetadata: poolData.extraNft.metadataAddress,
          assetMint: poolData.extraNft.mintAddress,
          assetMasterEdition: poolData.extraNft.masterEditionAddress,
          payerAssetAccount: poolData.extraNft.tokenAddress,
          sellsideEscrowTokenAccount: poolData.poolAtaExtraNft,
          ownerTokenAccount: ownerExtraNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          sellState,
          tokenOwnerTokenRecord: getTokenRecordPDA(
            poolData.extraNft.mintAddress,
            poolData.extraNft.tokenAddress,
          ).key,
          poolTokenRecord: getTokenRecordPDA(
            poolData.extraNft.mintAddress,
            poolData.poolAtaExtraNft,
          ).key,
          poolOwnerTokenRecord: getTokenRecordPDA(
            poolData.extraNft.mintAddress,
            ownerExtraNftAtaAddress,
          ).key,
          authorizationRules: defaultRules,
          ...DEFAULT_ACCOUNTS,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: MIP1_COMPUTE_UNITS,
          }),
        ])
        .remainingAccounts([
          {
            pubkey: poolData.nftCreator.publicKey,
            isSigner: false,
            isWritable: true,
          },
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = seller.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, seller);
      await sendAndAssertTx(connection, tx, blockhashData, false);

      const expectedTakerFees = 2.5 * LAMPORTS_PER_SOL * 0.003;
      const expectedMakerFees = 2.5 * LAMPORTS_PER_SOL * 0.025;
      const expectedReferralFees = expectedMakerFees + expectedTakerFees;
      const expectedRoyalties = 2.5 * LAMPORTS_PER_SOL * 0.015;
      const expectedLpFees = 2.5 * LAMPORTS_PER_SOL * 0.01;
      const [
        sellerBalance,
        paymentEscrowBalance,
        walletBalance,
        creatorBalance,
        referralBalance,
        sellStateBalance,
        ownerAta,
      ] = await Promise.all([
        connection.getBalance(seller.publicKey),
        connection.getBalance(poolData.poolPaymentEscrow),
        connection.getBalance(wallet.publicKey),
        connection.getBalance(poolData.nftCreator.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(sellState),
        getTokenAccount(connection, ownerExtraNftAtaAddress),
      ]);

      assert.equal(
        sellerBalance,
        initSellerBalance +
          2.5 * LAMPORTS_PER_SOL -
          SIGNATURE_FEE_LAMPORTS * 2 -
          tokenRecordRent * 2 - // since reinvest buy = false, need to create two token records
          expectedTakerFees -
          expectedRoyalties -
          expectedLpFees,
      );
      assert.equal(
        paymentEscrowBalance,
        initPaymentEscrowBalance - 2.5 * LAMPORTS_PER_SOL - expectedMakerFees,
      );
      assert.equal(walletBalance, initWalletBalance + expectedLpFees);
      assert.equal(creatorBalance, initCreatorBalance + expectedRoyalties);
      assert.equal(referralBalance, initReferralBalance + expectedReferralFees);
      assert.equal(sellStateBalance, 0);
      assert.equal(Number(ownerAta.amount), 1);
      assert.equal(ownerAta.owner.toBase58(), wallet.publicKey.toBase58());
      assert.equal(
        ownerAta.mint.toBase58(),
        poolData.extraNft.mintAddress.toBase58(),
      );

      const poolAccountInfo = await program.account.pool.fetch(
        poolData.poolKey,
      );
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
      assert.equal(poolAccountInfo.spotPrice.toNumber(), 2 * LAMPORTS_PER_SOL);
      assert.equal(poolAccountInfo.lpFeeEarned.toNumber(), expectedLpFees);

      initPaymentEscrowBalance = paymentEscrowBalance;
      initWalletBalance = walletBalance;
      initCreatorBalance = creatorBalance;
      initReferralBalance = referralBalance;
      cumulativeLpFees += expectedLpFees;
    }

    {
      const buyerNftAtaAddress = await getAssociatedTokenAddress(
        poolData.nft.mintAddress,
        buyer.publicKey,
      );
      const { key: sellState } = getMMMSellStatePDA(
        program.programId,
        poolData.poolKey,
        poolData.nft.mintAddress,
      );
      // sale price should be 2 * 1.25 = 2.5 SOL
      // with taker fee and royalties should be 2.5 * (1 + 0.035 + 0.01 + 0.015) = 2.65 SOL
      const tx = await program.methods
        .solMip1FulfillSell({
          assetAmount: new anchor.BN(1),
          maxPaymentAmount: new anchor.BN(2.65 * LAMPORTS_PER_SOL),
          allowlistAux: null,
          makerFeeBp: 100,
          takerFeeBp: 350,
        })
        .accountsStrict({
          payer: buyer.publicKey,
          owner: wallet.publicKey,
          cosigner: cosigner.publicKey,
          referral: poolData.referral.publicKey,
          pool: poolData.poolKey,
          buysideSolEscrowAccount: poolData.poolPaymentEscrow,
          assetMetadata: poolData.nft.metadataAddress,
          assetMint: poolData.nft.mintAddress,
          assetMasterEdition: poolData.nft.masterEditionAddress,
          sellsideEscrowTokenAccount: poolData.poolAtaNft,
          payerAssetAccount: buyerNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          sellState,
          ownerTokenRecord: getTokenRecordPDA(
            poolData.nft.mintAddress,
            poolData.poolAtaNft,
          ).key,
          destinationTokenRecord: getTokenRecordPDA(
            poolData.nft.mintAddress,
            buyerNftAtaAddress,
          ).key,
          authorizationRules: defaultRules,
          ...DEFAULT_ACCOUNTS,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: MIP1_COMPUTE_UNITS,
          }),
        ])
        .remainingAccounts([
          {
            pubkey: poolData.nftCreator.publicKey,
            isSigner: false,
            isWritable: true,
          },
        ])
        .transaction();

      const blockhashData = await connection.getLatestBlockhash();
      tx.feePayer = buyer.publicKey;
      tx.recentBlockhash = blockhashData.blockhash;
      tx.partialSign(cosigner, buyer);
      await sendAndAssertTx(connection, tx, blockhashData, false);

      const expectedTakerFees = 2.5 * LAMPORTS_PER_SOL * 0.035;
      const expectedMakerFees = 2.5 * LAMPORTS_PER_SOL * 0.01;
      const expectedReferralFees = expectedMakerFees + expectedTakerFees;
      const expectedRoyalties = 2.5 * LAMPORTS_PER_SOL * 0.015;
      const expectedLpFees = 2.5 * LAMPORTS_PER_SOL * 0.01;
      const [
        buyerBalance,
        paymentEscrowBalance,
        creatorBalance,
        referralBalance,
        walletBalance,
        buyerAta,
      ] = await Promise.all([
        connection.getBalance(buyer.publicKey),
        connection.getBalance(poolData.poolPaymentEscrow),
        connection.getBalance(poolData.nftCreator.publicKey),
        connection.getBalance(poolData.referral.publicKey),
        connection.getBalance(wallet.publicKey),
        getTokenAccount(connection, buyerNftAtaAddress),
      ]);

      assert.equal(
        buyerBalance,
        initBuyerBalance -
          2.5 * LAMPORTS_PER_SOL -
          SIGNATURE_FEE_LAMPORTS * 2 -
          tokenRecordRent -
          tokenAccountRent -
          expectedTakerFees -
          expectedRoyalties -
          expectedLpFees,
      );
      assert.equal(
        paymentEscrowBalance,
        initPaymentEscrowBalance + 2.5 * LAMPORTS_PER_SOL - expectedMakerFees,
      );
      assert.equal(creatorBalance, initCreatorBalance + expectedRoyalties);
      assert.equal(
        referralBalance,
        Math.floor(initReferralBalance + expectedReferralFees),
      );
      assert.equal(
        walletBalance,
        initWalletBalance +
          expectedLpFees +
          sellStateAccountRent +
          tokenAccountRent,
      );
      assert.equal(Number(buyerAta.amount), 1);
      assert.equal(buyerAta.owner.toBase58(), buyer.publicKey.toBase58());
      assert.equal(
        buyerAta.mint.toBase58(),
        poolData.nft.mintAddress.toBase58(),
      );

      const poolAccountInfo = await program.account.pool.fetch(
        poolData.poolKey,
      );
      assert.equal(
        poolAccountInfo.lpFeeEarned.toNumber(),
        cumulativeLpFees + expectedLpFees,
      );
      assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 0);
    }
  });
});
