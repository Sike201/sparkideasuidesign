// Rate limiting utilities for RPC calls

/**
 * Enhanced sleep function with jitter to prevent thundering herd
 */
export async function sleep(ms: number, jitter: boolean = true): Promise<void> {
  const delay = jitter ? ms + Math.random() * 100 : ms;
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Rate limiter class to manage RPC request frequency
 */
export class RateLimiter {
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private readonly minInterval: number;
  private readonly maxRequestsPerSecond: number;
  
  constructor(maxRequestsPerSecond: number = 5) {
    this.maxRequestsPerSecond = maxRequestsPerSecond;
    this.minInterval = 1000 / maxRequestsPerSecond; // ms between requests
  }
  
  /**
   * Wait if necessary to respect rate limits
   */
  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      console.log(`[RateLimiter] Waiting ${waitTime}ms to respect rate limit`);
      await sleep(waitTime, true);
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }
  
  /**
   * Get current rate info
   */
  getStats(): { requestCount: number; avgInterval: number } {
    return {
      requestCount: this.requestCount,
      avgInterval: this.minInterval
    };
  }
}

/**
 * Enhanced retry with exponential backoff and rate limiting awareness
 */
export async function retryWithBackoffAndRateLimit<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  rateLimiter?: RateLimiter
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      // Respect rate limit before making request
      if (rateLimiter) {
        await rateLimiter.waitIfNeeded();
      }
      
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i === maxRetries) break;
      
      // Check if it's a rate limit error and add extra delay
      const isRateLimit = error instanceof Error && (
        error.message.includes('429') || 
        error.message.includes('rate limit') ||
        error.message.includes('Too Many Requests')
      );
      
      const delay = isRateLimit 
        ? baseDelay * Math.pow(2, i) + 2000 // Extra 2s for rate limit errors
        : baseDelay * Math.pow(2, i);
      
      console.log(`[Retry] Attempt ${i + 1}/${maxRetries} failed, waiting ${delay}ms. Error: ${error.message}`);
      await sleep(delay, true);
    }
  }
  
  throw lastError!;
}

/**
 * Process items in batches with rate limiting
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 5,
  delayBetweenBatches: number = 1000,
  rateLimiter?: RateLimiter
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`[BatchProcessor] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(items.length/batchSize)} (${batch.length} items)`);
    
    const batchPromises = batch.map(async (item) => {
      try {
        if (rateLimiter) {
          await rateLimiter.waitIfNeeded();
        }
        return await processor(item);
      } catch (error) {
        console.error(`[BatchProcessor] Error processing item:`, error);
        return null;
      }
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value !== null) {
        results.push(result.value);
      }
    });
    
    // Add delay between batches
    if (i + batchSize < items.length) {
      console.log(`[BatchProcessor] Waiting ${delayBetweenBatches}ms before next batch...`);
      await sleep(delayBetweenBatches, true);
    }
  }
  
  return results;
}

/**
 * Connection wrapper with built-in rate limiting
 */
export class RateLimitedConnection {
  private rateLimiter: RateLimiter;
  
  constructor(private connection: any, maxRequestsPerSecond: number = 5) {
    this.rateLimiter = new RateLimiter(maxRequestsPerSecond);
  }
  
  async getAccountInfo(publicKey: any, commitment?: string) {
    return retryWithBackoffAndRateLimit(
      () => this.connection.getAccountInfo(publicKey, commitment),
      3,
      1000,
      this.rateLimiter
    );
  }
  
  async getTokenSupply(mint: any, commitment?: string) {
    return retryWithBackoffAndRateLimit(
      () => this.connection.getTokenSupply(mint, commitment),
      3,
      1000,
      this.rateLimiter
    );
  }
  
  async getLatestBlockhash(commitment?: string) {
    return retryWithBackoffAndRateLimit(
      () => this.connection.getLatestBlockhash(commitment),
      3,
      1000,
      this.rateLimiter
    );
  }
  
  async sendRawTransaction(rawTransaction: any, options?: any) {
    return retryWithBackoffAndRateLimit(
      () => this.connection.sendRawTransaction(rawTransaction, options),
      3,
      1000,
      this.rateLimiter
    );
  }
  
  // Add other methods as needed, all with rate limiting
  getStats() {
    return this.rateLimiter.getStats();
  }
}
