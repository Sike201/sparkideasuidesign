type FormatOptions = { withDollarSign?: boolean; customDecimals?: number; minDecimals?: number; maxDecimals?: number }

export const formatCurrencyAmount = (amount: string | number | undefined | null, options: FormatOptions = {}) => {
  if (!amount) return "0"
  const { customDecimals, withDollarSign, minDecimals, maxDecimals } = options
  let minimumFractionDigits = 0
  let maximumFractionDigits = 2

  if (minDecimals) {
    minimumFractionDigits = minDecimals
    maximumFractionDigits = Math.max(minDecimals, maximumFractionDigits)
  }
  if (maxDecimals) maximumFractionDigits = maxDecimals
  if (customDecimals) {
    maximumFractionDigits = customDecimals
    if (!minDecimals) minimumFractionDigits = customDecimals
  }

  const value = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(Number(amount))
  if (!withDollarSign) return value.substring(1)

  return value
}

export const formatCurrencyCompact = (amount: number | string | undefined) => {
  if (!amount) return "$0"
  const formattedValue = new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    currency: "USD",
    compactDisplay: "short",
    // maximumFractionDigits: 1,
  }).format(Number(amount))
  return formattedValue
}
export const formatCurrencyCompactWithDecimals = (amount: number | string | undefined) => {
  if (!amount) return "$0"
  const formattedValue = new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    currency: "USD",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(Number(amount))
  return formattedValue
}

export const formatNumberValue = (amount: number | string | undefined) => {
  if (!amount) return "0"
  const formattedValue = new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    compactDisplay: "short",
    // maximumFractionDigits: 1,
  }).format(Number(amount))
  return formattedValue
}

export const formatNumber = (amount: number | string | undefined, decimals: number = 2) => {
  if (!amount) return "0"
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(Number(amount))
}

export const formatCompactNumber = (amount: number | string | undefined) => {
  if (!amount) return "$0"
  const num = Number(amount)
  
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  } else {
    return `${num.toFixed(2)}`
  }
}