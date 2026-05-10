import { ExpandedTimelineEventType } from "@/components/Timeline/Timeline"
import { isBefore } from "date-fns/isBefore"

const upcomingEventTemplate: ExpandedTimelineEventType = {
  label: "Registration not opened yet",
  id: "UPCOMING",
  idRank: 1,
  date: new Date(),
  nextEventDate: null,
}

const generateUpcomingEvent = (whitelistStartDate: Date | null) => {
  const upcomingStatus = Object.assign(upcomingEventTemplate, { nextEventDate: whitelistStartDate })
  return upcomingStatus
}

export const getCurrentTgeEvent = (timeline: ExpandedTimelineEventType[]) => {
  // @askVanjaIfThisIsFine
  // if (timeline.length === 0) return null
  const currentMoment = new Date()
  const activeEvent = timeline.find((event) => {
    const hasEventStarted = event.date && !isBefore(currentMoment, event.date)
    const isEventFinished = event.date && isBefore(event.date, currentMoment)
    if (!hasEventStarted) return false
    if (!isEventFinished) return false
    if (!event?.nextEventDate) return true

    const isThisLastActivatedEvent = Boolean(isBefore(new Date(), event.nextEventDate))
    return isThisLastActivatedEvent
  })
  if (!activeEvent) {
    // @askVanjaIfThisIsFine
    const whitelistStartDate = timeline[0]?.date ?? new Date('2025')
    const upcomingEvent = generateUpcomingEvent(whitelistStartDate)
    return upcomingEvent
  }
  return activeEvent
}
