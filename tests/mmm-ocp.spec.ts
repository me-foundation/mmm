import * as anchor from '@coral-xyz/anchor';
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
  getSolFulfillBuyPrices,
} from '../sdk/src';
import {
  airdrop,
  createPolicyFixture,
  createPool,
  createPoolWithExampleOcpDeposits,
  createTestMintAndTokenOCP,
  getEmptyAllowLists,
  getSellStatePDARent,
  getTokenAccountRent,
  OCP_COMPUTE_UNITS,
  sendAndAssertTx,
  SIGNATURE_FEE_LAMPORTS,
} from './utils';
import {
  CMT_PROGRAM,
  PROGRAM_ID as OCP_PROGRAM_ID,
} from '@magiceden-oss/open_creator_protocol';

describe('mmm-ocp', () => {
  const { connection } = anchor.AnchorProvider.env();
  const wallet = new anchor.Wallet(Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: 'processed',
  });
  const program = new anchor.Program(
    IDL,
    MMMProgramID,
    provider,
  ) as anchor.Program<Mmm>;
  const cosigner = Keypair.generate();
  const DEFAULT_ACCOUNTS = {
    ocpProgram: OCP_PROGRAM_ID,
    cmtProgram: CMT_PROGRAM,
    instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    rent: SYSVAR_RENT_PUBKEY,
  };

  beforeEach(async () => {
    await airdrop(connection, wallet.publicKey, 50);
  });

  it('can deposit and withdraw ocp NFTs - happy path', async () => {
    const creator = Keypair.generate();
    const nftRes = await createTestMintAndTokenOCP(
      connection,
      wallet.payer,
      creator,
      { receiver: wallet.publicKey, closeAccount: true },
    );

    const poolData = await createPool(program, {
      owner: wallet.publicKey,
      cosigner,
      allowlists: [
        { value: creator.publicKey, kind: AllowlistKind.fvca },
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
      .ocpDepositSell({
        assetAmount: new anchor.BN(1),
        allowlistAux: null,
      })
      .accountsStrict({
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        pool: poolData.poolKey,
        assetMetadata: nftRes.metadataAddress,
        assetMint: nftRes.mintAddress,
        assetTokenAccount: nftRes.payerTokenAddress,
        sellsideEscrowTokenAccount: poolAta,
        sellState,
        allowlistAuxAccount: SystemProgram.programId,

        ocpMintState: nftRes.ocpMintState,
        ocpPolicy: nftRes.ocpPolicy,
        ocpFreezeAuthority: nftRes.ocpFreezeAuth,
        ...DEFAULT_ACCOUNTS,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: OCP_COMPUTE_UNITS }),
      ])
      .signers([cosigner])
      .rpc({ skipPreflight: true });

    const poolTokenEscrow = await getTokenAccount(connection, poolAta);
    assert.equal(Number(poolTokenEscrow.amount), 1);
    assert.equal(poolTokenEscrow.owner.toBase58(), poolData.poolKey.toBase58());
    assert.equal(
      poolTokenEscrow.mint.toBase58(),
      nftRes.mintAddress.toBase58(),
    );
    const sellStateAccountInfo = await program.account.sellState.fetch(
      sellState,
    );
    assert.equal(
      sellStateAccountInfo.assetMint.toBase58(),
      nftRes.mintAddress.toBase58(),
    );
    assert.equal(sellStateAccountInfo.assetAmount.toNumber(), 1);
    poolAccountInfo = await program.account.pool.fetch(poolData.poolKey);
    assert.equal(poolAccountInfo.sellsideAssetAmount.toNumber(), 1);
    assert.equal(await connection.getBalance(nftRes.payerTokenAddress), 0);

    const { key: buysideSolEscrowAccount } = getMMMBuysideSolEscrowPDA(
      program.programId,
      poolData.poolKey,
    );
    await program.methods
      .ocpWithdrawSell({ assetAmount: new anchor.BN(1), allowlistAux: null })
      .accountsStrict({
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        pool: poolData.poolKey,
        assetMint: nftRes.mintAddress,
        assetMetadata: nftRes.metadataAddress,
        assetTokenAccount: nftRes.payerTokenAddress,
        sellsideEscrowTokenAccount: poolAta,
        buysideSolEscrowAccount,
        allowlistAuxAccount: SystemProgram.programId,
        sellState,
        ocpMintState: nftRes.ocpMintState,
        ocpPolicy: nftRes.ocpPolicy,
        ocpFreezeAuthority: nftRes.ocpFreezeAuth,
        ...DEFAULT_ACCOUNTS,
      })
      .signers([cosigner])
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: OCP_COMPUTE_UNITS }),
      ])
      .rpc({ skipPreflight: true });

    const ownerTokenAccount = await getTokenAccount(
      connection,
      nftRes.payerTokenAddress,
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
      createPoolWithExampleOcpDeposits(
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
    // with taker fee and royalties should be 1.575 * (1 + 0.02 + 0.05) = 1.68525 SOL
    const tx = await program.methods
      .solOcpFulfillSell({
        assetAmount: new anchor.BN(1),
        maxPaymentAmount: new anchor.BN(1.68525 * LAMPORTS_PER_SOL),
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
        sellsideEscrowTokenAccount: poolData.poolAtaNft,
        payerAssetAccount: buyerNftAtaAddress,
        allowlistAuxAccount: SystemProgram.programId,
        sellState,
        ocpMintState: poolData.nft.ocpMintState,
        ocpPolicy: poolData.nft.ocpPolicy,
        ocpFreezeAuthority: poolData.nft.ocpFreezeAuth,
        ...DEFAULT_ACCOUNTS,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: OCP_COMPUTE_UNITS,
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
    const expectedRoyalties = 1.575 * LAMPORTS_PER_SOL * 0.05;
    const [
      buyerBalance,
      walletBalance,
      creatorBalance,
      referralBalance,
      poolBalance,
      buyerAta,
    ] = await Promise.all([
      connection.getBalance(buyer.publicKey),
      connection.getBalance(wallet.publicKey),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      connection.getBalance(poolData.poolKey),
      getTokenAccount(connection, buyerNftAtaAddress),
    ]);

    assert.equal(
      buyerBalance,
      initBuyerBalance -
        1.575 * LAMPORTS_PER_SOL -
        SIGNATURE_FEE_LAMPORTS * 2 -
        tokenAccountRent -
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
    const policy = await createPolicyFixture(connection, wallet.payer);
    const [poolData] = await Promise.all([
      createPoolWithExampleOcpDeposits(
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
        seller.publicKey,
        policy,
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
    // royalty percentage should be (2.2-0) / (5-0) * (1-0) * 0.05 = 0.028
    // with taker fee and royalties should be 2.2 / (1 + 0.028) * (1 - 0.005) ~ 2.129 SOL
    const expectedBuyPrices = getSolFulfillBuyPrices({
      totalPriceLamports: 2.2 * LAMPORTS_PER_SOL,
      takerFeeBp: 50,
      metadataRoyaltyBp: 280,
      buysideCreatorRoyaltyBp: 10000,
      lpFeeBp: 0,
      makerFeeBp: 350,
    });
    const tx = await program.methods
      .solOcpFulfillBuy({
        assetAmount: new anchor.BN(1),
        minPaymentAmount: expectedBuyPrices.sellerReceives,
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
        payerAssetAccount: poolData.extraNft.tokenAddress,
        sellsideEscrowTokenAccount: poolData.poolAtaExtraNft,
        ownerTokenAccount: ownerExtraNftAtaAddress,
        allowlistAuxAccount: SystemProgram.programId,
        sellState,
        ocpMintState: poolData.extraNft.ocpMintState,
        ocpPolicy: poolData.extraNft.ocpPolicy,
        ocpFreezeAuthority: poolData.extraNft.ocpFreezeAuth,
        ...DEFAULT_ACCOUNTS,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: OCP_COMPUTE_UNITS }),
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

    const expectedReferralFees =
      expectedBuyPrices.makerFeePaid.toNumber() +
      expectedBuyPrices.takerFeePaid.toNumber();
    const [
      sellerBalance,
      paymentEscrowBalance,
      creatorBalance,
      referralBalance,
      poolEscrowAta,
    ] = await Promise.all([
      connection.getBalance(seller.publicKey),
      connection.getBalance(poolData.poolPaymentEscrow),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      getTokenAccount(connection, poolData.poolAtaExtraNft),
    ]);

    assert.equal(
      sellerBalance,
      initSellerBalance +
        expectedBuyPrices.sellerReceives.toNumber() -
        SIGNATURE_FEE_LAMPORTS * 2 -
        sellStateAccountRent,
    );
    assert.equal(
      paymentEscrowBalance,
      initPaymentEscrowBalance -
        2.2 * LAMPORTS_PER_SOL -
        expectedBuyPrices.makerFeePaid.toNumber(),
    );
    assert.equal(
      creatorBalance,
      initCreatorBalance + expectedBuyPrices.royaltyPaid.toNumber(),
    );
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

  it('can fulfill two sided with negative maker fees - happy path', async () => {
    const seller = Keypair.generate();
    const buyer = Keypair.generate();
    const policy = await createPolicyFixture(connection, wallet.payer);
    const [poolData] = await Promise.all([
      createPoolWithExampleOcpDeposits(
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
        seller.publicKey,
        policy,
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
    ] = await Promise.all([
      connection.getBalance(wallet.publicKey),
      connection.getBalance(buyer.publicKey),
      connection.getBalance(seller.publicKey),
      connection.getBalance(poolData.nftCreator.publicKey),
      connection.getBalance(poolData.referral.publicKey),
      connection.getBalance(poolData.poolPaymentEscrow),
      getTokenAccountRent(connection),
      getSellStatePDARent(connection),
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
      // royalty percentage should be (5-2.5) / (5-0) * (1-0) * 0.05 = 0.025
      // with taker fee and royalties should be 2.5 / (1 + 0.025 + 0.01) * (1 - 0.003) ~ 2.408 SOL
      const expectedBuyPrices = getSolFulfillBuyPrices({
        totalPriceLamports: 2.5 * LAMPORTS_PER_SOL,
        takerFeeBp: 30,
        metadataRoyaltyBp: 250,
        buysideCreatorRoyaltyBp: 10000,
        lpFeeBp: 100,
        makerFeeBp: -30,
      });
      const tx = await program.methods
        .solOcpFulfillBuy({
          assetAmount: new anchor.BN(1),
          minPaymentAmount: expectedBuyPrices.sellerReceives,
          allowlistAux: null,
          makerFeeBp: -30,
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
          payerAssetAccount: poolData.extraNft.tokenAddress,
          sellsideEscrowTokenAccount: poolData.poolAtaExtraNft,
          ownerTokenAccount: ownerExtraNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          sellState,
          ocpMintState: poolData.extraNft.ocpMintState,
          ocpPolicy: poolData.extraNft.ocpPolicy,
          ocpFreezeAuthority: poolData.extraNft.ocpFreezeAuth,
          ...DEFAULT_ACCOUNTS,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: OCP_COMPUTE_UNITS,
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

      const expectedReferralFees =
        expectedBuyPrices.makerFeePaid.toNumber() +
        expectedBuyPrices.takerFeePaid.toNumber();
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
          expectedBuyPrices.sellerReceives.toNumber() -
          SIGNATURE_FEE_LAMPORTS * 2,
      );
      assert.equal(
        paymentEscrowBalance,
        initPaymentEscrowBalance -
          2.5 * LAMPORTS_PER_SOL -
          expectedBuyPrices.makerFeePaid.toNumber(),
      );
      assert.equal(
        walletBalance,
        initWalletBalance + expectedBuyPrices.lpFeePaid.toNumber(),
      );
      assert.equal(
        creatorBalance,
        initCreatorBalance + expectedBuyPrices.royaltyPaid.toNumber(),
      );
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
      assert.equal(
        poolAccountInfo.lpFeeEarned.toNumber(),
        expectedBuyPrices.lpFeePaid.toNumber(),
      );

      initPaymentEscrowBalance = paymentEscrowBalance;
      initWalletBalance = walletBalance;
      initCreatorBalance = creatorBalance;
      initReferralBalance = referralBalance;
      cumulativeLpFees += expectedBuyPrices.lpFeePaid.toNumber();
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
      // royalty percentage should be (5-2.5) / (5-0) * (1-0) * 0.05 = 0.025
      // with taker fee and royalties should be 2.5 * (1 + 0.035 + 0.01 + 0.025) = 2.675 SOL
      const tx = await program.methods
        .solOcpFulfillSell({
          assetAmount: new anchor.BN(1),
          maxPaymentAmount: new anchor.BN(2.675 * LAMPORTS_PER_SOL),
          allowlistAux: null,
          makerFeeBp: -100,
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
          sellsideEscrowTokenAccount: poolData.poolAtaNft,
          payerAssetAccount: buyerNftAtaAddress,
          allowlistAuxAccount: SystemProgram.programId,
          sellState,
          ocpMintState: poolData.nft.ocpMintState,
          ocpPolicy: poolData.nft.ocpPolicy,
          ocpFreezeAuthority: poolData.nft.ocpFreezeAuth,
          ...DEFAULT_ACCOUNTS,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({
            units: OCP_COMPUTE_UNITS,
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
      const expectedMakerFees = 2.5 * LAMPORTS_PER_SOL * -0.01;
      const expectedReferralFees = expectedMakerFees + expectedTakerFees;
      const expectedRoyalties = 2.5 * LAMPORTS_PER_SOL * 0.025;
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
