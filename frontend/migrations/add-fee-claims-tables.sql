-- Fee claims audit trail: tracks every fee claim from pools
CREATE TABLE IF NOT EXISTS fee_claims (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    pool_type TEXT NOT NULL,            -- 'omnipair' | 'dammv2_2'
    pool_address TEXT NOT NULL,
    amount_usdc REAL DEFAULT 0,         -- Stables claimed
    amount_token REAL DEFAULT 0,        -- Project tokens claimed
    tx_claim TEXT,                       -- TX signature for claiming from pool
    tx_to_fee_wallet TEXT,               -- TX signature for transfer to fee wallet
    tx_dispatch TEXT,                    -- TX signature for dispatch to destinations
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idea_id) REFERENCES ideas(id)
);

-- Ideator claims: prevents double-claiming, full audit trail
CREATE TABLE IF NOT EXISTS ideator_claims (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    ideator_wallet TEXT NOT NULL,
    amount_usdc REAL NOT NULL,
    tx_signature TEXT NOT NULL,
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idea_id) REFERENCES ideas(id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_fee_claims_idea_id ON fee_claims(idea_id);
CREATE INDEX IF NOT EXISTS idx_ideator_claims_idea_id ON ideator_claims(idea_id);
CREATE INDEX IF NOT EXISTS idx_ideator_claims_wallet ON ideator_claims(ideator_wallet);
