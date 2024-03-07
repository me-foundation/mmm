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
} from '@solana/spl-token';
import { createInitializeMemberInstruction } from '@solana/spl-token-group';

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

export async function createTestMintAndTokenT22Vanilla(
  connection: Connection,
  payer: Keypair,
  recipient?: PublicKey,
  groupAddress?: PublicKey,
) {
  const mintKeypair = Keypair.generate();
  const memberAddress = PublicKey.unique();
  const effectiveGroupAddress = groupAddress ?? PublicKey.unique();
  const tokenProgramId = TOKEN_2022_PROGRAM_ID;
  const effectiveRecipient = recipient ?? payer.publicKey;
  const targetTokenAccount = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    effectiveRecipient,
    true,
    tokenProgramId,
  );

  const mintSpace = getMintLen([ExtensionType.MetadataPointer]);
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
  const createPointerIx = createInitializeMetadataPointerInstruction(
    mintKeypair.publicKey,
    payer.publicKey,
    mintKeypair.publicKey,
    tokenProgramId,
  );
  const createGroupMemberIx = createInitializeMemberInstruction({
    programId: tokenProgramId,
    member: memberAddress,
    memberMint: mintKeypair.publicKey,
    memberMintAuthority: payer.publicKey,
    group: effectiveGroupAddress,
    groupUpdateAuthority: payer.publicKey,
  });
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
    createPointerIx,
    createGroupMemberIx,
    createGroupMemberPointerIx,
    createInitMintIx,
    createMetadataIx,
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
