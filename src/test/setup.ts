import '@testing-library/jest-dom';
import { vi, beforeEach, afterEach } from 'vitest';
import { installMockEventSource, MockEventSource } from './mocks/sse';

// Install mock EventSource globally
installMockEventSource();

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
  MockEventSource.reset();
});

afterEach(() => {
  MockEventSource.reset();
});

// Mock Tauri APIs globally
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve({ ip: '127.0.0.1', port: 8080 })),
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
    { 
      label: 'viz', 
      isVisible: vi.fn(() => Promise.resolve(true)), 
      hide: vi.fn(() => Promise.resolve()), 
      show: vi.fn(() => Promise.resolve()), 
      setFocus: vi.fn(() => Promise.resolve()),
    },
  ])),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
