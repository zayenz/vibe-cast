import { vi } from 'vitest';

/**
 * Mock EventSource for testing SSE connections
 */
export class MockEventSource {
  static instances: MockEventSource[] = [];
  
  url: string;
  readyState: number = 0; // CONNECTING
  
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  
  private listeners: Map<string, ((event: MessageEvent) => void)[]> = new Map();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    
    // Simulate async connection
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    const index = existing.indexOf(listener);
    if (index > -1) {
      existing.splice(index, 1);
    }
  }

  close(): void {
    this.readyState = 2; // CLOSED
    const index = MockEventSource.instances.indexOf(this);
    if (index > -1) {
      MockEventSource.instances.splice(index, 1);
    }
  }

  /**
   * Simulate receiving an SSE event
   */
  simulateEvent(type: string, data: unknown): void {
    const event = new MessageEvent(type, {
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });
    
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener(event);
    }
  }

  /**
   * Simulate a connection error
   */
  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  /**
   * Clear all mock instances
   */
  static reset(): void {
    MockEventSource.instances.forEach(instance => instance.close());
    MockEventSource.instances = [];
  }

  /**
   * Get the most recent instance
   */
  static getLatest(): MockEventSource | undefined {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }
}

/**
 * Install the MockEventSource globally
 */
export function installMockEventSource(): void {
  (globalThis as any).EventSource = MockEventSource;
}

/**
 * Create a mock fetch that handles /api/command and /api/state
 */
export function createMockFetch(initialState = { mode: 'fireplace', messages: ['Test Message'] }) {
  let state = { ...initialState };

  return vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/api/state')) {
      return {
        ok: true,
        json: async () => state,
      };
    }

    if (url.endsWith('/api/command') && options?.method === 'POST') {
      const body = JSON.parse(options.body as string);
      
      if (body.command === 'set-mode') {
        state.mode = body.payload;
      } else if (body.command === 'set-messages') {
        state.messages = body.payload;
      }
      
      return {
        ok: true,
        json: async () => ({ status: 'ok' }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    };
  });
}

