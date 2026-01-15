import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PhotoSlideshowPlugin } from '../PhotoSlideshowPlugin';
import { DEFAULT_COMMON_SETTINGS } from '../../types';

// Mock Tauri APIs
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `asset://${path}`,
}));

// Mock face detection to avoid loading models
vi.mock('../faceDetection', () => ({
  loadFaceDetectionModels: vi.fn().mockResolvedValue(undefined),
  detectFacePosition: vi.fn().mockResolvedValue(undefined),
}));

describe('PhotoSlideshowPlugin', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default invoke implementation
    mockInvoke.mockImplementation(async (cmd, _args) => {
      if (cmd === 'list_images_in_folder') {
        return ['/path/to/image1.jpg', '/path/to/image2.jpg'];
      }
      return [];
    });
    
    // Mock fetch for HTTP path
    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (url.toString().includes('/api/images/list')) {
        return {
          ok: true,
          json: async () => ['/path/to/image1.jpg', '/path/to/image2.jpg'],
        };
      }
      return {
        ok: true,
        blob: async () => new Blob([''], { type: 'image/jpeg' }),
      };
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should attempt to load example photos via HTTP when folderPath is empty', async () => {
    const Component = PhotoSlideshowPlugin.component;
    
    render(
      <Component
        audioData={[]}
        commonSettings={DEFAULT_COMMON_SETTINGS}
        customSettings={{ sourceType: 'local', folderPath: '' }}
      />
    );

    // Expect fetch to be called with the special resource path (encoded)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/images/list?folder=%24RESOURCES%2Fkittens')
      );
    });
  });
});
