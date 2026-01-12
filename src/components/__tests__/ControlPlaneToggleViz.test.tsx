import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ControlPlane } from '../ControlPlane';
import { MockEventSource } from '../../test/mocks/sse';
import { commandAction } from '../../router';

// Mock fetch for command submissions
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Tauri webviewWindow API
const mockGetAllWebviewWindows = vi.fn();
const mockVizWindow = {
  label: 'viz',
  isVisible: vi.fn(),
  hide: vi.fn(),
  show: vi.fn(),
  setFocus: vi.fn(),
};

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getAllWebviewWindows: () => mockGetAllWebviewWindows(),
}));

// Mock other Tauri APIs to avoid errors
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ ip: '127.0.0.1', port: 8080 }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

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

describe('ControlPlane Toggle Viz', () => {
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

    // Default mock for window
    mockGetAllWebviewWindows.mockResolvedValue([mockVizWindow]);
    mockVizWindow.isVisible.mockResolvedValue(true);
  });

  it('hides viz window if it is visible', async () => {
    renderControlPlane();
    
    // Connect SSE
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: [] });
    });

    const toggleButton = screen.getByTitle('Toggle visibility of the visualization window (Show or Hide)');
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(mockGetAllWebviewWindows).toHaveBeenCalled();
      expect(mockVizWindow.isVisible).toHaveBeenCalled();
      expect(mockVizWindow.hide).toHaveBeenCalled();
      expect(mockVizWindow.show).not.toHaveBeenCalled();
    });
  });

  it('shows viz window if it is hidden', async () => {
    mockVizWindow.isVisible.mockResolvedValue(false);
    
    renderControlPlane();
    
    // Connect SSE
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', { mode: 'fireplace', messages: [] });
    });

    const toggleButton = screen.getByTitle('Toggle visibility of the visualization window (Show or Hide)');
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(mockGetAllWebviewWindows).toHaveBeenCalled();
      expect(mockVizWindow.isVisible).toHaveBeenCalled();
      expect(mockVizWindow.show).toHaveBeenCalled();
      expect(mockVizWindow.setFocus).toHaveBeenCalled();
      expect(mockVizWindow.hide).not.toHaveBeenCalled();
    });
  });
});
