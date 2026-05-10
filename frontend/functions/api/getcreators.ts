import { jsonResponse, reportError } from "./cfPagesFunctionsUtils"
import { drizzle } from "drizzle-orm/d1"

type ENV = {
  DB: D1Database
}

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  try {
    // Get all unique Twitter accounts from tokens table with DAO information and fees
    const tokens = await ctx.env.DB
      .prepare(`
        SELECT DISTINCT twitter_account, mint, name, dao, fees_claimed
        FROM tokens 
        WHERE twitter_account IS NOT NULL AND twitter_account != ''
        ORDER BY twitter_account
      `)
      .all()

    // Transform the data to match the expected format
    const creators = tokens.results?.map((token: any) => ({
      twitterAccount: token.twitter_account,
      hasToken: true,
      tokenMint: token.mint,
      tokenName: token.name,
      hasDao: token.dao !== null && token.dao !== '',
      daoAddress: token.dao || undefined,
      feesClaimed: parseFloat(token.fees_claimed || '0') / 10, // Divide by 10 to match updated calculation
      feesClaimedRaw: token.fees_claimed || 0,
    })) || []

    return jsonResponse({ creators }, 200)
  } catch (e) {
    await reportError(ctx.env.DB, e)
    return jsonResponse({ message: "Something went wrong..." }, 500)
  }
} 