import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhotoSlideshowPlugin } from '../PhotoSlideshowPlugin';
import { DEFAULT_COMMON_SETTINGS } from '../../types';

// Mock Tauri APIs
const mockInvoke = vi.fn();
const mockResolveResource = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `asset://${path}`,
}));

vi.mock('@tauri-apps/api/path', () => ({
  resolveResource: (...args: any[]) => mockResolveResource(...args),
}));

// Mock face detection to avoid loading models
vi.mock('../faceDetection', () => ({
  loadFaceDetectionModels: vi.fn().mockResolvedValue(undefined),
  detectFacePosition: vi.fn().mockResolvedValue(undefined),
}));

describe('PhotoSlideshowPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default invoke implementation
    mockInvoke.mockImplementation(async (cmd, args) => {
      if (cmd === 'list_images_in_folder') {
        return ['/path/to/image1.jpg', '/path/to/image2.jpg'];
      }
      return [];
    });
  });

  it('should attempt to load example photos when folderPath is empty', async () => {
    const Component = PhotoSlideshowPlugin.component;
    
    // Setup mock for resolveResource
    mockResolveResource.mockResolvedValue('/resolved/resource/example-photos');

    render(
      <Component
        audioData={[]}
        commonSettings={DEFAULT_COMMON_SETTINGS}
        customSettings={{ sourceType: 'local', folderPath: '' }}
      />
    );

    // Expect resolveResource to be called
    await waitFor(() => {
      expect(mockResolveResource).toHaveBeenCalledWith('example-photos');
    });

    // Expect list_images_in_folder to be called with the resolved path
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('list_images_in_folder', {
        folderPath: '/resolved/resource/example-photos'
      });
    });
  });
});
