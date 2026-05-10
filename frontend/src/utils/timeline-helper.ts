import {
  ExpandedTimelineEventType,
  timelineEventIdRanks,
  TimelineEventType,
} from "@/components/Timeline/Timeline"
import { formatDateForDisplay } from "./date-helpers"
import { isBefore } from "date-fns/isBefore"

export const expandTimelineDataInfo = (
  timelineEvents: TimelineEventType[],
): ExpandedTimelineEventType[] => {
  const currentMoment = new Date()
  const nextEventDates = timelineEvents.slice(1)
  return timelineEvents.map((event, index) => {

    const displayedTime = event.date
      ? formatDateForDisplay(event.date)
      : event.fallbackText
        ? event.fallbackText
        : "TBD"
    return {
      label: event.label,
      date: event.date,
      id: event.id,
      idRank: timelineEventIdRanks[event.id],
      nextEventDate: nextEventDates[index]?.date ?? null,
      displayedTime,
      wasEventBeforeCurrentMoment: event.date ? isBefore(event.date, currentMoment) : false,
    }
  })
}
