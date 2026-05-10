/**
 * IdeaData - JSON model stored in the `data` column of the `ideas` table.
 *
 * Table schema:
 *   id   TEXT PRIMARY KEY  -- UUID
 *   data TEXT NOT NULL      -- JSON (this interface)
 *
 * To add a new field, just add it here. No SQL migration needed.
 */
export interface IdeaData {
  title: string;
  slug: string;
  description: string;
  category: string;
  author_username: string;
  author_avatar?: string;
  author_twitter_id?: string;
  source: string; // "user" | "twitter"
  tweet_url?: string;
  tweet_content?: string;
  sparked_by_username?: string; // Twitter handle of the user who tagged the bot, when distinct from the ideator
  estimated_price: number;
  raised_amount: number;
  cap_reached_at?: string;
  generated_image_url?: string;
  market_analysis?: string;
  colosseum_analysis?: string;
  colosseum_score?: number;
  status: string; // "pending" | "in_progress" | "completed" | "planned"
  token_address?: string;
  timeline_phase?: number;
  legends_url?: string;
  superteam_url?: string;
  coin_name?: string;
  ticker?: string;
  initial_token_price?: number;
  treasury_wallet?: string;
  usdc_withdrawn_at?: string;
  created_at: string;
  updated_at: string;

  // Pool addresses (set by deploy-pools)
  pool_omnipair?: string;
  pool_dammv2_1?: string;
  pool_dammv2_2?: string;
  pool_omnipair_lp_mint?: string;
  pool_dammv2_1_position?: string;
  pool_dammv2_2_position?: string;

  // Fee infrastructure
  fee_wallet?: string;           // Derived per-project fee wallet (public key)
  buyback_wallet?: string;       // Per-project buyback wallet (public key)
  ideator_wallet?: string;       // Wallet of the ideator (for claiming fees)

  // Fee tracking
  total_fees_collected?: number;  // Total USDC collected from all pools
  ideator_fees_available?: number; // 10% accumulated for ideator
  ideator_fees_claimed?: number;   // Amount ideator has already claimed
}

/** Row as stored in D1: id + JSON blob */
export interface IdeaRow {
  id: string;
  data: string;
}

/** Parsed idea with id included (what the API returns) */
export type IdeaWithId = IdeaData & { id: string };

/**
 * Parse a raw D1 row into a flat IdeaWithId object.
 * Extra fields (upvotes, downvotes, comments_count) from JOINs are preserved.
 */
export function parseIdeaRow(row: IdeaRow & Record<string, unknown>): IdeaWithId & Record<string, unknown> {
  const { id, data, ...extra } = row;
  return { id, ...JSON.parse(data), ...extra };
}

/**
 * Build the JSON string for INSERT.
 */
export function buildIdeaData(fields: Partial<IdeaData>): string {
  return JSON.stringify(fields);
}
