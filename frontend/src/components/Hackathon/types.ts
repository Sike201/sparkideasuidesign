export type HackathonStatus = "upcoming" | "open" | "voting" | "completed";
export type MilestoneStatus = "locked" | "active" | "completed" | "paid";

export interface Builder {
  id: string;
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
  wallet_address: string;
  claimed: boolean;
  source: "colosseum" | "manual" | "signup";
  created_at: string;
}

export interface Milestone {
  id: string;
  hackathon_id: string;
  milestone_order: number;
  title: string;
  amount_usdg: number;
  deadline: string;
  status: MilestoneStatus;
  paid_to?: string; // builder username
}

export interface Proposal {
  id: string;
  hackathon_id: string;
  builder_id: string;
  builder: Builder;
  title: string;
  description_md: string;
  approach_md: string;
  timeline_md: string;
  github_url: string;
  demo_url: string;
  team_members: string[];
  market_odds?: number;
  shortlisted?: number;
  submitted_at: string;
}

export interface Hackathon {
  id: string;
  idea_title: string;
  idea_slug: string;
  idea_image_url: string;
  usdg_amount: number;
  status: HackathonStatus;
  countdown_target: string;
  start_date?: string;
  end_date?: string;
  rules_md: string;
  what_is_expected_md?: string;
  milestones: Milestone[];
  proposals: Proposal[];
  combinator_chart_url: string;
  combinator_trade_url: string;
  combinator_proposal_pda?: string;
  previous_proposal_pdas?: string[];
  dao_pda?: string;
  combinator_option_labels?: string[] | string; // JSON string or array
  milestone_split: number[];
  created_at: string;
}
