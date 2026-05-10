import { Transaction, SystemProgram, PublicKey, Connection, TransactionInstruction } from "@solana/web3.js"
import { Buffer } from "buffer"

// Use a public RPC endpoint
const RPC_ENDPOINT1 = "https://solana-rpc.publicnode.com"
const RPC_ENDPOINT2 = "https://go.getblock.io/4136d34f90a6488b84214ae26f0ed5f4"

/**
 * Creates and sends a transaction with a memo instruction containing the message
 * @param message The message to include in the transaction
 * @param address The wallet address
 * @param signTransaction Function to sign the transaction
 * @param walletProvider The wallet provider (PHANTOM, BACKPACK, SOLFLARE)
 * @returns The transaction signature
 */
export async function sendTransaction(
  message: string,
  address: string,
  signTransaction: (transaction: Transaction, walletType: "PHANTOM" | "BACKPACK" | "SOLFLARE") => Promise<Transaction | null>,
  walletProvider: "PHANTOM" | "BACKPACK" | "SOLFLARE"
): Promise<Uint8Array> {
  const endpoints = [RPC_ENDPOINT1, RPC_ENDPOINT2]
  let lastError = null
  
  for (const endpoint of endpoints) {
    try {
      const connection = new Connection(endpoint)
      const recentBlockhash = await connection.getLatestBlockhash()

      const transaction = new Transaction()

      // Add a zero-lamport transfer to the same address (required for some wallets)
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(address),
          toPubkey: new PublicKey(address),
          lamports: 0,
        })
      )

      // Add the message as a memo instruction
      transaction.add(
        new TransactionInstruction({
          keys: [],
          programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
          data: Buffer.from(message),
        })
      )

      transaction.recentBlockhash = recentBlockhash.blockhash
      transaction.feePayer = new PublicKey(address)

      // Sign the transaction
      const signedTx = await signTransaction(transaction, walletProvider)
      if (!signedTx) throw new Error("Failed to sign transaction")

      // Send the transaction
      const txId = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      })

      // Return the signature
      return signedTx.signatures[0].signature!
    } catch (err) {
      console.error(`❌ Error with endpoint ${endpoint}:`, err)
      lastError = err
      // Continue to the next endpoint
    }
  }
  
  // If we get here, all endpoints failed
  console.error("❌ All RPC endpoints failed")
  throw lastError || new Error("All RPC endpoints failed")
}
