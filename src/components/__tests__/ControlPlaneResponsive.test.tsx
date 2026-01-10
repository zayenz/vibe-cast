import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ControlPlane } from '../ControlPlane';
import { MockEventSource } from '../../test/mocks/sse';
import { commandAction } from '../../router';

// Mock fetch
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

describe('ControlPlane Responsive Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.reset();
    
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.includes('/api/command') && options?.method === 'POST') {
        return { ok: true, json: async () => ({ status: 'ok' }) };
      }
      return { ok: false, status: 404 };
    });
  });

  it('header should wrap on smaller screens', async () => {
    renderControlPlane();
    
    // Simulate connection
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const sse = MockEventSource.getLatest();
      sse?.simulateEvent('state', {
        activeVisualization: 'fireplace',
        messages: [],
      });
    });

    await waitFor(() => {
      expect(screen.getByText('VIBECAST')).toBeInTheDocument();
    });

    // Get the header element (parent of h1)
    const titleElement = screen.getByText('VIBECAST');
    const headerElement = titleElement.closest('header');
    
    expect(headerElement).toHaveClass('flex-wrap');
  });
});
