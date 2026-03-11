import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteControl } from '../RemoteControl';
import { MockEventSource } from '../../test/mocks/sse';

// Mock fetch for command submissions
const mockFetch = vi.fn();
global.fetch = mockFetch;

function renderRemoteControl() {
  return render(<RemoteControl />);
}

// Helper to create mock state with presets (include playbackControl/messageTree so RemoteControl has full state shape)
const createMockState = (overrides: Record<string, unknown> = {}) => ({
  activeVisualization: 'fireplace',
  visualizationPresets: [
    { id: 'preset-1', name: 'Fireplace Default', visualizationId: 'fireplace', settings: {}, enabled: true },
    { id: 'preset-2', name: 'Techno Default', visualizationId: 'techno', settings: {}, enabled: true },
  ],
  activeVisualizationPreset: null,
  commonSettings: { intensity: 1.0, dim: 1.0 },
  messages: [],
  messageTree: [],
  triggeredMessage: null,
  folderPlaybackQueue: null,
  playbackControl: null,
  ...overrides,
});

describe('RemoteControl', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loading state initially', () => {
    renderRemoteControl();
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('exits blocking loader after 2 seconds even without state', async () => {
    renderRemoteControl();

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    await waitFor(() => {
      expect(screen.getByText('Remote')).toBeInTheDocument();
      expect(screen.queryByText('Connecting...')).not.toBeInTheDocument();
      expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
    });
  });

  it('renders correctly after SSE connects', async () => {
    renderRemoteControl();
    
    await act(async () => {
      vi.advanceTimersByTime(600);
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', createMockState({
        messages: [{ id: '1', text: 'Test Message', textStyle: 'scrolling-capitals' }],
      }));
    });

    await waitFor(() => {
      expect(screen.getByText('Remote')).toBeInTheDocument();
    });
    
    // Visualizations are driven by presets now
    expect(screen.getByText('Fireplace Default')).toBeInTheDocument();
    expect(screen.getByText('Techno Default')).toBeInTheDocument();
    expect(screen.getByText('Test Message')).toBeInTheDocument();
  });

  it('shows live connection indicator when connected', async () => {
    renderRemoteControl();
    
    await act(async () => {
      vi.advanceTimersByTime(600);
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', createMockState());
    });

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });
  });

  it('sends set-active-visualization-preset command when a preset button is clicked', async () => {
    renderRemoteControl();
    
    await act(async () => {
      vi.advanceTimersByTime(600);
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', createMockState());
    });

    await waitFor(() => {
      expect(screen.getByText('Techno Default')).toBeInTheDocument();
    });
    
    const technoButton = screen.getByText('Techno Default').closest('button');
    fireEvent.click(technoButton!);
    
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

  it('keeps optimistic highlight while waiting for SSE confirmation', async () => {
    renderRemoteControl();

    await act(async () => {
      vi.advanceTimersByTime(600);
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', createMockState({ activeVisualizationPreset: 'preset-1' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Techno Default')).toBeInTheDocument();
    });

    const fireplaceButton = screen.getByText('Fireplace Default').closest('button');
    const technoButton = screen.getByText('Techno Default').closest('button');
    expect(fireplaceButton?.className).toContain('bg-orange-500');
    expect(technoButton?.className).not.toContain('bg-orange-500');

    fireEvent.click(technoButton!);

    // Optimistic highlight should apply immediately.
    expect(technoButton?.className).toContain('bg-orange-500');

    // Without SSE confirmation, optimistic highlight should remain.
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });

    await waitFor(() => {
      expect(technoButton?.className).toContain('bg-orange-500');
      expect(fireplaceButton?.className).not.toContain('bg-orange-500');
    });
  });

  it('sends trigger-message command when a message button is clicked', async () => {
    renderRemoteControl();
    
    await act(async () => {
      vi.advanceTimersByTime(600);
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', createMockState({
        messages: [{ id: '1', text: 'Hello World', textStyle: 'scrolling-capitals' }],
      }));
    });

    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });
    
    const messageButton = screen.getByText('Hello World');
    fireEvent.click(messageButton);
    
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

  it('updates UI when SSE receives new state', async () => {
    renderRemoteControl();
    
    await act(async () => {
      vi.advanceTimersByTime(600);
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', createMockState({
        messages: [{ id: '1', text: 'Initial', textStyle: 'scrolling-capitals' }],
      }));
    });

    await waitFor(() => {
      expect(screen.getByText('Initial')).toBeInTheDocument();
    });

    // Simulate state update from SSE (e.g., from another client changing mode)
    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', createMockState({
        activeVisualization: 'techno',
        messages: [
          { id: '1', text: 'Initial', textStyle: 'scrolling-capitals' },
          { id: '2', text: 'New Message', textStyle: 'scrolling-capitals' },
        ],
      }));
    });

    await waitFor(() => {
      expect(screen.getByText('New Message')).toBeInTheDocument();
    });
  });

  it('shows reconnecting status when SSE disconnects', async () => {
    renderRemoteControl();
    
    await act(async () => {
      vi.advanceTimersByTime(600);
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', createMockState());
    });

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    // Simulate SSE error/disconnect
    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateError();
    });

    await waitFor(() => {
      expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
    });
  });
});
