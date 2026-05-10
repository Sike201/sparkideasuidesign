import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"

type ENV = {
  DB: D1Database
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    // Get top fee generators based on actual fees_claimed
    const tokens = await ctx.env.DB
      .prepare(`
        SELECT 
          twitter_account, 
          SUM(COALESCE(fees_claimed, 0)) as total_fees_sol,
          COUNT(*) as token_count
        FROM tokens 
        WHERE twitter_account IS NOT NULL AND twitter_account != ''
        GROUP BY twitter_account
        ORDER BY total_fees_sol DESC
        LIMIT 10
      `)
      .all()

    // Transform the data to match the expected format with SOL amounts
    const SOL_PRICE_USD = 230; // Approximate SOL price for conversion
    
    const leaderboard = tokens.results?.map((token: any, index: number) => {
      let totalFeesSOL = parseFloat(token.total_fees_sol || '0') / 10; // Divide by 10 to match updated calculation
      
      // Set the first user to have equivalent of $15,780 in SOL as requested
      if (index === 0) {
        totalFeesSOL = 15780 / SOL_PRICE_USD; // Convert $15,780 to SOL (~68.6 SOL)
      }
      
      const feesGeneratedUSD = totalFeesSOL * SOL_PRICE_USD;
      
      return {
        username: token.twitter_account,
        feesGenerated: Math.round(feesGeneratedUSD),
        feesGeneratedSOL: totalFeesSOL,
        rank: index + 1,
        tokenCount: token.token_count
      };
    }) || []

    return jsonResponse({ leaderboard }, 200)
  } catch (e) {
    await reportError(ctx.env.DB, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
} 