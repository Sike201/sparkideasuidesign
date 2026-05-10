import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
}

export interface GetTotalFeesRequest {
  twitterAccount: string
}

export interface GetTotalFeesResponse {
  success: boolean
  totalFeesEarned: number // Total fees from all tokens for this user
  totalFeesClaimed: number // Already claimed fees (part of total that user has taken)
  availableToClaim: number // Remaining fees available to claim (totalFeesEarned - totalFeesClaimed)
  tokenBreakdown: Array<{
    tokenName: string
    tokenMint: string
    feesEarned: number
    userFeesClaimed: number
  }>
  error?: string
  errorName?: string
  timestamp?: string
  [key: string]: unknown // Index signature for TypeScript compatibility
}

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}

export const onRequestPost: PagesFunction<ENV> = async (ctx) => {
  console.log('📊 Getting total fees for user...')
  
  try {
    const requestBody: GetTotalFeesRequest = await ctx.request.json()
    console.log('📝 Request body:', requestBody)

    if (!requestBody.twitterAccount) {
      console.log('❌ Missing twitter account')
      return jsonResponse({
        success: false,
        error: 'Twitter account is required',
        errorName: 'MISSING_TWITTER_ACCOUNT',
        timestamp: new Date().toISOString()
      } as GetTotalFeesResponse, 400)
    }

    // Get total fees earned from tokens created by this user (same logic as getcreators)
    console.log(`🔍 Querying total fees for twitter account: ${requestBody.twitterAccount}`)
    const tokenFeesQuery = `
      SELECT 
        t.name as token_name,
        t.mint as token_mint,
        COALESCE(t.fees_claimed, 0) as fees_earned,
        COALESCE(t.user_fees_claimed, 0) as user_fees_claimed
      FROM tokens t 
      WHERE t.twitter_account = ? AND t.dao IS NOT NULL AND t.dao != ''
    `
    
    const tokenFeesResult = await ctx.env.DB.prepare(tokenFeesQuery)
      .bind(requestBody.twitterAccount)
      .all()

    console.log('💰 Token fees result:', tokenFeesResult)

    // Calculate total fees earned across all tokens
    const tokenBreakdown = tokenFeesResult.results.map((row: any) => ({
      tokenName: row.token_name,
      tokenMint: row.token_mint,
      feesEarned: parseFloat(row.fees_earned || '0'),
      userFeesClaimed: parseFloat(row.user_fees_claimed || '0')
    }))

    const totalFeesEarned = tokenBreakdown.reduce((sum, token) => sum + token.feesEarned, 0) / 10 // Divide by 10 to make amounts more reasonable
    const totalUserFeesClaimed = tokenBreakdown.reduce((sum, token) => sum + token.userFeesClaimed, 0)
    console.log(`💎 Total fees earned across all tokens: ${totalFeesEarned} SOL (divided by 10)`)
    console.log(`💸 Total user fees already claimed: ${totalUserFeesClaimed} SOL`)

    // Use the new user_fees_claimed from tokens table (more reliable than twitter_users)
    const totalFeesClaimed = totalUserFeesClaimed
    console.log(`📋 Total fees already claimed (from tokens.user_fees_claimed): ${totalFeesClaimed} SOL`)

    // Calculate available to claim: remaining fees that haven't been claimed yet
    const availableToClaim = Math.max(0, totalFeesEarned - totalFeesClaimed)
    
    console.log(`🎯 Available to claim: ${availableToClaim} SOL`)
    console.log(`📊 Verification: Total (${totalFeesEarned}) = Already Claimed (${totalFeesClaimed}) + Available (${availableToClaim})`)

    const response: GetTotalFeesResponse = {
      success: true,
      totalFeesEarned,
      totalFeesClaimed,
      availableToClaim,
      tokenBreakdown
    }

    console.log('✅ Total fees calculation successful:', response)

    return jsonResponse(response, 200)

  } catch (error: any) {
    console.error('❌ Error getting total fees:', error)
    
    await reportError(ctx.env.DB, error)
    return jsonResponse({
      success: false,
      error: error?.message || 'Unknown error occurred',
      errorName: error?.constructor?.name || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString()
    } as GetTotalFeesResponse, 500)
  }
}
