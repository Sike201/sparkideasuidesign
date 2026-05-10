-- Referral codes: one per wallet
CREATE TABLE IF NOT EXISTS referral_codes (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    twitter_username TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Referral relationships: who referred whom
CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    referrer_wallet TEXT NOT NULL,
    referrer_code TEXT NOT NULL,
    referee_wallet TEXT NOT NULL UNIQUE,
    referee_twitter_username TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_wallet ON referral_codes(wallet_address);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_wallet);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_wallet);
