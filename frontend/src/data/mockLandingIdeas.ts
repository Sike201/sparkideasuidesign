/** Curated mock ideas for the marketing landing only (no API). */

export type LandingIdeaBand = "featured" | "raising" | "market" | "archive";

export interface LandingMockIdea {
  id: string;
  title: string;
  slug: string;
  tagline: string;
  category: string;
  author: string;
  handle: string;
  raisedUsd: number;
  goalUsd: number;
  backers: number;
  band: LandingIdeaBand;
  /** 0–1 progress toward goal */
  progress: number;
  ticker?: string;
}

export const MOCK_LANDING_TICKER = [
  { label: "Solana Mobile SDK", amount: "$184k" },
  { label: "Intent Router", amount: "$92k" },
  { label: "Privacy L2 Bridge", amount: "$310k" },
  { label: "Agentic Treasury", amount: "$67k" },
  { label: "RWA Receipt Token", amount: "$240k" },
  { label: "Perp Risk Oracle", amount: "$128k" },
];

export const MOCK_LANDING_IDEAS: LandingMockIdea[] = [
  {
    id: "1",
    title: "P2P Stablecoin Ramp",
    slug: "p2p-stablecoin-ramp",
    tagline: "Decentralised on/off ramp rails for emerging markets, USDC-first.",
    category: "DeFi",
    author: "Mara K.",
    handle: "marak_defi",
    raisedUsd: 4_200_000,
    goalUsd: 5_000_000,
    backers: 1840,
    band: "featured",
    progress: 0.84,
    ticker: "RAMP",
  },
  {
    id: "2",
    title: "Paystream",
    slug: "paystream",
    tagline: "Composable payroll streams with on-chain attestations.",
    category: "Payments",
    author: "0xLeo",
    handle: "0xleo",
    raisedUsd: 890_000,
    goalUsd: 1_200_000,
    backers: 612,
    band: "raising",
    progress: 0.74,
    ticker: "PAY",
  },
  {
    id: "3",
    title: "Solomon Index",
    slug: "solomon-index",
    tagline: "Crowdsourced fundamentals layer for memecoins and new launches.",
    category: "Data",
    author: "IndexDAO",
    handle: "indexdao",
    raisedUsd: 420_000,
    goalUsd: 750_000,
    backers: 903,
    band: "raising",
    progress: 0.56,
    ticker: "SOLO",
  },
  {
    id: "4",
    title: "Ranger Sentinel",
    slug: "ranger-sentinel",
    tagline: "Wallet behaviour scoring + MEV-aware routing for retail.",
    category: "Security",
    author: "Ranger",
    handle: "rangersec",
    raisedUsd: 1_100_000,
    goalUsd: 1_000_000,
    backers: 2104,
    band: "raising",
    progress: 1,
    ticker: "RNGR",
  },
  {
    id: "5",
    title: "Futarchy Hack Kit",
    slug: "futarchy-hack-kit",
    tagline: "Drop-in decision markets for DAOs and hackathon teams.",
    category: "Governance",
    author: "cypher",
    handle: "cypherdao",
    raisedUsd: 0,
    goalUsd: 400_000,
    backers: 0,
    band: "raising",
    progress: 0,
    ticker: "FUTR",
  },
  {
    id: "6",
    title: "Sparkline Social",
    slug: "sparkline-social",
    tagline: "Idea graphs: who funded, who built, fee splits on-chain.",
    category: "Social",
    author: "Bubble",
    handle: "bubblebuilds",
    raisedUsd: 2_400_000,
    goalUsd: 2_400_000,
    backers: 5021,
    band: "market",
    progress: 1,
    ticker: "LINE",
  },
  {
    id: "7",
    title: "Omni Grants Router",
    slug: "omni-grants-router",
    tagline: "Route grant payouts across chains with one compliance surface.",
    category: "Infra",
    author: "Ewan",
    handle: "ewanborgpad",
    raisedUsd: 3_100_000,
    goalUsd: 2_800_000,
    backers: 884,
    band: "archive",
    progress: 1,
  },
  {
    id: "8",
    title: "Agent Liquidity Desk",
    slug: "agent-liquidity-desk",
    tagline: "AI agents quote and rebalance LP positions with human guardrails.",
    category: "AI x Crypto",
    author: "synth",
    handle: "synthwave",
    raisedUsd: 760_000,
    goalUsd: 900_000,
    backers: 441,
    band: "archive",
    progress: 0.84,
  },
];

export function formatUsdCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toLocaleString()}`;
}
