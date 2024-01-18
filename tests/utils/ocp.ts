import {
  DataV2,
  createCreateMetadataAccountV3Instruction,
  createSignMetadataInstruction,
} from '@metaplex-foundation/mpl-token-metadata';
import {
  getAssociatedTokenAddress,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
} from '@solana/web3.js';
import {
  createWrapInstruction,
  createInitAccountInstruction,
  createMintToInstruction as ocpCreateMintToInstruction,
  findMintStatePk,
  findFreezeAuthorityPk,
  CMT_PROGRAM,
  createInitPolicyInstruction,
  process_tx,
  findPolicyPk,
  createDynamicRoyaltyStruct,
  createTransferInstruction,
  createCloseInstruction,
} from '@magiceden-oss/open_creator_protocol';
import { OCP_COMPUTE_UNITS, sendAndAssertTx } from './generic';
import { getMetaplexInstance } from './nfts';
import { BN } from '@coral-xyz/anchor';

export const DEVNET_POLICY_ALL = new PublicKey(
  '6Huqrb4xxmmNA4NufYdgpmspoLmjXFd3qEfteCddLgSz',
);

interface ReceiverArgs {
  receiver: PublicKey;
  closeAccount: boolean;
}

export async function createTestMintAndTokenOCP(
  connection: Connection,
  payer: Keypair,
  creator: Keypair,
  receiverArgs: ReceiverArgs,
  policy = DEVNET_POLICY_ALL,
) {
  const metaplexInstance = getMetaplexInstance(connection);

  const mintKeypair = new Keypair();
  let targetTokenAccount = await getAssociatedTokenAddress(
    mintKeypair.publicKey,
    payer.publicKey,
  );
  const metadataAddress = metaplexInstance
    .nfts()
    .pdas()
    .metadata({ mint: mintKeypair.publicKey });
  const ocpFreezeAuth = findFreezeAuthorityPk(policy);
  const ocpMintState = findMintStatePk(mintKeypair.publicKey);

  const mintTx: Transaction = await createNewMintTransaction(
    connection,
    payer,
    creator.publicKey,
    mintKeypair,
    payer.publicKey,
    payer.publicKey,
  );
  const recentBlockhashData = await connection.getLatestBlockhash();
  mintTx.recentBlockhash = recentBlockhashData.blockhash;
  mintTx.feePayer = payer.publicKey;
  mintTx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: OCP_COMPUTE_UNITS }),
    createWrapInstruction({
      mint: mintKeypair.publicKey,
      policy,
      freezeAuthority: payer.publicKey,
      mintAuthority: payer.publicKey,
      mintState: ocpMintState,
      from: payer.publicKey,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      cmtProgram: CMT_PROGRAM,
      metadata: metadataAddress,
    }),
    createInitAccountInstruction({
      policy,
      freezeAuthority: ocpFreezeAuth,
      mint: mintKeypair.publicKey,
      metadata: metadataAddress,
      mintState: ocpMintState,
      from: payer.publicKey,
      fromAccount: targetTokenAccount,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      cmtProgram: CMT_PROGRAM,
      payer: payer.publicKey,
    }),
    ocpCreateMintToInstruction({
      policy,
      freezeAuthority: ocpFreezeAuth,
      mint: mintKeypair.publicKey,
      metadata: metadataAddress,
      mintState: findMintStatePk(mintKeypair.publicKey),
      from: payer.publicKey,
      fromAccount: targetTokenAccount,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      cmtProgram: CMT_PROGRAM,
      payer: payer.publicKey,
    }),
  );
  mintTx.partialSign(mintKeypair, payer, creator);
  await sendAndAssertTx(connection, mintTx, recentBlockhashData, false);
  const receiverTokenAccount = await getAssociatedTokenAddress(
    mintKeypair.publicKey,
    receiverArgs.receiver,
  );

  if (!payer.publicKey.equals(receiverArgs.receiver)) {
    const transferTx = new Transaction();
    transferTx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: OCP_COMPUTE_UNITS }),
      createInitAccountInstruction({
        policy,
        freezeAuthority: ocpFreezeAuth,
        mint: mintKeypair.publicKey,
        metadata: metadataAddress,
        mintState: ocpMintState,
        from: receiverArgs.receiver,
        fromAccount: receiverTokenAccount,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        cmtProgram: CMT_PROGRAM,
        payer: payer.publicKey,
      }),
      createTransferInstruction({
        policy,
        freezeAuthority: ocpFreezeAuth,
        mint: mintKeypair.publicKey,
        metadata: metadataAddress,
        mintState: ocpMintState,
        from: payer.publicKey,
        fromAccount: targetTokenAccount,
        to: receiverArgs.receiver,
        toAccount: receiverTokenAccount,
        cmtProgram: CMT_PROGRAM,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      }),
    );
    if (receiverArgs.closeAccount) {
      transferTx.add(
        createCloseInstruction({
          policy,
          freezeAuthority: ocpFreezeAuth,
          mint: mintKeypair.publicKey,
          metadata: metadataAddress,
          mintState: ocpMintState,
          from: payer.publicKey,
          fromAccount: targetTokenAccount,
          cmtProgram: CMT_PROGRAM,
          instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          destination: payer.publicKey,
        }),
      );
    }
    const recentBlockhashData = await connection.getLatestBlockhash();
    transferTx.recentBlockhash = recentBlockhashData.blockhash;
    transferTx.feePayer = payer.publicKey;
    transferTx.sign(payer);
    await sendAndAssertTx(connection, transferTx, recentBlockhashData, false);
  }

  return {
    mintAddress: mintKeypair.publicKey,
    metadataAddress: metadataAddress,
    payerTokenAddress: targetTokenAccount,
    tokenAddress: receiverTokenAccount,
    ocpMintState,
    ocpFreezeAuth,
    ocpPolicy: policy,
  };
}

const createNewMintTransaction = async (
  connection: Connection,
  payer: Keypair,
  creator: PublicKey,
  mintKeypair: Keypair,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey,
) => {
  const metaplexInstance = getMetaplexInstance(connection);
  //Get the minimum lamport balance to create a new account and avoid rent payments
  const requiredBalance = await getMinimumBalanceForRentExemptMint(connection);
  //metadata account associated with mint
  const metadataPDA = metaplexInstance
    .nfts()
    .pdas()
    .metadata({ mint: mintKeypair.publicKey });

  const ON_CHAIN_METADATA = {
    name: 'xyzname',
    symbol: 'xyz',
    uri: 'example.com',
    sellerFeeBasisPoints: 500,
    creators: [{ address: creator, verified: false, share: 100 }],
    collection: null,
    uses: null,
  } as DataV2;

  const createNewTokenTransaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: requiredBalance,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mintKeypair.publicKey, //Mint Address
      0, //Number of Decimals of New mint
      mintAuthority, //Mint Authority
      freezeAuthority, //Freeze Authority
      TOKEN_PROGRAM_ID,
    ),
    createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPDA,
        mint: mintKeypair.publicKey,
        mintAuthority: mintAuthority,
        payer: payer.publicKey,
        updateAuthority: mintAuthority,
      },
      {
        createMetadataAccountArgsV3: {
          data: ON_CHAIN_METADATA,
          isMutable: true,
          collectionDetails: null,
        },
      },
    ),
    createSignMetadataInstruction({
      metadata: metadataPDA,
      creator,
    }),
  );

  return createNewTokenTransaction;
};

export const createPolicyFixture = async (conn: Connection, payer: Keypair) => {
  const uuid = Keypair.generate().publicKey;
  const policy = findPolicyPk(uuid);
  const jsonRule = JSON.stringify({
    events: [],
    conditions: {
      or: [
        { field: 'action', operator: 'string_not_equals', value: 'transfer' },
        {
          and: [
            {
              not: {
                field: 'metadata/name',
                operator: 'string_has_substring',
                value: 'FROZEN',
              },
            },
            {
              or: [
                {
                  field: 'to',
                  operator: 'string_not_equals',
                  value: '11111111111111111111111111111111',
                },
                {
                  field: 'metadata/name',
                  operator: 'string_has_substring',
                  value: '(winner)',
                },
              ],
            },
          ],
        },
      ],
    },
  });
  const dr = createDynamicRoyaltyStruct({
    startMultiplierBp: 10000,
    endMultiplierBp: 0,
    startPrice: new BN(0),
    endPrice: new BN(5 * LAMPORTS_PER_SOL),
  });
  const ix = createInitPolicyInstruction(
    { policy, uuid, authority: payer.publicKey },
    { arg: { jsonRule, dynamicRoyalty: dr } },
  );
  await process_tx(conn, [ix], [payer]);
  return policy;
};
