import * as anchor from '@project-serum/anchor';
import {
  getAssociatedTokenAddress,
  getAccount as getTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  unpackAccount,
} from '@solana/spl-token';
import {
  ComputeBudgetProgram,
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
  createPoolWithExampleDepositsUmi,
  getEmptyAllowLists,
  getMetaplexInstance,
  sendAndAssertTx,
} from './utils';
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { token } from '@metaplex-foundation/js';

describe.only('mmm-any-allowlist', () => {
  const TOKEN_PROGRAM_IDS = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

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
    await airdrop(connection, cosigner.publicKey, 50);
  });

  TOKEN_PROGRAM_IDS.forEach((tokenProgramId) => {
    describe.only(`Token program: ${tokenProgramId}`, () => {
      it.only('can fulfill with allowlist set to any', async () => {
        const seller = Keypair.generate();
        const buyer = Keypair.generate();
        const [poolData] = await Promise.all([
          createPoolWithExampleDepositsUmi(
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
            tokenProgramId,
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
          toWeb3JsPublicKey(poolData.extraNft.mintAddress),
          wallet.publicKey,
          true,
          tokenProgramId,
        );
        const { key: extraNftSellState } = getMMMSellStatePDA(
          program.programId,
          poolData.poolKey,
          toWeb3JsPublicKey(poolData.extraNft.mintAddress),
        );
        const sellTx = await program.methods
          .solFulfillBuy({
            assetAmount: new anchor.BN(1),
            minPaymentAmount: new anchor.BN(1),
            allowlistAux: null,
            takerFeeBp: 100,
            makerFeeBp: 0,
          })
          .accountsStrict({
            payer: seller.publicKey,
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            referral: poolData.referral.publicKey,
            pool: poolData.poolKey,
            buysideSolEscrowAccount: poolData.poolPaymentEscrow,
            assetMetadata: toWeb3JsPublicKey(poolData.extraNft.metadataAddress),
            assetMasterEdition: toWeb3JsPublicKey(
              poolData.extraNft.masterEditionAddress,
            ),
            assetMint: toWeb3JsPublicKey(poolData.extraNft.mintAddress),
            payerAssetAccount: toWeb3JsPublicKey(
              poolData.extraNft.tokenAddress!,
            ),
            sellsideEscrowTokenAccount: poolData.poolAtaExtraNft,
            ownerTokenAccount: ownerExtraNftAtaAddress,
            allowlistAuxAccount: SystemProgram.programId,
            systemProgram: SystemProgram.programId,
            tokenProgram: tokenProgramId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
            sellState: extraNftSellState,
          })
          .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({ units: 500_0000 }),
          ])
          .transaction();

        const blockhashData = await connection.getLatestBlockhash();
        sellTx.feePayer = seller.publicKey;
        sellTx.recentBlockhash = blockhashData.blockhash;
        sellTx.partialSign(cosigner, seller);
        await sendAndAssertTx(connection, sellTx, blockhashData, true);

        const account = await connection.getAccountInfo(
          poolData.poolAtaExtraNft,
        );
        const poolAtaExtraNft = unpackAccount(
          poolData.poolAtaExtraNft,
          account,
          tokenProgramId,
        );

        assert.equal(Number(poolAtaExtraNft.amount), 1);
        assert.equal(
          poolAtaExtraNft.mint.toBase58(),
          toWeb3JsPublicKey(poolData.extraNft.mintAddress).toBase58(),
        );
        assert.equal(
          poolAtaExtraNft.owner.toBase58(),
          poolData.poolKey.toBase58(),
        );

        const buyerNftAtaAddress = await getAssociatedTokenAddress(
          toWeb3JsPublicKey(poolData.nft.mintAddress),
          buyer.publicKey,
          true,
          tokenProgramId,
        );
        const { key: nftSellState } = getMMMSellStatePDA(
          program.programId,
          poolData.poolKey,
          toWeb3JsPublicKey(poolData.nft.mintAddress),
        );

        // console.log('mint asset', poolData.nft.mintAddress.toString());
        // console.log('pool', poolData.poolKey.toString());
        // console.log('programID', tokenProgramId.toString());
        // console.log(
        //   'sellsideEscrowTokenAccount',
        //   poolData.poolAtaNft.toString(),
        // );

        const buyTx = await program.methods
          .solFulfillSell({
            assetAmount: new anchor.BN(1),
            maxPaymentAmount: new anchor.BN(10 * LAMPORTS_PER_SOL),
            buysideCreatorRoyaltyBp: 0,
            allowlistAux: null,
            makerFeeBp: 100,
            takerFeeBp: 100,
          })
          .accountsStrict({
            payer: buyer.publicKey,
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            referral: poolData.referral.publicKey,
            pool: poolData.poolKey,
            buysideSolEscrowAccount: poolData.poolPaymentEscrow,
            assetMetadata: toWeb3JsPublicKey(poolData.nft.metadataAddress),
            assetMasterEdition: toWeb3JsPublicKey(
              poolData.nft.masterEditionAddress,
            ),
            assetMint: toWeb3JsPublicKey(poolData.nft.mintAddress),
            sellsideEscrowTokenAccount: poolData.poolAtaNft,
            payerAssetAccount: buyerNftAtaAddress,
            allowlistAuxAccount: SystemProgram.programId,
            sellState: nftSellState,
            systemProgram: SystemProgram.programId,
            tokenProgram: tokenProgramId,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .transaction();
        buyTx.feePayer = buyer.publicKey;
        buyTx.recentBlockhash = blockhashData.blockhash;
        buyTx.partialSign(cosigner, buyer);

        await sendAndAssertTx(connection, buyTx, blockhashData, true);

        const a = await connection.getAccountInfo(buyerNftAtaAddress);
        const buyerAtaNft = unpackAccount(
          buyerNftAtaAddress,
          a,
          tokenProgramId,
        );

        assert.equal(Number(buyerAtaNft.amount), 1);
        assert.equal(
          buyerAtaNft.mint.toBase58(),
          poolData.nft.mintAddress.toString(),
        );
        assert.equal(buyerAtaNft.owner.toBase58(), buyer.publicKey.toBase58());
      });
    });
  });
});
