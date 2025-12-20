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
      expect(screen.getByText('VISUALIZER')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Fireplace')).toBeInTheDocument();
    expect(screen.getByText('Techno')).toBeInTheDocument();
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

  it('sends set-mode command when mode button is clicked', async () => {
    renderControlPlane();
    
    // Wait for SSE to connect and send initial state
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
});
