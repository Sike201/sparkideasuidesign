import { Connection, PublicKey } from '@solana/web3.js'
import { jsonResponse, reportError } from './cfPagesFunctionsUtils';

type ENV = {
  DB: D1Database
  RPC_URL: string
}

type GetSolBalanceResponse = {
  success: boolean
  balance: number
  userAddress: string
  cluster: string
}

// Cache to prevent duplicate requests and improve performance
const balanceCache = new Map<string, { 
  balance: number
  timestamp: number
  promise?: Promise<number>
}>()

// Cache duration: 30 seconds
const CACHE_DURATION = 30 * 1000

// Cleanup expired cache entries
function cleanupCache() {
  const now = Date.now()
  for (const [key, entry] of balanceCache.entries()) {
    if (now - entry.timestamp > CACHE_DURATION) {
      balanceCache.delete(key)
    }
  }
}

// Retry logic with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (i === maxRetries) break
      
      const delay = baseDelay * Math.pow(2, i)
      console.log(`[getsolbalance] Retry ${i + 1}/${maxRetries} after ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError!
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const db = ctx.env.DB

  try {
    const { searchParams } = new URL(ctx.request.url)
    const userAddress = searchParams.get("userAddress")
    const cluster = searchParams.get("cluster") || "mainnet"
    const forceRefresh = searchParams.get("forceRefresh") === "true"

    // Validate required parameters
    if (!userAddress) {
      return jsonResponse({ 
        message: "Missing required parameter: userAddress" 
      }, 400)
    }

    if (!['devnet', 'mainnet'].includes(cluster)) {
      return jsonResponse({ 
        message: `Unsupported cluster (${cluster})!` 
      }, 400)
    }

    // Validate Solana address
    try {
      new PublicKey(userAddress)
    } catch (error) {
      return jsonResponse({ 
        message: "Invalid Solana address format" 
      }, 400)
    }

    // Clean up expired cache entries
    cleanupCache()
    
    // Check cache first with cache key
    const cacheKey = `${userAddress}-${cluster}`
    console.log(`[getsolbalance] Cache key: ${cacheKey}`)
    console.log(`[getsolbalance] Force refresh: ${forceRefresh}`)
    const cached = balanceCache.get(cacheKey)
    
    if (cached && !forceRefresh) {
      console.log(`[getsolbalance] Cache hit - returning cached balance: ${cached.balance}`)
      
      // If there's a pending promise, wait for it
      if (cached.promise) {
        try {
          const freshBalance = await cached.promise
          console.log(`[getsolbalance] Fresh balance from pending promise: ${freshBalance}`)
          return jsonResponse({
            success: true,
            balance: freshBalance,
            userAddress,
            cluster
          } as GetSolBalanceResponse, 200)
        } catch (error) {
          console.log(`[getsolbalance] Error with pending promise, using cached value`)
        }
      }
      
      return jsonResponse({
        success: true,
        balance: cached.balance,
        userAddress,
        cluster
      } as GetSolBalanceResponse, 200)
    }

    // Create a promise for this request to prevent duplicate requests
    const balancePromise = (async () => {
      // Get RPC URLs for the cluster with fallback options
      const getRpcUrls = (cluster: string): string[] => {
        const urls: string[] = []
        
        // Primary RPC URL from environment
        if (ctx.env.RPC_URL) {
          urls.push(ctx.env.RPC_URL)
        }
        
        // Public fallbacks
        if (cluster === "mainnet") {
          urls.push("https://api.mainnet-beta.solana.com")
        } else {
          urls.push("https://api.devnet.solana.com")
        }
        
        return urls
      }

      const rpcUrls = getRpcUrls(cluster)
      console.log(`[getsolbalance] Available RPC URLs: ${rpcUrls.length}`)
      
      let connection: Connection | null = null
      let lastError: Error | null = null
      
      // Try each RPC URL until one works
      for (const rpcUrl of rpcUrls) {
        try {
          console.log(`[getsolbalance] Trying RPC: ${rpcUrl.replace(/api-key=[^&]*/, 'api-key=***')}`)
          connection = new Connection(rpcUrl, "confirmed")
          
          // Test the connection with a simple call
          await connection.getSlot()
          console.log(`[getsolbalance] Successfully connected to RPC`)
          break
        } catch (error) {
          console.log(`[getsolbalance] RPC failed:`, error)
          lastError = error as Error
          connection = null
        }
      }
      
      if (!connection) {
        throw new Error(`All RPC endpoints failed. Last error: ${lastError?.message}`)
      }

      // Convert userAddress to PublicKey
      const userPubKey = new PublicKey(userAddress)

      let balance = 0
      try {
        console.log(`[getsolbalance] Fetching SOL balance...`)
        const balanceResponse = await retryWithBackoff(() => 
          Promise.race([
            connection!.getBalance(userPubKey),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('SOL balance fetch timeout')), 20000)
            )
          ])
        )
        console.log(`[getsolbalance] Raw balance (lamports):`, balanceResponse)
        balance = balanceResponse / 1000000000 // Convert lamports to SOL
        console.log(`[getsolbalance] Calculated balance (SOL): ${balance}`)
      } catch (error) {
        console.log(`[getsolbalance] Error fetching balance:`, error)
        balance = 0
      }

      return balance
    })()

    // Store the promise in cache to prevent duplicate requests
    balanceCache.set(cacheKey, { 
      balance: 0, 
      timestamp: Date.now(), 
      promise: balancePromise 
    })

    // Wait for the balance to be fetched
    const balance = await balancePromise

    // Update cache with the final result (remove the promise)
    balanceCache.set(cacheKey, { 
      balance, 
      timestamp: Date.now() 
    })

    console.log(`[getsolbalance] Final balance calculated: ${balance}`)
    console.log(`[getsolbalance] Cache updated with new balance`)

    const response: GetSolBalanceResponse = {
      success: true,
      balance,
      userAddress,
      cluster
    }

    console.log(`[getsolbalance] Returning response:`, response)
    return jsonResponse(response, 200)

  } catch (e) {
    console.error("SOL balance fetch error:", e)
    await reportError(db, e)
    return jsonResponse({ 
      message: "Something went wrong while fetching SOL balance...",
      error: e instanceof Error ? e.message : "Unknown error"
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
