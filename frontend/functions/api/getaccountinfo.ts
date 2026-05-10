import { Connection, PublicKey } from '@solana/web3.js'
import { jsonResponse, reportError } from './cfPagesFunctionsUtils';

type ENV = {
  DB: D1Database
  RPC_URL: string
}

type GetAccountInfoRequest = {
  address: string
}

type GetAccountInfoResponse = {
  success: boolean
  exists?: boolean
  data?: any
  error?: string
}

// Import enhanced rate limiting
import { retryWithBackoffAndRateLimit, RateLimiter } from './rateLimit';

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  const db = ctx.env.DB

  try {
    const body = await ctx.request.json() as GetAccountInfoRequest
    const { address } = body

    // Validate required parameters
    if (!address) {
      return jsonResponse({ 
        success: false,
        error: "Missing required parameter: address" 
      }, 400)
    }

    // Validate address format
    try {
      new PublicKey(address)
    } catch (error) {
      return jsonResponse({ 
        success: false,
        error: "Invalid address format" 
      }, 400)
    }

    console.log(`[getaccountinfo] Getting account info for: ${address}`)

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
    console.log(`[getaccountinfo] Available RPC URLs: ${rpcUrls.length}`)
    
    let connection: Connection | null = null
    let lastError: Error | null = null
    
    // Try each RPC URL until one works
    for (const rpcUrl of rpcUrls) {
      try {
        console.log(`[getaccountinfo] Trying RPC: ${rpcUrl.replace(/api-key=[^&]*/, 'api-key=***')}`)
        connection = new Connection(rpcUrl, "confirmed")
        
        // Test the connection with a simple call
        await connection.getSlot()
        console.log(`[getaccountinfo] Successfully connected to RPC`)
        break
      } catch (error) {
        console.log(`[getaccountinfo] RPC failed:`, error)
        lastError = error as Error
        connection = null
      }
    }
    
    if (!connection) {
      throw new Error(`All RPC endpoints failed. Last error: ${lastError?.message}`)
    }

    // Create rate limiter for this operation
    const rateLimiter = new RateLimiter(3); // 3 requests per second
    
    // Get account info with enhanced retry logic and rate limiting
    let accountInfo;
    try {
      console.log(`[getaccountinfo] Fetching account info...`)
      const publicKey = new PublicKey(address)
      accountInfo = await retryWithBackoffAndRateLimit(
        () => Promise.race([
          connection!.getAccountInfo(publicKey),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Account info fetch timeout')), 20000)
          )
        ]),
        3,
        1000,
        rateLimiter
      )
      console.log(`[getaccountinfo] Account info fetched, exists: ${!!accountInfo}`)
    } catch (error) {
      console.log(`[getaccountinfo] Error fetching account info:`, error)
      throw new Error(`Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    const response: GetAccountInfoResponse = {
      success: true,
      exists: !!accountInfo,
      data: accountInfo ? {
        lamports: accountInfo.lamports,
        owner: accountInfo.owner.toString(),
        executable: accountInfo.executable,
        rentEpoch: accountInfo.rentEpoch
      } : null
    }

    console.log(`[getaccountinfo] Returning response:`, response)
    return jsonResponse(response, 200)

  } catch (e) {
    console.error("Account info fetch error:", e)
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
