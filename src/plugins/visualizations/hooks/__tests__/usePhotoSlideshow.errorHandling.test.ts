import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    protocol: 'http:',
  },
  writable: true,
});

// Mock import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    DEV: false,
  },
  writable: true,
});

describe('usePhotoSlideshow Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('Basic Error Handling', () => {
    it('should handle simple fetch errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => 
        usePhotoSlideshow({ folderPath: '/test/folder' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeTruthy();
        console.log('Error message:', result.current.error);
      }, { timeout: 2000 });
    });

    it('should handle HTML response with 404 status and attempt fallback', async () => {
      const htmlResponse = '<!DOCTYPE html><html><head><title>VibeCast</title></head><body>...</body></html>';
      
      // Mock the primary folder request that returns HTML
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: {
          get: vi.fn((header) => {
            if (header === 'content-type') return 'text/html; charset=utf-8';
            return null;
          }),
        },
        text: vi.fn().mockResolvedValue(htmlResponse),
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON')),
      });

      // Mock the fallback request that also fails (empty array)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn((header) => {
            if (header === 'content-type') return 'application/json';
            return null;
          }),
        },
        json: vi.fn().mockResolvedValue([]),
      });

      const { result } = renderHook(() => 
        usePhotoSlideshow({ folderPath: '/test/folder' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeTruthy();
        console.log('Error message:', result.current.error);
        // With enhanced fallback behavior, we should see a message about both primary and fallback failures
        expect(result.current.error).toContain('No images found in the selected folder and default photos could not be loaded');
      }, { timeout: 2000 });
    });

    it('should detect API configuration errors and skip fallback', async () => {
      const htmlResponse = '<!DOCTYPE html><html><head><title>VibeCast</title></head><body>...</body></html>';
      
      // Mock a response that clearly indicates an API configuration issue
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          get: vi.fn((header) => {
            if (header === 'content-type') return 'text/html; charset=utf-8';
            return null;
          }),
        },
        text: vi.fn().mockResolvedValue(htmlResponse),
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON')),
      });

      const { result } = renderHook(() => 
        usePhotoSlideshow({ folderPath: '/test/folder' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeTruthy();
        console.log('Error message:', result.current.error);
        // For server errors with HTML responses, we should see the original HTML error
        expect(result.current.error).toContain('Server returned HTML instead of JSON');
      }, { timeout: 2000 });
    });
  });
});