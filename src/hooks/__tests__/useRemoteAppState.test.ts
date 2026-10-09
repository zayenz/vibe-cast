import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRemoteAppState } from '../useRemoteAppState';
import { MockEventSource } from '../../test/mocks/sse';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('reports a bootstrap timeout and recovers when SSE later supplies state', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  })));
  const { result } = renderHook(() => useRemoteAppState());
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(result.current.connectionPhase).toBe('degraded');
  expect(result.current.error).toContain('timed out');
  const stream = MockEventSource.getLatest()!;
  act(() => stream.simulateError());
  expect(result.current.connectionPhase).toBe('degraded');
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  act(() => MockEventSource.getLatest()!.simulateEvent('state', { activeVisualization: 'techno' }));
  expect(result.current.state?.activeVisualization).toBe('techno');
  expect(result.current.error).toBeNull();
  expect(result.current.connectionPhase).toBe('live');
});

it('reports unsuccessful bootstrap responses and aborts requests on unmount', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  const first = renderHook(() => useRemoteAppState());
  await act(async () => { await Promise.resolve(); });
  expect(first.result.current.error).toContain('503');
  first.unmount();
  let signal: RequestInit['signal'];
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => {
    signal = options.signal ?? undefined;
    return new Promise(() => {});
  }));
  const second = renderHook(() => useRemoteAppState());
  second.unmount();
  expect(signal?.aborted).toBe(true);
});
