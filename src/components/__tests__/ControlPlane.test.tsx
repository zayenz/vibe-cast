import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ControlPlane } from '../ControlPlane';
import { useStore } from '../../store';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve({ ip: '127.0.0.1', port: 1234 })),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: vi.fn(() => ({
    label: 'main',
    isVisible: vi.fn(() => Promise.resolve(true)),
    hide: vi.fn(() => Promise.resolve()),
    show: vi.fn(() => Promise.resolve()),
  })),
  getAllWebviewWindows: vi.fn(() => Promise.resolve([
    { label: 'main' },
    { label: 'viz', isVisible: vi.fn(() => Promise.resolve(true)), hide: vi.fn(), show: vi.fn(), setFocus: vi.fn() },
  ])),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock the store
vi.mock('../../store', () => ({
  useStore: vi.fn(),
}));

describe('ControlPlane', () => {
  const mockSetMode = vi.fn();
  const mockTriggerMessage = vi.fn();
  const mockSetServerInfo = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useStore as any).mockReturnValue({
      mode: 'fireplace',
      messages: ['Test Message'],
      setMode: mockSetMode,
      triggerMessage: mockTriggerMessage,
      serverInfo: { ip: '127.0.0.1', port: 1234 },
      setServerInfo: mockSetServerInfo,
      setMessages: vi.fn(),
    });
  });

  it('renders correctly', () => {
    render(<ControlPlane />);
    expect(screen.getByText('VISUALIZER')).toBeInTheDocument();
    expect(screen.getByText('Fireplace')).toBeInTheDocument();
    expect(screen.getByText('Techno')).toBeInTheDocument();
    expect(screen.getByText('http://127.0.0.1:1234')).toBeInTheDocument();
  });

  it('changes mode when buttons are clicked', () => {
    render(<ControlPlane />);
    
    const technoButton = screen.getByText('Techno').closest('button');
    fireEvent.click(technoButton!);
    
    expect(mockSetMode).toHaveBeenCalledWith('techno');
  });

  it('triggers a message when a preset is clicked', () => {
    render(<ControlPlane />);
    
    const messageButton = screen.getByText('Test Message').closest('button');
    fireEvent.click(messageButton!);
    
    expect(mockTriggerMessage).toHaveBeenCalledWith('Test Message');
  });
});


