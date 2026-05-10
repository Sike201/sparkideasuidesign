import { CountDownType } from "@/components/CountDownCallback"
import { useEffect, useState } from "react"

const calculateTimeLeft = (endOfEvent: Date) => {
  if (!endOfEvent) return 0
  return endOfEvent.getTime() - Date.now()
}

export const useCountDown = ({
  endOfEvent,
  callbackWhenTimeExpires,
  callbackAsPerInterval,
  interval = 1000,
}: CountDownType) => {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft(endOfEvent))

  useEffect(() => {
    setTimeLeft(calculateTimeLeft(endOfEvent))
  }, [endOfEvent])

  useEffect(() => {
    if (timeLeft <= 0) {
      callbackWhenTimeExpires?.()
      return
    }
    const countdownInterval = setInterval(() => {
      callbackAsPerInterval?.()
      setTimeLeft(calculateTimeLeft(endOfEvent))
    }, interval)

    return () => {
      clearInterval(countdownInterval)
    }
  })
}
