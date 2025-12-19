import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('renders nothing when there is no active message', () => {
    (useStore as any).mockReturnValue(null);
    render(<Marquee />);
    expect(screen.queryByText(/./)).not.toBeInTheDocument();
  });

  it('renders the message when activeMessage changes', () => {
    (useStore as any).mockImplementation((selector: any) => selector({ activeMessage: 'Hello!' }));
    render(<Marquee />);
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('clears the message after 10 seconds', () => {
    (useStore as any).mockImplementation((selector: any) => selector({ activeMessage: 'Hello!' }));
    render(<Marquee />);
    expect(screen.getByText('Hello!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.queryByText('Hello!')).not.toBeInTheDocument();
  });
});

