import { z, ZodTypeAny } from "zod"
import { TierSchema } from "./eligibilityModel"
/**
 * @deprecated deprecate , use drizzle
 * UserModel, user table in the database.
 */
export type UserModel = {
  wallet_address: string
  username: string
}
type TwitterHandle = string
type ProjectId = string
/**
 * @deprecated Use UserData from './models/userModel' instead.
 * UserModelJson, old json column in user database.
 */
export type UserModelJson = {
  twitter?: {
    twitterId: string
    follows: Record<
      TwitterHandle,
      {
        isFollowing: boolean
      }
    >
  }
  investmentIntent?: Record<
    ProjectId,
    {
      amount: string
      message: string
      signature: number[]
    }
  >
  termsOfUse?: {
    acceptedAt: Date
    acceptedTextSigned: string
    countryOfOrigin: string
  }
  referral?: Record<
    ProjectId,
    {
      referralCode: string
      createdAt: string
      message: string
      signature: number[]
    }
  >
  emailData?: {
    email: string
    providedAt: Date
    acceptedTextSigned: string
  }
  referralCode?: Record<
    ProjectId,
    {
      code: string
      message: string
      signature: number[]
    }
  >
}

export type TokenModel = {
  mint: string
  name: string
  imageUrl: string
  dao: string
  twitter_account: string
  fees_claimed?: string | number | null
  user_fees_claimed?: string | number | null
  damm_pool_address?: string | null
}

export type GetTokensResponse = {
  tokens: TokenModel[]
}

export type GetTokenResponse = {
  token: TokenModel
}

export type DaoGovernanceModel = {
  address: string
  realm: string
  governedAccount: string
  activeProposalCount: number
  config: {
    minCommunityWeightToCreateProposal: string
    minTransactionHoldUpTime: number
    votingBaseTime: number
    votingCoolOffTime: number
  }
}

export type DaoProposalOptionModel = {
  label: string
  voteWeight: string
  voteResult: "None" | "Succeeded" | "Defeated"
  transactionsCount: number
  transactionsExecutedCount: number
}

export type DaoProposalState = 
  | { draft: Record<string, never> }
  | { signingOff: Record<string, never> }
  | { voting: Record<string, never> }
  | { succeeded: Record<string, never> }
  | { executing: Record<string, never> }
  | { completed: Record<string, never> }
  | { cancelled: Record<string, never> }
  | { defeated: Record<string, never> }
  | { executingWithErrors: Record<string, never> }
  | { vetoed: Record<string, never> }

export type DaoProposalModel = {
  address: string
  governance: string
  name: string
  description: string
  state: DaoProposalState
  draftAt?: string
  votingAt?: string
  votingCompletedAt?: string
  executingAt?: string
  closedAt?: string
  options: DaoProposalOptionModel[]
  denyVoteWeight: string
  abstainVoteWeight: string
  vetoVoteWeight: string
}

export type DaoModel = {
  address: string
  name: string
  description: string
  communityMint: string
  communityTokenHoldingAccount: string
  realmConfigAccount: string
  councilMint: string | null
  authority: string | null
  version: 'V1' | 'V2'
  governances: DaoGovernanceModel[]
  proposals: DaoProposalModel[]
  proposalCount: number
}

export type UserTokenMetadata = {
  name?: string
  symbol?: string
  image?: string
  description?: string
}

export type UserTokenModel = {
  mint: string
  amount: string
  decimals: number
  uiAmount: number
  metadata: UserTokenMetadata
}

export type GetUserTokensResponse = {
  success: boolean
  userAddress: string
  solBalance: UserTokenModel
  tokens: UserTokenModel[]
  tokenCount: number
}

export type TokenMarketData = {
  address: string
  name: string
  symbol: string
  price: number
  priceChange24h: number
  marketCap: number
  volume24h: number
  liquidity: number
  fdv: number
  priceChart: Array<{
    timestamp: number
    price: number
  }>
  lastUpdated: string
}

export type GetTokenMarketResponse = {
  success: boolean
  tokenMarketData: TokenMarketData
}

export type GetTokenBalanceResponse = {
  success: boolean
  balance: number
  mint: string
  userAddress: string
}

export type GetGovernanceDataResponse = {
  success: boolean
  votingPower: number
  hasRecord: boolean
  userAddress: string
  realmAddress: string
  tokenMint: string
}

/**
 * Represents url type
 * Not sure what we wanna validate there ATM, so leave it as string for now.
 */
const urlSchema = () => z.string()
const iconTypeSchema = () => z.enum(["WEB", "LINKED_IN", "X_TWITTER", "MEDIUM", "OUTER_LINK", "TELEGRAM", "DISCORD"])
const externalUrlSchema = () =>
  z.object({
    url: z.string().min(1),
    iconType: iconTypeSchema(),
    label: z.string(),
  })
const dateSchema = () => z.coerce.date()
const timelineEventsSchema = () =>
  z.enum(["REGISTRATION_OPENS", "SALE_OPENS", "SALE_CLOSES", "REWARD_DISTRIBUTION", "DISTRIBUTION_OVER"])

const optional = (type: ZodTypeAny) => type.optional().nullable()

const integerSchema = () => z.number().min(0).max(Number.MAX_SAFE_INTEGER).int()
export const idSchema = () =>
  z
    .string()
    .min(1)
    .regex(new RegExp(/^[A-Za-z0-9-]+$/), "Only letters, numbers, and dashes are allowed")
export const SolanaAddressSchema = z.string().regex(/[1-9A-HJ-NP-Za-km-z]{32,44}/)
const SolanaClusterSchema = z.enum(["mainnet", "devnet"])

const TokenDataSchema = z.object({
  iconUrl: urlSchema(),
  ticker: z.string(),

  mintAddress: SolanaAddressSchema.nullable(),
  decimals: integerSchema(),

  fixedTokenPriceInUsd: optional(z.number()),
  coinGeckoName: optional(z.string()),
})

const nftConfigSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  description: z.string(),
  imageUrl: z.string(),
  collection: z.string().optional(),
})
export const bannerTypeSchema = z.enum(["WIDE", "COMPACT"])
export type BannerType = z.infer<typeof bannerTypeSchema>
const bannerSchema = z.object({
  type: bannerTypeSchema,
  imageUrl: z.string().optional(),
  label: z.string(),
  cta: z
    .object({
      label: z.string(),
      url: urlSchema(),
    })
    .optional(),
  borderGradient: z.object({
    leftHex: z.string(),
    rightHex: z.string(),
  }),
  backgroundGradient: z.object({
    leftHex: z.string(),
    rightHex: z.string(),
  }),
})
const preRaisedSchema = z.object({
  label: z.string(),
  amount: z.number(),
})

export type NftConfigType = z.infer<typeof nftConfigSchema>

export const ProjectTypeSchema = z.enum(["goat", "blitz", "draft-pick", "launch-pool"])

export const projectSchema = z.object({
  id: idSchema(),
  config: z.object({
    cluster: SolanaClusterSchema,

    lpPositionToBeBurned: optional(z.boolean()),

    raiseTargetInUsd: integerSchema(),
    fdv: optional(integerSchema()),
    marketCap: optional(integerSchema()),
    fdvBottom: optional(z.string()),
    fdvBorgPad: optional(z.string()),
    floorStrategy: optional(z.string()),
    kpiEndFloorStrategy: optional(z.string()),
    
    totalTokensForLiquidityPool: integerSchema(),
    totalTokensForRewardDistribution: integerSchema(),

    rewardsDistributionTimeInMonths: integerSchema(),
    rewardDistribution: z
      .object({
        atTge: z.object({
          rewardRatio: z.number().min(0).max(1),
        }),
        afterTge: z.object({
          rewardRatio: z.number().min(0).max(1),
          numberOfPayments: z.number().min(0),
        }),
      })
      .optional(),

    finalSnapshotTimestamp: optional(dateSchema()),

    lbpWalletAddress: SolanaAddressSchema.nullable(),

    raisedTokenData: TokenDataSchema,
    launchedTokenData: TokenDataSchema,
    nftConfig: nftConfigSchema.optional(),
    referralDistribution: z
      .object({
        tokenTickerDistributed: z.string().optional(),
        iconUrl: urlSchema().optional(),
        totalAmountDistributed: z.number().int().positive(),
        ranking: z.record(z.string(), z.number().min(0)),
        raffle: z.record(z.string(), z.number().min(0)),
      })
      .optional(),
  }),
  info: z.object({
    /// following 4 fields are typically added AFTER the sale
    // link for claiming rewards (currently doing airdrops with streamflow, but could be anything)
    claimUrl: optional(z.string()),
    tweetUrl: optional(z.string()),
    tokenContractUrl: optional(z.string()),
    poolContractUrl: optional(z.string()),

    ///// project metadata info /////
    projectType: ProjectTypeSchema,
    title: z.string().min(1),
    subtitle: z.string().min(1),

    ///// images /////
    logoUrl: urlSchema(),
    thumbnailUrl: optional(urlSchema()),
    squaredThumbnailUrl: optional(urlSchema()),

    origin: z.string().min(1),
    sector: z.string().min(1),
    tokenGenerationEventDate: optional(z.string()),
    targetFdv: z.string().min(1).optional(),
    targetVesting: z.string().min(1).optional(),
    chain: z.object({ name: z.string().min(1), iconUrl: urlSchema() }),
    banner: bannerSchema.optional(),
    preRaised: preRaisedSchema.optional(),

    dataRoom: z.object({ backgroundImgUrl: urlSchema().optional(), url: urlSchema() }),
    liquidityPool: z.object({
      name: z.string().min(1),
      iconUrl: urlSchema(),
      lbpType: z.string().min(1),
      lockingPeriod: z.string().min(1).optional(),
      investorFees: z.string().min(1).optional(),
      projectFees: z.string().min(1).optional(),
      poolManager: z.string().min(1).optional(),
      iconPoolManager: urlSchema().optional(),
      tokenPairedWith: z.string().min(1).optional(),
      iconPairedWith: urlSchema().optional(),
    }),
    curator: z.object({
      avatarUrl: urlSchema(),
      fullName: z.string().min(1),
      position: z.string().min(1),
      socials: z.array(externalUrlSchema()),
    }),
    projectLinks: z.array(externalUrlSchema()),
    timeline: z.array(
      z.object({
        id: timelineEventsSchema(),
        date: dateSchema().nullable(),
        fallbackText: z.string().min(1).optional(),
        label: z.string().min(1),
      }),
    ),
    tiers: z.array(TierSchema).min(1),
  }),
})
export type ProjectModel = z.infer<typeof projectSchema>

export type CacheStoreModel = {
  cache_key: string
  created_at: string
  expires_at: string
  cache_data: string
}

export type GetExchangeResponse = {
  baseCurrency: string
  targetCurrency: string

  currentPrice: string

  quotedFrom?: string
  quotedAt?: string
  rawExchangeResponse?: unknown
}
export type GetPresignedUrlResponse = {
  signedUrl: string
  publicUrl: string
}
export type PaginationType = {
  page: number
  limit: number
  total: number
  totalPages: number
}
export type GetProjectsProjectResponse = ProjectModel & { investmentIntentSummary?: InvestmentIntentSummary }
export type GetProjectsResponse = {
  projects: GetProjectsProjectResponse[]
  pagination: PaginationType
}

export const AcceptTermsRequestSchema = z.object({
  publicKey: z.string(),
  message: z.string(),
  signature: z.array(z.number().int()),
  isLedgerTransaction: z.boolean().optional().default(false),
})
export type AcceptTermsRequest = z.infer<typeof AcceptTermsRequestSchema>

export const InvestmentIntentRequestSchema = z.object({
  publicKey: z.string(),
  projectId: z.string(),
  amount: z.string(),
  message: z.string(),
  signature: z.array(z.number().int()),
  isLedgerTransaction: z.boolean().optional().default(false),
})
export type InvestmentIntentRequest = z.infer<typeof InvestmentIntentRequestSchema>

export const InvestmentIntentSummarySchema = z.object({
  sum: z.number(),
  avg: z.number(),
  count: z.number(),
})
export type InvestmentIntentSummary = z.infer<typeof InvestmentIntentSummarySchema>

export const CreateEmailRequestSchema = z.object({
  email: z.string(),
  publicKey: z.string(),
  message: z.string(),
  signature: z.array(z.number().int()),
  isLedgerTransaction: z.boolean().optional().default(false),
})
export type CreateEmailRequest = z.infer<typeof CreateEmailRequestSchema>

export const CreateUsernameRequestSchema = z.object({
  publicKey: z.string(),
  username: z.string(),
})
export type CreateUsernameRequest = z.infer<typeof CreateUsernameRequestSchema>

export type TokenAmountModel = {
  /**
   * Raw amount of tokens as a string, ignoring decimals
   */
  amount: string
  /**
   * Number of decimals configured for token's mint.
   */
  decimals: number
  /**
   * Token amount as a float, accounting for decimals.
   */
  uiAmount: string
  /**
   * Token amount value in USD
   */
  amountInUsd: string
  /**
   * Token price in USD
   */
  tokenPriceInUsd: string
}

export type SaleResultsResponse = {
  raiseTargetInUsd: string
  raiseTargetReached: boolean
  totalAmountRaised: TokenAmountModel
  averageDepositAmount: TokenAmountModel
  sellOutPercentage: string
  participantsCount: number
  marketCap: string
  fdv: string
}

export type UserInvestedRewardsResponse = {
  hasUserInvested: true
  lpPosition: {
    raisedTokenAmount: TokenAmountModel
    launchedTokenAmount: TokenAmountModel
  }
  rewards: {
    hasUserClaimedTotalAmount: boolean
    hasUserClaimedAvailableAmount: boolean
    hasRewardsDistributionStarted: boolean
    totalAmount: TokenAmountModel
    claimedAmount: TokenAmountModel
    claimableAmount: TokenAmountModel
    payoutSchedule: {
      date: string
      amount: number
      isClaimed: boolean
    }[]
  }
}

export type MyRewardsResponse = { hasUserInvested: false } | UserInvestedRewardsResponse

export type SaleResults = {
  raiseTargetInUsd: string
  raiseTargetReached: boolean
  totalAmountRaised: TokenAmountModel
  averageDepositAmount: TokenAmountModel
  participantsCount: number
  sellOutPercentage: number
  marketCap: number
  fdv: number
}

export type DepositStatus = {
  amountDeposited: TokenAmountModel
  minAmountAllowed: TokenAmountModel
  maxAmountAllowed: TokenAmountModel
  startTime: Date
}

export type AdminAuthFields = {
  address: string
  message: string
  signature: number[]
}

export const ReferralCodeRequestSchema = z.object({
  publicKey: z.string(),
  projectId: z.string(),
  referralCode: z.string(),
  message: z.string(),
  signature: z.array(z.number()),
  isLedgerTransaction: z.boolean().optional(),
})

export type ReferralCodeRequest = z.infer<typeof ReferralCodeRequestSchema>