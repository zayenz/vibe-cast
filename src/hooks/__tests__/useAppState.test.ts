import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppState, useSendCommand } from '../useAppState';
import { MockEventSource } from '../../test/mocks/sse';

describe('useAppState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.reset();
  });

  it('starts in loading state', () => {
    const { result } = renderHook(() => useAppState());
    
    expect(result.current.state).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('connects to SSE and receives initial state', async () => {
    const { result } = renderHook(() => useAppState());
    
    // Wait for EventSource to be created
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    const sse = MockEventSource.getLatest();
    expect(sse).toBeDefined();
    expect(sse?.url).toBe('/api/events');

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
    });
  });

  it('updates state when new SSE events arrive', async () => {
    const { result } = renderHook(() => useAppState());
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
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

  it('handles connection errors and attempts reconnect', async () => {
    vi.useFakeTimers();
    
    const { result } = renderHook(() => useAppState());
    
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const initialSse = MockEventSource.getLatest();
    
    // Simulate error
    await act(async () => {
      initialSse?.simulateError();
    });

    expect(result.current.isConnected).toBe(false);

    // Advance time to trigger reconnect
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    // A new SSE instance should be created
    expect(MockEventSource.instances.length).toBeGreaterThan(0);
    
    vi.useRealTimers();
  });

  it('uses custom API base when provided', async () => {
    renderHook(() => 
      useAppState({ apiBase: 'http://localhost:8080' })
    );
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    const sse = MockEventSource.getLatest();
    expect(sse?.url).toBe('http://localhost:8080/api/events');
  });

  it('cleans up SSE connection on unmount', async () => {
    const { unmount } = renderHook(() => useAppState());
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    const sse = MockEventSource.getLatest();
    expect(sse).toBeDefined();
    
    unmount();
    
    // SSE should be closed
    expect(sse?.readyState).toBe(2); // CLOSED
  });

  it('handles triggeredMessage in state', async () => {
    const { result } = renderHook(() => useAppState());
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
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
        body: JSON.stringify({ command: 'set-mode', payload: 'techno' }),
      })
    );
  });

  it('uses custom API base', async () => {
    const { result } = renderHook(() => 
      useSendCommand({ apiBase: 'http://localhost:8080' })
    );
    
    await act(async () => {
      await result.current.sendCommand('set-mode', 'techno');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/command',
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

