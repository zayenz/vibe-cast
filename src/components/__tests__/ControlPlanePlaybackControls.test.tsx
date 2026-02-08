import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ControlPlane } from '../ControlPlane';
import { MockEventSource } from '../../test/mocks/sse';
import { commandAction } from '../../router';

// Mock fetch for command sending
const mockFetch = vi.fn();
global.fetch = mockFetch;

function renderControlPlane() {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <ControlPlane />,
      action: commandAction,
    },
  ]);

  return render(<RouterProvider router={router} />);
}

/**
 * Helper to render the ControlPlane, advance timers so the SSE connection is
 * established, and inject a state event.  Returns the MockEventSource instance.
 */
async function renderAndInjectState(stateData: Record<string, unknown>) {
  renderControlPlane();

  // Advance past the 500ms initial delay in useAppState so EventSource is created
  await act(async () => {
    vi.advanceTimersByTime(600);
  });

  const sse = MockEventSource.getLatest();
  expect(sse).toBeDefined();

  // Fire open callback if not already called (the MockEventSource schedules it in
  // a setTimeout(0) which may not have been flushed yet)
  await act(async () => {
    vi.advanceTimersByTime(10);
  });

  // Inject the state event so the component renders with data
  await act(async () => {
    sse!.simulateEvent('state', stateData);
  });

  return sse!;
}

describe('ControlPlane Playback Controls Enhancement', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    MockEventSource.reset();

    // Simulate Tauri environment so useSendCommand sends deviceType: 'control_plane'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__TAURI_INTERNALS__ = {};

    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/command') && options?.method === 'POST') {
        return { ok: true, json: async () => ({ status: 'ok' }) };
      }
      // Return a valid response for server-info check (invoke fallback)
      return { ok: false, status: 404, json: async () => ({}) };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('shows stop button when message is playing from Control Plane', async () => {
    await renderAndInjectState({
      activeVisualization: 'fireplace',
      enabledVisualizations: ['fireplace'],
      commonSettings: { intensity: 1.0, dim: 1.0 },
      messages: [{ id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' }],
      messageTree: [{ type: 'message', message: { id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' } }],
      playbackControl: {
        sessionId: 'session1',
        currentMessage: { id: 'msg1', title: 'Test Message' },
        isPlaying: true,
        playbackPosition: 0,
        canStop: true,
        canStart: false,
        initiatedBy: 'control_plane',
        lastUpdated: Date.now(),
      },
      defaultTextStyle: 'scrolling-capitals',
    });

    await waitFor(() => {
      // Should show stop button(s) for the playing message
      const stopButtons = screen.getAllByTitle(/Stop message.*Control Plane/);
      expect(stopButtons.length).toBeGreaterThan(0);

      // Should show "Playing" indicator
      expect(screen.getByText('Playing')).toBeInTheDocument();
    });
  });

  it('shows stop button when message is playing from Mobile Remote', async () => {
    await renderAndInjectState({
      activeVisualization: 'fireplace',
      enabledVisualizations: ['fireplace'],
      commonSettings: { intensity: 1.0, dim: 1.0 },
      messages: [{ id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' }],
      messageTree: [{ type: 'message', message: { id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' } }],
      playbackControl: {
        sessionId: 'session1',
        currentMessage: { id: 'msg1', title: 'Test Message' },
        isPlaying: true,
        playbackPosition: 0,
        canStop: true,
        canStart: false,
        initiatedBy: 'mobile_remote',
        lastUpdated: Date.now(),
      },
      defaultTextStyle: 'scrolling-capitals',
    });

    await waitFor(() => {
      // Should show stop button(s) with mobile remote indication
      const stopButtons = screen.getAllByTitle(/Stop message.*Mobile Remote/);
      expect(stopButtons.length).toBeGreaterThan(0);
    });
  });

  it('sends trigger-message command via HTTP when play button is clicked', async () => {
    await renderAndInjectState({
      activeVisualization: 'fireplace',
      enabledVisualizations: ['fireplace'],
      commonSettings: { intensity: 1.0, dim: 1.0 },
      messages: [{ id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' }],
      messageTree: [{ type: 'message', message: { id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' } }],
      playbackControl: {
        sessionId: null,
        currentMessage: null,
        isPlaying: false,
        playbackPosition: 0,
        canStop: false,
        canStart: true,
        initiatedBy: 'system',
        lastUpdated: Date.now(),
      },
      defaultTextStyle: 'scrolling-capitals',
    });

    await waitFor(() => {
      expect(screen.getAllByTitle('Play message').length).toBeGreaterThan(0);
    });

    // Click the first play button
    fireEvent.click(screen.getAllByTitle('Play message')[0]);

    // Should send trigger-message command via HTTP (not Tauri invoke)
    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const triggerCall = calls.find(
        (call: any[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('/api/command') &&
          call[1]?.method === 'POST' &&
          typeof call[1]?.body === 'string' &&
          call[1].body.includes('"trigger-message"')
      );
      expect(triggerCall).toBeDefined();

      // Verify the body contains the message payload and deviceType
      const body = JSON.parse(triggerCall![1].body as string);
      expect(body.command).toBe('trigger-message');
      expect(body.deviceType).toBe('control_plane');
    });
  });

  it('sends stop-message command via HTTP when stop button is clicked', async () => {
    await renderAndInjectState({
      activeVisualization: 'fireplace',
      enabledVisualizations: ['fireplace'],
      commonSettings: { intensity: 1.0, dim: 1.0 },
      messages: [{ id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' }],
      messageTree: [{ type: 'message', message: { id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' } }],
      playbackControl: {
        sessionId: 'session1',
        currentMessage: { id: 'msg1', title: 'Test Message' },
        isPlaying: true,
        playbackPosition: 0,
        canStop: true,
        canStart: false,
        initiatedBy: 'control_plane',
        lastUpdated: Date.now(),
      },
      defaultTextStyle: 'scrolling-capitals',
    });

    await waitFor(() => {
      expect(screen.getAllByTitle(/Stop message.*Control Plane/).length).toBeGreaterThan(0);
    });

    // Click the first stop button
    fireEvent.click(screen.getAllByTitle(/Stop message.*Control Plane/)[0]);

    // Should send stop-message command via HTTP
    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stopCall = calls.find(
        (call: any[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('/api/command') &&
          call[1]?.method === 'POST' &&
          typeof call[1]?.body === 'string' &&
          call[1].body.includes('"stop-message"')
      );
      expect(stopCall).toBeDefined();

      // Verify the body contains deviceType
      const body = JSON.parse(stopCall![1].body as string);
      expect(body.command).toBe('stop-message');
      expect(body.deviceType).toBe('control_plane');
    });
  });

  it('shows global playback status in header when message is playing', async () => {
    await renderAndInjectState({
      activeVisualization: 'fireplace',
      enabledVisualizations: ['fireplace'],
      commonSettings: { intensity: 1.0, dim: 1.0 },
      messages: [{ id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' }],
      messageTree: [{ type: 'message', message: { id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' } }],
      playbackControl: {
        sessionId: 'session1',
        currentMessage: { id: 'msg1', title: 'Test Message' },
        isPlaying: true,
        playbackPosition: 0,
        canStop: true,
        canStart: false,
        initiatedBy: 'mobile_remote',
        lastUpdated: Date.now(),
      },
      defaultTextStyle: 'scrolling-capitals',
    });

    await waitFor(() => {
      // Should show global playback status
      expect(screen.getByText(/Playing: Test Message/)).toBeInTheDocument();
    });
  });
});
