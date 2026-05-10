// Global request deduplication to prevent multiple simultaneous requests for the same data
const ongoingRequests = new Map<string, Promise<unknown>>()

export function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  // If there's already an ongoing request for this key, return the existing promise
  if (ongoingRequests.has(key)) {
    return ongoingRequests.get(key)! as Promise<T>
  }

  // Create the request promise
  const requestPromise = requestFn().finally(() => {
    // Clean up the request from the map when it completes
    ongoingRequests.delete(key)
  })

  // Store the promise
  ongoingRequests.set(key, requestPromise)

  return requestPromise
}

// Helper function to create a unique key for API requests
export function createRequestKey(
  endpoint: string,
  params: Record<string, string | number | boolean>
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&')
  
  return `${endpoint}?${sortedParams}`
} 