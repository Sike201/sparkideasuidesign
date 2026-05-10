import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import pkg from '@metaplex-foundation/mpl-token-metadata';
const { Metadata, PROGRAM_ADDRESS: metaplexProgramId } = pkg;
import fs from "fs";
import dotenv from 'dotenv';

dotenv.config();

// Initialize connection to Solana devnet
const connection = new Connection(process.env.SOLANA_RPC_URL_DEVNET || clusterApiUrl("devnet"));
// const connection = new Connection(process.env.SOLANA_RPC_URL_MAINNET || clusterApiUrl("mainnet"));

// The address that minted the NFTs
// const minterAddress = new PublicKey("autd8K3Y3PADUm5ivDYw3YXsJXZFSX2eubhkrAuihkQ");
const minterAddress = new PublicKey("aut9x83v6CmtdKHQDsPK9csZCJWtfAUCF2mqLxSr19Y");

// Helper function to add delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getLastMintTransactions() {
  try {
    console.log("Getting all transactions...");
    
    // Get all signatures using pagination
    let allSignatures = [];
    let lastSignature = null;
    
    while (true) {
      const options = {
        limit: 1000, // Maximum allowed by the API
        before: lastSignature
      };
      
      const signatures = await connection.getSignaturesForAddress(minterAddress, options);
      if (signatures.length === 0) break;
      
      allSignatures.push(...signatures);
      lastSignature = signatures[signatures.length - 1].signature;
      
      console.log(`Fetched ${allSignatures.length} signatures so far...`);
      await delay(1000); // Add delay between pagination requests
    }
    
    console.log(`Found total of ${allSignatures.length} transactions`);
    console.log("Getting transaction data...");
    
    const transactions = [];
    
    // Process transactions one by one with delay to avoid rate limiting
    for (const sig of allSignatures) {
      try {
        const tx = await connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0
        });
        if (tx) {
          transactions.push(tx);
        }
        // Add delay between requests
        await delay(1000);
      } catch (error) {
        console.error(`Error fetching transaction ${sig.signature}:`, error.message);
        continue;
      }
    }

    // Prepare CSV header
    const csvRows = ['NFT Mint Address'];
    const processedMints = new Set(); // To prevent duplicates
    
    // Process each transaction
    for (const tx of transactions) {
      if (!tx || !tx.meta || !tx.transaction) continue;

      // Get all instructions from the transaction
      const instructions = tx.meta.innerInstructions?.[0]?.instructions || [];
      
      // Look for token program instructions
      for (const ix of instructions) {
        try {
          if (!ix.programIdIndex || !ix.accounts || ix.accounts.length < 2) continue;

          const programId = tx.transaction.message.staticAccountKeys[ix.programIdIndex]?.toString();
          if (!programId) continue;
          
          // Check if it's a token program instruction
          if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            // The first account is the NFT mint address
            const nftMintAddress = tx.transaction.message.staticAccountKeys[ix.accounts[0]]?.toString();
            
            if (nftMintAddress && !processedMints.has(nftMintAddress)) {
              processedMints.add(nftMintAddress);
              // Add to CSV rows
              csvRows.push(nftMintAddress);
            }
          }
        } catch (error) {
          console.error('Error processing instruction:', error.message);
          continue;
        }
      }
    }

    // Save to CSV file
    const filename = 'mint_transactions_devnet.csv';
    fs.writeFileSync(filename, csvRows.join('\n'));
    console.log(`Saved ${processedMints.size} unique NFT mint addresses to ${filename}`);

  } catch (error) {
    console.error("Error fetching transactions:", error);
  }
}

// Run the function
getLastMintTransactions();