import CountDownTimer from "@/components/CountDownTimer"
import { formatDateForTimer } from "@/utils/date-helpers"
import { isAfter } from "date-fns/isAfter"
import { ProjectModel } from "shared/models"
import { twMerge } from "tailwind-merge"

const LiveNowCountdown = ({ project }: { project: ProjectModel | undefined }) => {
  const tiers = project?.info.tiers ?? []
  const saleClosesPhaseStartDate = project?.info.timeline.find((phase) => phase.id === "SALE_CLOSES")?.date ?? null

  const getNextTier = (tiers: ProjectModel["info"]["tiers"], saleClosesPhaseStartDate: Date | null) => {
    if (!saleClosesPhaseStartDate)
      return {
        countdownEvent: null,
        labelAboveTimer: "Loading countdown...",
      }
    const nextTier = tiers.find((tier) => {
      if (!tier.benefits.startDate) return false
      return isAfter(tier.benefits.startDate, new Date())
    })
    if (nextTier) {
      return {
        countdownEvent: nextTier.benefits.startDate,
        labelAboveTimer: `Tier ${nextTier.label} opens in ${nextTier.benefits.startDate && formatDateForTimer(nextTier.benefits.startDate)}`,
      }
    }
    return {
      countdownEvent: saleClosesPhaseStartDate,
      labelAboveTimer: saleClosesPhaseStartDate ? `Sale closes in ${formatDateForTimer(saleClosesPhaseStartDate)}` : "",
    }
  }

  const nextTier = getNextTier(tiers, saleClosesPhaseStartDate)

  if (!nextTier.countdownEvent) return <></>

  return (
    <CountDownTimer
      endOfEvent={nextTier.countdownEvent}
      labelAboveTimer={nextTier.labelAboveTimer}
      className={twMerge("h-fit pb-3")}
    />
  )
}

export default LiveNowCountdown
