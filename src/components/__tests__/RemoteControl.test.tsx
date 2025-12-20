import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteControl } from '../RemoteControl';

// Mock fetch to return app state
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('RemoteControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for /api/state
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/state') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            mode: 'fireplace',
            messages: ['Test Message'],
          }),
        });
      }
      // Default for /api/command
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });
    });
  });

  it('renders correctly after loading state', async () => {
    render(<RemoteControl />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Remote')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Fire')).toBeInTheDocument();
    expect(screen.getByText('Techno')).toBeInTheDocument();
    expect(screen.getByText('Test Message')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<RemoteControl />);
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('sends set-mode command when a mode button is clicked', async () => {
    render(<RemoteControl />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Techno')).toBeInTheDocument();
    });
    
    const technoButton = screen.getByText('Techno').closest('button');
    fireEvent.click(technoButton!);
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/command', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'set-mode', payload: 'techno' }),
      }));
    });
  });

  it('sends trigger-message command when a message button is clicked', async () => {
    render(<RemoteControl />);
    
    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Test Message')).toBeInTheDocument();
    });
    
    const messageButton = screen.getByText('Test Message');
    fireEvent.click(messageButton);
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/command', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'trigger-message', payload: 'Test Message' }),
      }));
    });
  });

  it('shows error state when fetch fails', async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error('Network error')));
    
    render(<RemoteControl />);
    
    await waitFor(() => {
      expect(screen.getByText('Could not connect to visualizer')).toBeInTheDocument();
    });
  });
});
