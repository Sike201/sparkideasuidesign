import { format } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import { enGB } from "date-fns/locale/en-GB"

export const formatDateForDisplay = (date: Date) => {
  return format(date, "do MMMM, yyyy")
}
export const formatDateMonthDateHours = (date: Date) => {
  return format(date, "MMMM do, ha")
}
export const formatDateForTimer = (date: Date) => {
  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone // get IANA timezone name
  return formatInTimeZone(date, userTimeZone, "do MMMM, h:mm a zzz", { locale: enGB })
}
export const formatDateForSnapshot = (date: Date) => {
  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone // get IANA timezone name
  return formatInTimeZone(date, userTimeZone, "do MMM yyyy, h aa zzz", { locale: enGB })
}
export const formatDateAndMonth = (date: Date) => {
  return format(date, "do MMMM")
}
export const formatDateForProject = (date: Date) => {
  return format(date, "MMM do, yyyy")
}
