import { Commitment } from "./SolanaWeb3"
/**
 * Solana public RPC endpoint.
 * Should only be used while testing/developing.
 * Before going to production we should remove this variable and only use SOLANA_RPC_URL that comes from environment
 * Mainnet Url: https://api.mainnet-beta.solana.com/
 * @deprecated
 */
// export const SOLANA_PUBLIC_RPC_URL = "https://api.devnet.solana.com"
/**
 * Sticking to 'finalized' commitment level for now.
 * 'finalized' is the safest option, but may take some time to finish transactions.
 * If performance becomes an issue, we can discuss switching to 'confirmed' commitment level.
 */
export const COMMITMENT_LEVEL = "finalized" satisfies Commitment
/**
 * Priority fee for all transactions.
 * ATM hardcoded to 200k micro lamports.
 * In the future, refactor to use Helius getPriorityFeeEstimate API https://docs.helius.dev/solana-apis/priority-fee-api
 */
export const PRIORITY_FEE_MICRO_LAMPORTS = 200_000
/**
 * Token Program on Solana https://spl.solana.com/token
 */
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
/**
 * Associated Token Program Address on Solana https://spl.solana.com/associated-token-account
 */
export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
/**
 * Metadata program address
 */
export const METADATA_PROGRAM_ADDRESS = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
