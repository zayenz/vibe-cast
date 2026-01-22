/**
 * YouTube Retry Logic with Exponential Backoff
 * 
 * Implements robust retry mechanisms for YouTube player operations
 * with configurable backoff strategies and error handling.
 */

import {
  YouTubeError,
  YouTubeErrorType,
  RetryConfig,
  createYouTubeError,
  isRetryableError,
  calculateRetryDelay
} from '../types/YouTubeTypes';

// Retry operation result
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: YouTubeError;
  attempts: number;
  totalTime: number;
}

// Retry operation function type
export type RetryOperation<T> = () => Promise<T>;

// Retry options
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  timeoutMs?: number;
  retryableErrors?: YouTubeErrorType[];
  onRetry?: (attempt: number, error: YouTubeError) => void;
}

// Default retry options
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
  backoffMultiplier: 2,
  timeoutMs: 30000,
  retryableErrors: [
    YouTubeErrorType.NETWORK_TIMEOUT,
    YouTubeErrorType.NETWORK_UNREACHABLE,
    YouTubeErrorType.API_LOAD_TIMEOUT,
    YouTubeErrorType.SERVER_UNAVAILABLE,
    YouTubeErrorType.ASSET_NOT_FOUND
  ]
};

/**
 * Execute an operation with retry logic and exponential backoff
 */
export async function withRetry<T>(
  operation: RetryOperation<T>,
  options: Partial<RetryOptions> = {}
): Promise<RetryResult<T>> {
  const config: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: YouTubeError | null = null;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      // Check overall timeout
      if (config.timeoutMs && (Date.now() - startTime) > config.timeoutMs) {
        return {
          success: false,
          error: createYouTubeError(
            YouTubeErrorType.NETWORK_TIMEOUT,
            'Overall retry timeout exceeded',
            { 
              attempts: attempt + 1, 
              totalTime: Date.now() - startTime,
              timeoutMs: config.timeoutMs
            }
          ),
          attempts: attempt + 1,
          totalTime: Date.now() - startTime
        };
      }

      // Execute the operation
      const result = await operation();
      
      return {
        success: true,
        result,
        attempts: attempt + 1,
        totalTime: Date.now() - startTime
      };
    } catch (error) {
      // Convert to YouTubeError if needed
      const youtubeError = (error as any)?.type && (error as any)?.retryable !== undefined
        ? error as YouTubeError
        : createYouTubeError(
            YouTubeErrorType.NETWORK_UNREACHABLE,
            error instanceof Error ? error.message : 'Unknown error',
            { originalError: error, attempt: attempt + 1 }
          );

      lastError = youtubeError;

      // Check if error is retryable
      const isRetryable = config.retryableErrors?.includes(youtubeError.type) ?? 
                         isRetryableError(youtubeError.type);

      // If not retryable or last attempt, return failure
      if (!isRetryable || attempt === config.maxAttempts - 1) {
        return {
          success: false,
          error: youtubeError,
          attempts: attempt + 1,
          totalTime: Date.now() - startTime
        };
      }

      // Call retry callback if provided
      if (config.onRetry) {
        try {
          config.onRetry(attempt + 1, youtubeError);
        } catch (callbackError) {
          console.warn('[YouTube Retry] Retry callback error:', callbackError);
        }
      }

      // Calculate delay for next attempt
      const retryConfig: RetryConfig = {
        attempt,
        maxAttempts: config.maxAttempts,
        baseDelayMs: config.baseDelayMs,
        maxDelayMs: config.maxDelayMs,
        backoffMultiplier: config.backoffMultiplier
      };

      const delay = calculateRetryDelay(retryConfig);
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but just in case
  return {
    success: false,
    error: lastError || createYouTubeError(
      YouTubeErrorType.NETWORK_UNREACHABLE,
      'Retry loop completed without result'
    ),
    attempts: config.maxAttempts,
    totalTime: Date.now() - startTime
  };
}

/**
 * Specialized retry for network operations
 */
export async function withNetworkRetry<T>(
  operation: RetryOperation<T>,
  options: Partial<RetryOptions> = {}
): Promise<RetryResult<T>> {
  return withRetry(operation, {
    ...options,
    retryableErrors: [
      YouTubeErrorType.NETWORK_TIMEOUT,
      YouTubeErrorType.NETWORK_UNREACHABLE,
      YouTubeErrorType.SERVER_UNAVAILABLE
    ]
  });
}

/**
 * Specialized retry for API loading operations
 */
export async function withApiLoadRetry<T>(
  operation: RetryOperation<T>,
  options: Partial<RetryOptions> = {}
): Promise<RetryResult<T>> {
  return withRetry(operation, {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 8000,
    ...options,
    retryableErrors: [
      YouTubeErrorType.API_LOAD_TIMEOUT,
      YouTubeErrorType.API_SCRIPT_BLOCKED,
      YouTubeErrorType.NETWORK_TIMEOUT,
      YouTubeErrorType.NETWORK_UNREACHABLE
    ]
  });
}

/**
 * Specialized retry for asset serving operations
 */
export async function withAssetRetry<T>(
  operation: RetryOperation<T>,
  options: Partial<RetryOptions> = {}
): Promise<RetryResult<T>> {
  return withRetry(operation, {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 4000,
    ...options,
    retryableErrors: [
      YouTubeErrorType.ASSET_NOT_FOUND,
      YouTubeErrorType.SERVER_UNAVAILABLE,
      YouTubeErrorType.NETWORK_TIMEOUT
    ]
  });
}

/**
 * Create a timeout wrapper for operations
 */
export function withTimeout<T>(
  operation: RetryOperation<T>,
  timeoutMs: number,
  errorType: YouTubeErrorType = YouTubeErrorType.NETWORK_TIMEOUT
): RetryOperation<T> {
  return async (): Promise<T> => {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(createYouTubeError(
            errorType,
            `Operation timed out after ${timeoutMs}ms`,
            { timeoutMs }
          ));
        }, timeoutMs);
      })
    ]);
  };
}

/**
 * Retry manager for coordinating multiple retry operations
 */
export class YouTubeRetryManager {
  private activeRetries = new Map<string, AbortController>();
  private retryStats = new Map<string, { attempts: number; lastAttempt: number }>();

  /**
   * Execute operation with retry, with ability to cancel
   */
  async executeWithRetry<T>(
    operationId: string,
    operation: RetryOperation<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    // Cancel any existing retry for this operation
    this.cancelRetry(operationId);

    // Create abort controller for this retry
    const abortController = new AbortController();
    this.activeRetries.set(operationId, abortController);

    try {
      // Wrap operation to check for cancellation
      const cancellableOperation: RetryOperation<T> = async () => {
        if (abortController.signal.aborted) {
          throw createYouTubeError(
            YouTubeErrorType.NETWORK_UNREACHABLE,
            'Operation was cancelled',
            { operationId }
          );
        }
        return await operation();
      };

      // Execute with retry
      const result = await withRetry(cancellableOperation, {
        ...options,
        onRetry: (attempt, error) => {
          // Update stats
          this.retryStats.set(operationId, {
            attempts: attempt,
            lastAttempt: Date.now()
          });

          // Call original callback if provided
          if (options.onRetry) {
            options.onRetry(attempt, error);
          }
        }
      });

      return result;
    } finally {
      // Clean up
      this.activeRetries.delete(operationId);
      
      // Keep stats for a while for debugging
      setTimeout(() => {
        this.retryStats.delete(operationId);
      }, 60000); // Keep for 1 minute
    }
  }

  /**
   * Cancel a specific retry operation
   */
  cancelRetry(operationId: string): boolean {
    const controller = this.activeRetries.get(operationId);
    if (controller) {
      controller.abort();
      this.activeRetries.delete(operationId);
      return true;
    }
    return false;
  }

  /**
   * Cancel all active retry operations
   */
  cancelAllRetries(): number {
    const count = this.activeRetries.size;
    for (const controller of this.activeRetries.values()) {
      controller.abort();
    }
    this.activeRetries.clear();
    return count;
  }

  /**
   * Get retry statistics
   */
  getRetryStats(): Record<string, { attempts: number; lastAttempt: number }> {
    return Object.fromEntries(this.retryStats);
  }

  /**
   * Check if operation is currently retrying
   */
  isRetrying(operationId: string): boolean {
    return this.activeRetries.has(operationId);
  }

  /**
   * Get list of active retry operations
   */
  getActiveRetries(): string[] {
    return Array.from(this.activeRetries.keys());
  }
}

// Global retry manager instance
let globalRetryManager: YouTubeRetryManager | null = null;

/**
 * Get the global retry manager instance
 */
export function getRetryManager(): YouTubeRetryManager {
  if (!globalRetryManager) {
    globalRetryManager = new YouTubeRetryManager();
  }
  return globalRetryManager;
}

/**
 * Reset the global retry manager (useful for testing)
 */
export function resetRetryManager(): void {
  if (globalRetryManager) {
    globalRetryManager.cancelAllRetries();
  }
  globalRetryManager = null;
}