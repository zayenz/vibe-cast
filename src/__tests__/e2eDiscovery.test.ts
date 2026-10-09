import { afterEach, expect, it, vi } from 'vitest';
import { discoverE2EContext, setE2EContext } from '../e2e/client';

afterEach(() => {
  setE2EContext(null);
  window.history.replaceState({}, '', '/');
  vi.unstubAllGlobals();
});

it('retains explicit disabled responses per server while permitting URL session overrides', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) });
  vi.stubGlobal('fetch', fetch);
  expect(await discoverE2EContext('http://disabled:8080', 'visualizer', 'visualizer')).toBeNull();
  expect(await discoverE2EContext('http://disabled:8080', 'visualizer', 'visualizer')).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  await discoverE2EContext('http://another:8080', 'visualizer', 'visualizer');
  expect(fetch).toHaveBeenCalledTimes(2);
  window.history.replaceState({}, '', '/?e2e=1&sessionId=explicit');
  expect((await discoverE2EContext('http://disabled:8080', 'visualizer', 'visualizer'))?.sessionId).toBe('explicit');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('keeps discovering an enabled server until a session starts', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: true, activeSessionId: null }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: true, activeSessionId: 'started' }) });
  vi.stubGlobal('fetch', fetch);
  expect(await discoverE2EContext('http://enabled:8080', 'control_plane', 'control-plane')).toBeNull();
  expect((await discoverE2EContext('http://enabled:8080', 'control_plane', 'control-plane'))?.sessionId).toBe('started');
  expect(fetch).toHaveBeenCalledTimes(2);
});
