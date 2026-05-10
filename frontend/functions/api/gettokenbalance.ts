import { Connection, PublicKey } from '@solana/web3.js'
import { jsonResponse, reportError } from './cfPagesFunctionsUtils'
import { retryWithBackoffAndRateLimit, RateLimiter } from './rateLimit'

type ENV = {
  DB: D1Database
  RPC_URL: string
}

type GetTokenBalanceRequest = {
  userAddress: string
  tokenMint: string
  cluster?: string
}

type GetTokenBalanceResponse = {
  success: boolean
  balance?: number
  error?: string
}

// Rate limiter for token balance requests
const rateLimiter = new RateLimiter(10) // 10 requests per second

/**
 * Get RPC URLs with fallbacks
 */
const getRpcUrls = (cluster: string, ctx: any): string[] => {
  const urls: string[] = []
  
  // Add primary RPC URL from environment
  if (ctx.env.RPC_URL) {
    urls.push(ctx.env.RPC_URL)
  }
  
  // Add public fallbacks based on cluster
  if (cluster === "mainnet") {
    urls.push("https://api.mainnet-beta.solana.com")
  } else {
    urls.push("https://api.devnet.solana.com")
  }
  
  return urls
}

/**
 * Get token balance for a specific mint
 */
async function getTokenBalance(
  connection: Connection,
  userAddress: string,
  tokenMint: string
): Promise<number> {
  console.log(`[gettokenbalance] Fetching balance for ${tokenMint} for user ${userAddress}`)
  
  try {
    const userPubKey = new PublicKey(userAddress)
    const tokenMintPubKey = new PublicKey(tokenMint)
    
    // Get token accounts for this mint
    const tokenAccountsResult = await retryWithBackoffAndRateLimit(
      () => connection.getParsedTokenAccountsByOwner(userPubKey, {
        mint: tokenMintPubKey,
      }),
      3,
      1000,
      rateLimiter
    )
    
    if (tokenAccountsResult.value.length === 0) {
      console.log(`[gettokenbalance] No token accounts found for mint ${tokenMint}`)
      return 0
    }
    
    // Sum up balances from all token accounts (usually just one)
    let totalBalance = 0
    for (const account of tokenAccountsResult.value) {
      const balance = account.account.data.parsed?.info?.tokenAmount?.uiAmount || 0
      totalBalance += balance
    }
    
    console.log(`[gettokenbalance] Total balance: ${totalBalance} for mint ${tokenMint}`)
    return totalBalance
    
  } catch (error) {
    console.error(`[gettokenbalance] Error fetching token balance:`, error)
    throw error
  }
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    const { searchParams } = new URL(ctx.request.url)
    const userAddress = searchParams.get("userAddress")
    const tokenMint = searchParams.get("tokenMint")
    const cluster = searchParams.get("cluster") || "mainnet"
    
    if (!userAddress || !tokenMint) {
      return jsonResponse({
        success: false,
        error: "userAddress and tokenMint are required"
      }, 400)
    }
    
    // Validate addresses
    try {
      new PublicKey(userAddress)
      new PublicKey(tokenMint)
    } catch (error) {
      return jsonResponse({
        success: false,
        error: "Invalid address format"
      }, 400)
    }
    
    console.log(`[gettokenbalance] Processing request for user: ${userAddress}, token: ${tokenMint}`)
    
    const rpcUrls = getRpcUrls(cluster, ctx)
    console.log(`[gettokenbalance] Available RPC URLs: ${rpcUrls.length}`)
    
    let lastError: Error | null = null
    
    // Try each RPC URL until one works
    for (const [index, rpcUrl] of rpcUrls.entries()) {
      try {
        console.log(`[gettokenbalance] Trying RPC ${index + 1}/${rpcUrls.length}: ${rpcUrl.includes('api-key') ? rpcUrl.split('?')[0] + '?api-key=***' : rpcUrl}`)
        
        const connection = new Connection(rpcUrl)
        console.log(`[gettokenbalance] Successfully connected to RPC`)
        
        const balance = await getTokenBalance(connection, userAddress, tokenMint)
        
        const response: GetTokenBalanceResponse = {
          success: true,
          balance
        }
        
        console.log(`[gettokenbalance] Returning response:`, response)
        return jsonResponse(response, 200)
        
      } catch (error) {
        console.log(`[gettokenbalance] RPC ${index + 1} failed:`, error)
        lastError = error as Error
        continue
      }
    }
    
    // All RPC URLs failed
    throw lastError || new Error('All RPC endpoints failed')
    
  } catch (error) {
    console.error('[gettokenbalance] Error:', error)
    await reportError(ctx.env.DB, error)
    
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, 500)
  }
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    const request: GetTokenBalanceRequest = await ctx.request.json()
    const { userAddress, tokenMint, cluster = "mainnet" } = request
    
    if (!userAddress || !tokenMint) {
      return jsonResponse({
        success: false,
        error: "userAddress and tokenMint are required"
      }, 400)
    }
    
    // Validate addresses
    try {
      new PublicKey(userAddress)
      new PublicKey(tokenMint)
    } catch (error) {
      return jsonResponse({
        success: false,
        error: "Invalid address format"
      }, 400)
    }
    
    console.log(`[gettokenbalance] Processing POST request for user: ${userAddress}, token: ${tokenMint}`)
    
    const rpcUrls = getRpcUrls(cluster, ctx)
    console.log(`[gettokenbalance] Available RPC URLs: ${rpcUrls.length}`)
    
    let lastError: Error | null = null
    
    // Try each RPC URL until one works
    for (const [index, rpcUrl] of rpcUrls.entries()) {
      try {
        console.log(`[gettokenbalance] Trying RPC ${index + 1}/${rpcUrls.length}: ${rpcUrl.includes('api-key') ? rpcUrl.split('?')[0] + '?api-key=***' : rpcUrl}`)
        
        const connection = new Connection(rpcUrl)
        console.log(`[gettokenbalance] Successfully connected to RPC`)
        
        const balance = await getTokenBalance(connection, userAddress, tokenMint)
        
        const response: GetTokenBalanceResponse = {
          success: true,
          balance
        }
        
        console.log(`[gettokenbalance] Returning response:`, response)
        return jsonResponse(response, 200)
        
      } catch (error) {
        console.log(`[gettokenbalance] RPC ${index + 1} failed:`, error)
        lastError = error as Error
        continue
      }
    }
    
    // All RPC URLs failed
    throw lastError || new Error('All RPC endpoints failed')
    
  } catch (error) {
    console.error('[gettokenbalance] Error:', error)
    await reportError(ctx.env.DB, error)
    
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, 500)
  }
}

export const onRequestOptions: PagesFunction<ENV> = async (ctx) => {
  try {
    // Always allow CORS for development
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:5173',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    return jsonResponse({ message: error }, 500)
  }
}