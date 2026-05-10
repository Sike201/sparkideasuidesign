/**
 * GET /api/custodial-wallet?twitter_id=X&proposal_pda=Y
 * Check if a Twitter account has an assigned custodial wallet.
 * Returns wallet_address if assigned, null otherwise.
 */

type ENV = { DB: D1Database };

export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const twitterId = url.searchParams.get("twitter_id");
  const proposalPda = url.searchParams.get("proposal_pda");

  const twitterUsername = url.searchParams.get("twitter_username");

  if (!twitterId && !twitterUsername) {
    return new Response(JSON.stringify({ error: "twitter_id or twitter_username required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Match by twitter_id, or by username (stored as twitter_id = "username:X" or twitter_username = X)
  const row = await ctx.env.DB
    .prepare(
      `SELECT wallet_address, twitter_username FROM custodial_wallets
       WHERE (twitter_id = ? OR twitter_id = ? OR twitter_username = ?)
       AND (proposal_pda IS NULL OR proposal_pda = ?)`
    )
    .bind(
      twitterId || "",
      twitterUsername ? `username:${twitterUsername}` : "",
      twitterUsername || "",
      proposalPda || ""
    )
    .first();

  return new Response(JSON.stringify({
    assigned: !!row,
    wallet_address: row?.wallet_address || null,
    twitter_username: row?.twitter_username || null,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
