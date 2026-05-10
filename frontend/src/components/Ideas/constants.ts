// Ideas Feature Constants

import { BuilderTeam } from './types';

// Category colors for styling
export const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  "AI x Crypto": { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  "Consumer Apps": { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  "DAO Tooling & Governance": { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  "DeFi": { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  "Gaming": { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/20" },
  "Identity & Reputation": { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
  "Infrastructure": { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/20" },
  "Payments & Fintech": { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/20" },
  "Robotic": { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
  "RWA": { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
  "WEB2": { bg: "bg-gray-500/10", text: "text-gray-400", border: "border-gray-500/20" },
};

// Status colors for idea status
export const statusColors: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  pending: { bg: "bg-neutral-500/10", text: "text-neutral-400", dot: "bg-neutral-500", border: "border-neutral-500/20" },
  in_progress: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-500", border: "border-blue-500/20" },
  completed: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-500", border: "border-emerald-500/20" },
  planned: { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-500", border: "border-purple-500/20" },
  refunded: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-500", border: "border-red-500/20" },
};

// Available categories for idea submission
export const ideaCategories = [
  "AI x Crypto",
  "Consumer Apps",
  "DAO Tooling & Governance",
  "DeFi",
  "Gaming",
  "Identity & Reputation",
  "Infrastructure",
  "Payments & Fintech",
  "Robotic",
  "RWA",
  "WEB2",
];

// Mock builder teams data
export const builderTeams: BuilderTeam[] = [
  {
    id: "1",
    name: "Solana Labs Core",
    description: "Building core infrastructure for the Solana ecosystem. Specializing in high-performance blockchain solutions.",
    logo: "https://solana.com/src/img/branding/solanaLogoMark.svg",
    twitter: "solanalabs",
    website: "https://solanalabs.com",
    buildersCount: 12,
    totalEarned: "$2.5M",
    focus: ["Infrastructure", "DeFi", "Developer Tools"],
    availability: "Busy",
    experience: ["Solana Core", "Token Program", "SPL Standards"],
  },
  {
    id: "2",
    name: "DeFi Wizards",
    description: "Expert team in DeFi protocols, AMMs, and lending platforms. Building the future of decentralized finance.",
    twitter: "defiwizards",
    buildersCount: 8,
    totalEarned: "$1.2M",
    focus: ["DeFi", "AMM", "Lending"],
    availability: "Available",
    experience: ["Raydium", "Marinade Finance", "Orca"],
  },
  {
    id: "3",
    name: "NFT Builders Guild",
    description: "Creating innovative NFT experiences, marketplaces, and tools for creators and collectors.",
    twitter: "nftbuilders",
    website: "https://nftbuilders.xyz",
    buildersCount: 6,
    totalEarned: "$800K",
    focus: ["NFTs", "Gaming", "Consumer Apps"],
    availability: "Available",
    experience: ["Magic Eden", "Tensor", "Metaplex"],
  },
];

// Availability colors for teams
export const availabilityColors = {
  "Available": { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-500" },
  "Busy": { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-500" },
  "Not Available": { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-500" },
};
