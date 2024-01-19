import * as anchor from '@coral-xyz/anchor';
import {
  getAssociatedTokenAddress,
  getAccount as getTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { assert } from 'chai';
import {
  Mmm,
  AllowlistKind,
  CurveKind,
  getMMMSellStatePDA,
  IDL,
  MMMProgramID,
} from '../sdk/src';
import {
  airdrop,
  createPoolWithExampleDeposits,
  getEmptyAllowLists,
  getMetaplexInstance,
  sendAndAssertTx,
} from './utils';

describe('mmm-any-allowlist', () => {
  // only testing any allowlist, not many balance checks done
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

  beforeEach(async () => {
    await airdrop(connection, wallet.publicKey, 50);
  });

  it('can fulfill with allowlist set to any', async () => {
    const seller = Keypair.generate();
    const buyer = Keypair.generate();
    const metaplexInstance = getMetaplexInstance(connection);
    const [poolData] = await Promise.all([
      createPoolWithExampleDeposits(
        program,
        connection,
        [AllowlistKind.any],
        {
          owner: wallet.publicKey,
          cosigner,
          curveType: CurveKind.exp,
          curveDelta: new anchor.BN(300), // 300 bp
          expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
          lpFeeBp: 200,
        },
        'both',
        seller.publicKey,
      ),
      airdrop(connection, seller.publicKey, 10),
      airdrop(connection, buyer.publicKey, 10),
    ]);
    const poolAccount = await program.account.pool.fetch(poolData.poolKey);
    assert.deepEqual(poolAccount.allowlists, [
      { kind: AllowlistKind.any, value: PublicKey.default },
      ...getEmptyAllowLists(5),
    ]);

    const ownerExtraNftAtaAddress = await getAssociatedTokenAddress(
      poolData.extraNft.mintAddress,
      wallet.publicKey,
    );
    const { key: extraNftSellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      poolData.extraNft.mintAddress,
    );
    const sellTx = await program.methods
      .solFulfillBuy({
        assetAmount: new anchor.BN(1),
        minPaymentAmount: new anchor.BN(1),
        allowlistAux: null,
        takerFeeBp: 100,
        makerFeeBp: 0,
      })
      .accounts({
        payer: seller.publicKey,
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        referral: poolData.referral.publicKey,
        pool: poolData.poolKey,
        buysideSolEscrowAccount: poolData.poolPaymentEscrow,
        assetMetadata: poolData.extraNft.metadataAddress,
        assetMasterEdition: metaplexInstance
          .nfts()
          .pdas()
          .masterEdition({ mint: poolData.extraNft.mintAddress }),
        assetMint: poolData.extraNft.mintAddress,
        payerAssetAccount: poolData.extraNft.tokenAddress!,
        sellsideEscrowTokenAccount: poolData.poolAtaExtraNft,
        ownerTokenAccount: ownerExtraNftAtaAddress,
        allowlistAuxAccount: SystemProgram.programId,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
        sellState: extraNftSellState,
      })
      .transaction();

    const blockhashData = await connection.getLatestBlockhash();
    sellTx.feePayer = seller.publicKey;
    sellTx.recentBlockhash = blockhashData.blockhash;
    sellTx.partialSign(cosigner, seller);

    await sendAndAssertTx(connection, sellTx, blockhashData, true);
    const poolAtaExtraNft = await getTokenAccount(
      connection,
      poolData.poolAtaExtraNft,
    );
    assert.equal(Number(poolAtaExtraNft.amount), 1);
    assert.equal(
      poolAtaExtraNft.mint.toBase58(),
      poolData.extraNft.mintAddress.toBase58(),
    );
    assert.equal(poolAtaExtraNft.owner.toBase58(), poolData.poolKey.toBase58());

    const buyerNftAtaAddress = await getAssociatedTokenAddress(
      poolData.nft.mintAddress,
      buyer.publicKey,
    );
    const { key: nftSellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      poolData.nft.mintAddress,
    );

    const buyTx = await program.methods
      .solFulfillSell({
        assetAmount: new anchor.BN(1),
        maxPaymentAmount: new anchor.BN(10 * LAMPORTS_PER_SOL),
        buysideCreatorRoyaltyBp: 0,
        allowlistAux: null,
        makerFeeBp: 100,
        takerFeeBp: 100,
      })
      .accounts({
        payer: buyer.publicKey,
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        referral: poolData.referral.publicKey,
        pool: poolData.poolKey,
        buysideSolEscrowAccount: poolData.poolPaymentEscrow,
        assetMetadata: poolData.nft.metadataAddress,
        assetMasterEdition: metaplexInstance
          .nfts()
          .pdas()
          .masterEdition({ mint: poolData.nft.mintAddress }),
        assetMint: poolData.nft.mintAddress,
        sellsideEscrowTokenAccount: poolData.poolAtaNft,
        payerAssetAccount: buyerNftAtaAddress,
        allowlistAuxAccount: SystemProgram.programId,
        sellState: nftSellState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .transaction();
    buyTx.feePayer = buyer.publicKey;
    buyTx.recentBlockhash = blockhashData.blockhash;
    buyTx.partialSign(cosigner, buyer);

    await sendAndAssertTx(connection, buyTx, blockhashData, true);
    const buyerAtaNft = await getTokenAccount(connection, buyerNftAtaAddress);
    assert.equal(Number(buyerAtaNft.amount), 1);
    assert.equal(
      buyerAtaNft.mint.toBase58(),
      poolData.nft.mintAddress.toBase58(),
    );
    assert.equal(buyerAtaNft.owner.toBase58(), buyer.publicKey.toBase58());
  });
});
