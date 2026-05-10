-- Stores user trade history for the decision market.

CREATE TABLE IF NOT EXISTS combinator_trades (
  id TEXT PRIMARY KEY,
  proposal_pda TEXT NOT NULL,
  wallet TEXT NOT NULL,
  action TEXT NOT NULL,
  option_label TEXT,
  option_index INTEGER,
  side TEXT,
  amount REAL NOT NULL,
  token TEXT,
  tx_signature TEXT,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trades_pda ON combinator_trades(proposal_pda, timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_wallet ON combinator_trades(wallet, timestamp);
