import { Connection } from '@solana/web3.js'
import { jsonResponse, reportError } from './cfPagesFunctionsUtils';

type ENV = {
  DB: D1Database
  RPC_URL: string
}

type GetBlockhashResponse = {
  success: boolean
  blockhash?: string
  lastValidBlockHeight?: number
  error?: string
}

// Import enhanced rate limiting
import { retryWithBackoffAndRateLimit, RateLimiter } from './rateLimit';

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const db = ctx.env.DB

  try {
    console.log(`[getblockhash] Getting recent blockhash...`)

    // Get RPC URLs with fallback options
    const getRpcUrls = (): string[] => {
      const urls: string[] = []
      
      // Primary RPC URL from environment
      if (ctx.env.RPC_URL) {
        urls.push(ctx.env.RPC_URL)
      }
      
      // Public fallback
      urls.push("https://api.mainnet-beta.solana.com")
      
      return urls
    }

    const rpcUrls = getRpcUrls()
    console.log(`[getblockhash] Available RPC URLs: ${rpcUrls.length}`)
    
    let connection: Connection | null = null
    let lastError: Error | null = null
    
    // Try each RPC URL until one works
    for (const rpcUrl of rpcUrls) {
      try {
        console.log(`[getblockhash] Trying RPC: ${rpcUrl.replace(/api-key=[^&]*/, 'api-key=***')}`)
        connection = new Connection(rpcUrl, "confirmed")
        
        // Test the connection with a simple call
        await connection.getSlot()
        console.log(`[getblockhash] Successfully connected to RPC`)
        break
      } catch (error) {
        console.log(`[getblockhash] RPC failed:`, error)
        lastError = error as Error
        connection = null
      }
    }
    
    if (!connection) {
      throw new Error(`All RPC endpoints failed. Last error: ${lastError?.message}`)
    }

    // Create rate limiter for this operation
    const rateLimiter = new RateLimiter(3); // 3 requests per second
    
    // Get recent blockhash with enhanced retry logic and rate limiting
    let blockhashInfo;
    try {
      console.log(`[getblockhash] Fetching recent blockhash...`)
      blockhashInfo = await retryWithBackoffAndRateLimit(
        () => Promise.race([
          connection!.getLatestBlockhash(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Blockhash fetch timeout')), 20000)
          )
        ]),
        3,
        1000,
        rateLimiter
      )
      console.log(`[getblockhash] Blockhash fetched:`, blockhashInfo.blockhash)
    } catch (error) {
      console.log(`[getblockhash] Error fetching blockhash:`, error)
      throw new Error(`Failed to get recent blockhash: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    const response: GetBlockhashResponse = {
      success: true,
      blockhash: blockhashInfo.blockhash,
      lastValidBlockHeight: blockhashInfo.lastValidBlockHeight
    }

    console.log(`[getblockhash] Returning response:`, response)
    return jsonResponse(response, 200)

  } catch (e) {
    console.error("Blockhash fetch error:", e)
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    }
  })
