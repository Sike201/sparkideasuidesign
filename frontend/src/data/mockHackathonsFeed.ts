import type { HackathonModel } from "@/data/api/backendSparkApi";
import { mockHackathons } from "@/components/Hackathon/mockData";
import type { Hackathon } from "@/components/Hackathon/types";

/** Maps full `Hackathon` fixtures to the public list API shape for `/hackathons`. */
export function hackathonToListModel(h: Hackathon): HackathonModel {
  const category = (h as Hackathon & { category?: string }).category ?? "Ecosystem";
  return {
    id: h.id,
    idea_slug: h.idea_slug,
    idea_title: h.idea_title,
    idea_image_url: h.idea_image_url ?? "",
    category,
    usdg_amount: h.usdg_amount,
    status: h.status,
    countdown_target: h.countdown_target,
    start_date: h.start_date,
    end_date: h.end_date,
    rules_md: h.rules_md ?? "",
    what_is_expected_md: h.what_is_expected_md,
    combinator_chart_url: h.combinator_chart_url ?? "",
    combinator_trade_url: h.combinator_trade_url ?? "",
    combinator_proposal_pda: h.combinator_proposal_pda,
    previous_proposal_pdas: h.previous_proposal_pdas,
    dao_pda: h.dao_pda,
    combinator_option_labels: h.combinator_option_labels as string[] | string | undefined,
    milestone_split: h.milestone_split,
    created_at: h.created_at,
    updated_at: h.created_at,
    proposals_count: h.proposals?.length ?? 0,
    milestones: h.milestones as HackathonModel["milestones"],
    proposals: h.proposals as HackathonModel["proposals"],
  };
}

/** Demo rows merged into the hackathons index (after real API rows, deduped by `id`). */
export const MOCK_HACKATHONS_FOR_LIST: HackathonModel[] = mockHackathons.map(hackathonToListModel);
