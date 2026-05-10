-- Track automated buyback executions
CREATE TABLE IF NOT EXISTS buyback_executions (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    amount_usdg DECIMAL(20,6) NOT NULL,
    tokens_received DECIMAL(20,9) NOT NULL,
    price_at_execution DECIMAL(20,12) NOT NULL,
    nav_at_execution DECIMAL(20,12) NOT NULL,
    transaction_signature TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_buyback_executions_idea ON buyback_executions(idea_id);
CREATE INDEX IF NOT EXISTS idx_buyback_executions_created ON buyback_executions(created_at);
