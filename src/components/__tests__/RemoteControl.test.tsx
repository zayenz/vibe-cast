import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { RemoteControl } from '../RemoteControl';
import { MockEventSource } from '../../test/mocks/sse';
import { commandAction } from '../../router';

// Mock fetch for command submissions
const mockFetch = vi.fn();
global.fetch = mockFetch;

function renderRemoteControl() {
  const router = createMemoryRouter([
    {
      path: '/',
      element: <RemoteControl />,
      action: commandAction,
    },
  ]);

  return render(<RouterProvider router={router} />);
}

describe('RemoteControl', () => {
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
    renderRemoteControl();
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('renders correctly after SSE connects', async () => {
    renderRemoteControl();
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        mode: 'fireplace',
        messages: ['Test Message'],
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Remote')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Fire')).toBeInTheDocument();
    expect(screen.getByText('Techno')).toBeInTheDocument();
    expect(screen.getByText('Test Message')).toBeInTheDocument();
  });

  it('shows live connection indicator when connected', async () => {
    renderRemoteControl();
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: [] });
    });

    await waitFor(() => {
      expect(screen.getByText('Live Connection')).toBeInTheDocument();
    });
  });

  it('sends set-mode command when a mode button is clicked', async () => {
    renderRemoteControl();
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: [] });
    });

    await waitFor(() => {
      expect(screen.getByText('Techno')).toBeInTheDocument();
    });
    
    const technoButton = screen.getByText('Techno').closest('button');
    fireEvent.click(technoButton!);
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/command'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('set-mode'),
        })
      );
    });
  });

  it('sends trigger-message command when a message button is clicked', async () => {
    renderRemoteControl();
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: ['Hello World'] });
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
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: ['Initial'] });
    });

    await waitFor(() => {
      expect(screen.getByText('Initial')).toBeInTheDocument();
    });

    // Simulate state update from SSE (e.g., from another client changing mode)
    await act(async () => {
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'techno', messages: ['Initial', 'New Message'] });
    });

    await waitFor(() => {
      expect(screen.getByText('New Message')).toBeInTheDocument();
    });
  });

  it('shows reconnecting status when SSE disconnects', async () => {
    renderRemoteControl();
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: [] });
    });

    await waitFor(() => {
      expect(screen.getByText('Live Connection')).toBeInTheDocument();
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
