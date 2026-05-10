export const getRatioPercentage = (filled: number, total: number) => {
  return Math.floor((filled / total) * 100)
}

export const capitalizeFirstLetter = (string?: string) => {
  if (!string) return "" // handle empty or undefined strings
  return string.charAt(0).toUpperCase() + string.slice(1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function groupIntoPairs<T>(targetArray: T[]): ([T, T] | [T])[] {
  return targetArray.reduce(
    (acc, current, index) => {
      if (index % 2 === 0) {
        acc.push([current]) // Start a new subarray
      } else {
        acc[acc.length - 1].push(current) // Add to the last subarray
      }
      return acc
    },
    [] as ([T, T] | [T])[],
  )
}
