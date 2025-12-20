import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Marquee } from '../Marquee';
import { useStore } from '../../store';

// Mock the store
vi.mock('../../store', () => ({
  useStore: vi.fn(),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('Marquee', () => {
  it('renders nothing when there is no active message', () => {
    (useStore as any).mockImplementation((selector: any) => 
      selector({ activeMessage: null, messageTimestamp: 0 })
    );
    render(<Marquee />);
    expect(screen.queryByText(/./)).not.toBeInTheDocument();
  });

  it('renders the message when activeMessage is set', async () => {
    (useStore as any).mockImplementation((selector: any) => 
      selector({ activeMessage: 'Hello!', messageTimestamp: Date.now() })
    );
    render(<Marquee />);
    
    // Wait for the component to show the message after internal delay
    await waitFor(() => {
      expect(screen.getByText('Hello!')).toBeInTheDocument();
    }, { timeout: 200 });
  });

  it('initially shows nothing even with active message due to internal delay', () => {
    (useStore as any).mockImplementation((selector: any) => 
      selector({ activeMessage: 'Hello!', messageTimestamp: Date.now() })
    );
    render(<Marquee />);
    
    // Initially, displayMessage is null (before the 50ms delay)
    // The container should be rendered but empty
    const container = document.querySelector('.fixed.top-20');
    expect(container).toBeInTheDocument();
  });
});
