import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteControl } from '../RemoteControl';
import { useStore } from '../../store';

// Mock the store
vi.mock('../../store', () => ({
  useStore: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
) as any;

describe('RemoteControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useStore as any).mockReturnValue({
      mode: 'fireplace',
      messages: ['Test Message'],
    });
  });

  it('renders correctly', () => {
    render(<RemoteControl />);
    expect(screen.getByText('Remote Control')).toBeInTheDocument();
    expect(screen.getByText('Fireplace')).toBeInTheDocument();
    expect(screen.getByText('Techno')).toBeInTheDocument();
    expect(screen.getByText('Test Message')).toBeInTheDocument();
  });

  it('sends set-mode command when a mode button is clicked', async () => {
    render(<RemoteControl />);
    
    const technoButton = screen.getByText('Techno').closest('button');
    fireEvent.click(technoButton!);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/command', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'set-mode', payload: 'techno' }),
      }));
    });
  });

  it('sends trigger-message command when a message button is clicked', async () => {
    render(<RemoteControl />);
    
    const messageButton = screen.getByText('Test Message');
    fireEvent.click(messageButton);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/command', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ command: 'trigger-message', payload: 'Test Message' }),
      }));
    });
  });
});


