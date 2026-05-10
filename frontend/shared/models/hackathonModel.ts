/**
 * HackathonData - JSON model stored in the `data` column of the `hackathons` table.
 *
 * Table schema:
 *   id   TEXT PRIMARY KEY  -- UUID
 *   data TEXT NOT NULL      -- JSON (this interface)
 */
export interface HackathonData {
  idea_slug: string;
  idea_title: string;
  idea_image_url: string;
  category: string;
  usdg_amount: number;
  status: "upcoming" | "open" | "voting" | "completed";
  countdown_target: string;
  start_date?: string;
  end_date?: string;
  rules_md: string;
  what_is_expected_md?: string;
  combinator_chart_url: string;
  combinator_trade_url: string;
  combinator_proposal_pda?: string;
  /** Previous decision market PDAs (completed markets). Latest first. */
  previous_proposal_pdas?: string[];
  dao_pda?: string;
  /**
   * Optional override for the decision-market outcome labels. Stored as
   * a JSON-encoded string[] (e.g. `'["No","Alice","Bob"]'`). Kept as a
   * string for D1/JSON column compatibility — the admin editor does the
   * serialize/parse round-trip. Absent/empty → UI derives labels from
   * `proposals` or shows "Option N" as a last resort.
   */
  combinator_option_labels?: string;
  /**
   * Custom title for the decision proposal — surfaced on the mini-app
   * idea page as the collapsible section header (e.g. "Select the
   * builder of $PREDICT"). Optional: when empty, the UI falls back to
   * a default template derived from the project ticker.
   */
  decision_proposal_title?: string;
  milestone_split: number[];
  created_at: string;
  updated_at: string;
}

export interface HackathonRow {
  id: string;
  data: string;
}

export type HackathonWithId = HackathonData & { id: string };

export function parseHackathonRow(row: HackathonRow & Record<string, unknown>): HackathonWithId & Record<string, unknown> {
  const { id, data, ...extra } = row;
  return { id, ...JSON.parse(data), ...extra };
}

export function buildHackathonData(fields: Partial<HackathonData>): string {
  return JSON.stringify(fields);
}

/**
 * BuilderData - JSON model stored in the `data` column of the `builders` table.
 */
export interface BuilderData {
  username: string;
  display_name: string;
  avatar_url: string;
  position: string;
  city: string;
  about: string;
  skills: string[];
  i_am_a: string[];
  looking_for: string[];
  interested_in: string[];
  languages: string[];
  looking_for_teammates_text: string;
  is_student: boolean;
  twitter_url: string;
  github_url: string;
  telegram_url: string;
  google_email: string;
  wallet_address: string;
  additional_wallets: string[];
  claimed: boolean;
  source: "colosseum" | "manual" | "signup";
  created_at: string;
}

export interface BuilderRow {
  id: string;
  data: string;
}

export type BuilderWithId = BuilderData & { id: string };

export function parseBuilderRow(row: BuilderRow & Record<string, unknown>): BuilderWithId & Record<string, unknown> {
  const { id, data, ...extra } = row;
  return { id, ...JSON.parse(data), ...extra };
}

export function buildBuilderData(fields: Partial<BuilderData>): string {
  return JSON.stringify(fields);
}

/** Milestone row (normalized table) */
export interface MilestoneRow {
  id: string;
  hackathon_id: string;
  milestone_order: number;
  title: string;
  amount_usdg: number;
  deadline: string | null;
  status: "locked" | "active" | "completed" | "paid";
  paid_to: string | null;
}

/** Proposal row (normalized table) */
export interface ProposalRow {
  id: string;
  hackathon_id: string;
  builder_id: string;
  title: string;
  description_md: string | null;
  approach_md: string | null;
  timeline_md: string | null;
  github_url: string | null;
  demo_url: string | null;
  team_members: string | null; // JSON array
  market_odds: number | null;
  submitted_at: string;
}
