/** Curated art lives in `/public/portfolio/*` (shipped for preview rows). */

export type MockPortfolioStatus = "active" | "graveyard";

export interface MockFundedProject {
  slug: string;
  title: string;
  tagline: string;
  thesis: string;
  category: string;
  raisedUsd: number;
  goalUsd: number;
  image: string;
  status: MockPortfolioStatus;
  /** Optional secondary line for graveyard / risk context */
  footnote?: string;
}

export const MOCK_FUNDED_ACTIVE: MockFundedProject[] = [
  {
    slug: "capital-stack",
    title: "Capital Stack",
    tagline: "Treasury-grade cash management for on-chain teams.",
    thesis:
      "Institutional treasuries need deterministic reporting, segregated mandates, and settlement windows that match real-world banking — without leaving Solana.",
    category: "Treasury",
    raisedUsd: 7_200_000,
    goalUsd: 6_000_000,
    image: "/portfolio/chips.png",
    status: "active",
  },
  {
    slug: "velocity-card",
    title: "Velocity Card",
    tagline: "Spend rails with programmable velocity limits.",
    thesis:
      "Corporate cards fail at crypto-native companies. We pair hardware-light issuance with on-chain policy so every swipe inherits treasury rules.",
    category: "Payments",
    raisedUsd: 4_100_000,
    goalUsd: 3_500_000,
    image: "/portfolio/credit-spiral.png",
    status: "active",
  },
  {
    slug: "bridge-index",
    title: "Bridge Index",
    tagline: "Liquidity routing across social and market graphs.",
    thesis:
      "Cross-platform attention is fragmented. Bridge Index normalizes engagement signals into a single liquidity surface for builders and funds.",
    category: "Infrastructure",
    raisedUsd: 2_850_000,
    goalUsd: 2_400_000,
    image: "/portfolio/bridge.png",
    status: "active",
  },
  {
    slug: "singularity-vault",
    title: "Singularity Vault",
    tagline: "Concentrated LP with adaptive fee bands.",
    thesis:
      "Passive LP leaves money on the table. Singularity Vault rotates band width using volatility forecasts sourced from an internal oracle mesh.",
    category: "DeFi",
    raisedUsd: 1_920_000,
    goalUsd: 1_500_000,
    image: "/portfolio/vortex.png",
    status: "active",
  },
  {
    slug: "consensus-orb",
    title: "Consensus Orb",
    tagline: "Attested forecasting for milestone-based raises.",
    thesis:
      "Milestone raises need credible timelines. Orb binds contributor attestations to payout curves so capital unlocks only when shipped artifacts verify.",
    category: "Governance",
    raisedUsd: 1_275_000,
    goalUsd: 1_000_000,
    image: "/portfolio/orb.png",
    status: "active",
  },
  {
    slug: "circuit-owl",
    title: "Circuit Owl",
    tagline: "Security monitoring for programs in production.",
    thesis:
      "Runtime anomalies slip past audits. Owl watches CPI graphs, account growth, and signer sets — paging the team before an incident becomes a headline.",
    category: "Security",
    raisedUsd: 980_000,
    goalUsd: 750_000,
    image: "/portfolio/owl.png",
    status: "active",
  },
  {
    slug: "basket-index",
    title: "$BASKET",
    tagline: "Solana multi-asset index with deterministic rebalances.",
    thesis:
      "Single-name exposure is a career risk for desks. BASKET tracks a rules-based sleeve of liquid L1/L2 proxies with transparent rebalance cadence.",
    category: "Index",
    raisedUsd: 135_000,
    goalUsd: 100_000,
    image: "/portfolio/basket.png",
    status: "active",
  },
  {
    slug: "signal-room",
    title: "Signal Room",
    tagline: "Operator-grade comms for distributed market makers.",
    thesis:
      "Slack is too noisy for trading pods. Signal Room threads decisions, attaches on-chain receipts, and archives every message for compliance export.",
    category: "Collaboration",
    raisedUsd: 640_000,
    goalUsd: 500_000,
    image: "/portfolio/megaphone.png",
    status: "active",
  },
];

export const MOCK_FUNDED_GRAVEYARD: MockFundedProject[] = [
  {
    slug: "echo-lane",
    title: "Echo Lane",
    tagline: "Voice-native wallets for retail onboarding.",
    thesis:
      "Voice UX looked inevitable in 2024, but retention collapsed when carrier fees and ASR drift made custody recovery unreliable in production.",
    category: "Consumer",
    raisedUsd: 2_750_000,
    goalUsd: 2_750_000,
    image: "/portfolio/megaphone.png",
    status: "graveyard",
    footnote: "Program sunset — redemption window closed with full principal return.",
  },
  {
    slug: "northwind-rwa",
    title: "Northwind RWA",
    tagline: "Invoice financing on-chain with attested obligors.",
    thesis:
      "Legal wrappers could not align with three jurisdictions simultaneously; treasury paused distributions pending counsel review.",
    category: "RWA",
    raisedUsd: 890_000,
    goalUsd: 1_200_000,
    image: "/portfolio/bridge.png",
    status: "graveyard",
    footnote: "Round unwound — on-chain unwind completed; see disclosure memo.",
  },
];

export function getMockFundedBySlug(slug: string | undefined): MockFundedProject | undefined {
  if (!slug) return undefined;
  return [...MOCK_FUNDED_ACTIVE, ...MOCK_FUNDED_GRAVEYARD].find((p) => p.slug === slug);
}

export function mockProgressPct(p: MockFundedProject): number {
  if (p.goalUsd <= 0) return 0;
  return Math.min(160, Math.round((p.raisedUsd / p.goalUsd) * 100));
}
