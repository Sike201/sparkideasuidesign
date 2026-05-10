-- Stores price snapshots for decision market charts.
-- Frontend pushes prices every 30s via POST /api/combinator-prices.

CREATE TABLE IF NOT EXISTS combinator_price_history (
  id TEXT PRIMARY KEY,
  proposal_pda TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  spot_price REAL NOT NULL,
  twap_price REAL NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_pda_ts ON combinator_price_history(proposal_pda, timestamp);
