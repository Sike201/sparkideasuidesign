import { Connection, PublicKey } from "@solana/web3.js"
import bs58 from "bs58"

// Use a public RPC endpoint
const RPC_ENDPOINT1 = "https://solana-rpc.publicnode.com"
const RPC_ENDPOINT2 = "https://go.getblock.io/4136d34f90a6488b84214ae26f0ed5f4"

/**
 * Validates a transaction by checking if the message and sender match the expected values
 * @param message The expected message
 * @param publicKey The expected sender's public key
 * @param signature The transaction signature
 * @returns The transaction signature if valid, throws an error otherwise
 */
export async function validateTransaction(
  message: string,
  publicKey: string,
  signature: Uint8Array
): Promise<boolean> {
  const signatureBase58 = bs58.encode(signature)
  const endpoints = [RPC_ENDPOINT1, RPC_ENDPOINT2]
  
  let lastError = null
  
  for (const endpoint of endpoints) {
    try {
      const connection = new Connection(endpoint)
      const transaction = await waitForTransaction(connection, signatureBase58)

      if (!transaction || !transaction.meta || !transaction.meta.logMessages) {
        console.log("❌ Transaction not found or invalid")
        continue
      }

      const logMessages = transaction.meta.logMessages
      const memoLog = logMessages.find(log => log.includes('Program log: Memo'))
      let extractedMessage: string | null = null

      if (memoLog) {
        const matches = memoLog.match(/"([^"]*)"/)
        if (matches && matches[1]) {
          extractedMessage = matches[1]
        }
      }

      const firstAccount = transaction.transaction.message.accountKeys[0]
      const senderPublicKey = firstAccount.pubkey.toString()

      console.log("Extracted message from the transaction:", extractedMessage)
      console.log("Expected message:", message)
      console.log("Sender's address (string):", senderPublicKey)
      console.log("Expected address:", publicKey)

      const isVerified = extractedMessage === message && senderPublicKey === publicKey

      if (!isVerified) {
        throw new Error("Transaction validation failed")
      }

      return isVerified
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

async function waitForTransaction(connection: Connection, signatureBase58: string, timeout = 30000) {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    const transaction = await connection.getParsedTransaction(signatureBase58, { commitment: "confirmed" })
    if (transaction) {
      return transaction
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error("Timeout: Transaction not found")
}
