import { ExpandedTimelineEventType } from "@/components/Timeline/Timeline"
import { formatDateMonthDateHours } from "./date-helpers"
import { expandTimelineDataInfo } from "./timeline-helper"
import { getCurrentTgeEvent } from "./getCurrentTgeEvent"
import { GetProjectsProjectResponse, ProjectModel, InvestmentIntentSummary, SaleResults } from "shared/models"
import i18n from "@/i18n/i18n"

export type ExpandedProject = ProjectModel & {
  investmentIntentSummary?: InvestmentIntentSummary
  additionalData: {
    badgeClassName: string
    endMessage: string
    badgeLabel: string
    currentEvent?: ExpandedTimelineEventType
  }
  saleResults?: SaleResults
  depositStats?: {
    totalDepositedInUsd: number
    participantsCount: number
  }
}

export type EventTypeId = ExpandedTimelineEventType["id"]

/**
 * Processes an array of projects to add additionalData including timeline information
 * @param projects Array of projects from the API
 * @returns Array of ExpandedProject objects with additionalData
 */
export const processProjects = (projects: GetProjectsProjectResponse[]): ExpandedProject[] => {
  return projects.map(project => {
    // Process timeline data if available
    if (project.info.timeline && project.info.timeline.length > 0) {
      const expandedTimeline = expandTimelineDataInfo(project.info.timeline);
      const currentEvent = getCurrentTgeEvent(expandedTimeline);
      
      // Generate badge, label, and message data based on the current event
      const eventData = generateAdditionalEventData(currentEvent, project) || {
        badgeClassName: "",
        endMessage: "",
        badgeLabel: ""
      };
      
      return {
        ...project,
        additionalData: {
          currentEvent,
          ...eventData
        }
      };
    }
    
    // If no timeline, create default additionalData
    return {
      ...project,
      additionalData: {
        currentEvent: {
          label: "",
          id: "UPCOMING",
          idRank: 1,
          date: null,
          nextEventDate: null,
          displayedTime: "",
          wasEventBeforeCurrentMoment: false
        },
        badgeClassName: "",
        endMessage: "",
        badgeLabel: ""
      }
    };
  });
};

export const generateAdditionalEventData = (tgeEvent: ExpandedTimelineEventType, project: ProjectModel) => {
  const fallbackText = i18n.t("launch_pools.at_tbd")
  const getEventDateString = (date: Date | null) => {
    return date ? formatDateMonthDateHours(date) : fallbackText
  }

  const isBlitz = project.info.projectType === "blitz"

  switch (tgeEvent.id) {
    case "UPCOMING": {
      const text = getEventDateString(tgeEvent.nextEventDate)
      return {
        badgeClassName: "text-fg-primary border-bd-primary bg-default",
        endMessage: i18n.t("launch_pools.whitelist_opens", { text }),
        badgeLabel: "Upcoming",
      }
    }
    case "REGISTRATION_OPENS": {
      const text = getEventDateString(tgeEvent.nextEventDate)
      return {
        badgeClassName: isBlitz
          ? "text-brand-blitz bg-brand-blitz-secondary border-bd-blitz"
          : "text-fg-brand-primary border-bd-brand-secondary bg-tertiary",
        endMessage: i18n.t("launch_pools.whitelist_closes", { text }),
        badgeLabel: "Whitelisting",
      }
    }
    case "SALE_OPENS": {
      const text = getEventDateString(tgeEvent.nextEventDate)
      return {
        badgeClassName: isBlitz
          ? "bg-brand-blitz text-fg-alt-default border-brand-blitz"
          : "text-fg-alt-default border-bd-secondary bg-brand-primary",
        endMessage: i18n.t("launch_pools.sale_closes", { text }),
        badgeLabel: "Live Now",
      }
    }
    case "SALE_CLOSES": {
      const text = getEventDateString(tgeEvent.nextEventDate)
      return {
        badgeClassName: isBlitz
          ? "text-brand-blitz bg-brand-blitz-secondary border-bd-blitz"
          : "text-fg-primary border-bd-primary bg-default",
        endMessage: i18n.t("launch_pools.reward_distribution_start", { text }),
        badgeLabel: "Sale Over",
      }
    }
    case "REWARD_DISTRIBUTION": {
      const text = getEventDateString(tgeEvent.nextEventDate)
      return {
        badgeClassName: isBlitz
          ? "text-brand-blitz bg-brand-blitz-secondary border-bd-blitz"
          : "text-fg-brand-primary border-bd-brand-secondary bg-tertiary",
        endMessage: i18n.t("launch_pools.reward_distribution_ends", { text }),
        badgeLabel: "Reward Distribution",
      }
    }
    case "DISTRIBUTION_OVER": {
      const text = getEventDateString(tgeEvent.date)
      return {
        badgeClassName: isBlitz
          ? "text-brand-blitz bg-default border-bd-blitz"
          : "text-fg-primary border-bd-primary bg-default",
        endMessage: i18n.t("launch_pools.reward_distribution_ended", { text }),
        badgeLabel: "Closed",
      }
    }
  }
}