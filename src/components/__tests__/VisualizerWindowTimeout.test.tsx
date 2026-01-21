import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VisualizerWindow } from '../VisualizerWindow';
import { MockEventSource } from '../../test/mocks/sse';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Tauri API
const mockListen = vi.fn();
const mockEmit = vi.fn();
const mockInvoke = vi.fn();

// Mock modules BEFORE import
vi.mock('@tauri-apps/api/event', () => ({
  listen: (event: string, handler: any) => mockListen(event, handler),
  emit: (event: string, payload: any) => mockEmit(event, payload),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args: any) => mockInvoke(cmd, args),
}));

describe('VisualizerWindow Timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    MockEventSource.reset();
    vi.useFakeTimers();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    mockListen.mockResolvedValue(() => {});
    mockInvoke.mockResolvedValue({ port: 8080 }); // Default
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('falls back to defaults if SSE times out', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<VisualizerWindow />);

    // Fast-forward time by 2.1 seconds
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SSE connection timed out')
    );

    consoleWarnSpy.mockRestore();
  });
});
