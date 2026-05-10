/**
 * Combinator trade history API.
 * POST: store a trade after successful tx
 * GET:  retrieve trade history for a proposal
 */

type ENV = { DB: D1Database };

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status: number, request: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
  );
}

export const onRequest: PagesFunction<ENV> = async (ctx) => {
  const { request } = ctx;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method === "POST") return handlePost(ctx);
  if (request.method === "GET") return handleGet(ctx);
  return json({ error: "Method not allowed" }, 405, request);
};

async function handlePost(ctx: EventContext<ENV, string, unknown>) {
  const { request } = ctx;
  const db = ctx.env.DB;

  try {
    const body = (await request.json()) as {
      proposal_pda: string;
      wallet: string;
      action: string;
      option_label?: string;
      option_index?: number;
      side?: string;
      amount: number;
      token?: string;
      tx_signature?: string;
    };

    if (!body.proposal_pda || !body.wallet || !body.action) {
      return json({ error: "proposal_pda, wallet, and action required" }, 400, request);
    }

    await db
      .prepare(
        "INSERT INTO combinator_trades (id, proposal_pda, wallet, action, option_label, option_index, side, amount, token, tx_signature, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        uuidv4(),
        body.proposal_pda,
        body.wallet,
        body.action,
        body.option_label || null,
        body.option_index ?? null,
        body.side || null,
        body.amount,
        body.token || null,
        body.tx_signature || null,
        new Date().toISOString()
      )
      .run();

    return json({ success: true }, 200, request);
  } catch {
    return json({ error: "Failed to store trade" }, 500, request);
  }
}

async function handleGet(ctx: EventContext<ENV, string, unknown>) {
  const { request } = ctx;
  const db = ctx.env.DB;
  const url = new URL(request.url);
  const proposalPda = url.searchParams.get("proposal_pda");

  if (!proposalPda) {
    return json({ error: "proposal_pda required" }, 400, request);
  }

  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  // LEFT JOIN against `custodial_wallets` so each trade can be
  // attributed to its Twitter handle when the trader is a custodial
  // user. External (self-custody) wallets simply come back with
  // null twitter fields and the UI falls back to the address.
  //
  // Why LEFT JOIN: not every trade originated from a custodial wallet,
  // and we never want to drop trades from history just because the
  // signer is unknown to us.
  const result = await db
    .prepare(
      `SELECT
         t.action,
         t.wallet,
         t.option_label,
         t.option_index,
         t.side,
         t.amount,
         t.token,
         t.tx_signature,
         t.timestamp,
         cw.twitter_username,
         cw.twitter_id,
         cw.wallet_type
       FROM combinator_trades t
       LEFT JOIN custodial_wallets cw ON cw.wallet_address = t.wallet
       WHERE t.proposal_pda = ?
       ORDER BY t.timestamp DESC
       LIMIT ?`,
    )
    .bind(proposalPda, limit)
    .all();

  return json({ data: result.results || [] }, 200, request);
}
