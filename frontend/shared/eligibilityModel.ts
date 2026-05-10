import { z } from "zod"

const QUESTS_MIN_LENGTH = 0

/**
 * Base of Quests that the User does in order to become eligible.
 */
const BaseQuestSchema = z.object({
  // no need for label/description for now, they're stored on the frontend, based on tier
  // label: z.string().min(1),
  // description: z.string(),
  /**
   * Marks Quest as optional, currently there are none of those and the logic for handling them isn't defined
   * but let's not remove the field for now.
   * default: FALSE
   */
  isOptional: z.boolean().optional(),
})
/**
 * Requires the User to hold an amount of tokens.
 */
const HoldTokenQuestSchema = BaseQuestSchema.extend({
  type: z.literal('HOLD_TOKEN'),
  tokenMintAddress: z.string(),
  tokenName: z.string(),
  tokenAmount: z.string(),
})
/**
 * Requires the User to follow someone on X (twitter).
 */
const FollowOnTwitterQuestSchema = BaseQuestSchema.extend({
  type: z.literal('FOLLOW_ON_TWITTER'),
  twitterHandle: z.string(),
  twitterLabel: z.string(),
})
/**
 * Requires the User to accept the Terms of Use.
 */
const AcceptTermsOfUseQuestSchema = BaseQuestSchema.extend({
  type: z.literal('ACCEPT_TERMS_OF_USE'),
})
/**
 * Requires the User to provide Investment Intent (the amount that plan to invest) for a project.
 */
const ProvideInvestmentIntentQuestSchema = BaseQuestSchema.extend({
  type: z.literal('PROVIDE_INVESTMENT_INTENT'),
})
/**
 * (Optional) Requires the User to provide Referral code.
 */
const ReferralQuestSchema = BaseQuestSchema.extend({
  type: z.literal('REFERRAL'),
})
/**
 * Requires the User to be explicitly whitelisted for a project
 */
const WhitelistQuestSchema = BaseQuestSchema.extend({
  type: z.literal('WHITELIST'),
})
/**
 * Requires the User to provide their email.
 */
const ProvideEmailQuestSchema = BaseQuestSchema.extend({
  type: z.literal('PROVIDE_EMAIL'),
})
/**
 * Requires the User to provide their email.
 */
const ProvideReferralQuestSchema = BaseQuestSchema.extend({
  type: z.literal('PROVIDE_REFERRAL_CODE'),
})
/**
 * Requires the User to provide their email.
 */
const AllListedCompliancesSchema = BaseQuestSchema.extend({
  type: z.literal('ALL_LISTED_COMPLIANCES'),
})
/**
 * Quests that the User does in order to become eligible.
 * Quests names should be in imperative, like HOLD_TOKEN, FOLLOW_ON_X, not in passive like HOLDS, FOLLOWS.
 * Previously had DONT_RESIDE_IN_US, but that is now part of compliance, not quests anymore.
 */
const QuestSchema = z.discriminatedUnion("type", [
  HoldTokenQuestSchema,
  FollowOnTwitterQuestSchema,
  AcceptTermsOfUseQuestSchema,
  ProvideInvestmentIntentQuestSchema,
  WhitelistQuestSchema,
  ReferralQuestSchema,
  ProvideEmailQuestSchema,
  ProvideReferralQuestSchema,
  AllListedCompliancesSchema,
])
export type Quest = z.infer<typeof QuestSchema>
/**
 * CompletionSchema for merging with QuestSchemas.
 */
const CompletionSchema = z.object({
  isCompleted: z.boolean(),
})
/**
 * Quests that the User does in order to become eligible, with added completion status.
 */
const QuestWithCompletionSchema = z.union([
  HoldTokenQuestSchema.merge(CompletionSchema),
  FollowOnTwitterQuestSchema.merge(CompletionSchema),
  AcceptTermsOfUseQuestSchema.merge(CompletionSchema),
  ProvideInvestmentIntentQuestSchema.merge(CompletionSchema),
  ReferralQuestSchema.merge(CompletionSchema),
  WhitelistQuestSchema.merge(CompletionSchema),
  ProvideEmailQuestSchema.merge(CompletionSchema),
  ProvideReferralQuestSchema.merge(CompletionSchema),
  AllListedCompliancesSchema.merge(CompletionSchema),
])
export type QuestWithCompletion = z.infer<typeof QuestWithCompletionSchema>
export type QuestType = z.infer<typeof QuestSchema>['type']
/**
 * Benefits granted to the User when eligible for a Tier.
 * Also known as: rights
 * "Rights will be limited to those two parameters. Essentially a Start Date per tier & Min / Max Investments limits per tier."
 * Min and Max Investments are string to cover for floating points issues, possibly change to number.
 */
const BenefitsSchema = z.object({
  startDate: z.coerce.date().min(new Date("2024")).nullable(),
  minInvestment: z.string(),
  maxInvestment: z.string(),
})
const BooleanOperatorSchema = z.enum(['AND', 'OR'])
/**
 * Tiers of eligibility for the Project.
 */
export const TierSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  questsOperator: BooleanOperatorSchema.default('AND'),
  quests: z.array(QuestSchema).min(QUESTS_MIN_LENGTH),
  benefits: BenefitsSchema,
})
export type TierType = z.infer<typeof TierSchema>
/**
 * Same as TierSchema but with QuestWithCompletionSchema.
 * This should be served to the frontend.
 */
export const TierWithCompletionSchema = TierSchema.extend({
  quests: z.array(QuestWithCompletionSchema).min(QUESTS_MIN_LENGTH),
  isCompleted: z.boolean(),
})
export type TierWithCompletion = z.infer<typeof TierWithCompletionSchema>

export const EligibilityStatusSchema = z.object({
  snapshotTakenAt: z.string().optional(),
  address: z.string(),

  isNftCheckNeeded: z.boolean().optional(),

  // TODO @twitterAcc
  isTwitterAccountConnected: z.boolean(),

  whitelistTierId: z.string().optional().nullable(),
  whitelistedTier: z.object({}).optional().nullable(),

  isCompliant: z.boolean(),
  isEligible: z.boolean(),
  /**
   * The Tier the User is eligible for, or null if the User is not eligible for any.
   */
  eligibilityTier: TierSchema.nullable(),
  compliances: QuestWithCompletionSchema.array(),
  tiers: TierWithCompletionSchema.array(),
})
export type EligibilityStatus = z.infer<typeof EligibilityStatusSchema>
/**
 * EligibilityStatusRequestSchema
 */
export const EligibilityStatusRequestSchema = z.object({
  projectId: z.string(),
  address: z.string(),
})
