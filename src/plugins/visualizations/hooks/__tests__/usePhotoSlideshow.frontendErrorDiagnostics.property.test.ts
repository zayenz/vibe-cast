/**
 * Property-Based Tests for Frontend Error Diagnostics
 * 
 * **Feature: photo-slideshow-production-fix, Property 9: Frontend Error Diagnostics**
 * **Validates: Requirements 4.3**
 * 
 * This test validates that for any malformed or unexpected API response received by the frontend,
 * diagnostic information is provided to help identify the root cause.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import { usePhotoSlideshow } from '../usePhotoSlideshow';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`)
}));

// Mock face detection
vi.mock('../../faceDetection', () => ({
  loadFaceDetectionModels: vi.fn().mockResolvedValue(undefined),
  detectFacePosition: vi.fn().mockResolvedValue({ x: 0.5, y: 0.5 }),
}));

// Mock settings
vi.mock('../../../utils/settings', () => ({
  getStringSetting: vi.fn((value, defaultValue) => value || defaultValue),
  getBooleanSetting: vi.fn((value, defaultValue) => value !== undefined ? value : defaultValue),
  getNumberSetting: vi.fn((value, defaultValue) => value !== undefined ? value : defaultValue),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location for web remote environment
Object.defineProperty(window, 'location', {
  value: {
    protocol: 'http:',
  },
  writable: true,
});

// Mock import.meta.env for production environment
Object.defineProperty(import.meta, 'env', {
  value: {
    DEV: false,
  },
  writable: true,
});

describe('Feature: photo-slideshow-production-fix, Property 9: Frontend Error Diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Ensure web remote environment is properly set up for each test
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'http:',
      },
      writable: true,
    });
    
    Object.defineProperty(import.meta, 'env', {
      value: {
        DEV: false,
      },
      writable: true,
    });
    
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should provide diagnostic information for HTML responses with error status codes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          statusCode: fc.constantFrom(400, 403, 404, 500, 502, 503),
          statusText: fc.constantFrom('Bad Request', 'Forbidden', 'Not Found', 'Internal Server Error', 'Bad Gateway', 'Service Unavailable'),
          htmlContent: fc.oneof(
            fc.constant('<!DOCTYPE html><html><head><title>VibeCast</title></head><body><h1>Error</h1></body></html>'),
            fc.constant('<html><body>Server Error</body></html>'),
            fc.constant('<!DOCTYPE html>\n<html>\n<head>\n<title>Error Page</title>\n</head>\n<body>\n<div>Something went wrong</div>\n</body>\n</html>')
          ),
          folderPath: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\n')),
          contentType: fc.constantFrom('text/html', 'text/html; charset=utf-8', 'text/html; charset=UTF-8')
        }),
        async ({ statusCode, statusText, htmlContent, folderPath, contentType }) => {
          // Mock fetch to return HTML with error status
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: statusCode,
            statusText: statusText,
            headers: {
              get: vi.fn((header) => {
                if (header === 'content-type') return contentType;
                return null;
              }),
            },
            text: vi.fn().mockResolvedValue(htmlContent),
            json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON')),
          });

          const { result } = renderHook(() => 
            usePhotoSlideshow({ folderPath })
          );

          await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.error).toBeTruthy();
          }, { timeout: 3000 });

          const errorMessage = result.current.error!;

          // Core property: The hook should not crash and should provide an error message
          expect(errorMessage).toBeTruthy();
          expect(typeof errorMessage).toBe('string');
          expect(errorMessage.length).toBeGreaterThan(0);
          
          // Core property: The error should be informative (not just a generic crash message)
          expect(errorMessage).not.toContain('Cannot read properties of undefined');
          expect(errorMessage).not.toContain('TypeError');
          
          // Core property: The hook should handle the error gracefully
          expect(result.current.loading).toBe(false);
          expect(result.current.images).toEqual([]);
        }
      ),
      { numRuns: 30 }
    );
  });

  it('should handle various error scenarios without crashing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          errorScenario: fc.constantFrom(
            'network_error',
            'html_response', 
            'malformed_json',
            'wrong_data_type',
            'empty_response'
          ),
          folderPath: fc.string({ minLength: 0, maxLength: 50 }),
          statusCode: fc.integer({ min: 200, max: 599 })
        }),
        async ({ errorScenario, folderPath, statusCode }) => {
          void (folderPath || '$RESOURCES/kittens');
          
          // Set up different error scenarios
          switch (errorScenario) {
            case 'network_error':
              mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
              break;
              
            case 'html_response':
              mockFetch.mockResolvedValueOnce({
                ok: statusCode >= 200 && statusCode < 300,
                status: statusCode,
                statusText: 'Test Status',
                headers: {
                  get: vi.fn((header) => {
                    if (header === 'content-type') return 'text/html';
                    return null;
                  }),
                },
                text: vi.fn().mockResolvedValue('<!DOCTYPE html><html><body>Error</body></html>'),
                json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
              });
              break;
              
            case 'malformed_json':
              mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                  get: vi.fn((header) => {
                    if (header === 'content-type') return 'application/json';
                    return null;
                  }),
                },
                json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
              });
              break;
              
            case 'wrong_data_type':
              mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                  get: vi.fn((header) => {
                    if (header === 'content-type') return 'application/json';
                    return null;
                  }),
                },
                json: vi.fn().mockResolvedValue({ not: 'an array' }),
              });
              break;
              
            case 'empty_response':
              mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                  get: vi.fn((header) => {
                    if (header === 'content-type') return 'application/json';
                    return null;
                  }),
                },
                json: vi.fn().mockResolvedValue([]),
              });
              break;
          }

          const { result } = renderHook(() => 
            usePhotoSlideshow({ folderPath })
          );

          await waitFor(() => {
            expect(result.current.loading).toBe(false);
          }, { timeout: 3000 });

          // Core property: The hook should never crash
          expect(result.current).toBeDefined();
          expect(typeof result.current.loading).toBe('boolean');
          expect(Array.isArray(result.current.images)).toBe(true);
          
          // Core property: Error handling should be graceful
          if (result.current.error) {
            expect(typeof result.current.error).toBe('string');
            expect(result.current.error.length).toBeGreaterThan(0);
            // Should not contain crash-related error messages
            expect(result.current.error).not.toContain('Cannot read properties of undefined');
            expect(result.current.error).not.toContain('TypeError:');
          }
          
          // Core property: State should be consistent
          expect(result.current.loading).toBe(false);
          
          // For successful empty response, should handle gracefully
          if (errorScenario === 'empty_response') {
            expect(result.current.error).toBeTruthy(); // Should show "No images found"
            expect(result.current.images).toEqual([]);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});