import {
  CreateUsernameRequestSchema,
  GetTokensResponse,
  TokenModel,
  GetUserTokensResponse,
  GetTokenMarketResponse,
  GetTokenBalanceResponse,
  AdminAuthFields
} from "../../../shared/models.ts"
import { GitHubScoreData } from "../../../shared/services/githubScore"
import { deduplicateRequest, createRequestKey } from "../../utils/requestDeduplication"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`

const POST_CREATE_USER = API_BASE_URL + "/user"
const GET_USER = API_BASE_URL + "/user"
const GET_TOKENS = API_BASE_URL + "/gettokens"
const GET_TOKEN = API_BASE_URL + "/gettoken"
const GET_USER_TOKENS = API_BASE_URL + "/getusertokens"
const GET_TOKEN_MARKET = API_BASE_URL + "/gettokenmarket"
const GET_TOKEN_BALANCE = API_BASE_URL + "/gettokenbalance"
const GET_SOL_BALANCE = API_BASE_URL + "/getsolbalance"
const SEND_TRANSACTION = API_BASE_URL + "/sendtransaction"
const GET_BLOCKHASH = API_BASE_URL + "/getblockhash"
const GET_ACCOUNT_INFO = API_BASE_URL + "/getaccountinfo"
const GET_APPLICATIONS = API_BASE_URL + "/applications"
const GITHUB_SCORE = API_BASE_URL + "/github-score"
const IS_ADMIN_URL = API_BASE_URL + "/admin/isadmin"
const GET_TOKEN_VOLUME = API_BASE_URL + "/gettokenvolume"
const GET_CREATORS = API_BASE_URL + "/getcreators"
const TWITTER_OAUTH_URL = API_BASE_URL + "/twitter-oauth-url"
const TWITTER_OAUTH_TOKEN = API_BASE_URL + "/twitter-oauth-token"
const GET_LEADERBOARD = API_BASE_URL + "/getleaderboard"
const GET_TOTAL_FEES = API_BASE_URL + "/get_total_fees"
const GET_TOKEN_BALANCE_NEW = API_BASE_URL + "/gettokenbalance"
const SIMULATE_TRANSACTION = API_BASE_URL + "/simulatetransaction"
const GOVERNANCE_TRANSACTION = API_BASE_URL + "/governancetransaction"
const VOTE_TRANSACTION = API_BASE_URL + "/votetransaction"
const ADMIN_GET_IDEA_URL = API_BASE_URL + "/admin/get-idea"
const ADMIN_UPDATE_IDEA_BO_URL = API_BASE_URL + "/admin/update-idea-bo"
const IDEAS_URL = API_BASE_URL + "/ideas"
const IDEA_COMMENTS_URL = API_BASE_URL + "/idea-comments"
const IDEA_INVESTMENTS_URL = API_BASE_URL + "/idea-investments"
const AGENT_PROJECTS_URL = API_BASE_URL + "/agent-projects"
const AGENT_PROJECT_COMMENTS_URL = API_BASE_URL + "/agent-project-comments"
const AGENT_PROJECT_INVESTMENTS_URL = API_BASE_URL + "/agent-project-investments"
const HACKATHONS_URL = API_BASE_URL + "/hackathons"
const ADMIN_HACKATHONS_URL = API_BASE_URL + "/admin/hackathons"
const ADMIN_CREATE_HACKATHON_URL = API_BASE_URL + "/admin/create-hackathon"
const ADMIN_UPDATE_HACKATHON_URL = API_BASE_URL + "/admin/update-hackathon"
const ADMIN_UPDATE_PROPOSAL_URL = API_BASE_URL + "/admin/update-proposal"
const SUBMIT_PROPOSAL_URL = API_BASE_URL + "/submit-proposal"
const UPDATE_PROPOSAL_URL = API_BASE_URL + "/update-proposal"
const BUILDERS_URL = API_BASE_URL + "/builders"
const TOKEN_HOLDERS_URL = API_BASE_URL + "/token-holders"


type PostCreateUserStatusArgs = {
  address: string 
  // email: string
  username: string
}

const isAdmin = async (auth: AdminAuthFields): Promise<void> => {
  const url = new URL(IS_ADMIN_URL, window.location.href)

  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(auth),
    headers: {
      "Content-Type": "application/json",
    },
  })
  const json = await response.json()
  if (!response.ok) throw new Error(json.message)
  return json
}

const postCreateUserStatus = async ({ address, username }: PostCreateUserStatusArgs): Promise<boolean> => {
  // Create complete URL for the request
  const url = new URL(POST_CREATE_USER)
  
  const body = JSON.stringify({
    publicKey: address, // Make sure this matches the expected schema on the server
    // email,
    username,
  })

  const response = await fetch(url, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
    },
    // Use 'same-origin' instead of 'include' if not crossing domains
    credentials: "same-origin"
  })
  
  if (!response.ok) {
    const json = await response.json().catch(() => ({ message: "Unknown error" }))
    throw new Error(json.message || "Request failed")
  }
  
  const json = await response.json()
  return json
}

type GetUserArgs = {
  address: string
}

type UserModelJson = {
  address: string
  username: string
}

const getUser = async ({ address }: GetUserArgs): Promise<UserModelJson> => {
  const url = new URL(GET_USER)
  url.searchParams.set("address", address)
  const response = await fetch(url)
  const json = await response.json()
  return json
}

type GetTokensArgs = {
  isGraduated: string
  orderBy?: string
  orderDirection?: string
}

const getTokens = async ({ isGraduated, orderBy, orderDirection }: GetTokensArgs): Promise<GetTokensResponse> => {
  const url = new URL(GET_TOKENS)
  url.searchParams.set("isGraduated", isGraduated)
  if (orderBy) {
    url.searchParams.set("orderBy", orderBy)
  }
  if (orderDirection) {
    url.searchParams.set("orderDirection", orderDirection)
  }
  const response = await fetch(url)
  const json = await response.json()
  return json
}

type GetTokenArgs = {
  mint: string
}

type GetTokenResponse = {
  token: TokenModel
}

const getToken = async ({ mint }: GetTokenArgs): Promise<GetTokenResponse> => {
  const url = new URL(GET_TOKEN)
  url.searchParams.set("mint", mint)
  console.log(url)
  const response = await fetch(url)
  const json = await response.json()
  return json
}

type GetUserTokensArgs = {
  address: string
}

const getUserTokens = async ({ address }: GetUserTokensArgs): Promise<GetUserTokensResponse> => {
  const url = new URL(GET_USER_TOKENS)
  url.searchParams.set("address", address)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch user tokens: ${response.statusText}`)
  }
  const json = await response.json()
  return json
}

type GetTokenMarketArgs = {
  address: string
}

const getTokenMarket = async ({ address }: GetTokenMarketArgs): Promise<GetTokenMarketResponse> => {
  const url = new URL(GET_TOKEN_MARKET)
  url.searchParams.set("address", address)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch token market data: ${response.statusText}`)
  }
  const json = await response.json()
  return json
}

type GetTokenBalanceArgs = {
  userAddress: string
  tokenMint: string
  cluster?: string
}

type GetSolBalanceArgs = {
  userAddress: string
  cluster?: string
}

type GetSolBalanceResponse = {
  success: boolean
  balance: number
  userAddress: string
  cluster: string
}

type SendTransactionArgs = {
  signedTransaction: string
  commitment?: string
}

type SendTransactionResponse = {
  success: boolean
  signature?: string
  error?: string
}

type GetBlockhashResponse = {
  success: boolean
  blockhash?: string
  lastValidBlockHeight?: number
  error?: string
}

type GetAccountInfoArgs = {
  address: string
}

type GetAccountInfoResponse = {
  success: boolean
  exists?: boolean
  data?: any
  error?: string
}

// Jupiter/RPC API types
type GetTokenBalanceNewArgs = {
  userAddress: string
  tokenMint: string
  cluster?: string
}

type GetTokenBalanceNewResponse = {
  success: boolean
  balance?: number
  error?: string
}

type SimulateTransactionArgs = {
  transaction: string // Base64 encoded transaction
  cluster?: string
}

type SimulateTransactionResponse = {
  success: boolean
  valid?: boolean
  error?: string
  logs?: string[]
}

type GovernanceTransactionArgs = {
  action: 'deposit' | 'withdraw'
  userAddress: string
  realmAddress: string
  tokenMint: string
  amount?: string
  cluster?: string
}

type GovernanceTransactionResponse = {
  success: boolean
  transaction?: string
  error?: string
}

type VoteTransactionArgs = {
  action: 'cast' | 'relinquish' | 'check'
  userAddress: string
  realmAddress: string
  proposalAddress: string
  tokenMint: string
  voteChoice?: 'yes' | 'no'
  cluster?: string
}

type VoteTransactionResponse = {
  success: boolean
  transaction?: string
  hasVoted?: boolean
  vote?: 'yes' | 'no' | null
  error?: string
}

const getTokenBalance = async ({ userAddress, tokenMint, cluster = "mainnet" }: GetTokenBalanceArgs): Promise<GetTokenBalanceResponse> => {
  const requestKey = createRequestKey("getTokenBalance", { userAddress, tokenMint, cluster })
  
  return deduplicateRequest(requestKey, async () => {
    const url = new URL(GET_TOKEN_BALANCE)
    url.searchParams.set("userAddress", userAddress)
    url.searchParams.set("tokenMint", tokenMint)
    url.searchParams.set("cluster", cluster)
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch token balance: ${response.statusText}`)
    }
    const json = await response.json()
    return json
  })
}

const getSolBalance = async ({ userAddress, cluster = "mainnet" }: GetSolBalanceArgs): Promise<GetSolBalanceResponse> => {
  const requestKey = createRequestKey("getSolBalance", { userAddress, cluster })
  
  return deduplicateRequest(requestKey, async () => {
    const url = new URL(GET_SOL_BALANCE)
    url.searchParams.set("userAddress", userAddress)
    url.searchParams.set("cluster", cluster)
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch SOL balance: ${response.statusText}`)
    }
    const json = await response.json()
    return json
  })
}

const sendTransaction = async ({ signedTransaction, commitment = "confirmed" }: SendTransactionArgs): Promise<SendTransactionResponse> => {
  const requestKey = createRequestKey("sendTransaction", { signedTransaction: signedTransaction.slice(0, 16), commitment })
  
  return deduplicateRequest(requestKey, async () => {
    const response = await fetch(SEND_TRANSACTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signedTransaction,
        commitment
      })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to send transaction: ${response.statusText}`)
    }
    const json = await response.json()
    return json
  })
}

const getBlockhash = async (): Promise<GetBlockhashResponse> => {
  const requestKey = createRequestKey("getBlockhash", {})
  
  return deduplicateRequest(requestKey, async () => {
    const response = await fetch(GET_BLOCKHASH)
    
    if (!response.ok) {
      throw new Error(`Failed to get blockhash: ${response.statusText}`)
    }
    const json = await response.json()
    return json
  })
}

const getAccountInfo = async ({ address }: GetAccountInfoArgs): Promise<GetAccountInfoResponse> => {
  const requestKey = createRequestKey("getAccountInfo", { address })
  
  return deduplicateRequest(requestKey, async () => {
    const response = await fetch(GET_ACCOUNT_INFO, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to get account info: ${response.statusText}`)
    }
    const json = await response.json()
    return json
  })
}

// Applications API Types
export type ApplicationResponse = {
  id: string
  projectId: string
  githubUsername: string
  githubId: string
  deliverableName: string
  requestedPrice: number
  estimatedDeadline: string
  featureDescription: string
  solanaWalletAddress: string
  status: string
  githubScore?: number
  createdAt: string
  updatedAt: string
}

export type GetApplicationsResponse = {
  applications: ApplicationResponse[]
}

export type SubmitApplicationRequest = {
  projectId: string
  githubUsername: string
  githubId: string
  deliverableName: string
  requestedPrice: number
  estimatedDeadline: string
  featureDescription: string
  solanaWalletAddress: string
  githubAccessToken?: string
}

// Applications API Functions
type GetApplicationsByProjectIdArgs = {
  projectId: string
}

const getApplicationsByProjectId = async ({ projectId }: GetApplicationsByProjectIdArgs): Promise<GetApplicationsResponse> => {
  const url = new URL(GET_APPLICATIONS)
  url.searchParams.set("projectId", projectId)
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error("Failed to fetch applications")
  }
  
  const json = await response.json()
  return json
}

type GetAllApplicationsArgs = {
  sortBy?: string
  sortDirection?: string
}

const getAllApplications = async ({ sortBy, sortDirection }: GetAllApplicationsArgs = {}): Promise<GetApplicationsResponse> => {
  const url = new URL(GET_APPLICATIONS)
  
  if (sortBy) {
    url.searchParams.set("sortBy", sortBy)
  }
  if (sortDirection) {
    url.searchParams.set("sortDirection", sortDirection)
  }
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error("Failed to fetch applications")
  }
  
  const json = await response.json()
  return json
}

const submitApplication = async (applicationData: SubmitApplicationRequest): Promise<{ success: boolean; applicationId: string; githubScore?: number; message: string }> => {
  const url = new URL(GET_APPLICATIONS)
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(applicationData),
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to submit application")
  }
  
  const json = await response.json()
  return json
}

// GitHub Score API Types
export type GenerateGitHubScoreRequest = {
  githubUsername: string
  githubAccessToken: string
  applicationId?: string
}

export type GenerateGitHubScoreResponse = {
  success: boolean
  githubScore?: number
  message: string
}

export type GetApplicationWithGitHubScoreResponse = {
  success: boolean
  application: ApplicationResponse
}

// GitHub Score API Functions
const generateGitHubScore = async (request: GenerateGitHubScoreRequest): Promise<GenerateGitHubScoreResponse> => {
  const url = new URL(GITHUB_SCORE)
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to generate GitHub score")
  }
  
  const json = await response.json()
  return json
}

const getApplicationWithGitHubScore = async (applicationId: string): Promise<GetApplicationWithGitHubScoreResponse> => {
  const url = new URL(GITHUB_SCORE)
  url.searchParams.set("applicationId", applicationId)
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error("Failed to fetch application with GitHub score")
  }
  
  const json = await response.json()
  return json
}

// Test GitHub API connectivity
const testGitHubApi = async (githubAccessToken: string): Promise<{ success: boolean; message: string; user?: { username: string; id: number; publicRepos: number } }> => {
  const url = new URL(`${API_BASE_URL}/test-github`)
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ githubAccessToken }),
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to test GitHub API")
  }
  
  const json = await response.json()
  return json
}

const testGitHubPermissions = async (githubAccessToken: string): Promise<{ success: boolean; message: string; results: Record<string, unknown> }> => {
  const url = new URL(`${API_BASE_URL}/test-github-permissions`)
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ githubAccessToken }),
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to test GitHub permissions")
  }
  
  const json = await response.json()
  return json
}

// Volume API Types
export type VolumeDataPoint = {
  timestamp: number
  volume: number
  price: number
  trades: number
}

export type Transaction = {
  id: string
  timestamp: number
  type: 'buy' | 'sell'
  amount: number
  price: number
  volume: number
  wallet: string
}

export type GetTokenVolumeResponse = {
  success: boolean
  tokenAddress: string
  timeFrame: string
  volumeData: VolumeDataPoint[]
  totalVolume: number
  totalTrades: number
  averageVolume: number
  recentTransactions: Transaction[]
}

// Volume API Functions
type GetTokenVolumeArgs = {
  address: string
  timeFrame?: string
}

const getTokenVolume = async ({ address, timeFrame = "24h" }: GetTokenVolumeArgs): Promise<GetTokenVolumeResponse> => {
  const url = new URL(GET_TOKEN_VOLUME)
  url.searchParams.set("address", address)
  url.searchParams.set("timeFrame", timeFrame)
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error("Failed to fetch token volume data")
  }
  
  const json = await response.json()
  return json
}

// Creators API Types
export type Creator = {
  twitterAccount: string;
  hasToken: boolean;
  tokenMint?: string;
  tokenName?: string;
  hasDao: boolean;
  daoAddress?: string;
  feesClaimed: number;
  feesClaimedRaw: number | string;
}

export type GetCreatorsResponse = {
  creators: Creator[]
}

const getCreators = async (): Promise<GetCreatorsResponse> => {
  const url = new URL(GET_CREATORS, window.location.href)
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error("Failed to fetch creators")
  }
  
  const json = await response.json()
  return json
}

// Twitter OAuth API Types
export type TwitterOAuthUrlRequest = {
  redirect_uri: string
  state: string
  code_challenge: string
  code_challenge_method: string
}

export type TwitterOAuthUrlResponse = {
  authUrl: string
}

export type TwitterOAuthTokenRequest = {
  code: string
  redirect_uri: string
  code_verifier: string
  /**
   * Mini-app flow — when set to "mini", the backend also issues a 7-day JWT
   * (`token`) the PWA stores client-side for subsequent `/api/mini/*` calls.
   * Legacy web flows omit this field.
   */
  mode?: "mini"
}

export type TwitterUser = {
  id: string
  username: string
  name: string
  profile_image_url?: string
}

export type TwitterOAuthTokenResponse = {
  success: boolean
  user: TwitterUser
  /** Present only when the request was made with `mode: "mini"`. */
  token?: string
}

const getTwitterOAuthUrl = async (request: TwitterOAuthUrlRequest): Promise<TwitterOAuthUrlResponse> => {
  const url = new URL(TWITTER_OAUTH_URL, window.location.href)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  
  if (!response.ok) {
    throw new Error("Failed to get Twitter OAuth URL")
  }
  
  const json = await response.json()
  return json
}

const exchangeTwitterOAuthToken = async (request: TwitterOAuthTokenRequest): Promise<TwitterOAuthTokenResponse> => {
  const url = new URL(TWITTER_OAUTH_TOKEN, window.location.href)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  
  if (!response.ok) {
    throw new Error("Failed to exchange Twitter OAuth token")
  }
  
  const json = await response.json()
  return json
}

// GitHub OAuth API Types
export type GitHubOAuthUrlRequest = {
  redirect_uri: string
  state: string
}

export type GitHubOAuthUrlResponse = {
  authUrl: string
}

export type GitHubOAuthTokenRequest = {
  code: string
  redirect_uri: string
}

export type GitHubUser = {
  id: number
  login: string
  name: string
  avatar_url?: string
}

export type GitHubOAuthTokenResponse = {
  success: boolean
  user: GitHubUser
}

const GITHUB_OAUTH_URL = API_BASE_URL + "/github-oauth-url"
const GITHUB_OAUTH_TOKEN = API_BASE_URL + "/github-oauth-token"

const getGitHubOAuthUrl = async (request: GitHubOAuthUrlRequest): Promise<GitHubOAuthUrlResponse> => {
  const url = new URL(GITHUB_OAUTH_URL, window.location.href)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
  if (!response.ok) throw new Error("Failed to get GitHub OAuth URL")
  return response.json()
}

const exchangeGitHubOAuthToken = async (request: GitHubOAuthTokenRequest): Promise<GitHubOAuthTokenResponse> => {
  const url = new URL(GITHUB_OAUTH_TOKEN, window.location.href)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
  if (!response.ok) throw new Error("Failed to exchange GitHub OAuth token")
  return response.json()
}

// Google OAuth API Types
export type GoogleOAuthUrlRequest = {
  redirect_uri: string
  state: string
}

export type GoogleOAuthUrlResponse = {
  authUrl: string
}

export type GoogleOAuthTokenRequest = {
  code: string
  redirect_uri: string
}

export type GoogleUser = {
  id: string
  email: string
  name: string
  picture?: string
}

export type GoogleOAuthTokenResponse = {
  success: boolean
  user: GoogleUser
}

const GOOGLE_OAUTH_URL = API_BASE_URL + "/google-oauth-url"
const GOOGLE_OAUTH_TOKEN = API_BASE_URL + "/google-oauth-token"

const getGoogleOAuthUrl = async (request: GoogleOAuthUrlRequest): Promise<GoogleOAuthUrlResponse> => {
  const url = new URL(GOOGLE_OAUTH_URL, window.location.href)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
  if (!response.ok) throw new Error("Failed to get Google OAuth URL")
  return response.json()
}

const exchangeGoogleOAuthToken = async (request: GoogleOAuthTokenRequest): Promise<GoogleOAuthTokenResponse> => {
  const url = new URL(GOOGLE_OAUTH_TOKEN, window.location.href)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
  if (!response.ok) throw new Error("Failed to exchange Google OAuth token")
  return response.json()
}

// Leaderboard API Types
export type LeaderboardEntry = {
  username: string
  feesGenerated: number
  feesGeneratedSOL?: number
  rank: number
  tokenCount: number
}

export type GetLeaderboardResponse = {
  leaderboard: LeaderboardEntry[]
}

const getLeaderboard = async (): Promise<GetLeaderboardResponse> => {
  const url = new URL(GET_LEADERBOARD, window.location.href)
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error("Failed to fetch leaderboard")
  }
  
  const json = await response.json()
  return json
}

// Get Total Fees API Types
export type GetTotalFeesRequest = {
  twitterAccount: string
}

export type GetTotalFeesResponse = {
  success: boolean
  totalFeesEarned: number
  totalFeesClaimed: number
  availableToClaim: number
  tokenBreakdown: Array<{
    tokenName: string
    tokenMint: string
    feesEarned: number
    userFeesClaimed: number
  }>
  error?: string
  errorName?: string
  timestamp?: string
}

const getTotalFees = async (request: GetTotalFeesRequest): Promise<GetTotalFeesResponse> => {
  const url = new URL(GET_TOTAL_FEES, window.location.href)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  
  const json = await response.json()
  
  if (!response.ok) {
    throw new Error(json.message || "Failed to get total fees")
  }
  
  return json
}

// New Jupiter/RPC API functions
const getTokenBalanceNew = async (args: GetTokenBalanceNewArgs): Promise<GetTokenBalanceNewResponse> => {
  const response = await fetch(GET_TOKEN_BALANCE_NEW, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args)
  })
  
  const json = await response.json()
  
  if (!response.ok) {
    throw new Error(json.message || "Failed to get token balance")
  }
  
  return json
}

const simulateTransaction = async (args: SimulateTransactionArgs): Promise<SimulateTransactionResponse> => {
  const response = await fetch(SIMULATE_TRANSACTION, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args)
  })
  
  let json
  try {
    json = await response.json()
  } catch (error) {
    throw new Error(`Failed to parse response: ${response.status} ${response.statusText}`)
  }
  
  if (!response.ok) {
    throw new Error(json?.message || json?.error || `Failed to simulate transaction: ${response.status} ${response.statusText}`)
  }
  
  return json
}

const governanceTransaction = async (args: GovernanceTransactionArgs): Promise<GovernanceTransactionResponse> => {
  const response = await fetch(GOVERNANCE_TRANSACTION, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args)
  })
  
  const json = await response.json()
  
  if (!response.ok) {
    throw new Error(json.message || "Failed to create governance transaction")
  }
  
  return json
}

const voteTransaction = async (args: VoteTransactionArgs): Promise<VoteTransactionResponse> => {
  const response = await fetch(VOTE_TRANSACTION, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args)
  })
  
  const json = await response.json()
  
  if (!response.ok) {
    throw new Error(json.message || "Failed to process vote transaction")
  }
  
  return json
}

// Ideas API Types
export type IdeaModel = {
  id: string
  title: string
  slug: string
  description: string
  category: string
  author_username: string
  author_avatar: string
  author_twitter_id?: string
  source: 'user' | 'twitter'
  tweet_url?: string
  tweet_content?: string
  sparked_by_username?: string
  estimated_price?: number
  raised_amount?: number
  cap_reached_at?: string
  generated_image_url?: string
  market_analysis?: string
  colosseum_analysis?: string
  colosseum_score?: number
  token_address?: string
  timeline_phase?: number
  legends_url?: string
  superteam_url?: string
  coin_name?: string
  ticker?: string
  initial_token_price?: number
  ideator_wallet?: string
  ideator_fees_available?: number
  ideator_fees_claimed?: number
  total_fees_collected?: number
  treasury_wallet?: string
  liquidity_percent?: number
  status: 'pending' | 'in_progress' | 'completed' | 'planned'
  upvotes: number
  downvotes: number
  votes?: number // Legacy field for compatibility
  comments_count: number
  created_at: string
  updated_at: string
}

export type IdeaVoteModel = {
  id: string
  idea_id: string
  user_id: string
  voter_twitter_id?: string
  voter_username?: string
  vote_type: 'up' | 'down'
  idea_title?: string
  idea_slug?: string
  idea_category?: string
  created_at: string
}

export type IdeaCommentModel = {
  id: string
  idea_id: string
  parent_comment_id?: string
  content: string
  author_username: string
  author_avatar: string
  author_twitter_id?: string
  is_team: boolean
  created_at: string
  upvotes?: number
  downvotes?: number
  author_investment?: number
}

export type GetIdeasResponse = {
  ideas: IdeaModel[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}

export type GetUserVotesResponse = {
  votes: IdeaVoteModel[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}

export type GetIdeaResponse = {
  idea: IdeaModel
  comments: IdeaCommentModel[]
}

export type SubmitIdeaRequest = {
  title: string
  description: string
  category: string
  authorUsername?: string
  authorAvatar?: string
  authorTwitterId?: string
  source?: 'user' | 'twitter'
  tweetUrl?: string
  tweetContent?: string
  estimatedPrice?: number
  coinName?: string
  ticker?: string
  ideatorWallet?: string
  sparkedByUsername?: string
}

export type VoteIdeaRequest = {
  id: string
  action: 'vote' | 'upvote' | 'downvote'
  userId: string
  voterTwitterId?: string
  voterUsername?: string
  voteType?: 'up' | 'down'
  walletAddress?: string
}

export type VoteIdeaResponse = {
  success: boolean
  action: 'voted' | 'unvoted' | 'changed'
  voteType: 'up' | 'down' | null
}

export type SubmitCommentRequest = {
  ideaId: string
  parentCommentId?: string
  content: string
  authorUsername?: string
  authorAvatar?: string
  authorTwitterId?: string
  isTeam?: boolean
  walletAddress?: string
}

// Ideas API Functions
type GetIdeasArgs = {
  category?: string
  status?: string
  sortBy?: 'votes' | 'newest' | 'oldest' | 'raised' | 'downvotes'
  authorUsername?: string
  limit?: number
  offset?: number
}

const getIdeas = async ({ category, status, sortBy, authorUsername, limit, offset }: GetIdeasArgs = {}): Promise<GetIdeasResponse> => {
  const url = new URL(IDEAS_URL, window.location.href)
  
  if (category) url.searchParams.set("category", category)
  if (status) url.searchParams.set("status", status)
  if (sortBy) url.searchParams.set("sortBy", sortBy)
  if (authorUsername) url.searchParams.set("authorUsername", authorUsername)
  if (limit) url.searchParams.set("limit", limit.toString())
  if (offset) url.searchParams.set("offset", offset.toString())
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error("Failed to fetch ideas")
  }
  
  const json = await response.json()
  return json
}

const getUserVotes = async (voterUsername: string, limit?: number, offset?: number): Promise<GetUserVotesResponse> => {
  const url = new URL(IDEAS_URL, window.location.href)
  url.searchParams.set("voterUsername", voterUsername)
  if (limit) url.searchParams.set("limit", limit.toString())
  if (offset) url.searchParams.set("offset", offset.toString())
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error("Failed to fetch user votes")
  }
  
  const json = await response.json()
  return json
}

const getIdea = async (idOrSlug: string, bySlug: boolean = false): Promise<GetIdeaResponse> => {
  const url = new URL(IDEAS_URL, window.location.href)
  if (bySlug) {
    url.searchParams.set("slug", idOrSlug)
  } else {
    url.searchParams.set("id", idOrSlug)
  }
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error("Failed to fetch idea")
  }
  
  const json = await response.json()
  return json
}

const getIdeaBySlug = async (slug: string): Promise<GetIdeaResponse> => {
  return getIdea(slug, true)
}

const submitIdea = async (request: SubmitIdeaRequest): Promise<{ success: boolean; id: string; slug: string; url: string; message: string }> => {
  const url = new URL(IDEAS_URL, window.location.href)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to submit idea")
  }
  
  const json = await response.json()
  return json
}

interface UpdateIdeaRequest {
  id: string;
  author_twitter_id: string;
  title?: string;
  description?: string;
  category?: string;
  coin_name?: string;
  ticker?: string;
  estimated_price?: number;
}

const updateIdea = async (request: UpdateIdeaRequest): Promise<{ success: boolean }> => {
  const url = new URL(IDEAS_URL, window.location.href)
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, action: 'edit' })
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to update idea")
  }

  return response.json()
}

const voteIdea = async (request: VoteIdeaRequest): Promise<VoteIdeaResponse> => {
  const url = new URL(IDEAS_URL, window.location.href)
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to vote on idea")
  }
  
  const json = await response.json()
  return json
}

const getIdeaComments = async (ideaId: string): Promise<{ comments: IdeaCommentModel[] }> => {
  const url = new URL(IDEA_COMMENTS_URL, window.location.href)
  url.searchParams.set("ideaId", ideaId)
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error("Failed to fetch comments")
  }
  
  const json = await response.json()
  return json
}

const submitIdeaComment = async (request: SubmitCommentRequest): Promise<{ success: boolean; id: string; message: string }> => {
  const url = new URL(IDEA_COMMENTS_URL, window.location.href)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })
  
  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to submit comment")
  }
  
  const json = await response.json()
  return json
}

export type UserInvestmentModel = {
  id: string
  idea_id: string
  investor_wallet: string
  amount_usdc: number
  status: string
  created_at: string
  idea_title?: string
  idea_slug?: string
}

const getUserInvestments = async (walletOrUsername: string, byUsername = false): Promise<{ investments: UserInvestmentModel[] }> => {
  const url = new URL(IDEA_INVESTMENTS_URL, window.location.href)
  if (byUsername) {
    url.searchParams.set('username', walletOrUsername)
  } else {
    url.searchParams.set('wallet', walletOrUsername)
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error("Failed to fetch user investments")
  }
  return response.json()
}

// Agent Projects API Types
export type AgentProjectModel = {
  id: string
  title: string
  slug: string
  description: string
  team_name: string
  status: 'Draft' | 'Published'
  human_votes: number
  agent_votes: number
  total_votes: number
  colosseum_url: string
  colosseum_project_id: string
  estimated_price?: number
  raised_amount?: number
  treasury_wallet?: string
  generated_image_url?: string
  market_analysis?: string
  upvotes?: number
  downvotes?: number
  comments_count?: number
  created_at: string
  scraped_at: string
  updated_at: string
}

export type GetAgentProjectsResponse = {
  projects: AgentProjectModel[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
}

export type GetAgentProjectResponse = {
  project: AgentProjectModel
  comments: IdeaCommentModel[] // Reuse comment model structure
}

type GetAgentProjectsArgs = {
  status?: 'Draft' | 'Published' | 'all'
  sortBy?: 'votes' | 'newest' | 'oldest' | 'raised' | 'colosseum_votes' | 'downvotes'
  limit?: number
  offset?: number
}

// Agent Projects API Functions
const getAgentProjects = async ({ status, sortBy, limit, offset }: GetAgentProjectsArgs = {}): Promise<GetAgentProjectsResponse> => {
  const url = new URL(AGENT_PROJECTS_URL, window.location.href)

  if (status && status !== 'all') url.searchParams.set("status", status)
  if (sortBy) url.searchParams.set("sortBy", sortBy)
  if (limit) url.searchParams.set("limit", limit.toString())
  if (offset) url.searchParams.set("offset", offset.toString())

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error("Failed to fetch agent projects")
  }

  const json = await response.json()
  return json
}

const getAgentProject = async (idOrSlug: string, bySlug: boolean = false): Promise<GetAgentProjectResponse> => {
  const url = new URL(AGENT_PROJECTS_URL, window.location.href)
  if (bySlug) {
    url.searchParams.set("slug", idOrSlug)
  } else {
    url.searchParams.set("id", idOrSlug)
  }

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error("Failed to fetch agent project")
  }

  const json = await response.json()
  return json
}

const getAgentProjectBySlug = async (slug: string): Promise<GetAgentProjectResponse> => {
  return getAgentProject(slug, true)
}

const voteAgentProject = async (request: VoteIdeaRequest): Promise<VoteIdeaResponse> => {
  const url = new URL(AGENT_PROJECTS_URL, window.location.href)
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to vote on agent project")
  }

  const json = await response.json()
  return json
}

const getAgentProjectComments = async (projectId: string): Promise<{ comments: IdeaCommentModel[] }> => {
  const url = new URL(AGENT_PROJECT_COMMENTS_URL, window.location.href)
  url.searchParams.set("projectId", projectId)

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error("Failed to fetch comments")
  }

  const json = await response.json()
  return json
}

const submitAgentProjectComment = async (request: Omit<SubmitCommentRequest, 'ideaId'> & { projectId: string }): Promise<{ success: boolean; id: string; message: string }> => {
  const url = new URL(AGENT_PROJECT_COMMENTS_URL, window.location.href)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to submit comment")
  }

  const json = await response.json()
  return json
}

// Admin Back-Office API Functions
const adminGetIdea = async (auth: AdminAuthFields, ideaId: string): Promise<{ idea: Record<string, unknown> }> => {
  const response = await fetch(ADMIN_GET_IDEA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth, ideaId }),
  })
  const json = await response.json()
  if (!response.ok) throw new Error((json as { error?: string }).error || "Failed to fetch idea")
  return json as { idea: Record<string, unknown> }
}

const adminUpdateIdea = async (auth: AdminAuthFields, ideaId: string, data: Record<string, string | number | null>): Promise<{ success: boolean }> => {
  const response = await fetch(ADMIN_UPDATE_IDEA_BO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth, ideaId, data }),
  })
  const json = await response.json()
  if (!response.ok) throw new Error((json as { error?: string }).error || "Failed to update idea")
  return json as { success: boolean }
}

// Referrals API
const REFERRALS_URL = API_BASE_URL + "/referrals"

export type ReferralCodeResponse = {
  code: string
  referralCount: number
}

export type ReferralEntry = {
  referee_wallet: string
  referee_twitter_username?: string
  created_at: string
}

export type ReferralWithInvestmentEntry = {
  id: string
  referee_wallet: string
  referee_twitter_username?: string
  created_at: string
  total_invested_after_referral: number
}

export type GetReferralsResponse = {
  referrals: ReferralEntry[]
}

export type GetReferralsWithInvestmentsResponse = {
  referrals: ReferralWithInvestmentEntry[]
}

const getReferralCode = async (wallet: string): Promise<ReferralCodeResponse> => {
  const url = new URL(REFERRALS_URL, window.location.href)
  url.searchParams.set('wallet', wallet)
  url.searchParams.set('action', 'code')
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to get referral code")
  return response.json()
}

const getReferrals = async (wallet: string): Promise<GetReferralsResponse> => {
  const url = new URL(REFERRALS_URL, window.location.href)
  url.searchParams.set('wallet', wallet)
  url.searchParams.set('action', 'referrals')
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to get referrals")
  return response.json()
}

const getReferralsWithInvestments = async (wallet: string): Promise<GetReferralsWithInvestmentsResponse> => {
  const url = new URL(REFERRALS_URL, window.location.href)
  url.searchParams.set('wallet', wallet)
  url.searchParams.set('action', 'referrals-with-investments')
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to get referrals")
  return response.json()
}

const applyReferralCode = async (code: string, refereeWallet: string, refereeTwitterUsername?: string): Promise<{ success: boolean; message: string }> => {
  const url = new URL(REFERRALS_URL, window.location.href)
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, refereeWallet, refereeTwitterUsername })
  })
  const data = await response.json()
  if (!response.ok) throw new Error((data as { error?: string }).error || "Failed to apply referral code")
  return data as { success: boolean; message: string }
}

// Points API
const POINTS_URL = API_BASE_URL + "/points"
const POINTS_LEADERBOARD_URL = API_BASE_URL + "/points-leaderboard"

export type PointsLeaderboardEntry = {
  rank: number
  address: string
  points: number
  username: string | null
  avatar: string | null
}

export type UserPointsResponse = {
  points: number
  rank: number
}

const getPointsLeaderboard = async (limit: number = 50): Promise<{ leaderboard: PointsLeaderboardEntry[] }> => {
  const url = new URL(POINTS_LEADERBOARD_URL, window.location.href)
  url.searchParams.set('limit', String(limit))
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to fetch points leaderboard")
  return response.json()
}

const getUserPoints = async (wallet: string): Promise<UserPointsResponse> => {
  const url = new URL(POINTS_URL, window.location.href)
  url.searchParams.set('wallet', wallet)
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to fetch user points")
  return response.json()
}

// Hackathons API types
export type HackathonModel = {
  id: string
  idea_slug: string
  idea_title: string
  idea_image_url: string
  category: string
  usdg_amount: number
  status: "upcoming" | "open" | "voting" | "completed"
  countdown_target: string
  start_date?: string
  end_date?: string
  rules_md: string
  what_is_expected_md?: string
  combinator_chart_url: string
  combinator_trade_url: string
  combinator_proposal_pda?: string
  previous_proposal_pdas?: string[]
  dao_pda?: string
  /**
   * Optional override for the decision-market outcome labels. Either a
   * raw string[] or a JSON-encoded string[] (the DB column is TEXT).
   * When absent, UI falls back to building labels from `proposals` or
   * shows "Option N" as a last resort.
   */
  combinator_option_labels?: string[] | string
  milestone_split: number[]
  created_at: string
  updated_at: string
  proposals_count?: number
  milestones?: HackathonMilestoneModel[]
  proposals?: HackathonProposalModel[]
  /** Token metadata pulled from the linked Idea row (joined server-side
   *  on `idea_slug`). Used by the mini-app to display the project
   *  token's symbol/name instead of a truncated mint address. */
  coin_name?: string
  ticker?: string
  token_address?: string
  /** Treasury wallet address pulled from the linked Idea row (same
   *  server-side join as the token fields). Used by the mini-app's
   *  token-market card to display the on-chain treasury balance for
   *  the project's own token. */
  treasury_wallet?: string
  /** Custom title for the decision proposal (the question the market
   *  is asking) — editable per hackathon in BackOffice. The mini-app
   *  idea page uses it as the collapsible "Proposal 1" section
   *  header. When empty, the UI falls back to the default
   *  "Select the builder of $TICKER" template. */
  decision_proposal_title?: string
}

export type HackathonMilestoneModel = {
  id: string
  hackathon_id: string
  milestone_order: number
  title: string
  amount_usdg: number
  deadline: string | null
  status: "locked" | "active" | "completed" | "paid"
  paid_to: string | null
}

export type HackathonProposalModel = {
  id: string
  hackathon_id: string
  builder_id: string
  builder?: BuilderModel
  title: string
  description_md: string | null
  approach_md: string | null
  timeline_md: string | null
  github_url: string | null
  demo_url: string | null
  team_members: string[]
  market_odds: number | null
  shortlisted: number | null
  submitted_at: string
  /** Total community upvotes on this proposal. Aggregated server-side from
   *  the `proposal_upvotes` table on every fetch — see /api/hackathons. */
  upvote_count?: number
}

export type BuilderModel = {
  id: string
  username: string
  display_name: string
  avatar_url: string
  position: string
  city: string
  about: string
  skills: string[]
  i_am_a: string[]
  looking_for: string[]
  interested_in: string[]
  languages: string[]
  looking_for_teammates_text: string
  is_student: boolean
  twitter_url: string
  github_url: string
  telegram_url: string
  google_email: string
  wallet_address: string
  additional_wallets: string[]
  claimed: boolean
  source: string
  created_at: string
}

export type GetHackathonsResponse = {
  hackathons: HackathonModel[]
}

export type GetHackathonResponse = {
  hackathon: HackathonModel
}

// Hackathons API - Public
const getHackathons = async (): Promise<GetHackathonsResponse> => {
  const url = new URL(HACKATHONS_URL, window.location.href)
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to fetch hackathons")
  return response.json()
}

const getHackathon = async (id: string): Promise<GetHackathonResponse> => {
  const url = new URL(HACKATHONS_URL, window.location.href)
  url.searchParams.set("id", id)
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to fetch hackathon")
  return response.json()
}

// Hackathons API - Admin
const adminGetHackathons = async (auth: AdminAuthFields): Promise<GetHackathonsResponse> => {
  const response = await fetch(ADMIN_HACKATHONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth }),
  })
  const json = await response.json()
  if (!response.ok) throw new Error((json as { error?: string }).error || "Failed to fetch hackathons")
  return json as GetHackathonsResponse
}

const adminCreateHackathon = async (
  auth: AdminAuthFields,
  hackathon: Omit<HackathonModel, "id" | "created_at" | "updated_at" | "proposals_count" | "milestones" | "proposals">,
  milestones: { title: string; amount_usdg: number; deadline?: string }[]
): Promise<{ success: boolean; hackathonId: string }> => {
  const response = await fetch(ADMIN_CREATE_HACKATHON_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth, hackathon, milestones }),
  })
  const json = await response.json()
  if (!response.ok) throw new Error((json as { error?: string }).error || "Failed to create hackathon")
  return json as { success: boolean; hackathonId: string }
}

const adminUpdateHackathon = async (
  auth: AdminAuthFields,
  hackathonId: string,
  data?: Record<string, string | number | null>,
  milestones?: { id?: string; title: string; amount_usdg: number; deadline?: string; status?: string }[]
): Promise<{ success: boolean }> => {
  const response = await fetch(ADMIN_UPDATE_HACKATHON_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth, hackathonId, data, milestones }),
  })
  const json = await response.json()
  if (!response.ok) throw new Error((json as { error?: string }).error || "Failed to update hackathon")
  return json as { success: boolean }
}

// Admin: update or delete a proposal
const adminUpdateProposal = async (
  auth: AdminAuthFields,
  proposalId: string,
  data: Record<string, string | number | null>,
): Promise<{ success: boolean }> => {
  const response = await fetch(ADMIN_UPDATE_PROPOSAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth, proposalId, data }),
  })
  const json = await response.json()
  if (!response.ok) throw new Error((json as { error?: string }).error || "Failed to update proposal")
  return json as { success: boolean }
}

const adminDeleteProposal = async (
  auth: AdminAuthFields,
  proposalId: string,
): Promise<{ success: boolean }> => {
  const response = await fetch(ADMIN_UPDATE_PROPOSAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auth, proposalId, action: "delete" }),
  })
  const json = await response.json()
  if (!response.ok) throw new Error((json as { error?: string }).error || "Failed to delete proposal")
  return json as { success: boolean }
}

export type SubmitProposalRequest = {
  hackathon_id: string
  builder_wallet: string
  title: string
  description_md: string
  approach_md?: string
  timeline_md?: string
  github_url?: string
  demo_url?: string
  team_members?: string[]
  milestones?: { title: string; amount: string; deadline: string }[]
}

const submitProposal = async (data: SubmitProposalRequest): Promise<{ success: boolean; proposalId: string }> => {
  const response = await fetch(SUBMIT_PROPOSAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  const json = await response.json()
  if (!response.ok) throw new Error((json as { error?: string }).error || "Failed to submit proposal")
  return json as { success: boolean; proposalId: string }
}

// Update own proposal (builder auth via wallet)
const updateProposal = async (data: {
  proposal_id: string
  builder_wallet: string
  title?: string
  description_md?: string
  approach_md?: string
  timeline_md?: string
  github_url?: string
  demo_url?: string
  team_members?: string[]
  milestones?: { title: string; amount: string; deadline: string }[]
}): Promise<{ success: boolean }> => {
  const response = await fetch(UPDATE_PROPOSAL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  const json = await response.json()
  if (!response.ok) throw new Error((json as { error?: string }).error || "Failed to update proposal")
  return json as { success: boolean }
}

// Builders API - Public
export type GetBuildersResponse = {
  builders: BuilderModel[]
}

export type GetBuilderResponse = {
  builder: BuilderModel
  proposals?: { id: string; hackathon_id: string; hackathon_title: string; title: string; description_md: string | null; submitted_at: string }[]
}

const getBuilders = async (): Promise<GetBuildersResponse> => {
  const url = new URL(BUILDERS_URL, window.location.href)
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to fetch builders")
  return response.json()
}

const getBuilderByUsername = async (username: string): Promise<GetBuilderResponse> => {
  const url = new URL(BUILDERS_URL, window.location.href)
  url.searchParams.set("username", username)
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to fetch builder")
  return response.json()
}

const getBuilderByWallet = async (wallet: string): Promise<{ builder: BuilderModel | null }> => {
  const url = new URL(BUILDERS_URL, window.location.href)
  url.searchParams.set("wallet", wallet)
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to fetch builder")
  return response.json()
}

const searchBuilderBySocial = async (socialLink: string): Promise<{ builder: BuilderModel | null }> => {
  const url = new URL(BUILDERS_URL, window.location.href)
  url.searchParams.set("search_social", socialLink)
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to search builder")
  return response.json()
}

const findBuilderBySocial = async (socialLink: string): Promise<{ builder: BuilderModel | null }> => {
  const url = new URL(BUILDERS_URL, window.location.href)
  url.searchParams.set("find_by_social", socialLink)
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to find builder")
  return response.json()
}

const addWalletToBuilder = async (walletAddress: string, builderId: string): Promise<{ builder: BuilderModel }> => {
  const response = await fetch(BUILDERS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet_address: walletAddress, action: "add_wallet", builder_id: builderId }),
  })
  const json = await response.json()
  if (!response.ok) throw new Error((json as { error?: string }).error || "Failed to add wallet")
  return json as { builder: BuilderModel }
}

const updateBuilderProfile = async (walletAddress: string, data: Record<string, unknown>): Promise<{ builder: BuilderModel }> => {
  const response = await fetch(BUILDERS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet_address: walletAddress, data }),
  })
  const json = await response.json()
  if (!response.ok) throw new Error((json as { error?: string }).error || "Failed to update profile")
  return json as { builder: BuilderModel }
}

// Token Holders API
export type TokenHolderModel = {
  address: string
  amount: number
  percentage: number
}

type GetTokenHoldersResponse = {
  success: boolean
  holders: TokenHolderModel[]
  totalSupply: number
  decimals: number
}

const getTokenHolders = async (mint: string): Promise<GetTokenHoldersResponse> => {
  const url = new URL(TOKEN_HOLDERS_URL, window.location.href)
  url.searchParams.set("mint", mint)
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to fetch token holders")
  return response.json()
}

export const backendSparkApi = {
  postCreateUserStatus,
  getUser,
  getTokens,
  getToken,
  getUserTokens,
  getTokenMarket,
  getTokenBalance,
  getSolBalance,
  sendTransaction,
  getBlockhash,
  getAccountInfo,
  getApplicationsByProjectId,
  getAllApplications,
  submitApplication,
  isAdmin,
  generateGitHubScore,
  getApplicationWithGitHubScore,
  testGitHubApi,
  testGitHubPermissions,
  getTokenVolume,
  getCreators,
  getTwitterOAuthUrl,
  exchangeTwitterOAuthToken,
  getGitHubOAuthUrl,
  exchangeGitHubOAuthToken,
  getGoogleOAuthUrl,
  exchangeGoogleOAuthToken,
  getLeaderboard,
  getTotalFees,
  getTokenBalanceNew,
  simulateTransaction,
  governanceTransaction,
  voteTransaction,
  // Ideas API
  getIdeas,
  getIdea,
  getIdeaBySlug,
  getUserVotes,
  submitIdea,
  updateIdea,
  voteIdea,
  getIdeaComments,
  submitIdeaComment,
  getUserInvestments,
  // Agent Projects API
  getAgentProjects,
  getAgentProject,
  getAgentProjectBySlug,
  voteAgentProject,
  getAgentProjectComments,
  submitAgentProjectComment,
  // Admin Back-Office API
  adminGetIdea,
  adminUpdateIdea,
  // Referrals API
  getReferralCode,
  getReferrals,
  getReferralsWithInvestments,
  applyReferralCode,
  // Points API
  getPointsLeaderboard,
  getUserPoints,
  // Hackathons API
  getHackathons,
  getHackathon,
  adminGetHackathons,
  adminCreateHackathon,
  adminUpdateHackathon,
  adminUpdateProposal,
  adminDeleteProposal,
  submitProposal,
  updateProposal,
  getBuilders,
  getBuilderByUsername,
  getBuilderByWallet,
  searchBuilderBySocial,
  findBuilderBySocial,
  addWalletToBuilder,
  updateBuilderProfile,
  // Token Holders API
  getTokenHolders,
}