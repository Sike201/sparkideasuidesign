-- Hackathons: JSON blob pattern (like ideas)
CREATE TABLE IF NOT EXISTS hackathons (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

-- Hackathon milestones: normalized table
CREATE TABLE IF NOT EXISTS hackathon_milestones (
  id TEXT PRIMARY KEY,
  hackathon_id TEXT NOT NULL,
  milestone_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  amount_usdg REAL NOT NULL,
  deadline TEXT,
  status TEXT DEFAULT 'locked',
  paid_to TEXT,
  FOREIGN KEY (hackathon_id) REFERENCES hackathons(id)
);
CREATE INDEX IF NOT EXISTS idx_milestones_hackathon ON hackathon_milestones(hackathon_id);

-- Hackathon proposals: normalized table
CREATE TABLE IF NOT EXISTS hackathon_proposals (
  id TEXT PRIMARY KEY,
  hackathon_id TEXT NOT NULL,
  builder_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description_md TEXT,
  approach_md TEXT,
  timeline_md TEXT,
  github_url TEXT,
  demo_url TEXT,
  team_members TEXT,
  market_odds REAL,
  submitted_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (hackathon_id) REFERENCES hackathons(id),
  FOREIGN KEY (builder_id) REFERENCES builders(id)
);
CREATE INDEX IF NOT EXISTS idx_proposals_hackathon ON hackathon_proposals(hackathon_id);
CREATE INDEX IF NOT EXISTS idx_proposals_builder ON hackathon_proposals(builder_id);

-- Builders: JSON blob pattern
CREATE TABLE IF NOT EXISTS builders (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
