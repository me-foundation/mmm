import * as anchor from '@project-serum/anchor';
import {
  getAssociatedTokenAddress,
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
import { Umi } from '@metaplex-foundation/umi';
import {
  Mmm,
  AllowlistKind,
  CurveKind,
  getMMMSellStatePDA,
  IDL,
  MMMProgramID,
} from '../sdk/src';
import { airdrop, createPoolWithExampleDepositsUmi } from './utils';
import { toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { createUmi } from '@metaplex-foundation/umi-bundle-tests';

describe('mmm-referral', () => {
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
  let umi: Umi;

  // constants from `proxy.json` account in deps
  const mockProxyConfigKey = new PublicKey(
    '9V5HWD1ap6mCDMhBoXU5SVcZZn9ihqJtoMQZsw5MTnoD',
  );
  const mockProxyAuthorityKey = new PublicKey(
    'Aj7o3CHJAcUv1fa7rBe2CcApxD5A1U8Qjkb2Sua8TTM6',
  );

  beforeAll(async () => {
    await airdrop(connection, wallet.publicKey, 50);
    umi = (
      await createUmi('http://127.0.0.1:8899', { commitment: 'processed' })
    ).use(mplTokenMetadata());
  });

  it('Correctly validates referral', async () => {
    const buyer = Keypair.generate();
    const [poolData] = await Promise.all([
      createPoolWithExampleDepositsUmi(
        program,
        [AllowlistKind.fvca],
        {
          owner: wallet.publicKey,
          cosigner,
          curveType: CurveKind.exp,
          curveDelta: new anchor.BN(200), // 200 basis points
          expiry: new anchor.BN(new Date().getTime() / 1000 + 1000),
          reinvestFulfillBuy: true,
          reinvestFulfillSell: true,
          referral: mockProxyAuthorityKey,
        },
        'sell',
        TOKEN_PROGRAM_ID,
        buyer.publicKey,
      ),
      airdrop(connection, buyer.publicKey, 20),
    ]);

    const buyerNftAtaAddress = await getAssociatedTokenAddress(
      toWeb3JsPublicKey(poolData.nft.mintAddress),
      buyer.publicKey,
      true,
      TOKEN_PROGRAM_ID,
    );
    const { key: sellState } = getMMMSellStatePDA(
      program.programId,
      poolData.poolKey,
      toWeb3JsPublicKey(poolData.nft.mintAddress),
    );

    const assertReferral = async (referral: PublicKey, success: boolean) => {
      try {
        const txId = await program.methods
          .solFulfillSell({
            assetAmount: new anchor.BN(1),
            maxPaymentAmount: new anchor.BN(100 * LAMPORTS_PER_SOL),
            buysideCreatorRoyaltyBp: 0,
            allowlistAux: '',
            takerFeeBp: 100,
            makerFeeBp: 0,
          })
          .accountsStrict({
            payer: buyer.publicKey,
            owner: wallet.publicKey,
            cosigner: cosigner.publicKey,
            referral: referral,
            pool: poolData.poolKey,
            buysideSolEscrowAccount: poolData.poolPaymentEscrow,
            assetMetadata: poolData.nft.metadataAddress,
            assetMasterEdition: poolData.nft.masterEditionAddress,
            assetMint: poolData.nft.mintAddress,
            sellsideEscrowTokenAccount: poolData.poolAtaNft,
            payerAssetAccount: buyerNftAtaAddress,
            allowlistAuxAccount: SystemProgram.programId,
            sellState,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([buyer, cosigner])
          .rpc();
        if (success) {
          expect(txId).not.toBeNull();
        } else {
          expect(txId).toBeNull();
        }
      } catch (e) {
        expect(e).toBeInstanceOf(anchor.AnchorError);
        expect((e as anchor.AnchorError).error.errorMessage).toMatch(
          /invalid referral/,
        );
      }
    };

    // random keypair
    await assertReferral(new Keypair().publicKey, false);
    // account with correct account data but wrong program owner
    await assertReferral(
      new PublicKey('AJtUEMcZv9DDG4EVd8ugG3duAnCmmmVa6xCEUV7FqFFd'),
      false,
    );

    // correct proxy account
    await assertReferral(mockProxyConfigKey, true);

    // check that proxy account also works for fulfill buy
    await program.methods
      .solFulfillBuy({
        assetAmount: new anchor.BN(1),
        minPaymentAmount: new anchor.BN(1),
        makerFeeBp: 0,
        takerFeeBp: 100,
        allowlistAux: null,
      })
      .accountsStrict({
        payer: buyer.publicKey,
        owner: wallet.publicKey,
        cosigner: cosigner.publicKey,
        referral: mockProxyConfigKey,
        pool: poolData.poolKey,
        buysideSolEscrowAccount: poolData.poolPaymentEscrow,
        assetMetadata: poolData.nft.metadataAddress,
        assetMasterEdition: poolData.nft.masterEditionAddress,
        assetMint: poolData.nft.mintAddress,
        payerAssetAccount: buyerNftAtaAddress,
        sellsideEscrowTokenAccount: poolData.poolAtaNft,
        ownerTokenAccount: await getAssociatedTokenAddress(
          toWeb3JsPublicKey(poolData.nft.mintAddress),
          wallet.publicKey,
          false,
          TOKEN_PROGRAM_ID,
        ),
        allowlistAuxAccount: SystemProgram.programId,
        sellState,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([buyer, cosigner])
      .rpc();
  });
});
