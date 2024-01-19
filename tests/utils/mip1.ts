import {
  createCreateOrUpdateInstruction,
  findRuleSetPDA,
  PREFIX,
  PROGRAM_ID as AUTHORIZATION_RULES_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-auth-rules';
import {
  Keypair,
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  AccountMeta,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import {
  findMasterEditionV2Pda,
  findMetadataPda,
  token,
  tokenProgram,
} from '@metaplex-foundation/js';
import {
  AssetData,
  createCreateInstruction,
  CreateInstructionAccounts,
  CreateInstructionArgs,
  createMintInstruction,
  Key,
  MintInstructionAccounts,
  MintInstructionArgs,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
  TokenStandard,
  TokenDelegateRole,
  TokenRecord,
  TokenState,
  SetTokenStandardInstructionAccounts,
  createSetTokenStandardInstruction,
} from '@metaplex-foundation/mpl-token-metadata';
import { getMetaplexInstance, sendAndAssertTx } from '.';
import {
  createInitializeInstruction,
  createInitSignerInstruction,
  InitializeInstructionAccounts,
  InitializeInstructionArgs,
  InitSignerInstructionAccounts,
  StartInstructionAccounts,
  UnlockMethod,
  PROGRAM_ID as MIGRATION_VALIDATOR_PROGRAM_ID,
  createStartInstruction,
  UpdateInstructionArgs,
  UpdateInstructionAccounts,
  createUpdateInstruction,
  migrateInstructionDiscriminator,
} from '@metaplex-foundation/mpl-migration-validator';
import { encode } from '@msgpack/msgpack';
import { getTokenRecordPDA, MMMProgramID } from '../../sdk/src';
import {
  findMigrationState,
  findMigrationProgramAsSigner,
} from './migrationPdas';

const getAmountRuleIxData = (name: string, owner: PublicKey): Uint8Array => {
  return encode([
    1,
    Array.from(owner.toBuffer()),
    name,
    {
      'Transfer:Owner': {
        All: [
          [
            {
              Amount: [1, 'Eq', 'Amount'],
            },
            {
              Any: [
                [
                  {
                    All: [
                      [
                        {
                          ProgramOwned: [
                            Array.from(MMMProgramID.toBuffer()),
                            'Destination',
                          ],
                        },
                        {
                          PDAMatch: [
                            Array.from(MMMProgramID.toBuffer()),
                            'Destination',
                            'DestinationSeeds',
                          ],
                        },
                      ],
                    ],
                  },
                  {
                    All: [
                      [
                        {
                          ProgramOwned: [
                            Array.from(MMMProgramID.toBuffer()),
                            'Source',
                          ],
                        },
                        {
                          PDAMatch: [
                            Array.from(MMMProgramID.toBuffer()),
                            'Source',
                            'SourceSeeds',
                          ],
                        },
                      ],
                    ],
                  },
                ],
              ],
            },
          ],
        ],
      },
    },
  ]);
};

export const createDefaultTokenAuthorizationRules = async (
  connection: Connection,
  payer: Keypair,
  ruleName: string,
) => {
  const [ruleSetAddress] = await findRuleSetPDA(payer.publicKey, ruleName);

  const createIX = createCreateOrUpdateInstruction(
    {
      payer: payer.publicKey,
      ruleSetPda: ruleSetAddress,
      systemProgram: SystemProgram.programId,
      bufferPda: AUTHORIZATION_RULES_PROGRAM_ID,
    },
    {
      createOrUpdateArgs: {
        __kind: 'V1',
        serializedRuleSet: getAmountRuleIxData(ruleName, payer.publicKey),
      },
    },
  );

  const tx = new Transaction().add(createIX);

  const blockhashData = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhashData.blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const sig = await sendAndAssertTx(connection, tx, blockhashData, false);
  return { ruleSetAddress, txId: sig };
};

const createNewMip1MintTransaction = (
  payer: Keypair,
  mintKeypair: Keypair,
  tokenProgramId: PublicKey,
  ruleSet?: PublicKey,
) => {
  //metadata account associated with mint
  const metadataPDA = findMetadataPda(mintKeypair.publicKey);
  const masterEditionPDA = findMasterEditionV2Pda(mintKeypair.publicKey);

  const data: AssetData = {
    name: 'ProgrammableNonFungible',
    symbol: 'PNF',
    uri: 'uri',
    sellerFeeBasisPoints: 150,
    creators: [
      {
        address: payer.publicKey,
        share: 100,
        verified: true,
      },
    ],
    primarySaleHappened: false,
    isMutable: true,
    tokenStandard: TokenStandard.ProgrammableNonFungible,
    collection: null,
    uses: null,
    collectionDetails: null,
    ruleSet: ruleSet ?? null,
  };

  const createArgs: CreateInstructionArgs = {
    createArgs: {
      __kind: 'V1',
      assetData: data,
      decimals: 0,
      printSupply: { __kind: 'Zero' },
    },
  };
  const accounts: CreateInstructionAccounts = {
    metadata: metadataPDA,
    masterEdition: masterEditionPDA,
    mint: mintKeypair.publicKey,
    authority: payer.publicKey,
    payer: payer.publicKey,
    splTokenProgram: tokenProgramId,
    sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    updateAuthority: payer.publicKey,
  };
  const createIx = createCreateInstruction(accounts, createArgs);
  // this test always initializes the mint, we we need to set the
  // account to be writable and a signer
  for (let i = 0; i < createIx.keys.length; i++) {
    if (createIx.keys[i].pubkey.equals(mintKeypair.publicKey)) {
      createIx.keys[i].isSigner = true;
      createIx.keys[i].isWritable = true;
    }
  }

  const createNewTokenTransaction = new Transaction().add(createIx);

  return createNewTokenTransaction;
};

export const createProgrammableNft = async (
  connection: Connection,
  authorityAndPayer: Keypair,
  recipient: PublicKey,
  tokenProgramId: PublicKey,
  ruleSet?: PublicKey,
) => {
  const metaplexInstance = getMetaplexInstance(connection);
  const mintKeypair = Keypair.generate();
  const targetTokenAccount = await getAssociatedTokenAddress(
    mintKeypair.publicKey,
    recipient,
  );
  const metadataPDA = metaplexInstance
    .nfts()
    .pdas()
    .metadata({ mint: mintKeypair.publicKey });
  const masterEditionPDA = metaplexInstance
    .nfts()
    .pdas()
    .masterEdition({ mint: mintKeypair.publicKey });

  const tx = createNewMip1MintTransaction(
    authorityAndPayer,
    mintKeypair,
    tokenProgramId,
    ruleSet,
  );
  const mintIxAccounts: MintInstructionAccounts = {
    token: targetTokenAccount,
    tokenOwner: recipient,
    mint: mintKeypair.publicKey,
    metadata: metadataPDA,
    masterEdition: masterEditionPDA,
    payer: authorityAndPayer.publicKey,
    authority: authorityAndPayer.publicKey,
    sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    splTokenProgram: tokenProgramId,
    splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    authorizationRulesProgram: AUTHORIZATION_RULES_PROGRAM_ID,
    authorizationRules: ruleSet,
    tokenRecord: getTokenRecordPDA(mintKeypair.publicKey, targetTokenAccount)
      .key,
  };
  const mintIxArgs: MintInstructionArgs = {
    mintArgs: { __kind: 'V1', amount: 1, authorizationData: null },
  };
  tx.add(createMintInstruction(mintIxAccounts, mintIxArgs));

  const blockhashData = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhashData.blockhash;
  tx.feePayer = authorityAndPayer.publicKey;
  tx.partialSign(authorityAndPayer, mintKeypair);
  await sendAndAssertTx(connection, tx, blockhashData, false);

  return {
    mintAddress: mintKeypair.publicKey,
    metadataAddress: metadataPDA,
    masterEditionAddress: masterEditionPDA,
    tokenAddress: targetTokenAccount,
  };
};

export const getInitMigrationIx = (
  authority: PublicKey,
  collectionMint: PublicKey,
  ruleset: PublicKey,
  tokenProgramId: PublicKey,
) => {
  const initArgs: InitializeInstructionArgs = {
    initializeArgs: {
      ruleSet: ruleset,
      unlockMethod: UnlockMethod.Timed,
      collectionSize: 0,
    },
  };
  const initAccounts: InitializeInstructionAccounts = {
    payer: authority,
    authority,
    collectionMint: collectionMint,
    collectionMetadata: findMetadataPda(collectionMint),
    migrationState: findMigrationState(collectionMint),
    systemProgram: SystemProgram.programId,
  };
  return createInitializeInstruction(initAccounts, initArgs);
};

export const getInitMigrationSignerIx = (payer: PublicKey) => {
  const accounts: InitSignerInstructionAccounts = {
    payer,
    programSigner: findMigrationProgramAsSigner(),
    systemProgram: SystemProgram.programId,
  };
  return createInitSignerInstruction(accounts);
};

const findDelegateRecordPda = (
  authority: PublicKey,
  collectionMint: PublicKey,
): PublicKey => {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      collectionMint.toBuffer(),
      Buffer.from('collection_authority'),
      authority.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  )[0];
};

export const getUpdateMigrationIx = (
  authority: PublicKey,
  collectionMint: PublicKey,
) => {
  const updateArgs: UpdateInstructionArgs = {
    updateArgs: {
      ruleSet: null,
      collectionSize: null,
      newUpdateAuthority: null,
    },
  };
  const updateAccounts: UpdateInstructionAccounts = {
    authority,
    migrationState: findMigrationState(collectionMint),
  };
  return createUpdateInstruction(updateAccounts, updateArgs);
};

export const getStartMigrationIx = (
  authority: PublicKey,
  collectionMint: PublicKey,
  tokenProgramId: PublicKey,
) => {
  const pas = findMigrationProgramAsSigner();
  const startAccounts: StartInstructionAccounts = {
    payer: authority,
    authority,
    collectionMint,
    collectionMetadata: findMetadataPda(collectionMint),
    delegateRecord: findDelegateRecordPda(pas, collectionMint),
    migrationState: findMigrationState(collectionMint),
    splTokenProgram: tokenProgramId,
    systemProgram: SystemProgram.programId,
    tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    programSigner: pas,
  };
  const ret = createStartInstruction(startAccounts);
  return ret;
};

export const getMigrateValidatorMigrateIx = (
  authority: PublicKey,
  owner: PublicKey,
  ownerProgram: PublicKey,
  tokenMint: PublicKey,
  tokenAccount: PublicKey,
  collectionMint: PublicKey,
  ruleset: PublicKey,
  tokenProgramId: PublicKey,
): TransactionInstruction => {
  const pas = findMigrationProgramAsSigner();
  const accounts: AccountMeta[] = [
    { pubkey: findMetadataPda(tokenMint), isSigner: false, isWritable: true },
    {
      pubkey: findMasterEditionV2Pda(tokenMint),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: tokenAccount, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: ownerProgram, isSigner: false, isWritable: false },
    {
      pubkey: MIGRATION_VALIDATOR_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: tokenMint, isSigner: false, isWritable: false },
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: pas, isSigner: false, isWritable: false },
    {
      pubkey: findMetadataPda(collectionMint),
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: findDelegateRecordPda(pas, collectionMint),
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: getTokenRecordPDA(tokenMint, tokenAccount).key,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: tokenProgramId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: AUTHORIZATION_RULES_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: ruleset, isSigner: false, isWritable: false },
    {
      pubkey: findMigrationState(collectionMint),
      isSigner: false,
      isWritable: true,
    },
    { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys: accounts,
    programId: MIGRATION_VALIDATOR_PROGRAM_ID,
    data: Buffer.from([migrateInstructionDiscriminator]),
  });
};

let tokenRecordRent: number | undefined = undefined;
export const getTokenRecordRent = async (conn: Connection): Promise<number> => {
  if (tokenRecordRent === undefined) {
    tokenRecordRent = await TokenRecord.getMinimumBalanceForRentExemption(
      {
        key: Key.TokenRecord,
        bump: 0,
        delegate: PublicKey.default,
        delegateRole: TokenDelegateRole.Sale,
        state: TokenState.Unlocked,
        ruleSetRevision: 0,
        lockedTransfer: PublicKey.default,
      },
      conn,
    );
  }

  return tokenRecordRent;
};
