import { jsonResponse, reportError } from './cfPagesFunctionsUtils';

type ENV = {
  DB: D1Database;
  VITE_ENVIRONMENT_TYPE: string;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') || 'http://localhost:5173';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

function generateId(): string {
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
  );
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join('');
}

export const onRequest: PagesFunction<ENV> = async (context) => {
  const request = context.request;
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  switch (method) {
    case 'GET':
      return handleGet(context);
    case 'POST':
      return handlePost(context);
    default:
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { ...corsHeaders(request), Allow: 'OPTIONS, GET, POST' },
      });
  }
};

async function handleGet(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;
  const url = new URL(ctx.request.url);
  const wallet = url.searchParams.get('wallet');
  const action = url.searchParams.get('action') || 'code';

  if (!wallet) {
    return jsonResponse({ error: 'wallet query parameter is required' }, 400);
  }

  try {
    if (action === 'code') {
      // Get or create referral code for this wallet
      let row = await db
        .prepare('SELECT code FROM referral_codes WHERE wallet_address = ?')
        .bind(wallet)
        .first<{ code: string }>();

      if (!row) {
        // Generate a new code, retry up to 3 times on collision
        let code = '';
        for (let i = 0; i < 3; i++) {
          code = generateReferralCode();
          try {
            await db
              .prepare('INSERT INTO referral_codes (id, wallet_address, code) VALUES (?, ?, ?)')
              .bind(generateId(), wallet, code)
              .run();
            break;
          } catch (err: unknown) {
            if (i === 2) throw err;
          }
        }
        row = { code };
      }

      // Count referrals
      const countRow = await db
        .prepare('SELECT COUNT(*) as cnt FROM referrals WHERE referrer_wallet = ?')
        .bind(wallet)
        .first<{ cnt: number }>();

      return jsonResponse({ code: row.code, referralCount: countRow?.cnt || 0 });
    }

    if (action === 'referrals') {
      const rows = await db
        .prepare('SELECT referee_wallet, referee_twitter_username, created_at FROM referrals WHERE referrer_wallet = ? ORDER BY created_at DESC')
        .bind(wallet)
        .all<{ referee_wallet: string; referee_twitter_username: string | null; created_at: string }>();

      return jsonResponse({ referrals: rows.results || [] });
    }

    if (action === 'referrals-with-investments') {
      // Get referrals with post-referral investment totals
      const rows = await db
        .prepare(
          `SELECT r.id, r.referee_wallet, r.referee_twitter_username, r.created_at,
            COALESCE(SUM(CASE WHEN i.created_at > r.created_at AND i.status != 'refunded' THEN i.amount_usdc ELSE 0 END), 0) as total_invested_after_referral
          FROM referrals r
          LEFT JOIN idea_investments i ON i.investor_wallet = r.referee_wallet
          WHERE r.referrer_wallet = ?
          GROUP BY r.id, r.referee_wallet, r.referee_twitter_username, r.created_at
          ORDER BY r.created_at DESC`
        )
        .bind(wallet)
        .all<{
          id: string;
          referee_wallet: string;
          referee_twitter_username: string | null;
          created_at: string;
          total_invested_after_referral: number;
        }>();

      return jsonResponse({ referrals: rows.results || [] });
    }

    if (action === 'check') {
      // Check if this wallet has already been referred by someone
      const existing = await db
        .prepare('SELECT id FROM referrals WHERE referee_wallet = ?')
        .bind(wallet)
        .first();

      return jsonResponse({ alreadyReferred: !!existing });
    }

    return jsonResponse({ error: 'Invalid action. Use "code", "referrals", or "check".' }, 400);
  } catch (error) {
    await reportError(db, error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

async function handlePost(ctx: EventContext<ENV, string, unknown>) {
  const db = ctx.env.DB;

  try {
    const body = (await ctx.request.json()) as {
      code?: string;
      refereeWallet?: string;
      refereeTwitterUsername?: string;
    };

    const { code, refereeWallet, refereeTwitterUsername } = body;

    if (!code || !refereeWallet) {
      return jsonResponse({ error: 'code and refereeWallet are required' }, 400);
    }

    // Look up the referral code
    const codeRow = await db
      .prepare('SELECT wallet_address FROM referral_codes WHERE code = ?')
      .bind(code)
      .first<{ wallet_address: string }>();

    if (!codeRow) {
      return jsonResponse({ error: 'Invalid referral code' }, 404);
    }

    // Self-referral check
    if (codeRow.wallet_address === refereeWallet) {
      return jsonResponse({ error: 'Cannot refer yourself' }, 400);
    }

    // Check if already referred
    const existing = await db
      .prepare('SELECT id FROM referrals WHERE referee_wallet = ?')
      .bind(refereeWallet)
      .first();

    if (existing) {
      return jsonResponse({ error: 'This wallet has already been referred' }, 409);
    }

    // Record the referral
    await db
      .prepare(
        'INSERT INTO referrals (id, referrer_wallet, referrer_code, referee_wallet, referee_twitter_username) VALUES (?, ?, ?, ?, ?)'
      )
      .bind(generateId(), codeRow.wallet_address, code, refereeWallet, refereeTwitterUsername || null)
      .run();

    return jsonResponse({ success: true, message: 'Referral recorded' });
  } catch (error) {
    await reportError(db, error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}
