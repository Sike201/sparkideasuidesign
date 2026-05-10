export const timelineEvents = [
  "UPCOMING",
  "REGISTRATION_OPENS",
  "SALE_OPENS",
  "SALE_CLOSES",
  "REWARD_DISTRIBUTION",
  "DISTRIBUTION_OVER",
] as const
export type TimelineEventId = typeof timelineEvents
export const timelineEventLabels = {
  UPCOMING: "Upcoming",
  REGISTRATION_OPENS: "Registration Opens",
  SALE_OPENS: "Sale Opens",
  SALE_CLOSES: "Sale Closes",
  REWARD_DISTRIBUTION: "Reward Distribution",
  DISTRIBUTION_OVER: "Distribution Over",
}
export const timelineEventOptions = Object.entries(timelineEventLabels).map(([key, value]) => ({
  id: key as unknown as TimelineEventId[number], // Object.entries isn't type safe
  label: value,
}))

export const MAX_IMAGE_SIZE = 2097152 // 2MB

export const BORGPAD_TELEGRAM_URL = "https://t.me/borgpad"
export const FOUNDERS_APPLY_URL = "https://t.me/BorgPadInternApplicationBot"
export const BP_JWT_TOKEN = "bp_jwt_token"
