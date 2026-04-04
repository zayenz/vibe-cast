import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteControl } from '../RemoteControl';
import { MockEventSource } from '../../test/mocks/sse';

// Mock fetch for command submissions
const mockFetch = vi.fn();
global.fetch = mockFetch;
let bootstrapState: Record<string, unknown>;

function renderRemoteControl() {
  return render(<RemoteControl />);
}

async function connectRemoteSse(): Promise<MockEventSource> {
  await act(async () => {
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    await Promise.resolve();
  });

  const sse = MockEventSource.getLatest();
  expect(sse).toBeDefined();
  return sse!;
}

async function pushRemoteState(nextState: Record<string, unknown>): Promise<void> {
  const sse = await connectRemoteSse();
  await act(async () => {
    sse.simulateEvent('state', nextState);
    await Promise.resolve();
  });
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
    bootstrapState = createMockState();
    
    // Default mock for fetch
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.includes('/api/remote/state')) {
        return { ok: true, json: async () => bootstrapState };
      }
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

  it('renders the remote shell after bootstrap hydration', async () => {
    renderRemoteControl();

    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    await waitFor(() => {
      expect(screen.getByText('Remote')).toBeInTheDocument();
      expect(screen.queryByText('Connecting...')).not.toBeInTheDocument();
      expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
    });
  });

  it('renders correctly after SSE connects', async () => {
    renderRemoteControl();

    await pushRemoteState(createMockState({
      messageTree: [
        { type: 'message', id: '1', message: { id: '1', text: 'Test Message', textStyle: 'scrolling-capitals' } },
      ],
    }));

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

    await pushRemoteState(createMockState());

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });
  });

  it('sends set-active-visualization-preset command when a preset button is clicked', async () => {
    renderRemoteControl();

    await pushRemoteState(createMockState());

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

    await pushRemoteState(createMockState({ activeVisualizationPreset: 'preset-1' }));

    await waitFor(() => {
      expect(screen.getByText('Techno Default')).toBeInTheDocument();
    });

    const fireplaceButton = screen.getByText('Fireplace Default').closest('button');
    const technoButton = screen.getByText('Techno Default').closest('button');
    await waitFor(() => {
      expect(fireplaceButton?.className).toContain('bg-orange-500');
      expect(technoButton?.className).not.toContain('bg-orange-500');
    });

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

    await pushRemoteState(createMockState({
      messageTree: [
        { type: 'message', id: '1', message: { id: '1', text: 'Hello World', textStyle: 'scrolling-capitals' } },
      ],
    }));

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

    await pushRemoteState(createMockState({
      messageTree: [
        { type: 'message', id: '1', message: { id: '1', text: 'Initial', textStyle: 'scrolling-capitals' } },
      ],
    }));

    await waitFor(() => {
      expect(screen.getByText('Initial')).toBeInTheDocument();
    });

    // Simulate state update from SSE (e.g., from another client changing mode)
    await pushRemoteState(createMockState({
      activeVisualization: 'techno',
      messageTree: [
        { type: 'message', id: '1', message: { id: '1', text: 'Initial', textStyle: 'scrolling-capitals' } },
        { type: 'message', id: '2', message: { id: '2', text: 'New Message', textStyle: 'scrolling-capitals' } },
      ],
    }));

    await waitFor(() => {
      expect(screen.getByText('New Message')).toBeInTheDocument();
    });
  });

  it('shows queued folder state without marking the first message as playing', async () => {
    renderRemoteControl();

    await pushRemoteState(createMockState({
      messageTree: [
        {
          type: 'folder',
          id: 'folder-1',
          name: 'Showtime',
          children: [
            { type: 'message', id: 'message-1', message: { id: 'message-1', text: 'First', textStyle: 'scrolling-capitals' } },
            { type: 'message', id: 'message-2', message: { id: 'message-2', text: 'Second', textStyle: 'scrolling-capitals' } },
          ],
        },
      ],
      folderPlaybackQueue: {
        folderId: 'folder-1',
        messageIds: ['message-1', 'message-2'],
        currentIndex: 0,
      },
      triggeredMessage: null,
      playbackControl: null,
    }));

    await waitFor(() => {
      const cancelButton = screen.getByTestId('folder-cancel-folder-1');
      expect(cancelButton).toBeInTheDocument();
      expect(cancelButton.parentElement?.textContent).toContain('Queued 1/2');
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.queryByTestId('message-stop-message-1')).not.toBeInTheDocument();
      expect(screen.queryAllByText('Playing')).toHaveLength(0);
    });
  });

  it('shows reconnecting status when SSE disconnects', async () => {
    renderRemoteControl();

    await pushRemoteState(createMockState());

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
