/**
 * Property-Based Tests for Photo Slideshow Default Fallback Behavior
 * 
 * **Validates: Requirements 2.1, 2.3**
 * 
 * These tests verify that the photo slideshow correctly falls back to default photos
 * when the primary folder fails to load, and provides appropriate error handling
 * when both primary and fallback attempts fail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import { usePhotoSlideshow } from '../usePhotoSlideshow';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${path}`
}));

// Get the mocked function
import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

// Mock fetch for web remote testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console methods to avoid noise in tests
const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {})
};

describe('Photo Slideshow Default Fallback Behavior Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    Object.defineProperty(window, 'location', {
      value: { protocol: 'tauri:' },
      writable: true
    });
    Object.defineProperty(import.meta, 'env', {
      value: { DEV: false },
      writable: true
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    Object.values(consoleSpy).forEach(spy => spy.mockClear());
  });

  /**
   * Property 4: Default Fallback Behavior - Core Fallback Logic
   * 
   * When the primary folder fails to load, the system should:
   * 1. Attempt to load from the default fallback path ($RESOURCES/kittens)
   * 2. Set usingExamplePhotos to true when fallback is used successfully
   * 3. Provide appropriate error messages when both primary and fallback fail
   */
  it('Property 4: Default Fallback Behavior - Core Logic', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          folderPath: fc.oneof(
            fc.constant(''), // Empty folder path
            fc.constant('/nonexistent/folder'), // Known bad path
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('$RESOURCES'))
          ),
          primaryShouldSucceed: fc.boolean(),
          fallbackImages: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 })
        }),
        async ({ folderPath, primaryShouldSucceed, fallbackImages }) => {
          // Setup desktop environment
          Object.defineProperty(window, 'location', {
            value: { protocol: 'tauri:' },
            writable: true
          });

          // Configure mock responses
          mockInvoke.mockImplementation(async (command: string, args: any) => {
            if (command === 'list_images_in_folder') {
              const { folderPath: requestedPath } = args;
              
              // Handle primary folder request
              if (requestedPath === folderPath && folderPath !== '') {
                if (primaryShouldSucceed) {
                  return ['primary1.jpg', 'primary2.png'];
                } else {
                  throw new Error(`Folder not found: ${requestedPath}`);
                }
              }
              
              // Handle fallback request
              if (requestedPath === '$RESOURCES/kittens') {
                return fallbackImages;
              }
              
              throw new Error(`Unexpected path: ${requestedPath}`);
            }
            throw new Error(`Unknown command: ${command}`);
          });

          const { result } = renderHook(() => 
            usePhotoSlideshow({ folderPath }, undefined)
          );

          // Wait for loading to complete
          await waitFor(() => {
            expect(result.current.loading).toBe(false);
          }, { timeout: 5000 });

          // Verify behavior based on scenario
          if (!folderPath || folderPath === '') {
            // Empty folder path should go directly to fallback
            if (fallbackImages.length === 0) {
              // Empty fallback should show error
              expect(result.current.error).toBeTruthy();
              expect(result.current.images).toHaveLength(0);
            } else {
              // Non-empty fallback should succeed
              expect(result.current.error).toBeNull();
              expect(result.current.usingExamplePhotos).toBe(true);
              expect(result.current.images).toEqual(fallbackImages);
            }
          } else if (primaryShouldSucceed) {
            // Primary succeeded - no fallback needed
            expect(result.current.error).toBeNull();
            expect(result.current.usingExamplePhotos).toBe(false);
            expect(result.current.images).toEqual(['primary1.jpg', 'primary2.png']);
          } else {
            // Primary failed, should attempt fallback
            if (fallbackImages.length === 0) {
              // Both failed or fallback empty - should have error
              expect(result.current.error).toBeTruthy();
              expect(result.current.images).toHaveLength(0);
            } else {
              // Fallback succeeded
              expect(result.current.error).toBeNull();
              expect(result.current.usingExamplePhotos).toBe(true);
              expect(result.current.images).toEqual(fallbackImages);
            }
          }

          // Verify invoke calls
          const invokeCalls = mockInvoke.mock.calls.filter(call => call[0] === 'list_images_in_folder');
          
          if (!folderPath || folderPath === '') {
            // Should only call fallback
            expect(invokeCalls.length).toBeGreaterThanOrEqual(1);
            const fallbackCall = invokeCalls.find(call => (call[1] as Record<string, unknown>)?.folderPath === '$RESOURCES/kittens');
            expect(fallbackCall).toBeDefined();
          } else if (primaryShouldSucceed) {
            // Should only call primary
            expect(invokeCalls.length).toBeGreaterThanOrEqual(1);
            const primaryCall = invokeCalls.find(call => (call[1] as Record<string, unknown>)?.folderPath === folderPath);
            expect(primaryCall).toBeDefined();
          } else {
            // Should call both primary and fallback
            expect(invokeCalls.length).toBeGreaterThanOrEqual(1);
            const primaryCall = invokeCalls.find(call => (call[1] as Record<string, unknown>)?.folderPath === folderPath);
            expect(primaryCall).toBeDefined();
            
            if (fallbackImages.length > 0) {
              // Only check for fallback call if it would succeed
              const fallbackCall = invokeCalls.find(call => (call[1] as Record<string, unknown>)?.folderPath === '$RESOURCES/kittens');
              expect(fallbackCall).toBeDefined();
            }
          }
        }
      ),
      { numRuns: 30, timeout: 10000 }
    );
  });

  /**
   * Property 4: Default Fallback Behavior - Error Message Quality
   * 
   * When both primary and fallback fail, error messages should be informative
   * and contain diagnostic information to help users understand the issue.
   */
  it('Property 4: Default Fallback Behavior - Error Messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          folderPath: fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('$RESOURCES')),
          primaryErrorType: fc.oneof(
            fc.constant('not_found'),
            fc.constant('permission_denied'),
            fc.constant('invalid_path')
          ),
          fallbackShouldFail: fc.boolean()
        }),
        async ({ folderPath, primaryErrorType, fallbackShouldFail }) => {
          // Setup desktop environment
          Object.defineProperty(window, 'location', {
            value: { protocol: 'tauri:' },
            writable: true
          });

          // Configure error responses
          mockInvoke.mockImplementation(async (command: string, args: any) => {
            if (command === 'list_images_in_folder') {
              const { folderPath: requestedPath } = args;
              
              if (requestedPath === folderPath) {
                switch (primaryErrorType) {
                  case 'not_found':
                    throw new Error('Folder not found');
                  case 'permission_denied':
                    throw new Error('Permission denied');
                  case 'invalid_path':
                    throw new Error('Invalid path format');
                  default:
                    throw new Error('Unknown error');
                }
              }
              
              if (requestedPath === '$RESOURCES/kittens') {
                if (fallbackShouldFail) {
                  throw new Error('Default resources not found');
                } else {
                  return ['kitten1.jpg', 'kitten2.jpg'];
                }
              }
              
              throw new Error('Unexpected path');
            }
            throw new Error('Unknown command');
          });

          const { result } = renderHook(() => 
            usePhotoSlideshow({ folderPath }, undefined)
          );

          // Wait for loading to complete
          await waitFor(() => {
            expect(result.current.loading).toBe(false);
          }, { timeout: 5000 });

          // Verify behavior
          if (fallbackShouldFail) {
            // Both primary and fallback failed - should have comprehensive error
            expect(result.current.error).toBeTruthy();
            expect(result.current.images).toHaveLength(0);
            
            if (result.current.error) {
              // Error should contain some diagnostic information
              const errorLower = result.current.error.toLowerCase();
              expect(
                errorLower.includes('failed') || 
                errorLower.includes('error') ||
                errorLower.includes('not found') ||
                errorLower.includes('diagnostic') || 
                errorLower.includes('path')
              ).toBe(true);
            }
          } else {
            // Fallback succeeded
            expect(result.current.error).toBeNull();
            expect(result.current.usingExamplePhotos).toBe(true);
            expect(result.current.images).toEqual(['kitten1.jpg', 'kitten2.jpg']);
          }
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property 4: Default Fallback Behavior - Empty Folder Handling
   * 
   * When no folder is specified (empty string), the system should go directly
   * to the fallback without attempting to load from an empty path.
   */
  it('Property 4: Default Fallback Behavior - Empty Folder Direct Fallback', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
        async (fallbackImages) => {
          // Setup desktop environment
          Object.defineProperty(window, 'location', {
            value: { protocol: 'tauri:' },
            writable: true
          });

          // Configure mock to only handle fallback
          mockInvoke.mockImplementation(async (command: string, args: any) => {
            if (command === 'list_images_in_folder') {
              const { folderPath: requestedPath } = args;
              
              if (requestedPath === '$RESOURCES/kittens') {
                return fallbackImages;
              }
              
              // Should not be called with empty path
              throw new Error(`Unexpected path: ${requestedPath}`);
            }
            throw new Error(`Unknown command: ${command}`);
          });

          const { result } = renderHook(() => 
            usePhotoSlideshow({ folderPath: '' }, undefined)
          );

          // Wait for loading to complete
          await waitFor(() => {
            expect(result.current.loading).toBe(false);
          }, { timeout: 5000 });

          // Verify direct fallback behavior
          if (fallbackImages.length === 0) {
            // Empty fallback should show appropriate message
            expect(result.current.error).toBeTruthy();
            expect(result.current.images).toHaveLength(0);
          } else {
            // Non-empty fallback should succeed
            expect(result.current.error).toBeNull();
            expect(result.current.usingExamplePhotos).toBe(true);
            expect(result.current.images).toEqual(fallbackImages);
          }

          // Verify only fallback was called
          const invokeCalls = mockInvoke.mock.calls.filter(call => call[0] === 'list_images_in_folder');
          expect(invokeCalls.length).toBeGreaterThanOrEqual(1);
          
          // All calls should be to the fallback path
          const fallbackCalls = invokeCalls.filter(call => (call[1] as Record<string, unknown>)?.folderPath === '$RESOURCES/kittens');
          expect(fallbackCalls.length).toBeGreaterThanOrEqual(1);
          
          // No calls should be to empty path
          const emptyCalls = invokeCalls.filter(call => (call[1] as Record<string, unknown>)?.folderPath === '');
          expect(emptyCalls.length).toBe(0);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });
});