import { Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import {
  keypairIdentity,
  generateSigner
} from '@metaplex-foundation/umi';
import {
  createNft,
  findMetadataPda,
  verifyCollectionV1
} from '@metaplex-foundation/mpl-token-metadata';
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters';
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";

import dotenv from 'dotenv';
dotenv.config(); // Load environment variables

// Replace this with your base58-encoded private key string from Phantom
const privateKeyString = process.env.WALLET_PRIVATE_KEY;
// const privateKeyString = process.env.STAGE_PRIVATE_KEY;
// const privateKeyString = process.env.PROD_PRIVATE_KEY;

// Convert base58 string to Uint8Array
const privateKeyUint8Array = bs58.decode(privateKeyString);

// Initialize your wallet
const wallet = Keypair.fromSecretKey(privateKeyUint8Array);

// Connect to the Solana devnet
const connection = new Connection(clusterApiUrl("devnet"));

// Initialize Umi with your wallet identity
const umi = createUmi(connection);

// Set up the signer
const myKeypair = fromWeb3JsKeypair(wallet);
umi.use(keypairIdentity(myKeypair));
umi.use(mplTokenMetadata());

// Define metadata for the collection NFT
const collectionMetadata = {
  name: "EWAN Liquidity Provider",
  symbol: "bpEWAN",
  uri: "https://files.borgpad.com/Tada/nft-metadata/collection-metadata.json", // Add your collection metadata JSON URL
  sellerFeeBasisPoints: 500, // 5% royalties (500 basis points)
};

// Check and enforce name and symbol length constraints
const nameLength = (collectionMetadata.name).length;
const symbolLength = (collectionMetadata.symbol).length;

console.log("Collection NFT name length:", nameLength);
console.log("Collection NFT symbol length:", symbolLength);

if (nameLength > 32 || symbolLength > 10) {
  throw new Error("Name or symbol length exceeds the allowed limits.");
}

// Function to mint the NFT collection and link child NFTs
async function createNFTCollection() {
  try {
    // 1. Create the collection NFT
    console.log("Creating collection NFT...");

    // Generate a new mint signer for the collection
    const collectionMint = generateSigner(umi);
    const uri = collectionMetadata.uri;

    const collectionResult = await createNft(umi, {
      mint: collectionMint,
      name: collectionMetadata.name,
      symbol: collectionMetadata.symbol,
      uri: uri,
      sellerFeeBasisPoints: collectionMetadata.sellerFeeBasisPoints, // Use raw basis points (500 = 5%)
      isCollection: true,
    }).sendAndConfirm(umi);

    console.log("Collection NFT Minted:", collectionMint.publicKey.toString());
    console.log("Transaction signature:", bs58.encode(collectionResult.signature));
    console.log("View on Solana Explorer:", `https://solscan.io/tx/${bs58.encode(collectionResult.signature)}?cluster=devnet`);

    // 2. Create a child NFT in the collection
    console.log("\nCreating child NFT...");

    // Generate a NEW mint signer for the child NFT
    const childNftMint = generateSigner(umi);

    const childResult = await createNft(umi, {
      mint: childNftMint,
      name: "My NFT",
      uri: uri,
      sellerFeeBasisPoints: collectionMetadata.sellerFeeBasisPoints,
      collection: { key: collectionMint.publicKey, verified: false },
    }).sendAndConfirm(umi, { send: { commitment: "finalized" } });

    console.log("Child NFT Minted:", childNftMint.publicKey.toString());
    console.log("Transaction signature:", bs58.encode(childResult.signature));
    console.log("View on Solana Explorer:", `https://solscan.io/tx/${bs58.encode(childResult.signature)}?cluster=devnet`);

    // 3. Verify the collection
    console.log("\nVerifying collection...");
    const metadata = findMetadataPda(umi, { mint: childNftMint.publicKey });

    const verifyResult = await verifyCollectionV1(umi, {
      metadata,
      collectionMint: collectionMint.publicKey,
      authority: umi.identity,
    }).sendAndConfirm(umi);
    
    console.log("Collection verified!");
    console.log("Verification signature:", bs58.encode(verifyResult.signature));
    console.log("View on Solana Explorer:", `https://solscan.io/tx/${bs58.encode(verifyResult.signature)}?cluster=devnet`);

  } catch (error) {
    console.error("Failed to create NFT collection:", error);
  }
}

// Run the function to create the collection and NFTs
createNFTCollection();