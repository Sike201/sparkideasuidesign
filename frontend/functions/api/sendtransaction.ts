import { Connection, Commitment } from '@solana/web3.js'
import { jsonResponse, reportError } from './cfPagesFunctionsUtils';

/**
 * Custom transaction confirmation with fast polling
 */
async function confirmTransactionWithPolling(
  connection: Connection,
  signature: string,
  commitment: Commitment,
  maxAttempts: number,
  intervalMs: number
): Promise<{ success: boolean; hasError?: boolean; error?: string; attempts?: number }> {
  console.log(`[confirmTransaction] Starting polling for signature: ${signature}`)
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[confirmTransaction] Attempt ${attempt}/${maxAttempts} - checking signature...`)
      
      // Get transaction status
      const result = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true
      })
      
      if (result.value) {
        const status = result.value
        
        if (status.confirmationStatus === commitment || 
            status.confirmationStatus === 'finalized' ||
            (commitment === 'confirmed' && status.confirmationStatus === 'finalized')) {
          
          if (status.err) {
            console.log(`[confirmTransaction] Transaction failed with error:`, status.err)
            return {
              success: true,
              hasError: true,
              error: JSON.stringify(status.err),
              attempts: attempt
            }
          }
          
          console.log(`[confirmTransaction] Transaction confirmed with status: ${status.confirmationStatus}`)
          return {
            success: true,
            hasError: false,
            attempts: attempt
          }
        }
        
        console.log(`[confirmTransaction] Current status: ${status.confirmationStatus || 'processing'}, waiting...`)
      } else {
        console.log(`[confirmTransaction] Transaction not found yet, waiting...`)
      }
      
      // Wait before next attempt (except on the last attempt)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, intervalMs))
      }
      
    } catch (error) {
      console.log(`[confirmTransaction] Error checking signature (attempt ${attempt}):`, error)
      
      // If it's the last attempt, return the error
      if (attempt === maxAttempts) {
        return {
          success: false,
          error: `Failed to confirm transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      }
      
      // Otherwise, wait and retry
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
  }
  
  console.log(`[confirmTransaction] Timeout after ${maxAttempts} attempts`)
  return {
    success: false,
    error: `Transaction confirmation timeout after ${maxAttempts} attempts. Check signature ${signature} manually.`
  }
}

type ENV = {
  DB: D1Database
  RPC_URL: string
}

type SendTransactionRequest = {
  signedTransaction: string // Base64 encoded signed transaction
  commitment?: string
}

type SendTransactionResponse = {
  success: boolean
  signature?: string
  error?: string
}

// Import enhanced rate limiting
import { retryWithBackoffAndRateLimit, RateLimiter } from './rateLimit';

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const db = ctx.env.DB

  try {
    const body = await ctx.request.json() as SendTransactionRequest
    const { signedTransaction, commitment = 'confirmed' } = body

    // Validate required parameters
    if (!signedTransaction) {
      return jsonResponse({ 
        success: false,
        error: "Missing required parameter: signedTransaction" 
      }, 400)
    }

    // Validate commitment level
    const validCommitments = ['processed', 'confirmed', 'finalized']
    if (!validCommitments.includes(commitment)) {
      return jsonResponse({ 
        success: false,
        error: `Invalid commitment level. Must be one of: ${validCommitments.join(', ')}` 
      }, 400)
    }

    console.log(`[sendtransaction] Processing transaction with commitment: ${commitment}`)

    // Get RPC URLs with fallback options
    const getRpcUrls = (): string[] => {
      const urls: string[] = []
      
      // Primary RPC URL from environment
      if (ctx.env.RPC_URL) {
        urls.push(ctx.env.RPC_URL)
      }
      
      // Public fallback (though it might be rate limited)
      urls.push("https://api.mainnet-beta.solana.com")
      
      return urls
    }

    const rpcUrls = getRpcUrls()
    console.log(`[sendtransaction] Available RPC URLs: ${rpcUrls.length}`)
    
    let connection: Connection | null = null
    let lastError: Error | null = null
    
    // Try each RPC URL until one works
    for (const rpcUrl of rpcUrls) {
      try {
        console.log(`[sendtransaction] Trying RPC: ${rpcUrl.replace(/api-key=[^&]*/, 'api-key=***')}`)
        connection = new Connection(rpcUrl, commitment as any)
        
        // Test the connection with a simple call
        await connection.getSlot()
        console.log(`[sendtransaction] Successfully connected to RPC`)
        break
      } catch (error) {
        console.log(`[sendtransaction] RPC failed:`, error)
        lastError = error as Error
        connection = null
      }
    }
    
    if (!connection) {
      throw new Error(`All RPC endpoints failed. Last error: ${lastError?.message}`)
    }

    // Convert base64 signed transaction to Buffer
    let transactionBuffer: Buffer
    try {
      transactionBuffer = Buffer.from(signedTransaction, 'base64')
    } catch (error) {
      return jsonResponse({
        success: false,
        error: "Invalid signed transaction format. Must be base64 encoded."
      }, 400)
    }

    // Create rate limiter for this operation
    const rateLimiter = new RateLimiter(2); // 2 requests per second for transactions
    
    // Send the transaction with enhanced retry logic and rate limiting
    let signature: string
    try {
      console.log(`[sendtransaction] Sending transaction...`)
      signature = await retryWithBackoffAndRateLimit(
        () => Promise.race([
          connection!.sendRawTransaction(transactionBuffer, {
            skipPreflight: false,
            maxRetries: 5,
            preflightCommitment: commitment as any,
          }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Transaction send timeout')), 30000)
          )
        ]),
        3,
        1000,
        rateLimiter
      )
      console.log(`[sendtransaction] Transaction sent with signature: ${signature}`)
    } catch (error) {
      console.log(`[sendtransaction] Error sending transaction:`, error)
      return jsonResponse({
        success: false,
        error: `Failed to send transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
      }, 500)
    }

    // Wait for confirmation with custom polling (check every second)
    try {
      console.log(`[sendtransaction] Waiting for confirmation with 1-second polling...`)
      
      const confirmationResult = await confirmTransactionWithPolling(
        connection,
        signature,
        commitment as any,
        30, // max attempts (30 seconds)
        1000 // check every 1 second
      )
      
      if (!confirmationResult.success) {
        console.log(`[sendtransaction] Transaction confirmation failed:`, confirmationResult.error)
        return jsonResponse({
          success: false,
          signature,
          error: confirmationResult.error
        }, 400)
      }
      
      if (confirmationResult.hasError) {
        console.log(`[sendtransaction] Transaction failed on-chain:`, confirmationResult.error)
        return jsonResponse({
          success: false,
          signature,
          error: `Transaction failed: ${confirmationResult.error}`
        }, 400)
      }
      
      console.log(`[sendtransaction] Transaction confirmed successfully in ${confirmationResult.attempts} attempts`)
      
      const response: SendTransactionResponse = {
        success: true,
        signature
      }

      console.log(`[sendtransaction] Returning response:`, response)
      return jsonResponse(response, 200)

    } catch (confirmError) {
      console.error('Confirmation error:', confirmError)
      
      // Even if confirmation times out, the transaction might still succeed
      // Return the signature so the user can check it manually
      return jsonResponse({
        success: true, // We'll consider this successful since we got a signature
        signature,
        error: `Transaction submitted but confirmation timed out. Check signature manually: ${signature}`
      }, 200)
    }

  } catch (e) {
    console.error("Transaction send error:", e)
    await reportError(db, e)
    return jsonResponse({ 
      success: false,
      error: e instanceof Error ? e.message : "Unknown error occurred"
    }, 500)
  }
}

export const onRequestOptions: PagesFunction<ENV> = async (ctx) =>
  jsonResponse({}, {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
  })
