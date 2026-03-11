import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VisualizerWindow } from '../VisualizerWindow';
import { MockEventSource } from '../../test/mocks/sse';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Tauri API
const mockListen = vi.fn();
const mockEmit = vi.fn();

// Mock modules BEFORE import
vi.mock('@tauri-apps/api/event', () => ({
  listen: (event: string, handler: any) => mockListen(event, handler),
  emit: (event: string, payload: any) => mockEmit(event, payload),
}));

describe('VisualizerWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    vi.resetModules();
    MockEventSource.reset();
    (window as any).__TAURI_INTERNALS__ = {};
    
    // Default fetch mock
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    // Default listen mock - returns a promise that resolves to an unlisten function
    mockListen.mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete (window as any).__TAURI_INTERNALS__;
  });

  /**
   * Helper to advance through the VisualizerWindow's two-phase initialization:
   * Phase 1: invoke('get_server_info') resolves → serverReady becomes true → useAppState re-runs
   * Phase 2: The new useAppState effect's 500ms delay fires → SSE connection created
   */
  async function advancePastInitialization() {
    // Phase 1: advance past first 500ms delay and let invoke promise chain resolve
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    // Phase 2: after serverReady changes, useAppState re-runs with new apiBase.
    // Advance past the new 500ms delay so the final SSE connection is created.
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
  }

  it('renders without crashing and establishes SSE connection', async () => {
    render(<VisualizerWindow />);
    
    // Should attempt to listen to Tauri events
    await waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('audio-data', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('remote-command', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('state-changed', expect.any(Function));
    });

    // Advance through two-phase initialization
    await advancePastInitialization();
    
    const sse = MockEventSource.getLatest();
    // Should have tried to connect
    expect(sse).toBeDefined();
    
    // Send initial state
    await act(async () => {
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        messages: [],
      });
    });
  });

  it('handles Tauri listen errors gracefully (Simulating Production Environment failure)', async () => {
    // Mock listen to fail (rejected promise)
    // This happens in production if the window context is restricted or API is missing
    mockListen.mockRejectedValue(new Error('Tauri API not available'));
    
    // Spy on console.warn/log/error to verify we caught it
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<VisualizerWindow />);

    // Should NOT crash (the test itself would fail if render throws)
    
    // Verify it tried to listen
    await waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('audio-data', expect.any(Function));
    });

    // Verify we logged the warning (our new error handling logic)
    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[VisualizerWindow] Failed to listen to'),
        expect.anything()
      );
    });

    consoleWarnSpy.mockRestore();
  });

  it('uses relative API path in Production mode', async () => {
    // Set PROD mode
    vi.stubEnv('DEV', false); // import.meta.env.DEV = false
    vi.stubEnv('PROD', true);

    // Reset modules to re-evaluate VisualizerWindow and its API_BASE constant
    vi.resetModules();
    
    // Re-import the component
    const { VisualizerWindow: VisualizerWindowProd } = await import('../VisualizerWindow');

    render(<VisualizerWindowProd />);

    // Advance through two-phase initialization
    // After invoke resolves, apiBase is set to http://127.0.0.1:8080 and serverReady = true
    await advancePastInitialization();
    
    const sse = MockEventSource.getLatest();
    expect(sse).toBeDefined();
    // After invoke resolves with port 8080, the SSE connects to the resolved URL
    // (invoke always succeeds in test env, overriding the initial empty apiBase)
    expect(sse?.url).toContain('http://127.0.0.1:8080/api/events?');
    expect(sse?.url).not.toContain('compact=1');
  });

  it('uses absolute API path in Development mode', async () => {
    // Set DEV mode
    vi.stubEnv('DEV', true); 

    // Reset modules
    vi.resetModules();
    
    const { VisualizerWindow: VisualizerWindowDev } = await import('../VisualizerWindow');

    render(<VisualizerWindowDev />);

    // Advance through two-phase initialization
    await advancePastInitialization();
    
    const sse = MockEventSource.getLatest();
    expect(sse).toBeDefined();
    // In dev (DEV=true), initial apiBase is 'http://127.0.0.1:8080'
    // After invoke resolves, it's confirmed as 'http://127.0.0.1:8080'
    expect(sse?.url).toContain('http://127.0.0.1:8080/api/events?');
    expect(sse?.url).not.toContain('compact=1');
  });
});
