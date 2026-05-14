import type { Idea } from "@/components/Ideas/types";

const DEMO = "demo-" as const;

export function isDemoIdeaId(id: string): boolean {
  return id.startsWith(DEMO);
}

/** Raised ÷ goal — for sorting preview rows (higher = closer to goal). */
export function fundingGoalRatio(idea: Idea): number {
  const goal = idea.estimatedPrice ?? 0;
  if (goal <= 0) return 0;
  return (idea.raisedAmount ?? 0) / goal;
}

export function compareDemosByFundingCloseness(a: Idea, b: Idea): number {
  return fundingGoalRatio(b) - fundingGoalRatio(a);
}

const OPINION_BET_DESCRIPTION = `**Problem:** In today's digital landscape, discussions often lack engagement. Many platforms don't allow users to truly express their opinions or stake their claims. This leads to uninspired debates without any real stakes.

**Solution:** Opinion Bet offers a competitive space where users can bet on their viewpoints. By allowing users to put their money where their mouth is, we create lively debates with real rewards at stake.

**How it works:** Users buy into posts to support their opinions, engaging in real-time debates. Agents moderate these discussions, ensuring fair play. As opinions shift, so do the odds, allowing users to strategize and potentially flip the market in their favor. The winning side takes the pot, making every debate a thrilling experience.

**Why now:** With an increasing desire for interactive and engaging social platforms, Opinion Bet caters to the need for fun and competitive discourse. It's time to make discussions more dynamic and rewarding.`;

const OPINION_BET_COLOSSEUM = `### Market view\nMicro-stakes social is crowded; differentiation is settlement clarity plus distribution partnerships.\n\n### Risks\nRegulatory posture on skill vs chance varies materially by market.\n\n**Final Score: 68/100**`;

const OPINION_BET_GEMINI = `### Snapshot\nNarrow wedge into consumer social — defensible if trust metrics compound week over week.\n\n**Score: 65/100**`;

/** Static preview rows — votes are local-only (see IdeasPage). Sorted in the feed by fundingGoalRatio. */
export const DEMO_FEED_IDEAS: Idea[] = [
  {
    id: "demo-opinion-bet",
    title: "Opinion Bet",
    slug: "opinion-bet",
    description: OPINION_BET_DESCRIPTION,
    category: "Consumer Apps",
    upvotes: 4,
    downvotes: 0,
    userVote: null,
    authorUsername: "Ewan_btc",
    authorAvatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Ewan_btc",
    source: "user",
    commentsCount: 0,
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    status: "pending",
    estimatedPrice: 12000,
    raisedAmount: 11280,
    generatedImageUrl: "/portfolio/chips.png",
    coinName: "Opinion Bet",
    ticker: "OPBET",
    initialTokenPrice: 0.0005,
    liquidityPercent: 0.2,
    hasLandingPage: false,
    colosseumAnalysis: OPINION_BET_COLOSSEUM,
    colosseumScore: 68,
    marketAnalysis: OPINION_BET_GEMINI,
  },
  {
    id: "demo-onchain-scholarships",
    title: "On-chain Scholarships",
    slug: "demo-onchain-scholarships",
    description:
      "**Problem:** Grants are opaque and slow to settle.\n\n**Angle:** Milestone-based streaming with attestations and simple dispute windows.",
    category: "Consumer Apps",
    upvotes: 24,
    downvotes: 2,
    userVote: null,
    authorUsername: "spark_preview",
    authorAvatar: "/sparklogo.png",
    source: "user",
    commentsCount: 4,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    status: "pending",
    estimatedPrice: 8000,
    raisedAmount: 6400,
    generatedImageUrl: "/portfolio/orb.png",
  },
  {
    id: "demo-tokenized-leverage",
    title: "Tokenized Non-Custodial Leverage",
    slug: "demo-tokenized-leverage",
    description:
      "**Problem:** Leverage products often recentralize risk or hide liquidation mechanics.\n\n**Angle:** Fully on-chain leverage with transparent collateral flows and composable exits.",
    category: "DeFi",
    upvotes: 14,
    downvotes: 3,
    userVote: null,
    authorUsername: "STACCoverflow",
    authorAvatar: "/sparklogo.png",
    source: "user",
    commentsCount: 0,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    status: "pending",
    estimatedPrice: 47500,
    raisedAmount: 28500,
    generatedImageUrl: "/portfolio/vortex.png",
  },
  {
    id: "demo-human-gated",
    title: "Purchasing human-gated accounts",
    slug: "demo-human-gated",
    description:
      "**Problem:** Bots and sybil traffic degrade markets that depend on real humans.\n\n**Angle:** Account tiers gated by lightweight proof-of-personhood, tradable as explicit positions.",
    category: "AI x Crypto",
    upvotes: 9,
    downvotes: 1,
    userVote: null,
    authorUsername: "ewan_btc",
    authorAvatar: "/sparklogo.png",
    source: "user",
    commentsCount: 5,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    status: "pending",
    estimatedPrice: 2000,
    raisedAmount: 720,
    generatedImageUrl: "/portfolio/owl.png",
  },
  {
    id: "demo-builder-credits",
    title: "Builder Credits",
    slug: "demo-builder-credits",
    description:
      "**Problem:** Early teams lack predictable access to auditors and designers.\n\n**Angle:** Prepaid credits redeemable with verified vendors, settled in USDC with receipts on-chain.",
    category: "Tooling",
    upvotes: 6,
    downvotes: 0,
    userVote: null,
    authorUsername: "spark_preview",
    authorAvatar: "/sparklogo.png",
    source: "user",
    commentsCount: 1,
    createdAt: new Date(Date.now() - 86400000 * 9).toISOString(),
    status: "pending",
    estimatedPrice: 15000,
    raisedAmount: 1800,
    generatedImageUrl: "/portfolio/credit-spiral.png",
  },
  {
    id: "demo-attested-milestones",
    title: "Attested milestone vaults",
    slug: "demo-attested-milestones",
    description:
      "**Problem:** Milestone raises lack credible timelines and dispute surfaces.\n\n**Angle:** Contributor attestations bind to payout curves; capital unlocks only when shipped artifacts verify on-chain.",
    category: "Governance",
    upvotes: 11,
    downvotes: 0,
    userVote: null,
    authorUsername: "spark_preview",
    authorAvatar: "/sparklogo.png",
    source: "user",
    commentsCount: 3,
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    status: "pending",
    estimatedPrice: 22000,
    raisedAmount: 4100,
    generatedImageUrl: "/portfolio/orb.png",
  },
  {
    id: "demo-graph-router",
    title: "Graph-native liquidity router",
    slug: "demo-graph-router",
    description:
      "**Problem:** Attention and liquidity signals live on disconnected surfaces.\n\n**Angle:** Normalize social and market graphs into one routing layer for desks and builders.",
    category: "Infrastructure",
    upvotes: 8,
    downvotes: 1,
    userVote: null,
    authorUsername: "STACCoverflow",
    authorAvatar: "/sparklogo.png",
    source: "user",
    commentsCount: 2,
    createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
    status: "pending",
    estimatedPrice: 18000,
    raisedAmount: 2900,
    generatedImageUrl: "/portfolio/bridge.png",
  },
  {
    id: "demo-operator-comms",
    title: "Operator comms with on-chain receipts",
    slug: "demo-operator-comms",
    description:
      "**Problem:** Trading pods drown in chat noise and lose audit trails.\n\n**Angle:** Thread decisions, attach settlement receipts, and export compliance-ready archives.",
    category: "Tooling",
    upvotes: 5,
    downvotes: 0,
    userVote: null,
    authorUsername: "spark_preview",
    authorAvatar: "/sparklogo.png",
    source: "user",
    commentsCount: 1,
    createdAt: new Date(Date.now() - 86400000 * 11).toISOString(),
    status: "pending",
    estimatedPrice: 9000,
    raisedAmount: 900,
    generatedImageUrl: "/portfolio/megaphone.png",
  },
  {
    id: "demo-treasury-velocity-card",
    title: "Programmable velocity cards",
    slug: "demo-treasury-velocity-card",
    description:
      "**Problem:** Crypto-native companies outgrow legacy card controls.\n\n**Angle:** Every swipe inherits treasury policy with on-chain velocity limits and instant kill switches.",
    category: "Payments",
    upvotes: 4,
    downvotes: 0,
    userVote: null,
    authorUsername: "ewan_btc",
    authorAvatar: "/sparklogo.png",
    source: "user",
    commentsCount: 0,
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
    status: "pending",
    estimatedPrice: 35000,
    raisedAmount: 2100,
    generatedImageUrl: "/portfolio/credit-spiral.png",
  },
];

export function getDemoIdeaBySlug(slug: string): Idea | undefined {
  return DEMO_FEED_IDEAS.find((i) => i.slug === slug);
}
