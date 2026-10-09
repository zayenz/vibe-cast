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

it.each([true, false])('keeps streamed runtime revision 2 after late revision 1 (playing=%s)', async (isPlaying) => {
  const currentMessage = { id: 'current', text: 'Current', textStyle: 'scrolling-capitals' };
  const currentQueue = { folderId: 'folder', messageIds: ['current'], currentIndex: 0 };
  const currentStats = { current: { messageId: 'current', triggerCount: 2, lastTriggered: 20 } };
  const newer = {
    activeVisualization: 'fireplace',
    configRevision: 1,
    runtimeRevision: 2,
    playbackControl: { isPlaying, currentMessage: isPlaying ? { id: 'current', title: 'Current' } : null },
    triggeredMessage: isPlaying ? currentMessage : null,
    folderPlaybackQueue: isPlaying ? currentQueue : null,
    messageStats: currentStats,
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => newer }));
  const { result } = renderHook(() => useRemoteAppState());
  await act(async () => { await Promise.resolve(); });
  expect(result.current.connectionPhase).toBe('degraded');
  const stream = MockEventSource.getLatest()!;
  act(() => stream.simulateEvent('state', newer));
  const acceptedPlayback = result.current.state?.playbackControl;
  act(() => stream.simulateEvent('state', {
    ...newer,
    activeVisualization: 'techno',
    configRevision: 2,
    runtimeRevision: 1,
    playbackControl: { isPlaying: !isPlaying },
    triggeredMessage: isPlaying ? null : currentMessage,
    folderPlaybackQueue: isPlaying ? null : currentQueue,
    messageStats: {},
  }));

  expect(result.current.state).toMatchObject({
    configRevision: 2,
    activeVisualization: 'techno',
    runtimeRevision: 2,
    playbackControl: acceptedPlayback,
    triggeredMessage: newer.triggeredMessage,
    folderPlaybackQueue: newer.folderPlaybackQueue,
    messageStats: { current: { ...currentStats.current, history: [] } },
  });
  expect(result.current.isConnected).toBe(true);
  expect(result.current.connectionPhase).toBe('live');
  expect(result.current.error).toBeNull();

  act(() => stream.simulateEvent('state', {
    ...newer,
    runtimeRevision: 3,
    playbackControl: { isPlaying: !isPlaying },
  }));
  act(() => stream.simulateEvent('state', newer));
  expect(result.current.state?.runtimeRevision).toBe(3);
  expect(result.current.state?.playbackControl?.isPlaying).toBe(!isPlaying);
});

it('accepts reset revisions after reconnecting to a restarted backend', async () => {
  vi.useFakeTimers();
  const previous = {
    activeVisualization: 'fireplace',
    runtimeRevision: 20,
    playbackControl: { isPlaying: true },
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => previous }));
  const { result } = renderHook(() => useRemoteAppState());
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const previousStream = MockEventSource.getLatest()!;
  act(() => previousStream.simulateEvent('state', previous));
  act(() => previousStream.simulateError());
  expect(result.current.state?.playbackControl?.isPlaying).toBe(true);
  expect(result.current.connectionPhase).toBe('degraded');

  await act(async () => { await vi.advanceTimersByTimeAsync(501); });
  const restartedStream = MockEventSource.getLatest()!;
  expect(restartedStream).not.toBe(previousStream);
  const restarted = { ...previous, runtimeRevision: 0, playbackControl: { isPlaying: false } };
  act(() => restartedStream.simulateEvent('state', restarted));
  expect(result.current.state?.runtimeRevision).toBe(0);
  expect(result.current.state?.playbackControl?.isPlaying).toBe(false);
  expect(result.current.connectionPhase).toBe('live');

  act(() => restartedStream.simulateEvent('state', { ...previous, runtimeRevision: 1 }));
  act(() => restartedStream.simulateEvent('state', restarted));
  expect(result.current.state?.runtimeRevision).toBe(1);
  expect(result.current.state?.playbackControl?.isPlaying).toBe(true);
});
