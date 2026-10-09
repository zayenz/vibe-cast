import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { usePhotoSlideshow } from '../usePhotoSlideshow';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://${path}`,
}));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    naturalHeight = 100;
    naturalWidth = 200;
    set src(_value: string) { window.queueMicrotask(() => this.onload?.()); }
    decode = async () => {};
  });
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: vi.fn(() => 'blob:healthy'),
    revokeObjectURL: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('skips a missing current photo and displays the healthy next photo', async () => {
  vi.mocked(invoke).mockResolvedValue(['/missing.jpg', '/healthy.jpg']);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('missing')
    ? { ok: false, status: 404, statusText: 'Not Found' }
    : { ok: true, blob: async () => new Blob(['image']) }));
  const { result } = renderHook(() => usePhotoSlideshow({ folderPath: '/photos', smartCrop: false }));
  await waitFor(() => expect(result.current.currentImage).toBe('/healthy.jpg'));
  await waitFor(() => expect(result.current.currentBlobUrl).toBe('blob:healthy'));
  expect(result.current.error).toBeNull();
});

it('reports an error after every listed photo fails', async () => {
  vi.mocked(invoke).mockResolvedValue(['/missing-a.jpg', '/missing-b.jpg']);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));
  const { result } = renderHook(() => usePhotoSlideshow({ folderPath: '/photos', smartCrop: false }));
  await waitFor(() => expect(result.current.error).toContain('None of the slideshow media'));
});
