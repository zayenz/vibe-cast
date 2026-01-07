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
    vi.clearAllMocks();
    vi.resetModules();
    MockEventSource.reset();
    
    // Default fetch mock
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    // Default listen mock - returns a promise that resolves to an unlisten function
    mockListen.mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders without crashing and establishes SSE connection', async () => {
    render(<VisualizerWindow />);
    
    // Should attempt to listen to Tauri events
    await waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('audio-data', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('remote-command', expect.any(Function));
      expect(mockListen).toHaveBeenCalledWith('state-changed', expect.any(Function));
    });

    // Simulate SSE connection
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      // Should have tried to connect
      expect(sse).toBeDefined();
      
      // Send initial state
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
    // Note: We need to re-import MockEventSource too if it relies on side effects, 
    // but here we just need the component to use the new env.
    const { VisualizerWindow: VisualizerWindowProd } = await import('../VisualizerWindow');

    render(<VisualizerWindowProd />);

    // Check MockEventSource URL
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      // In production (DEV=false), API_BASE should be ''
      // So SSE URL should be '/api/events'
      expect(sse?.url).toBe('/api/events');
    });
  });

  it('uses absolute API path in Development mode', async () => {
    // Set DEV mode
    vi.stubEnv('DEV', true); 

    // Reset modules
    vi.resetModules();
    
    const { VisualizerWindow: VisualizerWindowDev } = await import('../VisualizerWindow');

    render(<VisualizerWindowDev />);

    // Check MockEventSource URL
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      // In dev (DEV=true), API_BASE should be 'http://localhost:8080'
      // So SSE URL should be 'http://localhost:8080/api/events'
      expect(sse?.url).toBe('http://localhost:8080/api/events');
    });
  });
});