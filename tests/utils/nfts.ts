import {
  CreatorInput,
  keypairIdentity,
  Metaplex,
  PublicKey,
  token as getSplTokenAmount,
} from '@metaplex-foundation/js';
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { getKeypair, sendAndAssertTx } from './generic';
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeInstruction,
  createInitializeGroupMemberPointerInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  createInitializeGroupPointerInstruction,
} from '@solana/spl-token';
import {
  createInitializeGroupInstruction,
  createInitializeMemberInstruction,
} from '@solana/spl-token-group';

export const getMetaplexInstance = (conn: Connection) => {
  return Metaplex.make(conn).use(keypairIdentity(getKeypair()));
};

export const getMetadataURI = (index: number): string => {
  return `nft://${index}.json`;
};

export const mintNfts = async (
  conn: Connection,
  config: {
    numNfts: number;
    recipient?: PublicKey;
    isCollection?: boolean;
    collectionAddress?: PublicKey;
    verifyCollection?: boolean;
    collectionIsSized?: boolean;
    creators?: CreatorInput[];
    sftAmount?: number; // if this is set, will mint sft instread of nft
  },
) => {
  const metaplexInstance = getMetaplexInstance(conn);
  let collectionSigner = (() => {
    if (config.verifyCollection) {
      const kp = getKeypair();
      return { publicKey: kp.publicKey, secretKey: kp.secretKey };
    }
    return undefined;
  })();

  const sftAmount = config.sftAmount;
  if (sftAmount === undefined) {
    return Promise.all(
      Array(0, config.numNfts).map((_, index) =>
        metaplexInstance.nfts().create(
          {
            name: `TEST #${index}`,
            uri: getMetadataURI(index),
            sellerFeeBasisPoints: 100,
            isCollection: config.isCollection,
            tokenOwner: config.recipient,
            collection: config.collectionAddress,
            collectionAuthority: collectionSigner,
            collectionIsSized: config.collectionIsSized,
            creators: config.creators,
          },
          { confirmOptions: { skipPreflight: true, commitment: 'processed' } },
        ),
      ),
    );
  } else {
    return Promise.all(
      Array(0, config.numNfts).map((_, index) =>
        metaplexInstance.nfts().createSft(
          {
            name: `TEST #${index}`,
            uri: `nft://${index}.json`,
            sellerFeeBasisPoints: 100,
            isCollection: config.isCollection,
            tokenOwner: config.recipient ?? getKeypair().publicKey,
            collection: config.collectionAddress,
            collectionAuthority: collectionSigner,
            collectionIsSized: config.collectionIsSized,
            creators: config.creators,
            tokenAmount: getSplTokenAmount(sftAmount),
          },
          { confirmOptions: { skipPreflight: true, commitment: 'processed' } },
        ),
      ),
    );
  }
};

export const mintCollection = async (
  conn: Connection,
  config: {
    numNfts: number;
    legacy: boolean;
    recipient?: PublicKey;
    verifyCollection: boolean;
    creators?: CreatorInput[];
  },
) => {
  const collectionNft = (
    await mintNfts(conn, {
      numNfts: 1,
      isCollection: true,
      collectionIsSized: !config.legacy,
    })
  )[0];

  const collectionMembers = await mintNfts(conn, {
    numNfts: config.numNfts,
    recipient: config.recipient,
    collectionAddress: collectionNft.mintAddress,
    verifyCollection: config.verifyCollection,
    creators: config.creators,
  });

  return { collection: collectionNft, members: collectionMembers };
};

export async function createTestMintAndTokenT22VanillaExt(
  connection: Connection,
  payer: Keypair,
  recipient?: PublicKey,
  groupAddress?: PublicKey,
  groupMemberAddress?: PublicKey,
) {
  const mintKeypair = Keypair.generate();
  const effectiveGroupAddress = groupAddress ?? Keypair.generate().publicKey;
  const tokenProgramId = TOKEN_2022_PROGRAM_ID;
  const effectiveRecipient = recipient ?? payer.publicKey;
  const targetTokenAccount = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    effectiveRecipient,
    true,
    tokenProgramId,
  );

  const mintSpace = getMintLen([
    ExtensionType.MetadataPointer,
    ExtensionType.GroupMemberPointer,
  ]);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(
    mintSpace * 2,
  );

  const createMintAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mintKeypair.publicKey,
    space: mintSpace,
    lamports: mintLamports,
    programId: tokenProgramId,
  });
  const createMetadataPointerIx = createInitializeMetadataPointerInstruction(
    mintKeypair.publicKey,
    payer.publicKey,
    mintKeypair.publicKey,
    tokenProgramId,
  );

  const memberAddress = groupMemberAddress ?? mintKeypair.publicKey;
  const createGroupMemberPointerIx =
    createInitializeGroupMemberPointerInstruction(
      mintKeypair.publicKey,
      payer.publicKey,
      memberAddress,
      tokenProgramId,
    );
  const createInitMintIx = createInitializeMint2Instruction(
    mintKeypair.publicKey,
    0,
    payer.publicKey,
    payer.publicKey,
    tokenProgramId,
  );

  const createMetadataIx = createInitializeInstruction({
    metadata: mintKeypair.publicKey,
    updateAuthority: payer.publicKey,
    mint: mintKeypair.publicKey,
    mintAuthority: payer.publicKey,
    name: 'xyzname',
    symbol: 'xyz',
    uri: 'example.com',
    programId: tokenProgramId,
  });

  const createGroupMemberIx = createInitializeMemberInstruction({
    programId: tokenProgramId,
    member: mintKeypair.publicKey,
    memberMint: mintKeypair.publicKey,
    memberMintAuthority: payer.publicKey,
    group: effectiveGroupAddress,
    groupUpdateAuthority: payer.publicKey,
  });

  const createAtaIx = createAssociatedTokenAccountInstruction(
    payer.publicKey,
    targetTokenAccount,
    effectiveRecipient,
    mintKeypair.publicKey,
    tokenProgramId,
  );

  const mintToIx = createMintToInstruction(
    mintKeypair.publicKey,
    targetTokenAccount,
    payer.publicKey,
    1, // amount
    [],
    tokenProgramId,
  );

  const blockhashData = await connection.getLatestBlockhash();
  const tx = new Transaction().add(
    createMintAccountIx,
    createGroupMemberPointerIx,
    createMetadataPointerIx,
    createInitMintIx,
    createMetadataIx,
    createGroupMemberIx,
    createAtaIx,
    mintToIx,
  );
  tx.recentBlockhash = blockhashData.blockhash;
  tx.feePayer = payer.publicKey;
  tx.partialSign(payer, mintKeypair);
  await sendAndAssertTx(connection, tx, blockhashData, false);

  return {
    mint: mintKeypair.publicKey,
    recipientTokenAccount: targetTokenAccount,
  };
}

export async function createTestGroupMintExt(
  connection: Connection,
  payer: Keypair,
) {
  const tokenProgramId = TOKEN_2022_PROGRAM_ID;
  const groupKeyPair = Keypair.generate();
  const mintSpace = getMintLen([ExtensionType.GroupPointer]);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(
    mintSpace * 2,
  );

  const createMintAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: groupKeyPair.publicKey,
    space: mintSpace,
    lamports: mintLamports,
    programId: tokenProgramId,
  });
  const createGroupPointerIx = createInitializeGroupPointerInstruction(
    groupKeyPair.publicKey,
    payer.publicKey,
    groupKeyPair.publicKey,
    tokenProgramId,
  );

  const createInitMintIx = createInitializeMint2Instruction(
    groupKeyPair.publicKey,
    0,
    payer.publicKey,
    payer.publicKey,
    tokenProgramId,
  );

  const createGroupIx = createInitializeGroupInstruction({
    programId: tokenProgramId,
    group: groupKeyPair.publicKey,
    mint: groupKeyPair.publicKey,
    mintAuthority: payer.publicKey,
    updateAuthority: payer.publicKey,
    maxSize: 10,
  });

  const blockhashData = await connection.getLatestBlockhash();
  const tx = new Transaction().add(
    createMintAccountIx,
    createGroupPointerIx,
    createInitMintIx,
    createGroupIx,
  );
  tx.recentBlockhash = blockhashData.blockhash;
  tx.feePayer = payer.publicKey;
  tx.partialSign(payer, groupKeyPair);
  await sendAndAssertTx(connection, tx, blockhashData, false);

  return {
    groupAddress: groupKeyPair.publicKey,
  };
}

export async function createTestGroupMemberMint(
  connection: Connection,
  payer: Keypair,
  groupAddress: PublicKey,
) {
  const tokenProgramId = TOKEN_2022_PROGRAM_ID;
  const groupMemberKeyPair = Keypair.generate();
  const mintSpace = getMintLen([ExtensionType.GroupPointer]);
  const mintLamports = await connection.getMinimumBalanceForRentExemption(
    mintSpace * 2,
  );

  const createMintAccountIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: groupMemberKeyPair.publicKey,
    space: mintSpace,
    lamports: mintLamports,
    programId: tokenProgramId,
  });
  const createGroupMemberPointerIx =
    createInitializeGroupMemberPointerInstruction(
      groupMemberKeyPair.publicKey,
      payer.publicKey,
      groupMemberKeyPair.publicKey,
      tokenProgramId,
    );

  const createInitMintIx = createInitializeMint2Instruction(
    groupMemberKeyPair.publicKey,
    0,
    payer.publicKey,
    payer.publicKey,
    tokenProgramId,
  );

  const createGroupMemberIx = createInitializeMemberInstruction({
    programId: tokenProgramId,
    member: groupMemberKeyPair.publicKey,
    memberMint: groupMemberKeyPair.publicKey,
    memberMintAuthority: payer.publicKey,
    group: groupAddress,
    groupUpdateAuthority: payer.publicKey,
  });

  const blockhashData = await connection.getLatestBlockhash();
  const tx = new Transaction().add(
    createMintAccountIx,
    createGroupMemberPointerIx,
    createInitMintIx,
    createGroupMemberIx,
  );
  tx.recentBlockhash = blockhashData.blockhash;
  tx.feePayer = payer.publicKey;
  tx.partialSign(payer, groupMemberKeyPair);
  await sendAndAssertTx(connection, tx, blockhashData, false);

  return {
    groupMemberKeyPair,
  };
}
