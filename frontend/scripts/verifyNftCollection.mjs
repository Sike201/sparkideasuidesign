import { Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import {
  keypairIdentity,
  generateSigner
} from '@metaplex-foundation/umi';
import {
  findMetadataPda,
  verifyCollectionV1,
  fetchMetadata,
  findCollectionAuthorityRecordPda
} from '@metaplex-foundation/mpl-token-metadata';
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters';
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { PublicKey } from "@solana/web3.js";

dotenv.config(); // Load environment variables

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Replace this with your base58-encoded private key string from Phantom
// const privateKeyString = process.env.STAGE_PRIVATE_KEY;
const privateKeyString = process.env.PROD_PRIVATE_KEY;

// Convert base58 string to Uint8Array
const privateKeyUint8Array = bs58.decode(privateKeyString);

// Initialize your wallet
const wallet = Keypair.fromSecretKey(privateKeyUint8Array);

// Connect to the Solana devnet
// const connection = new Connection(clusterApiUrl("devnet"));
// const connection = new Connection(clusterApiUrl("mainnet-beta"));
// const connection = new Connection(process.env.SOLANA_RPC_URL_DEVNET);
const connection = new Connection(process.env.SOLANA_RPC_URL_MAINNET);


// Initialize Umi with your wallet identity
const umi = createUmi(connection);

// Set up the signer
const myKeypair = fromWeb3JsKeypair(wallet);
umi.use(keypairIdentity(myKeypair));
umi.use(mplTokenMetadata());

async function verifyNFTsInCollection() {
  try {
    // Read the CSV file from the scripts directory
    // const csvPath = path.join(__dirname, 'mint_transactions_devnet.csv');
    const csvPath = path.join(__dirname, 'mint_transactions_mainnet.csv');
    console.log('Reading CSV from:', csvPath);
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const nftMintAddresses = csvContent.split('\n').slice(1); // Skip header row

    console.log(`Found ${nftMintAddresses.length} NFTs to verify`);
    console.log('Using wallet:', wallet.publicKey.toString());

    // Process each NFT
    let verifiedCount = 0;
    let skippedCount = 0;
    for (const mintAddress of nftMintAddresses) {
      if (!mintAddress.trim()) continue; // Skip empty lines

      try {
        console.log(`\nProcessing NFT: ${mintAddress}`);
        verifiedCount++;
        console.log(`${verifiedCount}`);
        
        // Find the metadata PDA for the NFT
        const metadata = findMetadataPda(umi, { 
          mint: new PublicKey(mintAddress)
        });

        // Fetch the NFT's metadata to get its collection
        let nftMetadata;
        try {
          nftMetadata = await fetchMetadata(umi, metadata);
          // console.log("nftMetadata", nftMetadata);
        } catch (metadataError) {
          console.error(`Failed to fetch metadata for NFT ${mintAddress}:`, metadataError.message);
          skippedCount++;
          continue; // Skip to next NFT if metadata fetch fails
        }
        
        if (!nftMetadata || !nftMetadata.collection || nftMetadata.collection.__option === 'None') {
          console.log(`NFT ${mintAddress} has no collection defined, skipping...`);
          skippedCount++;
          continue;
        }

        const collectionMintAddress = nftMetadata.collection.value.key;
        console.log(`Collection address for NFT: ${collectionMintAddress}`);

        // Find the collection authority record PDA
        const collectionAuthorityRecord = findCollectionAuthorityRecordPda(umi, {
          mint: collectionMintAddress,
          collectionAuthority: umi.identity.publicKey,
        });

        // Verify the collection
        const verifyResult = await verifyCollectionV1(umi, {
          metadata,
          collectionMint: collectionMintAddress,
          authority: umi.identity,
          collectionAuthorityRecord,
        }).sendAndConfirm(umi);
        
        console.log("NFT verified successfully!");
        console.log("Verification signature:", bs58.encode(verifyResult.signature));
        console.log("View on Solana Explorer:", `https://solscan.io/tx/${bs58.encode(verifyResult.signature)}?cluster=devnet`);

        // Add a small delay between verifications to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Failed to verify NFT ${mintAddress}:`, error.message);
        if (error.message.includes("Incorrect account owner")) {
          console.error("This NFT's collection requires different authority, skipping...");
          skippedCount++;
        }
        continue; // Continue with next NFT for all types of errors
      }
    }

    console.log("\nVerification process completed!");
    console.log(`Total NFTs processed: ${verifiedCount}`);
    console.log(`Skipped NFTs: ${skippedCount}`);
    console.log(`Successfully verified: ${verifiedCount - skippedCount}`);

  } catch (error) {
    console.error("Failed to verify NFTs:", error);
  }
}

// Run the verification process
verifyNFTsInCollection();