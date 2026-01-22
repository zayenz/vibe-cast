/**
 * Property-Based Tests for YouTube Retry Mechanisms
 * 
 * Feature: youtube-player-production-fix
 * Property 1: YouTube API Loading Reliability
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  withRetry,
  YouTubeRetryManager,
  getRetryManager,
  resetRetryManager,
  DEFAULT_RETRY_OPTIONS
} from '../utils/YouTubeRetry';
import {
  YouTubeErrorType,
  createYouTubeError,
  isRetryableError,
  calculateRetryDelay
} from '../types/YouTubeTypes';

describe('Feature: youtube-player-production-fix, Property 1: YouTube API Loading Reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRetryManager();
  });

  afterEach(() => {
    resetRetryManager();
  });

  it('should respect maximum attempts for any valid configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (maxAttempts) => {
          let attemptCount = 0;
          
          const operation = async () => {
            attemptCount++;
            throw createYouTubeError(
              YouTubeErrorType.NETWORK_TIMEOUT,
              `Attempt ${attemptCount} failed`
            );
          };

          const result = await withRetry(operation, {
            maxAttempts,
            baseDelayMs: 1, // Very fast for testing
            maxDelayMs: 10
          });

          // Should fail after exactly maxAttempts
          expect(result.success).toBe(false);
          expect(result.attempts).toBe(maxAttempts);
          expect(attemptCount).toBe(maxAttempts);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should not retry non-retryable errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          YouTubeErrorType.ORIGIN_REJECTED,
          YouTubeErrorType.CORS_BLOCKED,
          YouTubeErrorType.CSP_SCRIPT_BLOCKED,
          YouTubeErrorType.INVALID_VIDEO_ID
        ),
        async (errorType) => {
          let attemptCount = 0;
          
          const operation = async () => {
            attemptCount++;
            throw createYouTubeError(errorType, `Non-retryable error: ${errorType}`);
          };

          const result = await withRetry(operation, {
            maxAttempts: 5,
            baseDelayMs: 1
          });

          // Should fail immediately without retries
          expect(result.success).toBe(false);
          expect(result.attempts).toBe(1);
          expect(attemptCount).toBe(1);
          expect(isRetryableError(errorType)).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should calculate exponential backoff delays correctly', () => {
    fc.assert(
      fc.property(
        fc.record({
          attempt: fc.integer({ min: 0, max: 10 }),
          baseDelayMs: fc.integer({ min: 100, max: 2000 }),
          backoffMultiplier: fc.integer({ min: 2, max: 4 }),
          maxDelayMs: fc.integer({ min: 5000, max: 30000 })
        }),
        ({ attempt, baseDelayMs, backoffMultiplier, maxDelayMs }) => {
          const config = {
            attempt,
            maxAttempts: 10,
            baseDelayMs,
            maxDelayMs,
            backoffMultiplier
          };

          const delay = calculateRetryDelay(config);

          // Should be a positive number
          expect(delay).toBeGreaterThan(0);
          
          // Should not exceed maxDelayMs (plus small jitter tolerance)
          expect(delay).toBeLessThanOrEqual(maxDelayMs * 1.1);
          
          // Should be at least baseDelayMs for first attempt
          if (attempt === 0) {
            expect(delay).toBeGreaterThanOrEqual(baseDelayMs * 0.9);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle successful operations correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          successValue: fc.string(),
          maxAttempts: fc.integer({ min: 1, max: 5 })
        }),
        async ({ successValue, maxAttempts }) => {
          let attemptCount = 0;
          
          const operation = async () => {
            attemptCount++;
            return successValue;
          };

          const result = await withRetry(operation, {
            maxAttempts,
            baseDelayMs: 1
          });

          // Should succeed on first attempt
          expect(result.success).toBe(true);
          expect(result.result).toBe(successValue);
          expect(result.attempts).toBe(1);
          expect(attemptCount).toBe(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should maintain retry manager singleton correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (callCount) => {
          resetRetryManager();
          
          // Multiple calls should return same instance
          const managers = Array.from({ length: callCount }, () => getRetryManager());
          
          for (let i = 1; i < managers.length; i++) {
            expect(managers[i]).toBe(managers[0]);
          }

          // Should be instance of YouTubeRetryManager
          expect(managers[0]).toBeInstanceOf(YouTubeRetryManager);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should have sensible default configuration', () => {
    fc.assert(
      fc.property(
        fc.constant(null), // No input needed
        () => {
          // Default options should be reasonable
          expect(DEFAULT_RETRY_OPTIONS.maxAttempts).toBeGreaterThan(0);
          expect(DEFAULT_RETRY_OPTIONS.maxAttempts).toBeLessThanOrEqual(10);
          
          expect(DEFAULT_RETRY_OPTIONS.baseDelayMs).toBeGreaterThan(0);
          expect(DEFAULT_RETRY_OPTIONS.baseDelayMs).toBeLessThanOrEqual(5000);
          
          expect(DEFAULT_RETRY_OPTIONS.maxDelayMs).toBeGreaterThan(DEFAULT_RETRY_OPTIONS.baseDelayMs);
          
          expect(DEFAULT_RETRY_OPTIONS.backoffMultiplier).toBeGreaterThanOrEqual(1);
          expect(DEFAULT_RETRY_OPTIONS.backoffMultiplier).toBeLessThanOrEqual(5);
          
          expect(Array.isArray(DEFAULT_RETRY_OPTIONS.retryableErrors)).toBe(true);
          expect(DEFAULT_RETRY_OPTIONS.retryableErrors!.length).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should classify error types consistently', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(YouTubeErrorType)),
        (errorType) => {
          const isRetryable = isRetryableError(errorType);
          
          // Should be consistent
          expect(typeof isRetryable).toBe('boolean');
          
          // Same call should return same result
          expect(isRetryableError(errorType)).toBe(isRetryable);
          
          // Known retryable errors
          const knownRetryable = [
            YouTubeErrorType.NETWORK_TIMEOUT,
            YouTubeErrorType.NETWORK_UNREACHABLE,
            YouTubeErrorType.API_LOAD_TIMEOUT,
            YouTubeErrorType.SERVER_UNAVAILABLE,
            YouTubeErrorType.ASSET_NOT_FOUND
          ];
          
          if (knownRetryable.includes(errorType)) {
            expect(isRetryable).toBe(true);
          }

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should create retry managers with proper initial state', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const manager = new YouTubeRetryManager();
          
          // Should start with empty state
          expect(manager.getActiveRetries()).toEqual([]);
          expect(manager.getRetryStats()).toEqual({});
          expect(manager.isRetrying('any-id')).toBe(false);
          
          // Should be able to cancel non-existent retries
          expect(manager.cancelRetry('non-existent')).toBe(false);
          expect(manager.cancelAllRetries()).toBe(0);

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });
});