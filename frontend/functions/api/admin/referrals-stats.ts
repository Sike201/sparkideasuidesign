import { jsonResponse } from '../cfPagesFunctionsUtils';
import { isApiKeyValid } from '../../services/apiKeyService';

type ENV = {
  DB: D1Database;
};

/**
 * GET /api/admin/referrals-stats
 *
 * Returns all referrers with their referral count and
 * total USDC invested by their referred users.
 * Protected by API key (read permission).
 */
export const onRequestGet: PagesFunction<ENV> = async (ctx) => {
  // if (!await isApiKeyValid({ ctx, permissions: ['read'] })) {
  //   return jsonResponse({ error: 'Unauthorized' }, 401);
  // }

  const db = ctx.env.DB;

  try {
    // Get all referrers with code, twitter username, referral count
    const referrers = await db
      .prepare(`
        SELECT
          rc.wallet_address,
          rc.code,
          rc.twitter_username,
          rc.created_at,
          COUNT(r.id) as referral_count
        FROM referral_codes rc
        LEFT JOIN referrals r ON r.referrer_wallet = rc.wallet_address
        GROUP BY rc.wallet_address
        ORDER BY referral_count DESC
      `)
      .all<{
        wallet_address: string;
        code: string;
        twitter_username: string | null;
        created_at: string;
        referral_count: number;
      }>();

    // Get all referrals with referee investment totals
    const referralDetails = await db
      .prepare(`
        SELECT
          r.referrer_wallet,
          r.referee_wallet,
          r.referee_twitter_username,
          r.created_at,
          COALESCE(SUM(CASE WHEN ii.status = 'active' THEN ii.amount_usdc ELSE 0 END), 0) as total_invested
        FROM referrals r
        LEFT JOIN idea_investments ii ON ii.investor_wallet = r.referee_wallet
        GROUP BY r.id
        ORDER BY r.created_at DESC
      `)
      .all<{
        referrer_wallet: string;
        referee_wallet: string;
        referee_twitter_username: string | null;
        created_at: string;
        total_invested: number;
      }>();

    // Compute total invested per referrer
    const investmentByReferrer: Record<string, number> = {};
    for (const d of referralDetails.results || []) {
      investmentByReferrer[d.referrer_wallet] = (investmentByReferrer[d.referrer_wallet] || 0) + d.total_invested;
    }

    // Build response
    const result = (referrers.results || []).map((r) => ({
      wallet: r.wallet_address,
      code: r.code,
      twitter: r.twitter_username,
      createdAt: r.created_at,
      referralCount: r.referral_count,
      totalReferredInvestment: investmentByReferrer[r.wallet_address] || 0,
    }));

    // Sort by total referred investment descending
    result.sort((a, b) => b.totalReferredInvestment - a.totalReferredInvestment);

    // Global stats
    const totalReferrals = result.reduce((s, r) => s + r.referralCount, 0);
    const totalInvestment = result.reduce((s, r) => s + r.totalReferredInvestment, 0);

    return jsonResponse({
      stats: {
        totalReferrers: result.length,
        totalReferrals,
        totalReferredInvestment: totalInvestment,
      },
      referrers: result,
      referralDetails: referralDetails.results || [],
    });
  } catch (error) {
    console.error('[REFERRALS-STATS] Error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
};
