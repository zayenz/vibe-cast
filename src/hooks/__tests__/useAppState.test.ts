import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppState, useSendCommand } from '../useAppState';
import { MockEventSource } from '../../test/mocks/sse';

describe('useAppState', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    MockEventSource.reset();
    global.fetch = mockFetch;
    mockFetch.mockImplementation(() => new Promise(() => {}));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('starts in loading state', () => {
    const { result } = renderHook(() => useAppState());
    
    expect(result.current.state).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.connectionPhase).toBe('connecting');
    expect(result.current.hydrationSource).toBeNull();
  });

  it('connects to SSE and receives initial state', async () => {
    const { result } = renderHook(() => useAppState());
    
    // Advance past the 500ms initial delay so EventSource is created
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    // Advance past MockEventSource's setTimeout(0) for onopen
    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const sse = MockEventSource.getLatest();
    expect(sse).toBeDefined();
    // In jsdom, window.location.origin is 'http://localhost:3000', so the SSE URL includes the origin
    expect(sse?.url).toContain('http://localhost:3000/api/events?');
    expect(sse?.url).toContain('clientId=');
    expect(sse?.url).toContain('sessionStartMs=');

    // Simulate receiving state
    await act(async () => {
      sse?.simulateEvent('state', {
        mode: 'fireplace',
        messages: ['Hello', 'World'],
      });
    });

    await waitFor(() => {
      // Legacy SSE format: messages arrive as strings but are normalized to MessageConfig[]
      expect(result.current.state).toEqual(expect.objectContaining({
        mode: 'fireplace',
        activeVisualization: 'fireplace',
        messages: [
          { id: '0', text: 'Hello', textStyle: 'scrolling-capitals' },
          { id: '1', text: 'World', textStyle: 'scrolling-capitals' },
        ],
      }));
      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectionPhase).toBe('live');
      expect(result.current.hydrationSource).toBe('sse');
    });
  });

  it('updates state when new SSE events arrive', async () => {
    const { result } = renderHook(() => useAppState());
    
    // Advance past the 500ms initial delay + onopen
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: [] });
    });

    await waitFor(() => {
      expect(result.current.state?.mode).toBe('fireplace');
    });

    // Simulate another state update
    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'techno', messages: ['New'] });
    });

    await waitFor(() => {
      expect(result.current.state?.mode).toBe('techno');
      expect(result.current.state?.messages).toEqual([
        { id: '0', text: 'New', textStyle: 'scrolling-capitals' },
      ]);
    });
  });

  it('applies active preset updates from command events before full state broadcast', async () => {
    const { result } = renderHook(() => useAppState());

    await act(async () => {
      vi.advanceTimersByTime(600);
      vi.advanceTimersByTime(10);
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        visualizationPresets: [
          { id: 'preset-1', name: 'Fireplace Default', visualizationId: 'fireplace', settings: {}, enabled: true },
          { id: 'preset-2', name: 'Techno Default', visualizationId: 'techno', settings: {}, enabled: true },
        ],
        activeVisualizationPreset: 'preset-1',
        messages: [],
        commonSettings: { intensity: 1.0, dim: 1.0 },
        textStyleSettings: {},
      });
    });

    await waitFor(() => {
      expect(result.current.state?.activeVisualizationPreset).toBe('preset-1');
      expect(result.current.state?.activeVisualization).toBe('fireplace');
    });

    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('command', {
        command: 'set-active-visualization-preset',
        payload: 'preset-2',
      });
    });

    await waitFor(() => {
      expect(result.current.state?.activeVisualizationPreset).toBe('preset-2');
      expect(result.current.state?.activeVisualization).toBe('techno');
    });
  });

  it('handles connection errors and attempts reconnect', async () => {
    const { result } = renderHook(() => useAppState());
    
    // Advance past the 500ms initial delay + onopen
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });

    const initialSse = MockEventSource.getLatest();
    expect(initialSse).toBeDefined();
    
    // Simulate error
    await act(async () => {
      initialSse?.simulateError();
    });

    expect(result.current.isConnected).toBe(false);

    // Advance time to trigger reconnect
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    // A new SSE instance should be created
    expect(MockEventSource.instances.length).toBeGreaterThan(0);
  });

  it('uses custom API base when provided', async () => {
    renderHook(() => useAppState({ apiBase: 'http://127.0.0.1:8080' }));
    
    // Advance past the 500ms initial delay so EventSource is created
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // Verify EventSource was created with correct URL
    const sse = MockEventSource.instances[0];
    expect(sse).toBeDefined();
    expect(sse?.url).toContain('http://127.0.0.1:8080/api/events?');
  });

  it('requests compact browser snapshots while waiting for SSE state', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'fireplace', messages: ['Compact'] }),
    });

    renderHook(() => useAppState());

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/state?compact=1',
      expect.objectContaining({
        cache: 'no-store',
      }),
    );
  });

  it('omits compact query parameters for Tauri windows', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'fireplace', messages: ['Desktop'] }),
    });

    renderHook(() => useAppState({ apiBase: 'http://127.0.0.1:8091' }));

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    const sse = MockEventSource.getLatest();
    expect(sse?.url).toContain('http://127.0.0.1:8091/api/events?');
    expect(sse?.url).not.toContain('compact=1');

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8091/api/state',
      expect.objectContaining({
        cache: 'no-store',
      }),
    );
  });

  it('cleans up SSE connection on unmount', async () => {
    const { unmount } = renderHook(() => useAppState());
    
    // Advance past the 500ms initial delay so EventSource is created
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    const sse = MockEventSource.getLatest();
    expect(sse).toBeDefined();
    
    unmount();
    
    // SSE should be closed
    expect(sse?.readyState).toBe(2); // CLOSED
  });

  it('handles triggeredMessage in state', async () => {
    const { result } = renderHook(() => useAppState());
    
    // Advance past the 500ms initial delay + onopen
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        enabledVisualizations: ['fireplace', 'techno'],
        commonSettings: { intensity: 1.0, dim: 1.0 },
        visualizationSettings: {},
        messages: [{ id: '1', text: 'Hello', textStyle: 'scrolling-capitals' }],
        triggeredMessage: { id: '1', text: 'Hello', textStyle: 'scrolling-capitals' },
        defaultTextStyle: 'scrolling-capitals',
        textStyleSettings: {},
      });
    });

    await waitFor(() => {
      expect(result.current.state?.triggeredMessage?.text).toBe('Hello');
    });
  });

  it('bootstraps state when SSE is slow', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'fireplace', messages: ['Hello'] }),
    });

    const { result } = renderHook(() => useAppState());

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.state?.activeVisualization).toBe('fireplace');
      expect(result.current.state?.messages).toEqual([
        { id: '0', text: 'Hello', textStyle: 'scrolling-capitals' },
      ]);
      expect(result.current.connectionPhase).toBe('degraded');
      expect(result.current.hydrationSource).toBe('bootstrap');
    });
  });

  it('enters degraded phase after 2 seconds without state', async () => {
    const { result } = renderHook(() => useAppState());

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    await waitFor(() => {
      expect(result.current.connectionPhase).toBe('degraded');
      expect(result.current.state).toBeNull();
    });
  });

  it('transitions from degraded to live when first SSE state arrives', async () => {
    const { result } = renderHook(() => useAppState());

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(result.current.connectionPhase).toBe('degraded');

    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'techno', messages: ['Recovered'] });
    });

    await waitFor(() => {
      expect(result.current.connectionPhase).toBe('live');
      expect(result.current.hydrationSource).toBe('sse');
      expect(result.current.state?.messages).toEqual([
        { id: '0', text: 'Recovered', textStyle: 'scrolling-capitals' },
      ]);
    });
  });

  it('retries bootstrap fetch when early requests fail', async () => {
    mockFetch.mockRejectedValue(new Error('Temporary network failure'));

    renderHook(() => useAppState());

    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
    }

    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('starts fallback polling when SSE state is unavailable', async () => {
    mockFetch.mockRejectedValue(new Error('State endpoint temporarily unavailable'));

    renderHook(() => useAppState());

    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
    }

    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('does not override SSE state with bootstrap fetch', async () => {
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ mode: 'fireplace', messages: ['Bootstrap'] }),
            });
          }, 1000);
        })
    );

    const { result } = renderHook(() => useAppState());

    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'techno', messages: ['SSE'] });
    });

    await waitFor(() => {
      expect(result.current.state?.mode).toBe('techno');
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(result.current.state?.mode).toBe('techno');
      expect(result.current.state?.messages).toEqual([
        { id: '0', text: 'SSE', textStyle: 'scrolling-capitals' },
      ]);
    });
  });
});

describe('useSendCommand', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
  });

  it('sends command to API', async () => {
    const { result } = renderHook(() => useSendCommand());
    
    await act(async () => {
      await result.current.sendCommand('set-mode', 'techno');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/command',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'set-mode', payload: 'techno', deviceType: 'mobile_remote' }),
      })
    );
  });

  it('uses custom API base', async () => {
    const { result } = renderHook(() => 
      useSendCommand({ apiBase: 'http://127.0.0.1:8080' })
    );
    
    await act(async () => {
      await result.current.sendCommand('set-mode', 'techno');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/api/command',
      expect.anything()
    );
  });

  it('tracks pending state', async () => {
    mockFetch.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { ok: true, json: async () => ({ status: 'ok' }) };
    });

    const { result } = renderHook(() => useSendCommand());
    
    expect(result.current.isPending).toBe(false);
    
    let commandPromise: Promise<unknown>;
    act(() => {
      commandPromise = result.current.sendCommand('set-mode', 'techno');
    });

    // Should be pending immediately after call
    expect(result.current.isPending).toBe(true);
    
    await act(async () => {
      await commandPromise;
    });

    expect(result.current.isPending).toBe(false);
  });

  it('returns response data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', data: 'test' }),
    });

    const { result } = renderHook(() => useSendCommand());
    
    let response: unknown;
    await act(async () => {
      response = await result.current.sendCommand('test', null);
    });

    expect(response).toEqual({ status: 'ok', data: 'test' });
  });
});
