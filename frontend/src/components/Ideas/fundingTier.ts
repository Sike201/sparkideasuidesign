import { fundingGoalRatio } from "@/data/demoFeedIdeas";
import type { Idea } from "./types";

/** Single Spark orange for all funding progress (matches ~60% band). */
export const FUNDING_ORANGE_BAR = "bg-[#f97316]";
export const FUNDING_ORANGE_TEXT = "text-[#f97316]";

export type FundingTier = "default";

export function getFundingTier(_ratio: number): FundingTier {
  return "default";
}

export function fundingTierFromIdea(idea: Idea): FundingTier {
  return getFundingTier(fundingGoalRatio(idea));
}

export function fundingBarClass(_tier?: FundingTier): string {
  return FUNDING_ORANGE_BAR;
}

export function fundingPctTextClass(_tier?: FundingTier): string {
  return FUNDING_ORANGE_TEXT;
}
