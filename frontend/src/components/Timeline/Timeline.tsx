import { useWindowSize } from "@/hooks/useWindowSize"
import { differenceInMilliseconds } from "date-fns"
import { isBefore } from "date-fns/isBefore"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { twMerge } from "tailwind-merge"
import { CountDownCallback } from "../CountDownCallback"
import { getCurrentTgeEvent } from "@/utils/getCurrentTgeEvent"

export type Props = {
  timelineEvents: ExpandedTimelineEventType[]
  isRaiseTargetReached?: boolean
  hasDistributionStarted?: boolean
}

export const timelineEventIds = [
  "UPCOMING",
  "REGISTRATION_OPENS",
  "SALE_OPENS",
  "SALE_CLOSES",
  "REWARD_DISTRIBUTION",
  "DISTRIBUTION_OVER",
] as const
export const timelineEventIdRanks: Record<(typeof timelineEventIds)[number], number> = {
  UPCOMING: 1,
  REGISTRATION_OPENS: 2,
  SALE_OPENS: 3,
  SALE_CLOSES: 4,
  REWARD_DISTRIBUTION: 5,
  DISTRIBUTION_OVER: 6,
}
export type TimelineEventType = {
  label: string
  date: Date | null
  id: (typeof timelineEventIds)[number]
  fallbackText?: string | null
}

export type ExpandedTimelineEventType = {
  displayedTime?: string | null
  wasEventBeforeCurrentMoment?: boolean
  nextEventDate: Date | null
  idRank: number
} & TimelineEventType

const MAX_TIMELINE_SECTION_HEIGHT = 50
const GAP_SIZE = 16
const BORDER_SIZE = 1
const HORIZONTAL_PADDING = 16

const Timeline = ({ timelineEvents, isRaiseTargetReached = false, hasDistributionStarted = false }: Props) => {
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [timelineData, setTimelineData] = useState<ExpandedTimelineEventType[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const dataLength = timelineData.length
  const currentTgeEvent = getCurrentTgeEvent(timelineData)


  const { width } = useWindowSize()

  const renderTimelineEvent = (event: ExpandedTimelineEventType, dataLength: number, index: number) => {
    const displayTimeline = dataLength - 1 !== index
    const calculateTimelineRatio = () => {
      if (isRaiseTargetReached && event.id === "SALE_OPENS") return 1
      if (hasDistributionStarted) {
        if (event.idRank < timelineEventIdRanks.REWARD_DISTRIBUTION) return 1
        if (event.idRank === timelineEventIdRanks.REWARD_DISTRIBUTION) return 0
        return 0
      }
      
      const isTimelineFinished = Boolean(event?.nextEventDate && isBefore(event.nextEventDate, new Date()))
      if (isTimelineFinished) return 1
      if (!event.wasEventBeforeCurrentMoment) return 0
      if (!event?.nextEventDate) return 0

      const timelineDurationInMs = event.date ? differenceInMilliseconds(event.nextEventDate, event.date) : 0
      const timelineLeftInMs = differenceInMilliseconds(event.nextEventDate, new Date())
      const ratio = (timelineDurationInMs - timelineLeftInMs) / timelineDurationInMs
      return ratio
    }

    const calculatedRatio = calculateTimelineRatio()
    const calculateHorizontalTimelineSectionWidth = () => {
      if (!containerWidth) return 0
      return (
        (containerWidth - 2 * (HORIZONTAL_PADDING + BORDER_SIZE) - (dataLength - 1) * GAP_SIZE) / dataLength + GAP_SIZE
      )
    }
    const horizontalTimelineWidth = calculateHorizontalTimelineSectionWidth()

    const isCurrent = (!isRaiseTargetReached && event.id === currentTgeEvent?.id) || 
                     (isRaiseTargetReached && event.id === "SALE_CLOSES") ||
                     (hasDistributionStarted && event.id === "REWARD_DISTRIBUTION") ||
                     (hasDistributionStarted && event.id === "SALE_OPENS")

    return (
      <div key={event.id} className="flex w-full flex-1 items-center gap-4 lg:max-w-[132px] lg:flex-col">
        <div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-default lg:shrink">
          {displayTimeline && (
            <>
              {/* mobile view */}
              <div className="absolute left-[9px] top-3 z-[1] h-[50px] w-[6px] items-center bg-default lg:hidden"></div>
              <div
                style={{
                  height: calculatedRatio * MAX_TIMELINE_SECTION_HEIGHT,
                }}
                className="absolute left-[9px] top-3 z-[2] ml-[2px] flex w-[2px] flex-col gap-1 bg-brand-primary lg:hidden"
              ></div>

              {/* desktop view */}
              <div
                style={{ width: horizontalTimelineWidth }}
                className="absolute left-3 z-[1] hidden h-[6px] w-full items-center bg-default lg:flex"
              ></div>
              <div
                style={{
                  width: calculatedRatio * horizontalTimelineWidth,
                }}
                className="absolute left-3 z-[2] hidden h-[2px] flex-col bg-brand-primary lg:flex"
              ></div>
            </>
          )}
          {(event.wasEventBeforeCurrentMoment || isCurrent) && <div className="z-[3] h-2 w-2 rounded-full bg-brand-primary"></div>}
        </div>

        <div className="flex flex-1 flex-col lg:items-center">
          <span
            className={twMerge(
              "truncate text-wrap text-xs font-normal",
              (event.wasEventBeforeCurrentMoment || isCurrent) && "font-semibold",
            )}
          >
            {event.label}
          </span>
          <span className="truncate text-xs leading-[18px] opacity-50">{event.displayedTime}</span>
        </div>
      </div>
    )
  }

  useLayoutEffect(() => {
    if (containerRef?.current?.offsetWidth) {
      setContainerWidth(containerRef.current.offsetWidth)
    }
  }, [width])

  const updateTimeline = useCallback(() => {
    setTimelineData(timelineEvents)
  }, [timelineEvents])

  useEffect(() => {
    updateTimeline()
  }, [timelineEvents, updateTimeline])

  return (
    <section className="w-full max-w-[792px]">
      {/* <h2 className="w-full pb-3 text-left text-xl font-semibold md:text-2xl">Timeline</h2> */}
      <div
        ref={containerRef}
        className="flex w-full flex-col justify-between gap-4 rounded-lg border border-bd-secondary bg-secondary/50 px-4 py-5 lg:flex-row"
      >
        {Object.values(timelineData).map((event: ExpandedTimelineEventType, dataIndex) =>
          renderTimelineEvent(event, dataLength, dataIndex),
        )}
      </div>

      {/* countdown events */}
      {currentTgeEvent?.nextEventDate && currentTgeEvent.id !== "UPCOMING" && (
        <>
          {/* countdown for adding circle for finished event */}
          <CountDownCallback endOfEvent={currentTgeEvent.nextEventDate} callbackWhenTimeExpires={updateTimeline} />
          {/* countdown for updating line timeline lengths every minute */}
          <CountDownCallback
            endOfEvent={currentTgeEvent.nextEventDate}
            callbackAsPerInterval={updateTimeline}
            interval={60000}
          />
        </>
      )}
    </section>
  )
}

export default Timeline
