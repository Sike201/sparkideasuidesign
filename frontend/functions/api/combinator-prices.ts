/**
 * Combinator price history API.
 * POST: store price snapshots (called by frontend every 30s)
 * GET:  retrieve price history for charts
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

export const onRequest: PagesFunction<ENV> = async (ctx) => {
  const { request } = ctx;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method === "POST") return handlePost(ctx);
  if (request.method === "GET") return handleGet(ctx);

  return json({ error: "Method not allowed" }, 405, request);
};

// POST: store prices
async function handlePost(ctx: EventContext<ENV, string, unknown>) {
  const { request } = ctx;
  const db = ctx.env.DB;

  try {
    const body = (await request.json()) as {
      proposal_pda: string;
      prices: { index: number; spot: number; twap: number }[];
    };

    if (!body.proposal_pda || !body.prices?.length) {
      return json({ error: "proposal_pda and prices required" }, 400, request);
    }

    const timestamp = new Date().toISOString();
    const stmts = body.prices.map((p) =>
      db
        .prepare(
          "INSERT INTO combinator_price_history (id, proposal_pda, option_index, spot_price, twap_price, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(
          `${body.proposal_pda}-${p.index}-${Date.now()}`,
          body.proposal_pda,
          p.index,
          p.spot,
          p.twap,
          timestamp
        )
    );

    await db.batch(stmts);
    return json({ success: true, count: stmts.length }, 200, request);
  } catch (err) {
    return json({ error: "Failed to store prices" }, 500, request);
  }
}

// GET: retrieve price history
async function handleGet(ctx: EventContext<ENV, string, unknown>) {
  const { request } = ctx;
  const db = ctx.env.DB;
  const url = new URL(request.url);
  const proposalPda = url.searchParams.get("proposal_pda");

  if (!proposalPda) {
    return json({ error: "proposal_pda query param required" }, 400, request);
  }

  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50000"), 100000);

  // Time-range filter — `range=2h|24h|all`. Drives BOTH the time
  // window (cutoff) AND the per-range downsampling rule. The two
  // are coupled to keep the payload size bounded.
  //
  // Strategy per range:
  //   - 2h  → cutoff at 2h ago, NO downsampling (raw minute-by-minute
  //           ~120/option). Matches the "original chart" behavior
  //           the user remembered — every recorded tick is visible
  //           and the line is granular.
  //   - 24h → NO cutoff, 30-min bucketing. Returns the FULL history
  //           at half-hourly cadence so the user can scroll left
  //           past the 24h window and see older data. Frontend
  //           `setVisibleRange` zooms the initial view to the last
  //           24h; horizontal pan reveals everything else.
  //   - all → NO cutoff, 1h bucketing. Same scroll-back semantics,
  //           heavier downsample so a year of data still loads
  //           snappily (~24 points/option/day).
  //
  // Why downsample at all: prices recorded every ~minute → "all"
  // raw is 10s of thousands of rows on a long market.
  //
  // Implementation: WHERE filter on
  // `epoch_seconds % bucketSec < TOLERANCE` rather than GROUP BY,
  // so the planner rides the existing `idx_price_pda_ts` index
  // directly without a hash-aggregate or self-join.
  //
  // Cutoff computed in JS rather than SQL so comparisons are on
  // the same ISO-8601 strings we wrote at insert time.
  const range = url.searchParams.get("range") || "all";
  const HOURS_BY_RANGE: Record<string, number | null> = {
    "2h": 2,
    "24h": null, // fetch full history, frontend zooms to last 24h
    "all": null,
  };
  // Bucket size (seconds). 0 means "no downsampling — keep every row".
  const BUCKET_SEC_BY_RANGE: Record<string, number> = {
    "2h": 0,
    "24h": 1800, // 30 min
    "all": 3600, // 1 h
  };
  // Tolerance window (seconds) inside each bucket — rows whose
  // `epoch_seconds % bucketSec < TOLERANCE` survive the filter.
  // 60s catches the FIRST minute of each bucket regardless of
  // exact write cadence (handles writers at 55-65s drift). With a
  // ~1-minute write cadence, this yields 1 row per bucket per
  // option in the typical case, occasionally 0 (writer skipped a
  // minute → that bucket is missing → chart bridges with the next
  // surviving point, visually invisible).
  const TOLERANCE_SEC = 60;
  const hours = HOURS_BY_RANGE[range] ?? null;
  const bucketSec = BUCKET_SEC_BY_RANGE[range] ?? 3600;

  // Build the SQL incrementally based on which filters are active.
  // Avoiding a single mega-query with conditional fragments keeps
  // the EXPLAIN plan stable and the generated bytecode cacheable.
  const clauses: string[] = ["proposal_pda = ?"];
  const binds: unknown[] = [proposalPda];
  if (hours !== null) {
    const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
    clauses.push("timestamp >= ?");
    binds.push(cutoff);
  }
  if (bucketSec > 0) {
    // `strftime('%s', ...)` returns the unix epoch as text; CAST
    // gets us an INTEGER for the modulo. The modulus operand is
    // bound as a parameter so SQLite can prepare-cache the query.
    clauses.push("CAST(strftime('%s', timestamp) AS INTEGER) % ? < ?");
    binds.push(bucketSec, TOLERANCE_SEC);
  }
  binds.push(limit);
  const sql =
    `SELECT option_index, spot_price, twap_price, timestamp
       FROM combinator_price_history
      WHERE ${clauses.join(" AND ")}
      ORDER BY timestamp ASC
      LIMIT ?`;

  const result = await db.prepare(sql).bind(...binds).all();

  return json({ data: result.results || [] }, 200, request);
}
