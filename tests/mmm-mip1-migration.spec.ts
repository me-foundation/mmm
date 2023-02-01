import * as anchor from '@project-serum/anchor';
import {
  getAssociatedTokenAddress,
  getAccount as getTokenAccount,
} from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { assert } from 'chai';
import { Mmm, AllowlistKind, IDL, MMMProgramID, MMMClient } from '../sdk/src';
import {
  airdrop,
  createDefaultTokenAuthorizationRules,
  createPool,
  getEmptyAllowLists,
  getInitMigrationIx,
  getInitMigrationSignerIx,
  getKeypair,
  getMigrateValidatorMigrateIx,
  getStartMigrationIx,
  getUpdateMigrationIx,
  mintNfts,
  MIP1_COMPUTE_UNITS,
  sendAndAssertTx,
} from './utils';
import { before } from 'mocha';

describe('mmm-mip1-migration', () => {
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
  const nftAuthority = getKeypair();
  let defaultRules: PublicKey;
  let collectionNft: Awaited<ReturnType<typeof mintNfts>>[number];

  before(async () => {
    const rulesRes = await createDefaultTokenAuthorizationRules(
      connection,
      nftAuthority,
      'test',
    );
    defaultRules = rulesRes.ruleSetAddress;

    collectionNft = (
      await mintNfts(connection, {
        numNfts: 1,
        isCollection: true,
        collectionIsSized: true,
      })
    )[0];

    const initMigrationSignerIx = getInitMigrationSignerIx(
      nftAuthority.publicKey,
    );
    const initMigrationIx = getInitMigrationIx(
      nftAuthority.publicKey,
      collectionNft.mintAddress,
      defaultRules,
    );
    const updateMigrationIx = getUpdateMigrationIx(
      nftAuthority.publicKey,
      collectionNft.mintAddress,
    );
    const startMigrationIx = getStartMigrationIx(
      nftAuthority.publicKey,
      collectionNft.mintAddress,
    );

    const blockhashData = await connection.getLatestBlockhash();
    const initMigrationTx = new Transaction().add(
      initMigrationSignerIx,
      initMigrationIx,
      updateMigrationIx,
      startMigrationIx,
    );
    initMigrationTx.feePayer = nftAuthority.publicKey;
    initMigrationTx.recentBlockhash = blockhashData.blockhash;
    initMigrationTx.sign(nftAuthority);
    await sendAndAssertTx(connection, initMigrationTx, blockhashData, false);
  });

  beforeEach(async () => {
    await airdrop(connection, wallet.publicKey, 50);
  });

  it('can deposit mip0 NFTs and withdraw migrated NFTs - happy path', async () => {
    const nftRes = (
      await mintNfts(connection, {
        numNfts: 1,
        recipient: wallet.publicKey,
        collectionAddress: collectionNft.mintAddress,
        verifyCollection: true,
      })
    )[0];

    const poolData = await createPool(program, {
      owner: wallet.publicKey,
      cosigner,
      allowlists: [
        { value: collectionNft.mintAddress, kind: AllowlistKind.mcc },
        ...getEmptyAllowLists(5),
      ],
    });
    const walletMmmClient = new MMMClient(connection);
    const [blockhashData] = await Promise.all([
      connection.getLatestBlockhash(),
      walletMmmClient.withPool(poolData.poolKey),
    ]);

    // deposit normal NFT into pool
    const depositIx = await walletMmmClient.getInsDepositSell(
      {
        assetAmount: new anchor.BN(1),
        allowlistAux: null,
      },
      nftRes.mintAddress,
    );
    const depositTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhashData.blockhash,
        instructions: [depositIx],
      }).compileToLegacyMessage(),
    );
    depositTx.sign([wallet.payer, cosigner]);
    await sendAndAssertTx(connection, depositTx, blockhashData, false);
    const poolAta = await getAssociatedTokenAddress(
      nftRes.mintAddress,
      poolData.poolKey,
      true,
    );

    // migrate NFT -> pNFT
    const migrateIx = getMigrateValidatorMigrateIx(
      nftAuthority.publicKey,
      poolData.poolKey,
      program.programId,
      nftRes.mintAddress,
      poolAta,
      collectionNft.mintAddress,
      defaultRules,
    );
    const migrateTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: nftAuthority.publicKey,
        recentBlockhash: blockhashData.blockhash,
        instructions: [migrateIx],
      }).compileToLegacyMessage(),
    );
    migrateTx.sign([nftAuthority]);
    await sendAndAssertTx(connection, migrateTx, blockhashData, false);

    const poolAtaAccountInfo = await getTokenAccount(connection, poolAta);
    assert.equal(
      poolAtaAccountInfo.owner.toBase58(),
      poolData.poolKey.toBase58(),
    );
    assert.equal(
      poolAtaAccountInfo.mint.toBase58(),
      nftRes.mintAddress.toBase58(),
    );
    assert.equal(Number(poolAtaAccountInfo.amount), 1);
    assert.ok(poolAtaAccountInfo.isFrozen);

    // withdraw newly migrated pNFT
    const withdrawIx = await walletMmmClient.getInsWithdrawSell(
      {
        assetAmount: new anchor.BN(1),
        allowlistAux: null,
      },
      nftRes.mintAddress,
    );
    const withdrawTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhashData.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({
            units: MIP1_COMPUTE_UNITS,
          }),
          withdrawIx,
        ],
      }).compileToLegacyMessage(),
    );
    withdrawTx.sign([wallet.payer, cosigner]);
    await sendAndAssertTx(connection, withdrawTx, blockhashData, false);

    const walletAtaAccountInfo = await getTokenAccount(
      connection,
      nftRes.tokenAddress!,
    );
    assert.equal(
      walletAtaAccountInfo.mint.toBase58(),
      nftRes.mintAddress.toBase58(),
    );
    assert.equal(
      walletAtaAccountInfo.owner.toBase58(),
      wallet.publicKey.toBase58(),
    );
    assert.equal(Number(walletAtaAccountInfo.amount), 1);
  });

  it('can buy mip0 NFTs and sell migrated NFTs - happy path', async () => {
    const seller = Keypair.generate();
    const buyer = Keypair.generate();
    await Promise.all([
      airdrop(connection, seller.publicKey, 10),
      airdrop(connection, buyer.publicKey, 10),
    ]);
    const nftRes = (
      await mintNfts(connection, {
        numNfts: 1,
        recipient: seller.publicKey,
        collectionAddress: collectionNft.mintAddress,
        verifyCollection: true,
      })
    )[0];

    const poolData = await createPool(program, {
      owner: wallet.publicKey,
      cosigner,
      allowlists: [
        { value: collectionNft.mintAddress, kind: AllowlistKind.mcc },
        ...getEmptyAllowLists(5),
      ],
      reinvestFulfillBuy: true,
      reinvestFulfillSell: true,
      lpFeeBp: 150,
    });
    const mmmClient = new MMMClient(connection);
    const [blockhashData] = await Promise.all([
      connection.getLatestBlockhash(),
      mmmClient.withPool(poolData.poolKey),
    ]);

    // deposit sol into pool so it can buy
    const depositIx = await mmmClient.getInsSolDepositBuy({
      paymentAmount: new anchor.BN(10 * LAMPORTS_PER_SOL),
    });
    const depositTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhashData.blockhash,
        instructions: [depositIx],
      }).compileToLegacyMessage(),
    );
    depositTx.sign([wallet.payer, cosigner]);
    await sendAndAssertTx(connection, depositTx, blockhashData, false);

    // buy normal NFT, reinvest = true so NFT is owned by pool
    const buyIxSeller = await mmmClient.getInsSolFulfillBuy(
      {
        assetAmount: new anchor.BN(1),
        minPaymentAmount: new anchor.BN(0), // skip checking balances for this test
        allowlistAux: null,
        makerFeeBp: 100,
        takerFeeBp: 100,
      },
      seller.publicKey,
      nftRes.mintAddress,
      nftRes.tokenAddress!,
    );
    const buyTxSeller = new VersionedTransaction(
      new TransactionMessage({
        payerKey: seller.publicKey,
        recentBlockhash: blockhashData.blockhash,
        instructions: [buyIxSeller],
      }).compileToLegacyMessage(),
    );
    buyTxSeller.sign([seller, cosigner]);
    await sendAndAssertTx(connection, buyTxSeller, blockhashData, false);

    // migrate NFT -> pNFT
    const poolAta = await getAssociatedTokenAddress(
      nftRes.mintAddress,
      poolData.poolKey,
      true,
    );
    const migrateIx = getMigrateValidatorMigrateIx(
      nftAuthority.publicKey,
      poolData.poolKey,
      program.programId,
      nftRes.mintAddress,
      poolAta,
      collectionNft.mintAddress,
      defaultRules,
    );
    const migrateTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: nftAuthority.publicKey,
        recentBlockhash: blockhashData.blockhash,
        instructions: [migrateIx],
      }).compileToLegacyMessage(),
    );
    migrateTx.sign([nftAuthority]);
    await sendAndAssertTx(connection, migrateTx, blockhashData, false);

    // buy newly migrated pNFT
    const sellIx = await mmmClient.getInsSolFulfillSell(
      {
        assetAmount: new anchor.BN(1),
        maxPaymentAmount: new anchor.BN(10 * LAMPORTS_PER_SOL), // skip checking balances for this test
        buysideCreatorRoyaltyBp: 100,
        allowlistAux: null,
        makerFeeBp: 130,
        takerFeeBp: 100,
      },
      buyer.publicKey,
      nftRes.mintAddress,
    );
    const sellTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: buyer.publicKey,
        recentBlockhash: blockhashData.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({
            units: MIP1_COMPUTE_UNITS,
          }),
          sellIx,
        ],
      }).compileToLegacyMessage(),
    );
    sellTx.sign([buyer, cosigner]);
    await sendAndAssertTx(connection, sellTx, blockhashData, false);

    const buyerAta = await getAssociatedTokenAddress(
      nftRes.mintAddress,
      buyer.publicKey,
    );
    const buyerAtaAccountInfo = await getTokenAccount(connection, buyerAta);
    assert.equal(
      buyerAtaAccountInfo.owner.toBase58(),
      buyer.publicKey.toBase58(),
    );
    assert.equal(
      buyerAtaAccountInfo.mint.toBase58(),
      nftRes.mintAddress.toBase58(),
    );
    assert.equal(Number(buyerAtaAccountInfo.amount), 1);
    assert.ok(buyerAtaAccountInfo.isFrozen);

    // sell the pNFT back to the pool
    const buyIxBuyer = await mmmClient.getInsSolFulfillBuy(
      {
        assetAmount: new anchor.BN(1),
        minPaymentAmount: new anchor.BN(0), // skip checking balances for this test
        allowlistAux: null,
        makerFeeBp: 100,
        takerFeeBp: 100,
      },
      buyer.publicKey,
      nftRes.mintAddress,
      buyerAta,
    );
    const buyTxBuyer = new VersionedTransaction(
      new TransactionMessage({
        payerKey: buyer.publicKey,
        recentBlockhash: blockhashData.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({
            units: MIP1_COMPUTE_UNITS,
          }),
          buyIxBuyer,
        ],
      }).compileToLegacyMessage(),
    );
    buyTxBuyer.sign([buyer, cosigner]);
    await sendAndAssertTx(connection, buyTxBuyer, blockhashData, false);

    const poolAtaAccountInfo = await getTokenAccount(connection, poolAta);
    assert.equal(
      poolAtaAccountInfo.owner.toBase58(),
      poolData.poolKey.toBase58(),
    );
    assert.equal(
      poolAtaAccountInfo.mint.toBase58(),
      nftRes.mintAddress.toBase58(),
    );
    assert.equal(Number(poolAtaAccountInfo.amount), 1);
    assert.ok(poolAtaAccountInfo.isFrozen);
  });
});
