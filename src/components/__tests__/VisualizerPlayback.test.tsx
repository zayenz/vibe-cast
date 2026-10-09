import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VisualizerWindow } from '../VisualizerWindow';
import { useStore } from '../../store';
import { MockEventSource } from '../../test/mocks/sse';
import { DEFAULT_COMMON_SETTINGS, MessageConfig } from '../../plugins/types';
import { AppState, DeviceType } from '../../hooks/useAppState';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  completions: new Map<string, () => void>(),
  invoke: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mocks.invoke(...args) }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, handler: (event: { payload: unknown }) => void) => {
    mocks.handlers.set(name, handler);
    return () => { if (mocks.handlers.get(name) === handler) mocks.handlers.delete(name); };
  },
}));
vi.mock('../../plugins/visualizations', () => {
  const plugin = { id: 'fireplace', name: 'Fireplace', settingsSchema: [], component: () => null };
  return {
    visualizationRegistry: [plugin],
    getVisualization: () => plugin,
    getDefaultVisualizationSettings: () => ({ fireplace: {} }),
  };
});
vi.mock('../../plugins/textStyles', () => {
  const plugin = {
    id: 'test', name: 'Test', settingsSchema: [],
    component: ({ message, messageTimestamp, onComplete }: { message: string; messageTimestamp: number; onComplete: () => void }) => {
      mocks.completions.set(`${message}:${messageTimestamp}`, onComplete);
      return <button onClick={onComplete}>{message}</button>;
    },
  };
  return {
    textStyleRegistry: [plugin],
    getTextStyle: () => plugin,
    getDefaultTextStyleSettings: () => ({ test: {} }),
  };
});

const message: MessageConfig = { id: 'same-message', text: 'Hello playback', textStyle: 'test' };
function snapshot(revision: number, sessionId: string | null, currentMessage = message): AppState {
  return {
    configRevision: 1, runtimeRevision: revision,
    activeVisualization: 'fireplace', activeVisualizationPreset: null,
    enabledVisualizations: ['fireplace'], commonSettings: DEFAULT_COMMON_SETTINGS,
    visualizationSettings: {}, visualizationPresets: [],
    messages: [currentMessage], triggeredMessage: sessionId ? currentMessage : null,
    defaultTextStyle: 'test', textStyleSettings: {}, textStylePresets: [],
    playbackControl: {
      sessionId, currentMessage: sessionId ? { id: currentMessage.id, title: currentMessage.text } : null,
      isPlaying: !!sessionId, playbackPosition: 0, canStop: !!sessionId,
      canStart: !sessionId, initiatedBy: DeviceType.System, lastUpdated: 0,
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.handlers.clear();
  mocks.completions.clear();
  useStore.setState({ activeMessages: [], activeMessage: null, messageTimestamp: 0 });
  mocks.fetch.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => url.includes('/api/state') ? snapshot(1, null) : { status: 'ok', enabled: false },
  }));
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'get_server_info') return { port: 8080 };
    if (command === 'check_server_ready') return true;
    if (command === 'get_app_state') return snapshot(1, null);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function initialize() {
  render(<VisualizerWindow />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
}

function tauriState(next: AppState) {
  mocks.handlers.get('playback-control-changed')!({ payload: { type: 'MESSAGE_STARTED', state: next, playbackControl: next.playbackControl } });
}

it('deduplicates IPC, Tauri and SSE snapshots and does not resurrect a completed session', async () => {
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'get_server_info') return { port: 8080 };
    if (command === 'check_server_ready') return true;
    if (command === 'get_app_state') return snapshot(5, 'session-a');
  });
  await initialize();
  expect(useStore.getState().activeMessages[0].playbackSessionId).toBe('session-a');
  await act(async () => {
    tauriState(snapshot(5, 'session-a'));
    MockEventSource.getLatest()!.simulateEvent('state', snapshot(5, 'session-a'));
  });
  expect(screen.getAllByText('Hello playback')).toHaveLength(1);
  expect(useStore.getState().activeMessages).toHaveLength(1);
  fireEvent.click(screen.getByText('Hello playback'));
  await act(async () => { await Promise.resolve(); });
  const request = mocks.fetch.mock.calls.find(([url]) => String(url).includes('/api/command'))!;
  expect(JSON.parse(request[1].body)).toMatchObject({ command: 'message-complete', payload: { messageId: message.id, playbackSessionId: 'session-a' } });
  act(() => tauriState(snapshot(6, 'session-a')));
  expect(useStore.getState().activeMessages).toHaveLength(0);
});

it('restarts the same message for a new session and ignores old stops and old completion callbacks', async () => {
  await initialize();
  await act(async () => MockEventSource.getLatest()!.simulateEvent('state', snapshot(2, 'session-a')));
  const completions = [...mocks.completions.values()];
  const oldCompletion = completions[completions.length - 1];
  act(() => tauriState(snapshot(4, 'session-b')));
  expect(useStore.getState().activeMessages).toHaveLength(1);
  expect(useStore.getState().activeMessages[0].playbackSessionId).toBe('session-b');
  act(() => {
    tauriState(snapshot(3, null));
    oldCompletion();
  });
  expect(useStore.getState().activeMessages[0].playbackSessionId).toBe('session-b');
  expect(mocks.fetch.mock.calls.filter(([url]) => String(url).includes('/api/command'))).toHaveLength(0);
  act(() => tauriState(snapshot(5, null)));
  expect(useStore.getState().activeMessages).toHaveLength(0);
});

it('preserves different-message overlays and keeps debug completion local', async () => {
  await initialize();
  await act(async () => MockEventSource.getLatest()!.simulateEvent('state', snapshot(2, 'session-a')));
  act(() => {
    tauriState(snapshot(3, 'session-b', { ...message, id: 'other', text: 'Other playback' }));
    useStore.getState().triggerMessage({ ...message, id: 'debug', text: 'Debug playback' });
  });
  expect(screen.getByText('Hello playback')).toBeInTheDocument();
  expect(screen.getByText('Other playback')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Debug playback'));
  expect(useStore.getState().activeMessages).toHaveLength(2);
  expect(mocks.fetch.mock.calls.filter(([url]) => String(url).includes('/api/command'))).toHaveLength(0);
});
