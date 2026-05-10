// Points system utilities
// Points are awarded ONLY when an idea launches (threshold reached, ideacoin minted).
// Linear formula: 1 USDC invested = 100 points.
// Referrer bonus: 10% of referee's points (1 USDC invested by referee = 10 pts for referrer).

// --- Constants ---
export const POINTS_PER_USDC = 100;
export const REFERRAL_INVEST_BONUS_RATE = 0.1; // 10% of referee's invest points

// --- Point Calculation ---

export function calculateInvestPoints(amountUsdc: number): number {
  if (amountUsdc <= 0) return 0;
  return Math.floor(amountUsdc * POINTS_PER_USDC);
}

// --- Core: Award Points ---

async function addPointsToUser(db: D1Database, walletAddress: string, points: number): Promise<void> {
  if (points === 0) return;

  const existing = await db
    .prepare('SELECT data FROM user WHERE address = ?')
    .bind(walletAddress)
    .first<{ data: string }>();

  if (existing) {
    const userData = JSON.parse(existing.data || '{}');
    userData.points = Math.max(0, (userData.points || 0) + points);
    await db
      .prepare('UPDATE user SET data = ? WHERE address = ?')
      .bind(JSON.stringify(userData), walletAddress)
      .run();
  } else if (points > 0) {
    await db
      .prepare("INSERT INTO user (address, data) VALUES (?, ?)")
      .bind(walletAddress, JSON.stringify({ points }))
      .run();
  }
}

/**
 * Award points for all investors of an idea at launch time.
 * Called from the finalize step when an idea successfully launches.
 * Also awards referral bonuses to referrers of invested users.
 */
export async function awardLaunchPoints(
  db: D1Database,
  ideaId: string,
): Promise<{ totalInvestorPoints: number; totalReferrerPoints: number; investorCount: number }> {
  // Get all active investments for this idea
  const investments = await db
    .prepare(
      `SELECT investor_wallet, SUM(amount_usdc) as total_invested
       FROM idea_investments
       WHERE idea_id = ? AND status = 'active'
       GROUP BY investor_wallet`
    )
    .bind(ideaId)
    .all<{ investor_wallet: string; total_invested: number }>();

  const rows = investments.results || [];
  let totalInvestorPoints = 0;
  let totalReferrerPoints = 0;

  // Build a set of all investor wallets to batch-fetch referral relationships
  const wallets = rows.map(r => r.investor_wallet);
  const referralMap = await getReferralMap(db, wallets);

  for (const row of rows) {
    const investorPoints = calculateInvestPoints(row.total_invested);
    if (investorPoints <= 0) continue;

    await addPointsToUser(db, row.investor_wallet, investorPoints);
    totalInvestorPoints += investorPoints;

    // Referral bonus
    const referrerWallet = referralMap.get(row.investor_wallet);
    if (referrerWallet) {
      const bonusPoints = Math.floor(investorPoints * REFERRAL_INVEST_BONUS_RATE);
      if (bonusPoints > 0) {
        await addPointsToUser(db, referrerWallet, bonusPoints);
        totalReferrerPoints += bonusPoints;
      }
    }
  }

  return { totalInvestorPoints, totalReferrerPoints, investorCount: rows.length };
}

/**
 * Build a map of referee_wallet → referrer_wallet for a list of wallets.
 */
async function getReferralMap(
  db: D1Database,
  wallets: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (wallets.length === 0) return map;

  // D1 doesn't support IN with bind params for variable-length lists,
  // so we query one-by-one (acceptable — bounded by investor count per idea).
  for (const wallet of wallets) {
    const row = await db
      .prepare('SELECT referrer_wallet FROM referrals WHERE referee_wallet = ?')
      .bind(wallet)
      .first<{ referrer_wallet: string }>();
    if (row?.referrer_wallet) {
      map.set(wallet, row.referrer_wallet);
    }
  }

  return map;
}
