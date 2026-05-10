import { Transaction, SystemProgram, PublicKey, Connection, TransactionInstruction } from "@solana/web3.js"
import { Buffer } from "buffer"
import { 
  createAssociatedTokenAccountInstruction, 
  getAssociatedTokenAddress, 
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token"

// Use multiple RPC endpoints for reliability
const MAINNET_ENDPOINTS = [
  "https://haleigh-sa5aoh-fast-mainnet.helius-rpc.com",
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://go.getblock.io/4136d34f90a6488b84214ae26f0ed5f4"
]

const DEVNET_ENDPOINTS = [
  "https://api.devnet.solana.com", 
  "https://devnet.helius.xyz/v1/rpc"
]

// Parameter interface
export interface SendTokenParams {
  amount?: number;
  decimals?: number;
  tokenMint: string;
  walletAddress: string;
  destAddress: string;
  signTransaction?: (transaction: Transaction, walletType: "PHANTOM" | "BACKPACK" | "SOLFLARE") => Promise<Transaction | null>;
  walletProvider?: "PHANTOM" | "BACKPACK" | "SOLFLARE";
  cluster?: "mainnet" | "devnet";
}

/**
 * Sends SPL tokens to a destination address, creating the token account if needed
 * @param params Object containing parameters for the token transfer
 * @returns The transaction signature as a string
 */
export async function sendTokenTo(
  params: SendTokenParams
): Promise<string> {
  const { 
    amount = 0, 
    decimals = 6, 
    tokenMint, 
    walletAddress: fromAddress, 
    destAddress: toAddress,
    signTransaction,
    walletProvider,
    cluster = "mainnet"
  } = params;
  
  if (!signTransaction || !walletProvider) {
    throw new Error("signTransaction and walletProvider are required");
  }
  
  // Choose endpoints based on cluster
  const endpoints = cluster === "mainnet" ? MAINNET_ENDPOINTS : DEVNET_ENDPOINTS;
  let lastError = null;
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Trying endpoint: ${endpoint} on ${cluster}`);
      
      const connection = new Connection(endpoint, "confirmed");
      const mint = new PublicKey(tokenMint);
      const fromPublicKey = new PublicKey(fromAddress);
      const toPublicKey = new PublicKey(toAddress);
      
      // Get associated token accounts for sender and receiver
      const fromTokenAccount = await getAssociatedTokenAddress(
        mint,
        fromPublicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      const toTokenAccount = await getAssociatedTokenAddress(
        mint,
        toPublicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      // Check if destination token account exists
      const destinationAccount = await connection.getAccountInfo(toTokenAccount);
      
      const transaction = new Transaction();
      
      // If destination token account doesn't exist, create it
      if (!destinationAccount) {
        console.log("Creating token account...");
        transaction.add(
          createAssociatedTokenAccountInstruction(
            fromPublicKey,
            toTokenAccount,
            toPublicKey,
            mint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }
      
      // Only add transfer instruction if amount > 0
      if (amount > 0) {
        console.log(`Adding transfer instruction: ${amount} tokens (${amount / Math.pow(10, decimals)} with decimals)`);
        transaction.add(
          createTransferCheckedInstruction(
            fromTokenAccount,
            mint,
            toTokenAccount,
            fromPublicKey,
            amount,
            decimals,
            [],
            TOKEN_PROGRAM_ID
          )
        );
        
        // Add a memo for better transaction tracking
        transaction.add(
          new TransactionInstruction({
            keys: [],
            programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
            data: Buffer.from(`Send ${amount / Math.pow(10, decimals)} tokens to ${toAddress}`),
          })
        );
      }
      
      // Get latest blockhash and set transaction parameters
      const recentBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = recentBlockhash.blockhash;
      transaction.feePayer = fromPublicKey;
      
      // Sign the transaction
      console.log("Signing transaction...");
      const signedTx = await signTransaction(transaction, walletProvider);
      if (!signedTx) throw new Error("Failed to sign transaction");
      
      // Send the transaction
      console.log("Sending transaction...");
      const txId = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      
      console.log("Transaction sent successfully:", txId);
      
      // Return the signature as a string
      return txId;
    } catch (err) {
      console.error(`❌ Error with endpoint ${endpoint}:`, err);
      lastError = err;
      // Continue to the next endpoint
    }
  }
  
  // If we get here, all endpoints failed
  console.error("❌ All RPC endpoints failed");
  throw lastError || new Error("All RPC endpoints failed");
}
