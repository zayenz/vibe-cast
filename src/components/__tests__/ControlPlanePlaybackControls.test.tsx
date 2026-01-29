import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('ControlPlane Playback Controls Enhancement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  it('shows stop button when message is playing from Control Plane', async () => {
    renderControlPlane();
    
    // Simulate SSE connection and state with playing message
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        enabledVisualizations: ['fireplace'],
        commonSettings: { intensity: 1.0, dim: 1.0 },
        messages: [{ id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' }],
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
    });

    await waitFor(() => {
      // Should show stop button (square icon) for the playing message
      const stopButton = screen.getByTitle(/Stop message.*Control Plane/);
      expect(stopButton).toBeInTheDocument();
      
      // Should show "Playing" indicator
      expect(screen.getByText('Playing')).toBeInTheDocument();
    });
  });

  it('shows stop button when message is playing from Mobile Remote', async () => {
    renderControlPlane();
    
    // Simulate SSE connection and state with message started from mobile
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        enabledVisualizations: ['fireplace'],
        commonSettings: { intensity: 1.0, dim: 1.0 },
        messages: [{ id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' }],
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
    });

    await waitFor(() => {
      // Should show stop button with mobile remote indication
      const stopButton = screen.getByTitle(/Stop message.*Mobile Remote/);
      expect(stopButton).toBeInTheDocument();
      
      // Should show mobile remote indicator (📱)
      expect(screen.getByText('📱')).toBeInTheDocument();
    });
  });

  it('disables play button when another message is playing', async () => {
    renderControlPlane();
    
    // Simulate SSE connection and state with one message playing
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        enabledVisualizations: ['fireplace'],
        commonSettings: { intensity: 1.0, dim: 1.0 },
        messages: [
          { id: 'msg1', text: 'Playing Message', textStyle: 'scrolling-capitals' },
          { id: 'msg2', text: 'Other Message', textStyle: 'scrolling-capitals' }
        ],
        playbackControl: {
          sessionId: 'session1',
          currentMessage: { id: 'msg1', title: 'Playing Message' },
          isPlaying: true,
          playbackPosition: 0,
          canStop: true,
          canStart: false,
          initiatedBy: 'control_plane',
          lastUpdated: Date.now(),
        },
        defaultTextStyle: 'scrolling-capitals',
      });
    });

    await waitFor(() => {
      // The non-playing message should have disabled play button
      const otherMessageButtons = screen.getAllByTitle('Another message is playing');
      expect(otherMessageButtons.length).toBeGreaterThan(0);
      
      // The playing message should have stop button
      const stopButton = screen.getByTitle(/Stop message.*Control Plane/);
      expect(stopButton).toBeInTheDocument();
    });
  });

  it('sends start-message command when play button is clicked', async () => {
    renderControlPlane();
    
    // Simulate SSE connection and idle state
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        enabledVisualizations: ['fireplace'],
        commonSettings: { intensity: 1.0, dim: 1.0 },
        messages: [{ id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' }],
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
    });

    await waitFor(() => {
      // Click the play button
      const playButton = screen.getByTitle('Play message');
      fireEvent.click(playButton);
    });

    // Should send start-message command
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/command',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('start-message'),
        })
      );
    });
  });

  it('sends stop-message command when stop button is clicked', async () => {
    renderControlPlane();
    
    // Simulate SSE connection and playing state
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        enabledVisualizations: ['fireplace'],
        commonSettings: { intensity: 1.0, dim: 1.0 },
        messages: [{ id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' }],
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
    });

    await waitFor(() => {
      // Click the stop button
      const stopButton = screen.getByTitle(/Stop message.*Control Plane/);
      fireEvent.click(stopButton);
    });

    // Should send stop-message command
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/command',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('stop-message'),
        })
      );
    });
  });

  it('shows global playback status in header when message is playing', async () => {
    renderControlPlane();
    
    // Simulate SSE connection and playing state
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        enabledVisualizations: ['fireplace'],
        commonSettings: { intensity: 1.0, dim: 1.0 },
        messages: [{ id: 'msg1', text: 'Test Message', textStyle: 'scrolling-capitals' }],
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
    });

    await waitFor(() => {
      // Should show global playback status
      expect(screen.getByText(/Playing: Test Message/)).toBeInTheDocument();
      
      // Should show mobile remote indicator in header
      const headerMobileIndicators = screen.getAllByText('📱');
      expect(headerMobileIndicators.length).toBeGreaterThan(0);
    });
  });
});