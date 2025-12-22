import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ControlPlane } from '../ControlPlane';
import { MockEventSource } from '../../test/mocks/sse';
import { commandAction } from '../../router';

// Mock fetch for command submissions
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

describe('ControlPlane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.reset();
    
    // Default mock for fetch
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.includes('/api/command') && options?.method === 'POST') {
        return { ok: true, json: async () => ({ status: 'ok' }) };
      }
      return { ok: false, status: 404 };
    });
  });

  it('shows loading state initially', () => {
    renderControlPlane();
    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
  });

  it('renders correctly after SSE connects', async () => {
    renderControlPlane();
    
    // Simulate SSE connection and initial state
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        mode: 'fireplace',
        messages: ['Test Message'],
      });
    });

    await waitFor(() => {
      expect(screen.getByText('VIBECAST')).toBeInTheDocument();
    });
    
    // Visualization selection is now preset-based (defaults are created from plugin registry)
    expect(screen.getByText('Fireplace Default')).toBeInTheDocument();
    expect(screen.getByText('Techno Default')).toBeInTheDocument();
    expect(screen.getByText('Test Message')).toBeInTheDocument();
  });

  it('shows connection status indicator', async () => {
    renderControlPlane();
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: [] });
    });

    await waitFor(() => {
      expect(screen.getByText('System Active')).toBeInTheDocument();
    });
  });

  it('sends set-active-visualization-preset command when a preset card is clicked', async () => {
    renderControlPlane();
    
    // Wait for SSE to connect and send initial state
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: [] });
    });

    await waitFor(() => {
      expect(screen.getByText('Techno Default')).toBeInTheDocument();
    });
    
    const technoPresetCard = screen.getByText('Techno Default').closest('button');
    fireEvent.click(technoPresetCard!);
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/command'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('set-active-visualization-preset'),
        })
      );
    });
  });

  it('sends trigger-message command when a message is clicked', async () => {
    renderControlPlane();
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: ['Hello World'] });
    });

    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });
    
    const messageButton = screen.getByText('Hello World').closest('button');
    fireEvent.click(messageButton!);
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/command'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('trigger-message'),
        })
      );
    });
  });

  it('renders folder counts (triggered/total) and sends reset-message-stats command', async () => {
    renderControlPlane();

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        enabledVisualizations: ['fireplace', 'techno'],
        commonSettings: { intensity: 1.0, dim: 1.0 },
        visualizationSettings: {},
        visualizationPresets: [],
        activeVisualizationPreset: null,
        messages: [
          { id: 'm1', text: 'A', textStyle: 'scrolling-capitals' },
          { id: 'm2', text: 'B', textStyle: 'scrolling-capitals' },
        ],
        messageTree: [
          {
            type: 'folder',
            id: 'f1',
            name: 'Folder',
            collapsed: false,
            children: [
              { type: 'message', id: 'm1', message: { id: 'm1', text: 'A', textStyle: 'scrolling-capitals' } },
              { type: 'message', id: 'm2', message: { id: 'm2', text: 'B', textStyle: 'scrolling-capitals' } },
            ],
          },
        ],
        defaultTextStyle: 'scrolling-capitals',
        textStyleSettings: {},
        textStylePresets: [],
        messageStats: {
          m1: { messageId: 'm1', triggerCount: 1, lastTriggered: 1, history: [{ timestamp: 1 }] },
          m2: { messageId: 'm2', triggerCount: 0, lastTriggered: 0, history: [] },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Folder')).toBeInTheDocument();
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Reset all message counts'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/command'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('reset-message-stats'),
        })
      );
    });
  });

  it('updates when SSE receives new state', async () => {
    renderControlPlane();
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: ['Initial'] });
    });

    await waitFor(() => {
      expect(screen.getByText('Initial')).toBeInTheDocument();
    });

    // Simulate mode change from SSE
    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'techno', messages: ['Initial', 'New Message'] });
    });

    await waitFor(() => {
      expect(screen.getByText('New Message')).toBeInTheDocument();
    });
  });

  it('handles state transitions from null to object with messageStats without crashing', async () => {
    // This test specifically protects against the prevDeps.length error
    // by ensuring the component handles state transitions correctly
    renderControlPlane();
    
    // Initially state is null - component should render loading state
    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
    
    // Simulate SSE connection with state that has messageStats
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        messages: [{ id: '1', text: 'Test', textStyle: 'scrolling-capitals' }],
        messageStats: {
          '1': {
            messageId: '1',
            triggerCount: 0,
            lastTriggered: 0,
            history: []
          }
        }
      });
    });

    // Component should render without crashing (no prevDeps.length error)
    await waitFor(() => {
      expect(screen.getByText('VIBECAST')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Update state with new messageStats - should not crash
    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        messages: [{ id: '1', text: 'Test', textStyle: 'scrolling-capitals' }],
        messageStats: {
          '1': {
            messageId: '1',
            triggerCount: 1,
            lastTriggered: Date.now(),
            history: [{ timestamp: Date.now() }]
          }
        }
      });
    });

    // Component should still render without errors
    await waitFor(() => {
      expect(screen.getByText('VIBECAST')).toBeInTheDocument();
    });
  });

  it('handles state with undefined messageStats without crashing', async () => {
    // Test that component handles state where messageStats is undefined
    renderControlPlane();
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      // State without messageStats
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        messages: [{ id: '1', text: 'Test', textStyle: 'scrolling-capitals' }]
        // messageStats is intentionally omitted
      });
    });

    // Component should render without crashing
    await waitFor(() => {
      expect(screen.getByText('VIBECAST')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('prevents prevDeps.length error by ensuring hooks are called in consistent order', async () => {
    // This test specifically protects against the "prevDeps.length is undefined" error
    // by ensuring hooks are always called in the same order, even when state changes
    renderControlPlane();
    
    // Initially state is null - all hooks should be called, loading screen shown
    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
    
    // Simulate multiple state transitions to ensure hook order consistency
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        messages: [],
        messageStats: {}
      });
    });

    // Component should render without crashing (no prevDeps.length error)
    await waitFor(() => {
      expect(screen.getByText('VIBECAST')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Simulate another state update - should not crash
    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'techno',
        messages: [{ id: '1', text: 'Test', textStyle: 'scrolling-capitals' }],
        messageStats: {
          '1': {
            messageId: '1',
            triggerCount: 1,
            lastTriggered: Date.now(),
            history: [{ timestamp: Date.now() }]
          }
        }
      });
    });

    // Component should still render without errors
    await waitFor(() => {
      expect(screen.getByText('VIBECAST')).toBeInTheDocument();
    });
  });
});
