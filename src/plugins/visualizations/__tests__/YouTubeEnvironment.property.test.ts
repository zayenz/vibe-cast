/**
 * Property-Based Tests for YouTube Environment Detection
 * 
 * Feature: youtube-player-production-fix
 * Property 3: Origin Validation and Compatibility
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { YouTubeEnvironmentResolver, getEnvironmentResolver, resetEnvironmentResolver } from '../utils/YouTubeEnvironment';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

describe('Feature: youtube-player-production-fix, Property 3: Origin Validation and Compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnvironmentResolver();
    mockFetch.mockClear();
    mockInvoke.mockClear();
  });

  afterEach(() => {
    resetEnvironmentResolver();
  });

  it('should always return a defined result for any environment', () => {
    fc.assert(
      fc.property(
        fc.record({
          protocol: fc.constantFrom('http:', 'https:', 'tauri:', 'asset:'),
          hostname: fc.constantFrom('localhost', '127.0.0.1'),
          port: fc.integer({ min: 1024, max: 65535 })
        }),
        ({ protocol, hostname, port }) => {
          const origin = protocol.startsWith('http') ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
          
          Object.defineProperty(window, 'location', {
            value: { protocol, origin },
            writable: true
          });

          // Test that resolver can be created and provides basic functionality
          const resolver = new YouTubeEnvironmentResolver();
          const env = resolver.getEnvironmentInfo();
          const diagnostics = resolver.getDiagnosticInfo();

          // Core properties that should always hold
          expect(env).toBeDefined();
          expect(env.protocol).toBe(protocol);
          expect(env.origin).toBe(origin);
          expect(typeof env.isHttpProtocol).toBe('boolean');
          expect(typeof env.isCustomProtocol).toBe('boolean');
          expect(typeof env.isDevelopment).toBe('boolean');
          expect(typeof env.isProduction).toBe('boolean');

          expect(diagnostics).toBeDefined();
          expect(diagnostics.environment).toEqual(env);
          expect(typeof diagnostics.timestamp).toBe('number');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should provide consistent environment detection', () => {
    fc.assert(
      fc.property(
        fc.record({
          protocol: fc.constantFrom('http:', 'https:', 'tauri:', 'asset:'),
          port: fc.integer({ min: 1024, max: 65535 })
        }),
        ({ protocol, port }) => {
          const origin = protocol.startsWith('http') ? `${protocol}//localhost:${port}` : `${protocol}//localhost`;
          
          Object.defineProperty(window, 'location', {
            value: { protocol, origin },
            writable: true
          });

          const resolver = new YouTubeEnvironmentResolver();
          
          // Multiple calls should return consistent environment info
          const env1 = resolver.getEnvironmentInfo();
          const env2 = resolver.getEnvironmentInfo();

          expect(env1).toEqual(env2);
          expect(env1.protocol).toBe(protocol);
          expect(env1.origin).toBe(origin);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should provide diagnostic information for any environment', () => {
    fc.assert(
      fc.property(
        fc.record({
          protocol: fc.constantFrom('http:', 'https:', 'tauri:', 'asset:'),
          hostname: fc.constantFrom('localhost', '127.0.0.1')
        }),
        ({ protocol, hostname }) => {
          const origin = `${protocol}//${hostname}`;
          
          Object.defineProperty(window, 'location', {
            value: { protocol, origin },
            writable: true
          });

          const resolver = new YouTubeEnvironmentResolver();
          const diagnostics = resolver.getDiagnosticInfo();

          // Should always have required diagnostic fields
          expect(diagnostics).toHaveProperty('environment');
          expect(diagnostics).toHaveProperty('timestamp');
          expect(diagnostics).toHaveProperty('userAgent');
          
          expect(diagnostics.environment.protocol).toBe(protocol);
          expect(diagnostics.environment.origin).toBe(origin);
          expect(typeof diagnostics.timestamp).toBe('number');
          expect(diagnostics.timestamp).toBeGreaterThan(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle singleton instance correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (callCount) => {
          resetEnvironmentResolver();
          
          // Multiple calls to getEnvironmentResolver should return same instance
          const resolvers = Array.from({ length: callCount }, () => getEnvironmentResolver());
          
          // All should be the same instance
          for (let i = 1; i < resolvers.length; i++) {
            expect(resolvers[i]).toBe(resolvers[0]);
          }

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should classify environments correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          { protocol: 'http:', expected: { isHttp: true, isDev: false, isProd: false } },
          { protocol: 'https:', expected: { isHttp: true, isDev: false, isProd: false } },
          { protocol: 'tauri:', expected: { isHttp: false, isDev: false, isProd: true } },
          { protocol: 'asset:', expected: { isHttp: false, isDev: false, isProd: true } }
        ),
        ({ protocol, expected }) => {
          const origin = protocol.startsWith('http') ? `${protocol}//localhost:3000` : `${protocol}//localhost`;
          
          Object.defineProperty(window, 'location', {
            value: { protocol, origin },
            writable: true
          });

          const resolver = new YouTubeEnvironmentResolver();
          const env = resolver.getEnvironmentInfo();

          expect(env.isHttpProtocol).toBe(expected.isHttp);
          expect(env.isCustomProtocol).toBe(!expected.isHttp);
          expect(env.isProduction).toBe(expected.isProd);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should detect development environment correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('http:', 'https:'),
        (protocol) => {
          // Development is specifically localhost:1420
          const origin = `${protocol}//localhost:1420`;
          
          Object.defineProperty(window, 'location', {
            value: { protocol, origin },
            writable: true
          });

          const resolver = new YouTubeEnvironmentResolver();
          const env = resolver.getEnvironmentInfo();

          expect(env.isDevelopment).toBe(true);
          expect(env.isProduction).toBe(false);
          expect(env.isHttpProtocol).toBe(true);

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});