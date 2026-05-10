import { useCountDown } from "@/hooks/useCountDown"

export type CountDownType = {
  endOfEvent: Date
  callbackWhenTimeExpires?: () => void
  callbackAsPerInterval?: () => void
  interval?: number // milliseconds
}

export const CountDownCallback = ({ endOfEvent, callbackWhenTimeExpires }: CountDownType) => {
  useCountDown({ endOfEvent, callbackWhenTimeExpires })
  return null
}
