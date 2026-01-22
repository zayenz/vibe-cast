/**
 * Unit Tests for YouTube Types and State Management
 * 
 * Tests error classification, state transitions, and configuration validation
 * with specific examples and edge cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  YouTubeErrorType,
  DEFAULT_YOUTUBE_CONFIG,
  INITIAL_PLAYER_STATE,
  calculateRetryDelay,
  createYouTubeError,
  isRetryableError,
  validateYouTubeConfig,
  detectEnvironment,
  RetryConfig
} from '../types/YouTubeTypes';

describe('YouTube Error Types and State Management', () => {
  describe('Error Classification', () => {
    it('should correctly identify retryable errors', () => {
      const retryableErrors = [
        YouTubeErrorType.NETWORK_TIMEOUT,
        YouTubeErrorType.NETWORK_UNREACHABLE,
        YouTubeErrorType.API_LOAD_TIMEOUT,
        YouTubeErrorType.SERVER_UNAVAILABLE,
        YouTubeErrorType.ASSET_NOT_FOUND
      ];

      retryableErrors.forEach(errorType => {
        expect(isRetryableError(errorType)).toBe(true);
      });
    });

    it('should correctly identify non-retryable errors', () => {
      const nonRetryableErrors = [
        YouTubeErrorType.ORIGIN_REJECTED,
        YouTubeErrorType.CORS_BLOCKED,
        YouTubeErrorType.CSP_SCRIPT_BLOCKED,
        YouTubeErrorType.CSP_FRAME_BLOCKED,
        YouTubeErrorType.INVALID_CONFIG,
        YouTubeErrorType.INVALID_VIDEO_ID
      ];

      nonRetryableErrors.forEach(errorType => {
        expect(isRetryableError(errorType)).toBe(false);
      });
    });

    it('should create error objects with correct properties', () => {
      const error = createYouTubeError(
        YouTubeErrorType.NETWORK_TIMEOUT,
        'Network request timed out',
        { url: 'https://www.youtube.com/iframe_api' }
      );

      expect(error.type).toBe(YouTubeErrorType.NETWORK_TIMEOUT);
      expect(error.message).toBe('Network request timed out');
      expect(error.details).toEqual({ url: 'https://www.youtube.com/iframe_api' });
      expect(error.retryable).toBe(true);
      expect(error.timestamp).toBeTypeOf('number');
      expect(error.timestamp).toBeGreaterThan(0);
    });

    it('should create non-retryable error objects correctly', () => {
      const error = createYouTubeError(
        YouTubeErrorType.INVALID_VIDEO_ID,
        'Invalid video ID format',
        { videoId: 'invalid-id' }
      );

      expect(error.type).toBe(YouTubeErrorType.INVALID_VIDEO_ID);
      expect(error.retryable).toBe(false);
    });
  });

  describe('Retry Configuration', () => {
    it('should calculate exponential backoff correctly', () => {
      const config: RetryConfig = {
        attempt: 0,
        maxAttempts: 5,
        baseDelayMs: 1000,
        maxDelayMs: 16000,
        backoffMultiplier: 2
      };

      // First attempt (attempt 0): ~1000ms
      const delay0 = calculateRetryDelay({ ...config, attempt: 0 });
      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThanOrEqual(1100); // With jitter

      // Second attempt (attempt 1): ~2000ms
      const delay1 = calculateRetryDelay({ ...config, attempt: 1 });
      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThanOrEqual(2200);

      // Third attempt (attempt 2): ~4000ms
      const delay2 = calculateRetryDelay({ ...config, attempt: 2 });
      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThanOrEqual(4400);
    });

    it('should respect maximum delay limit', () => {
      const config: RetryConfig = {
        attempt: 10, // Very high attempt number
        maxAttempts: 15,
        baseDelayMs: 1000,
        maxDelayMs: 5000, // Low max delay
        backoffMultiplier: 2
      };

      const delay = calculateRetryDelay(config);
      expect(delay).toBeLessThanOrEqual(5500); // Max delay + jitter
    });

    it('should add jitter to prevent thundering herd', () => {
      const config: RetryConfig = {
        attempt: 1,
        maxAttempts: 5,
        baseDelayMs: 1000,
        maxDelayMs: 16000,
        backoffMultiplier: 2
      };

      // Run multiple times to ensure jitter varies
      const delays = Array.from({ length: 10 }, () => calculateRetryDelay(config));
      const uniqueDelays = new Set(delays);
      
      // Should have some variation due to jitter
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('Configuration Validation', () => {
    it('should use default values for empty configuration', () => {
      const config = validateYouTubeConfig({});
      expect(config).toEqual(DEFAULT_YOUTUBE_CONFIG);
    });

    it('should clamp maxRetries to valid range', () => {
      expect(validateYouTubeConfig({ maxRetries: -1 }).maxRetries).toBe(0);
      expect(validateYouTubeConfig({ maxRetries: 15 }).maxRetries).toBe(10);
      expect(validateYouTubeConfig({ maxRetries: 5 }).maxRetries).toBe(5);
    });

    it('should clamp retryDelayMs to valid range', () => {
      expect(validateYouTubeConfig({ retryDelayMs: 50 }).retryDelayMs).toBe(100);
      expect(validateYouTubeConfig({ retryDelayMs: 10000 }).retryDelayMs).toBe(5000);
      expect(validateYouTubeConfig({ retryDelayMs: 2000 }).retryDelayMs).toBe(2000);
    });

    it('should clamp timeoutMs to valid range', () => {
      expect(validateYouTubeConfig({ timeoutMs: 500 }).timeoutMs).toBe(1000);
      expect(validateYouTubeConfig({ timeoutMs: 50000 }).timeoutMs).toBe(30000);
      expect(validateYouTubeConfig({ timeoutMs: 15000 }).timeoutMs).toBe(15000);
    });

    it('should preserve boolean values correctly', () => {
      expect(validateYouTubeConfig({ fallbackEnabled: false }).fallbackEnabled).toBe(false);
      expect(validateYouTubeConfig({ debugMode: true }).debugMode).toBe(true);
    });

    it('should handle partial configuration objects', () => {
      const partialConfig = {
        maxRetries: 3,
        debugMode: true
      };

      const result = validateYouTubeConfig(partialConfig);
      expect(result.maxRetries).toBe(3);
      expect(result.debugMode).toBe(true);
      expect(result.retryDelayMs).toBe(DEFAULT_YOUTUBE_CONFIG.retryDelayMs);
      expect(result.timeoutMs).toBe(DEFAULT_YOUTUBE_CONFIG.timeoutMs);
      expect(result.fallbackEnabled).toBe(DEFAULT_YOUTUBE_CONFIG.fallbackEnabled);
    });
  });

  describe('Initial State', () => {
    it('should have correct initial player state', () => {
      expect(INITIAL_PLAYER_STATE.status).toBe('loading');
      expect(INITIAL_PLAYER_STATE.serverUrl).toBeNull();
      expect(INITIAL_PLAYER_STATE.error).toBeNull();
      expect(INITIAL_PLAYER_STATE.retryCount).toBe(0);
      expect(INITIAL_PLAYER_STATE.isRetrying).toBe(false);
      expect(INITIAL_PLAYER_STATE.config).toEqual(DEFAULT_YOUTUBE_CONFIG);
      expect(INITIAL_PLAYER_STATE.serverInfo).toBeNull();
    });

    it('should have sensible default configuration', () => {
      expect(DEFAULT_YOUTUBE_CONFIG.maxRetries).toBeGreaterThan(0);
      expect(DEFAULT_YOUTUBE_CONFIG.retryDelayMs).toBeGreaterThan(0);
      expect(DEFAULT_YOUTUBE_CONFIG.timeoutMs).toBeGreaterThan(0);
      expect(DEFAULT_YOUTUBE_CONFIG.fallbackEnabled).toBe(true);
      expect(DEFAULT_YOUTUBE_CONFIG.debugMode).toBe(false);
    });
  });

  describe('Environment Detection', () => {
    beforeEach(() => {
      // Reset location mock
      vi.clearAllMocks();
    });

    it('should detect HTTP development environment', () => {
      // Mock window.location for development
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'http:',
          origin: 'http://localhost:1420'
        },
        writable: true
      });

      const env = detectEnvironment();
      expect(env.isHttpProtocol).toBe(true);
      expect(env.isCustomProtocol).toBe(false);
      expect(env.protocol).toBe('http:');
      expect(env.origin).toBe('http://localhost:1420');
      expect(env.isDevelopment).toBe(true);
      expect(env.isProduction).toBe(false);
    });

    it('should detect HTTPS development environment', () => {
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'https:',
          origin: 'https://localhost:1420'
        },
        writable: true
      });

      const env = detectEnvironment();
      expect(env.isHttpProtocol).toBe(true);
      expect(env.isDevelopment).toBe(true);
      expect(env.isProduction).toBe(false);
    });

    it('should detect Tauri production environment', () => {
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'tauri:',
          origin: 'tauri://localhost'
        },
        writable: true
      });

      const env = detectEnvironment();
      expect(env.isHttpProtocol).toBe(false);
      expect(env.isCustomProtocol).toBe(true);
      expect(env.protocol).toBe('tauri:');
      expect(env.isDevelopment).toBe(false);
      expect(env.isProduction).toBe(true);
    });

    it('should detect asset protocol production environment', () => {
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'asset:',
          origin: 'asset://localhost'
        },
        writable: true
      });

      const env = detectEnvironment();
      expect(env.isHttpProtocol).toBe(false);
      expect(env.isCustomProtocol).toBe(true);
      expect(env.protocol).toBe('asset:');
      expect(env.isDevelopment).toBe(false);
      expect(env.isProduction).toBe(true);
    });

    it('should detect HTTP remote environment', () => {
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'http:',
          origin: 'http://192.168.1.100:8080'
        },
        writable: true
      });

      const env = detectEnvironment();
      expect(env.isHttpProtocol).toBe(true);
      expect(env.isCustomProtocol).toBe(false);
      expect(env.isDevelopment).toBe(false); // Not localhost:1420
      expect(env.isProduction).toBe(false);  // Not custom protocol
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined configuration values', () => {
      const config = validateYouTubeConfig({
        maxRetries: undefined,
        retryDelayMs: undefined,
        timeoutMs: undefined,
        fallbackEnabled: undefined,
        debugMode: undefined
      });

      expect(config).toEqual(DEFAULT_YOUTUBE_CONFIG);
    });

    it('should handle null configuration values', () => {
      const config = validateYouTubeConfig({
        maxRetries: null as any,
        retryDelayMs: null as any,
        timeoutMs: null as any,
        fallbackEnabled: null as any,
        debugMode: null as any
      });

      expect(config).toEqual(DEFAULT_YOUTUBE_CONFIG);
    });

    it('should handle extreme retry configuration values', () => {
      const extremeConfig: RetryConfig = {
        attempt: 0,
        maxAttempts: 1,
        baseDelayMs: 1,
        maxDelayMs: 1,
        backoffMultiplier: 1
      };

      const delay = calculateRetryDelay(extremeConfig);
      expect(delay).toBeGreaterThanOrEqual(1);
      expect(delay).toBeLessThanOrEqual(2); // 1ms + small jitter
    });

    it('should create error with minimal information', () => {
      const error = createYouTubeError(
        YouTubeErrorType.NETWORK_TIMEOUT,
        'Timeout'
      );

      expect(error.type).toBe(YouTubeErrorType.NETWORK_TIMEOUT);
      expect(error.message).toBe('Timeout');
      expect(error.details).toBeUndefined();
      expect(error.context).toBeUndefined();
      expect(error.retryable).toBe(true);
      expect(error.timestamp).toBeTypeOf('number');
    });
  });
});