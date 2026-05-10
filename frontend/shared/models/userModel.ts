/**
 * UserData - JSON model stored in the `data` column of the `user` table.
 *
 * Table schema:
 *   address TEXT PRIMARY KEY  -- Solana wallet address
 *   data    TEXT DEFAULT '{}'  -- JSON (this interface)
 *
 * To add a new field, just add it here. No SQL migration needed.
 */
export interface UserData {
  username?: string;
  email?: string;
  tou_accepted_at?: string;
  twitter?: {
    twitterId: string;
    follows: Record<string, { isFollowing: boolean }>;
  };
  investmentIntent?: Record<
    string,
    { amount: string; message: string; signature: number[] }
  >;
  termsOfUse?: {
    acceptedAt: string;
    acceptedTextSigned: string;
    countryOfOrigin: string;
  };
  referral?: Record<
    string,
    { referralCode: string; createdAt: string; message: string; signature: number[] }
  >;
  referralCode?: Record<
    string,
    { code: string; message: string; signature: number[] }
  >;
  points?: number;
  created_at?: string;
  updated_at?: string;
}

/** Row as stored in D1: address + JSON blob */
export interface UserRow {
  address: string;
  data: string;
}

/** Parsed user with address included (what the API returns) */
export type UserWithAddress = UserData & { address: string };

/**
 * Parse a raw D1 row into a flat UserWithAddress object.
 * Extra fields from JOINs are preserved.
 */
export function parseUserRow(row: UserRow & Record<string, unknown>): UserWithAddress & Record<string, unknown> {
  const { address, data, ...extra } = row;
  return { address, ...JSON.parse(data as string), ...extra };
}

/**
 * Build the JSON string for INSERT/UPDATE.
 */
export function buildUserData(fields: Partial<UserData>): string {
  return JSON.stringify(fields);
}
