-- Add investor email and Terms of Use acceptance to idea_investments
ALTER TABLE idea_investments ADD COLUMN investor_email TEXT;
ALTER TABLE idea_investments ADD COLUMN tou_accepted_at TEXT;
