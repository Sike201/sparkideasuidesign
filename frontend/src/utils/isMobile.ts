/**
 * This isn't such a simple issue, as it depends on the usecase -- what do we consider a mobile device.
 * In our case, it is enough to determine whether the user is using Android or iOS -- if neither, we don't consider it a mobile device.
 * - This detection isn't perfect, feel free to update if needed.
 */
export const isMobile = (): boolean => {
  return isAndroid() || isiOS()
}

export const isAndroid = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase()
  return /android/.test(userAgent)
}

export const isiOS = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase()
  return /ipad|iphone|ipod/.test(userAgent)
}

export const isDesktop = () => !isMobile()

/**
 * Detect if the user is using Brave browser
 */
export const isBrave = (): boolean => {
  // @ts-expect-error Brave-specific API
  return navigator.brave && typeof navigator.brave.isBrave === 'function'
}
