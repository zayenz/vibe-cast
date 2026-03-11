import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { commandAction } from '../router';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createCommandRequest(command: string, payload: unknown) {
  const formData = new FormData();
  formData.set('command', command);
  formData.set('payload', JSON.stringify(payload));

  return new Request('http://localhost/', {
    method: 'POST',
    body: formData,
  });
}

describe('commandAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('uses same-origin API calls in browser mode', async () => {
    await commandAction({
      request: createCommandRequest('set-mode', 'techno'),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/command',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          command: 'set-mode',
          payload: 'techno',
          deviceType: 'mobile_remote',
        }),
      }),
    );
  });

  it('uses the discovered Tauri server port in desktop mode', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValue({
      ip: '127.0.0.1',
      port: 8091,
    } as never);

    await commandAction({
      request: createCommandRequest('set-mode', 'techno'),
    });

    expect(invoke).toHaveBeenCalledWith('get_server_info');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8091/api/command',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          command: 'set-mode',
          payload: 'techno',
          deviceType: 'control_plane',
        }),
      }),
    );
  });
});
