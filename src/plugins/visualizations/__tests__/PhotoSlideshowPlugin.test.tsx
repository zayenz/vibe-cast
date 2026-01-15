import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  beforeEach(() => {
    vi.clearAllMocks();
    // Default invoke implementation
    mockInvoke.mockImplementation(async (cmd, _args) => {
      if (cmd === 'list_images_in_folder') {
        return ['/path/to/image1.jpg', '/path/to/image2.jpg'];
      }
      return [];
    });
  });

  it('should attempt to load example photos via invoke when folderPath is empty (default env)', async () => {
    const Component = PhotoSlideshowPlugin.component;
    
    render(
      <Component
        audioData={[]}
        commonSettings={DEFAULT_COMMON_SETTINGS}
        customSettings={{ sourceType: 'local', folderPath: '' }}
      />
    );

    // Expect invoke to be called with the special resource path
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('list_images_in_folder', {
        folderPath: '$RESOURCES/kittens'
      });
    });
  });
});
