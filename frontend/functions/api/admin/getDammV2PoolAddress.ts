import { jsonResponse, reportError } from "../cfPagesFunctionsUtils"
import { Connection, PublicKey } from "@solana/web3.js"
import { CpAmm } from "@meteora-ag/cp-amm-sdk"
import { isApiKeyValid } from "../../services/apiKeyService"

type ENV = {
  DB: D1Database
  RPC_URL: string
}

// Function to find DAMM V2 pool address for a specific token using CP-AMM SDK
const findDammV2PoolForToken = async (connection: Connection, tokenMint: string): Promise<string | null> => {
  try {
    console.log(`[DAMM V2] Searching for DAMM V2 pool for token: ${tokenMint}`)
    
    // Initialize CP-AMM SDK
    const cpAmm = new CpAmm(connection)
    
    // Get all DAMM V2 pools
    const allPools = await cpAmm.getAllPools()
    console.log(`[DAMM V2] Found ${allPools.length} total DAMM V2 pools`)
    
    // Look for pools that contain our token - use early return for better performance
    const tokenPublicKey = new PublicKey(tokenMint)
    
    // Search and validate in one pass - exit immediately when valid pool found
    for (let i = 0; i < allPools.length; i++) {
      const pool = allPools[i]
      
      // Check if this pool contains our token
      if (pool.account.tokenAMint.equals(tokenPublicKey) || pool.account.tokenBMint.equals(tokenPublicKey)) {
        const poolAddress = pool.publicKey.toString()
        console.log(`[DAMM V2] Found pool ${i + 1}/${allPools.length} containing token: ${poolAddress}`)
        
        // Validate this is actually a DAMM V2 pool
        try {
          const poolAccountInfo = await connection.getAccountInfo(pool.publicKey)
          if (poolAccountInfo) {
            const expectedDammV2ProgramId = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
            if (poolAccountInfo.owner.toString() === expectedDammV2ProgramId) {
                      console.log(`[DAMM V2] ✅ Validated DAMM V2 pool at position ${i + 1}: ${poolAddress}`)
        console.log(`[DAMM V2] Exiting early - no need to process remaining ${allPools.length - i - 1} pools`)
        console.log(`[DAMM V2] Returning pool address immediately...`)
        return poolAddress // EXIT IMMEDIATELY - don't process remaining pools
            } else {
              console.log(`[DAMM V2] ⚠️ Pool ${poolAddress} is not owned by DAMM V2 program, continuing search...`)
            }
          } else {
            console.log(`[DAMM V2] Pool account does not exist: ${poolAddress}, continuing search...`)
          }
        } catch (validationError) {
          console.log(`[DAMM V2] Could not validate pool ${poolAddress}:`, validationError)
        }
      }
      
      // Log progress every 1000 pools for visibility
      if ((i + 1) % 1000 === 0) {
        console.log(`[DAMM V2] Processed ${i + 1}/${allPools.length} pools...`)
      }
    }
    
    console.log(`[DAMM V2] No valid DAMM V2 pool found for token ${tokenMint} after checking all ${allPools.length} pools`)

  } catch (error) {
    console.error(`[DAMM V2] Error searching for DAMM V2 pool for ${tokenMint}:`, error)
    return null
  }
}

// Function to fetch DAMM V2 pool address from DexScreener (fallback)
const fetchDammPoolAddressFromDexScreener = async (tokenAddress: string): Promise<string | null> => {
  try {
    console.log(`[DexScreener] Fetching DAMM pool address for token: ${tokenAddress}`)
    
    // DexScreener API endpoint for Solana tokens
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BorgPad/1.0)',
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      console.warn(`[DexScreener] API error for ${tokenAddress}: ${response.status} ${response.statusText}`)
      return null
    }

    const data = await response.json() as any
    
    if (!data.pairs || data.pairs.length === 0) {
      console.log(`[DexScreener] No pairs found for token ${tokenAddress}`)
      return null
    }

    // Look for DAMM V2 pairs specifically
    const dammPair = data.pairs.find((pair: any) => {
      // Check if it's a DAMM V2 pair by looking at the DEX name or pair address pattern
      return pair.dexId === 'meteora' || 
             pair.dexId === 'damm' || 
             pair.pairAddress?.includes('damm') ||
             pair.dexId?.toLowerCase().includes('damm')
    })

    if (dammPair) {
      console.log(`[DexScreener] Found DAMM pair for token ${tokenAddress}: ${dammPair.pairAddress}`)
      return dammPair.pairAddress
    }

    // If no specific DAMM pair found, return the first pair address as fallback
    const firstPair = data.pairs[0]
    console.log(`[DexScreener] Using first pair as fallback for token ${tokenAddress}: ${firstPair.pairAddress}`)
    return firstPair.pairAddress

  } catch (error) {
    console.error(`[DexScreener] Error fetching DAMM pool address for ${tokenAddress}:`, error)
    return null
  }
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  try {
    // authorize request
    // if (!await isApiKeyValid({ ctx, permissions: ['read'] })) {
    //   return jsonResponse(null, 401)
    // }

    // Get token address from request body
    const body = await ctx.request.json()
    const { tokenMint } = body

    if (!tokenMint) {
      return jsonResponse({ 
        error: "Missing required parameter: tokenMint" 
      }, 400)
    }

    console.log(`[API] Getting DAMM V2 pool address for token: ${tokenMint}`)

    // Validate token mint address
    try {
      new PublicKey(tokenMint)
    } catch (error) {
      return jsonResponse({ 
        error: "Invalid token mint address format" 
      }, 400)
    }

    const connection = new Connection(ctx.env.RPC_URL, "confirmed")

    // Use CP-AMM SDK to find DAMM V2 pool
    console.log(`[API] Searching for DAMM V2 pool using CP-AMM SDK...`)
    let dammPoolAddress = await findDammV2PoolForToken(connection, tokenMint)

    if (dammPoolAddress) {
      // Validate the pool address before returning
      try {
        new PublicKey(dammPoolAddress)
        
        console.log(`[API] Successfully found DAMM V2 pool address: ${dammPoolAddress}`)
        
        return jsonResponse({
          success: true,
          tokenMint,
          dammV2PoolAddress: dammPoolAddress,
          source: dammPoolAddress ? "sdk" : "dexscreener"
        }, 200)
        
      } catch (error) {
        console.error(`[API] Invalid DAMM pool address ${dammPoolAddress}:`, error)
        return jsonResponse({
          success: false,
          error: "Invalid DAMM pool address found",
          tokenMint
        }, 500)
      }
    } else {
      console.log(`[API] No DAMM V2 pool found for token: ${tokenMint}`)
      
      return jsonResponse({
        success: false,
        error: "No DAMM V2 pool found for this token",
        tokenMint
      }, 404)
    }

  } catch (e) {
    console.error(`[API] Error getting DAMM V2 pool address:`, e)
    await reportError(ctx.env.DB, e)
    return jsonResponse({ 
      success: false,
      error: "Something went wrong..." 
    }, 500)
  }
}

// Also support GET requests with query parameter
export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    // authorize request
    // if (!await isApiKeyValid({ ctx, permissions: ['read'] })) {
    //   return jsonResponse(null, 401)
    // }

    // Get token address from query parameter
    const url = new URL(ctx.request.url)
    const tokenMint = url.searchParams.get('tokenMint')

    if (!tokenMint) {
      return jsonResponse({ 
        error: "Missing required query parameter: tokenMint" 
      }, 400)
    }

    console.log(`[API] Getting DAMM V2 pool address for token: ${tokenMint}`)

    // Validate token mint address
    try {
      new PublicKey(tokenMint)
    } catch (error) {
      return jsonResponse({ 
        error: "Invalid token mint address format" 
      }, 400)
    }

    const connection = new Connection(ctx.env.RPC_URL, "confirmed")

    // Use CP-AMM SDK to find DAMM V2 pool
    console.log(`[API] Searching for DAMM V2 pool using CP-AMM SDK...`)
    let dammPoolAddress = await findDammV2PoolForToken(connection, tokenMint)

    if (dammPoolAddress) {
      // Validate the pool address before returning
      try {
        new PublicKey(dammPoolAddress)
        
        console.log(`[API] Successfully found DAMM V2 pool address: ${dammPoolAddress}`)
        
        return jsonResponse({
          success: true,
          tokenMint,
          dammV2PoolAddress: dammPoolAddress,
          source: dammPoolAddress ? "sdk" : "dexscreener"
        }, 200)
        
      } catch (error) {
        console.error(`[API] Invalid DAMM pool address ${dammPoolAddress}:`, error)
        return jsonResponse({
          success: false,
          error: "Invalid DAMM pool address found",
          tokenMint
        }, 500)
      }
    } else {
      console.log(`[API] No DAMM V2 pool found for token: ${tokenMint}`)
      
      return jsonResponse({
        success: false,
        error: "No DAMM V2 pool found for this token",
        tokenMint
      }, 404)
    }

  } catch (e) {
    console.error(`[API] Error getting DAMM V2 pool address:`, e)
    await reportError(ctx.env.DB, e)
    return jsonResponse({ 
      success: false,
      error: "Something went wrong..." 
    }, 500)
  }
}
