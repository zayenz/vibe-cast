import { useEffect, useState, useCallback, useRef } from 'react';
import { 
  CommonVisualizationSettings, 
  MessageConfig,
  VisualizationPreset,
  TextStylePreset,
  MessageStats,
  RemoteCommand,
  DEFAULT_COMMON_SETTINGS,
} from '../plugins/types';
import type { MessageTreeNode } from '../plugins/types';

/**
 * Playback control state for message synchronization
 */
export interface PlaybackControlState {
  sessionId: string | null;
  currentMessage: MessageInfo | null;
  isPlaying: boolean;
  playbackPosition: number; // milliseconds
  canStop: boolean;
  canStart: boolean;
  initiatedBy: DeviceType;
  lastUpdated: number; // timestamp
}

/**
 * Message information for playback control
 */
export interface MessageInfo {
  id: string;
  title: string;
  duration?: number;
  folderPath?: string;
}

/**
 * Device type for playback control
 */
export enum DeviceType {
  ControlPlane = 'control_plane',
  MobileRemote = 'mobile_remote',
  System = 'system'
}

/**
 * Folder playback queue state
 */
export interface FolderPlaybackQueue {
  folderId: string;
  messageIds: string[];
  currentIndex: number;
}

/**
 * Application state from the SSE stream
 * Updated to match the new plugin-based architecture
 */
export interface AppState {
  configRevision: number;
  runtimeRevision: number;
  // Visualization state
  activeVisualization: string;
  enabledVisualizations: string[];
  commonSettings: CommonVisualizationSettings;
  visualizationSettings: Record<string, Record<string, unknown>>;
  visualizationPresets?: VisualizationPreset[];
  activeVisualizationPreset?: string | null;
  
  // Message state
  messages: MessageConfig[];
  messageTree?: MessageTreeNode[];
  triggeredMessage?: MessageConfig | null;
  messageStats?: Record<string, MessageStats>;
  folderPlaybackQueue?: FolderPlaybackQueue | null;
  
  // Playback control state
  playbackControl?: PlaybackControlState;
  
  // Text style state
  defaultTextStyle: string;
  textStyleSettings: Record<string, Record<string, unknown>>;
  textStylePresets?: TextStylePreset[];
  
  // Legacy compatibility
  mode?: 'fireplace' | 'techno';
}

export type ConnectionPhase = 'connecting' | 'degraded' | 'live';
export type HydrationSource = 'sse' | 'bootstrap' | null;

export interface ConnectionTiming {
  remoteLoadStartMs: number;
  sseConstructedMs: number | null;
  sseOpenMs: number | null;
  firstStateEventMs: number | null;
  bootstrapSuccessMs: number | null;
  spinnerExitMs: number | null;
}

/**
 * Hook configuration
 */
interface UseAppStateOptions {
  /** Base URL for API calls. Defaults to '' for same-origin */
  apiBase?: string;
  /** Callback for commands received via SSE */
  onCommand?: (command: RemoteCommand) => void;
}

function generateClientId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `remote-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Parse SSE state into AppState, handling both legacy and new formats
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSSEState(data: any): AppState {
  const buildFallbackPresets = (settings: Record<string, Record<string, unknown>> = {}): VisualizationPreset[] => {
    const fallbackIds = new Set<string>(['fireplace', 'techno']);
    if (typeof data?.activeVisualization === 'string' && data.activeVisualization.length > 0) {
      fallbackIds.add(data.activeVisualization);
    }
    if (settings && typeof settings === 'object') {
      Object.keys(settings).forEach((id) => fallbackIds.add(id));
    }

    return Array.from(fallbackIds).map((visualizationId) => ({
      id: `${visualizationId}-default`,
      name: `${visualizationId.replace(/-/g, ' ')} Default`,
      visualizationId,
      settings: settings[visualizationId] ?? {},
      enabled: true,
    }));
  };

  // Parse playback control state if available
  const parsePlaybackControl = (playbackControl: unknown): PlaybackControlState | undefined => {
    if (!playbackControl || typeof playbackControl !== 'object') {
      return undefined;
    }
    const control = playbackControl as Record<string, unknown>;

    return {
      sessionId: (control.sessionId as string | null | undefined) || (control.session_id as string | null | undefined) || null,
      currentMessage: (control.currentMessage as MessageInfo | null | undefined) || (control.current_message as MessageInfo | null | undefined) || null,
      isPlaying: Boolean(control.isPlaying ?? control.is_playing ?? false),
      playbackPosition: Number(control.playbackPosition ?? control.playback_position ?? 0),
      canStop: Boolean(control.canStop ?? control.can_stop ?? false),
      canStart: Boolean(control.canStart ?? control.can_start ?? true),
      initiatedBy: (control.initiatedBy as DeviceType | undefined) ?? (control.initiated_by as DeviceType | undefined) ?? DeviceType.System,
      lastUpdated: Number(control.lastUpdated ?? control.last_updated ?? Date.now()),
    };
  };

  // Handle new format
  if (data.activeVisualization !== undefined) {
    const basePresets: VisualizationPreset[] = data.visualizationPresets ?? [];
    const effectivePresets = Array.isArray(basePresets) && basePresets.length > 0
      ? basePresets
      : buildFallbackPresets(data.visualizationSettings ?? {});

    return {
      configRevision: Number(data.configRevision ?? 0),
      runtimeRevision: Number(data.runtimeRevision ?? 0),
      activeVisualization: data.activeVisualization,
      enabledVisualizations: data.enabledVisualizations ?? ['fireplace', 'techno'],
      commonSettings: data.commonSettings ?? DEFAULT_COMMON_SETTINGS,
      visualizationSettings: data.visualizationSettings ?? {},
      visualizationPresets: effectivePresets,
      activeVisualizationPreset: data.activeVisualizationPreset ?? null,
      messages: data.messages ?? [],
      messageTree: data.messageTree ?? undefined,
      triggeredMessage: data.triggeredMessage ?? null,
      messageStats: data.messageStats ?? (typeof data.messageStats === 'object' ? data.messageStats : {}),
      folderPlaybackQueue: data.folderPlaybackQueue ?? null,
      playbackControl: parsePlaybackControl(data.playbackControl),
      defaultTextStyle: data.defaultTextStyle ?? 'scrolling-capitals',
      textStyleSettings: data.textStyleSettings ?? {},
      textStylePresets: data.textStylePresets ?? [],
      // Legacy compatibility
      mode: data.activeVisualization === 'techno' ? 'techno' : 'fireplace',
    };
  }
  
  // Handle legacy format
  const legacyPresets = buildFallbackPresets();
  return {
    configRevision: 0,
    runtimeRevision: 0,
    activeVisualization: data.mode ?? 'fireplace',
    enabledVisualizations: ['fireplace', 'techno'],
    commonSettings: DEFAULT_COMMON_SETTINGS,
    visualizationSettings: {},
    visualizationPresets: legacyPresets,
    activeVisualizationPreset: null,
    messages: Array.isArray(data.messages) 
      ? data.messages.map((m: unknown, i: number) => 
          typeof m === 'string' 
            ? { id: String(i), text: m, textStyle: 'scrolling-capitals' }
            : m as MessageConfig
        )
      : [],
    messageTree: undefined,
    triggeredMessage: data.triggered_message 
      ? { id: 'triggered', text: data.triggered_message, textStyle: 'scrolling-capitals' }
      : null,
    messageStats: {},
    folderPlaybackQueue: null,
    playbackControl: undefined, // Legacy format doesn't have playback control
    defaultTextStyle: 'scrolling-capitals',
    textStyleSettings: {},
    textStylePresets: [],
    mode: data.mode ?? 'fireplace',
  };
}

/**
 * Custom hook that subscribes to the SSE event stream for real-time state updates.
 * This is the single source of truth for app state - no local mutations, only SSE updates.
 * 
 * @param options Configuration options
 * @returns Current app state and connection status
 */
export function useAppState(options: UseAppStateOptions = {}) {
  const { apiBase = '', onCommand } = options;

  const clientIdRef = useRef<string>(generateClientId());
  const sessionStartMsRef = useRef<number>(Date.now());
  const spinnerExitLoggedRef = useRef(false);

  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>('connecting');
  const [hydrationSource, setHydrationSource] = useState<HydrationSource>(null);
  const [timing, setTiming] = useState<ConnectionTiming>({
    remoteLoadStartMs: sessionStartMsRef.current,
    sseConstructedMs: null,
    sseOpenMs: null,
    firstStateEventMs: null,
    bootstrapSuccessMs: null,
    spinnerExitMs: null,
  });

  const hasReceivedState = useRef(false);
  const hasReceivedSSEState = useRef(false);

  useEffect(() => {
    const remoteLoadStartMs = Date.now();
    sessionStartMsRef.current = remoteLoadStartMs;
    spinnerExitLoggedRef.current = false;
    hasReceivedState.current = false;
    hasReceivedSSEState.current = false;
    setError(null);
    setIsConnected(false);
    setConnectionPhase('connecting');
    setHydrationSource(null);
    setTiming({
      remoteLoadStartMs,
      sseConstructedMs: null,
      sseOpenMs: null,
      firstStateEventMs: null,
      bootstrapSuccessMs: null,
      spinnerExitMs: null,
    });

    const logMetric = (name: string, extra?: Record<string, unknown>) => {
      const now = Date.now();
      console.log('[useAppState][metrics]', name, {
        clientId: clientIdRef.current,
        atMs: now,
        elapsedMs: now - remoteLoadStartMs,
        ...extra,
      });
    };

    const markTiming = (key: keyof Omit<ConnectionTiming, 'remoteLoadStartMs'>, metricName: string) => {
      const now = Date.now();
      setTiming((prev) => (prev[key] === null ? { ...prev, [key]: now } : prev));
      logMetric(metricName, { valueMs: now });
    };

    const markSpinnerExit = (reason: string) => {
      if (spinnerExitLoggedRef.current) {
        return;
      }
      spinnerExitLoggedRef.current = true;
      const now = Date.now();
      setTiming((prev) => (prev.spinnerExitMs === null ? { ...prev, spinnerExitMs: now } : prev));
      logMetric('spinner_exit_ms', { reason, valueMs: now });
    };

    logMetric('remote_load_start');

    // When apiBase is empty (e.g. Remote on same origin as server), use current origin so SSE connects
    const effectiveBase = apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!effectiveBase) {
      console.log('[useAppState] No API base and no window origin, skipping SSE connection');
      return;
    }

    let eventSource: EventSource | null = null;
    let hardResetTimer: ReturnType<typeof setTimeout> | null = null;
    let noStateWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let bootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPollTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPollStartTimer: ReturnType<typeof setTimeout> | null = null;
    let degradedUiTimer: ReturnType<typeof setTimeout> | null = null;
    let requestTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let activeController: AbortController | null = null;
    let isMounted = true;
    let bootstrapAttempt = 0;
    let connectAttempt = 0;
    let hardResetCount = 0;
    let pollInFlight = false;
    const EVENT_SOURCE_CLOSED = typeof EventSource !== 'undefined' && EventSource.CLOSED !== undefined
      ? EventSource.CLOSED
      : 2;
    const MAX_HARD_RESETS = 8;
    const NO_STATE_WATCHDOG_MS = 8000;
    const HARD_RESET_DELAY_MS = 750;
    const DEGRADE_UI_AFTER_MS = 2000;
    const BOOTSTRAP_RETRY_DELAYS_MS = [0, 500, 1500, 3000, 5000];
    const BOOTSTRAP_TIMEOUT_MS = 4000;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
    const FALLBACK_POLL_START_MS = isTauri ? 3000 : 1000;
    const FALLBACK_POLL_INTERVAL_MS = isTauri ? 3000 : 1000;
    const FALLBACK_POLL_TIMEOUT_MS = isTauri ? 3000 : 2000;
    const stateSnapshotUrl = `${effectiveBase}/api/state${isTauri ? '' : '?compact=1'}`;

    const sseParams = new URLSearchParams({
      clientId: clientIdRef.current,
      sessionStartMs: String(remoteLoadStartMs),
    });
    if (!isTauri) {
      sseParams.set('compact', '1');
    }
    const sseUrl = `${effectiveBase}/api/events?${sseParams.toString()}`;
    console.log(`[useAppState] Initializing SSE connection to: ${sseUrl}`);

    const clearRequestTimeout = () => {
      if (requestTimeoutTimer) {
        clearTimeout(requestTimeoutTimer);
        requestTimeoutTimer = null;
      }
    };

    const clearNoStateWatchdog = () => {
      if (noStateWatchdogTimer) {
        clearTimeout(noStateWatchdogTimer);
        noStateWatchdogTimer = null;
      }
    };

    const scheduleHardReset = (reason: string) => {
      if (!isMounted || hardResetTimer) {
        return;
      }
      hardResetCount += 1;
      if (hardResetCount > MAX_HARD_RESETS) {
        console.error('[useAppState] Max hard resets reached, SSE failed to deliver initial state');
        setError('SSE connection failed to deliver initial state');
        setConnectionPhase('degraded');
        return;
      }

      console.warn(`[useAppState] Scheduling hard SSE reset (${reason}) in ${HARD_RESET_DELAY_MS}ms`);
      hardResetTimer = setTimeout(() => {
        hardResetTimer = null;
        if (!isMounted) {
          return;
        }
        eventSource?.close();
        connect();
      }, HARD_RESET_DELAY_MS);
    };

    const scheduleNoStateWatchdog = (reason: string) => {
      if (!isMounted || hasReceivedSSEState.current || noStateWatchdogTimer) {
        return;
      }
      logMetric('no_state_watchdog_started', { reason, timeoutMs: NO_STATE_WATCHDOG_MS });
      noStateWatchdogTimer = setTimeout(() => {
        noStateWatchdogTimer = null;
        if (!isMounted || hasReceivedSSEState.current) {
          return;
        }
        logMetric('no_state_watchdog_fired', { reason });
        scheduleHardReset('no-state-watchdog');
      }, NO_STATE_WATCHDOG_MS);
    };

    const fetchStateSnapshot = async (timeoutMs: number, source: 'bootstrap' | 'fallback-poll') => {
      if (!isMounted) {
        return;
      }

      activeController?.abort();
      activeController = new AbortController();
      requestTimeoutTimer = setTimeout(() => {
        activeController?.abort();
      }, timeoutMs);

      try {
        const response = await fetch(stateSnapshotUrl, {
          signal: activeController.signal,
          cache: 'no-store',
        });
        if (!response.ok || !isMounted) {
          return;
        }

        const data = await response.json();
        if (!isMounted) {
          return;
        }

        // If we have already received SSE state, prefer SSE to avoid stale overwrite.
        if (source !== 'bootstrap' && hasReceivedSSEState.current) {
          return;
        }

        if (source === 'bootstrap' && hasReceivedState.current) {
          return;
        }

        const parsedState = parseSSEState(data);
        setState(parsedState);
        setError(null);
        hasReceivedState.current = true;
        if (!hasReceivedSSEState.current) {
          setConnectionPhase('degraded');
          setHydrationSource((prev) => prev ?? 'bootstrap');
          markSpinnerExit(`${source}-hydration`);
          if (source === 'bootstrap') {
            markTiming('bootstrapSuccessMs', 'bootstrap_success');
          }
        }
        console.log(`[useAppState] State hydrated via ${source}`);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.warn(`[useAppState] ${source} fetch failed:`, e);
        }
      } finally {
        clearRequestTimeout();
      }
    };

    const scheduleFallbackPoll = () => {
      if (!isMounted || hasReceivedSSEState.current) {
        return;
      }

      fallbackPollTimer = setTimeout(async () => {
        if (!isMounted || hasReceivedSSEState.current) {
          return;
        }

        if (pollInFlight) {
          scheduleFallbackPoll();
          return;
        }

        pollInFlight = true;
        try {
          await fetchStateSnapshot(FALLBACK_POLL_TIMEOUT_MS, 'fallback-poll');
        } finally {
          pollInFlight = false;
          if (!hasReceivedSSEState.current) {
            scheduleFallbackPoll();
          }
        }
      }, FALLBACK_POLL_INTERVAL_MS);
    };

    const bootstrapState = () => {
      const delay = BOOTSTRAP_RETRY_DELAYS_MS[bootstrapAttempt];
      if (delay === undefined) {
        return;
      }

      bootstrapRetryTimer = setTimeout(async () => {
        if (!isMounted || hasReceivedState.current) {
          return;
        }

        await fetchStateSnapshot(BOOTSTRAP_TIMEOUT_MS, 'bootstrap');
        if (!hasReceivedState.current) {
          bootstrapAttempt += 1;
          bootstrapState();
        }
      }, delay);
    };

    const connect = () => {
      if (!isMounted) {
        console.log('[useAppState] Component unmounted, skipping connect');
        return;
      }

      connectAttempt += 1;
      console.log(`[useAppState] SSE connect attempt #${connectAttempt} to: ${sseUrl}`);

      try {
        eventSource = new EventSource(sseUrl);
        markTiming('sseConstructedMs', 'sse_constructed');
        scheduleNoStateWatchdog('eventsource-created');
        console.log('[useAppState] EventSource created, readyState:', eventSource.readyState);
      } catch (err) {
        console.error('[useAppState] Failed to create EventSource:', err);
        scheduleHardReset('eventsource-constructor-error');
        return;
      }

      eventSource.addEventListener('state', (event) => {
        if (!isMounted) return;
        console.log('[useAppState] Received state event, data length:', event.data?.length);
        try {
          const isFirstSSEState = !hasReceivedSSEState.current;
          const data = JSON.parse(event.data);
          const parsedState = parseSSEState(data);
          setState(parsedState);
          setError(null);
          setIsConnected(true);
          setConnectionPhase('live');
          setHydrationSource('sse');
          hasReceivedState.current = true;
          hasReceivedSSEState.current = true;
          clearNoStateWatchdog();
          if (isFirstSSEState) {
            markTiming('firstStateEventMs', 'first_state_event');
            markSpinnerExit('first-sse-state');
          }
          console.log('[useAppState] State parsed and set successfully');
        } catch (e) {
          console.error('[useAppState] Failed to parse SSE state:', e);
        }
      });

      eventSource.addEventListener('command', (event) => {
        if (!isMounted) return;
        console.log('[useAppState] Received command event');
        try {
          const command = JSON.parse(event.data) as RemoteCommand;

          // Patch remote-visible fields from lightweight command events so the UI
          // doesn't wait for a potentially heavier full-state broadcast.
          if (command.command === 'set-active-visualization-preset') {
            setState((prev) => {
              if (!prev) {
                return prev;
              }

              const payload = command.payload;
              const nextPresetId =
                payload === null
                  ? null
                  : typeof payload === 'string'
                    ? payload
                    : prev.activeVisualizationPreset ?? null;

              if (nextPresetId === prev.activeVisualizationPreset) {
                return prev;
              }

              const matchingPreset = (prev.visualizationPresets ?? []).find((preset) => preset.id === nextPresetId);
              const nextVisualization = matchingPreset?.visualizationId ?? prev.activeVisualization;

              return {
                ...prev,
                activeVisualizationPreset: nextPresetId,
                activeVisualization: nextVisualization,
                mode: nextVisualization === 'techno' ? 'techno' : 'fireplace',
              };
            });
          } else if (command.command === 'set-active-visualization' && typeof command.payload === 'string') {
            setState((prev) => {
              if (!prev || prev.activeVisualization === command.payload) {
                return prev;
              }
              return {
                ...prev,
                activeVisualization: command.payload,
                mode: command.payload === 'techno' ? 'techno' : 'fireplace',
              };
            });
          }

          onCommand?.(command);
        } catch (e) {
          console.error('[useAppState] Failed to parse SSE command:', e);
        }
      });

      eventSource.onerror = (e) => {
        if (!isMounted) return;
        console.error('[useAppState] SSE connection error:', {
          readyState: eventSource?.readyState,
          connectAttempt,
          error: e
        });
        setIsConnected(false);

        if (hasReceivedSSEState.current) {
          setConnectionPhase('degraded');
          return;
        }

        scheduleNoStateWatchdog('sse-error-before-first-state');
        if (eventSource?.readyState === EVENT_SOURCE_CLOSED) {
          scheduleHardReset('eventsource-closed-before-first-state');
        }
      };

      eventSource.onopen = () => {
        if (!isMounted) return;
        markTiming('sseOpenMs', 'sse_open');
        console.log('[useAppState] SSE connection opened successfully');
        setIsConnected(true);
        setError(null);
        if (!hasReceivedSSEState.current) {
          scheduleNoStateWatchdog('sse-open-without-state');
        }
      };
    };

    // In Tauri windows (Control Plane, Visualizer), the server starts concurrently with the
    // frontend, so we add a small delay to let it initialize. In a browser (Remote), the
    // server is already running since it served the page — connect immediately.
    const startupDelay = isTauri ? 500 : 0;

    if (!isTauri) {
      degradedUiTimer = setTimeout(() => {
        if (!isMounted || hasReceivedState.current) {
          return;
        }
        setConnectionPhase((prev) => (prev === 'live' ? 'live' : 'degraded'));
        markSpinnerExit('safety-threshold');
      }, DEGRADE_UI_AFTER_MS);
    }

    const initialDelay = setTimeout(() => {
      console.log(`[useAppState] Starting SSE connection after ${startupDelay}ms delay`);
      connect();
    }, startupDelay);

    bootstrapState();
    fallbackPollStartTimer = setTimeout(() => {
      if (!hasReceivedSSEState.current) {
        console.log('[useAppState] Starting fallback /api/state polling while SSE is not fully synced');
        scheduleFallbackPoll();
      }
    }, FALLBACK_POLL_START_MS);

    return () => {
      console.log('[useAppState] Cleanup: closing SSE connection');
      isMounted = false;
      clearTimeout(initialDelay);
      if (bootstrapRetryTimer) {
        clearTimeout(bootstrapRetryTimer);
      }
      if (fallbackPollStartTimer) {
        clearTimeout(fallbackPollStartTimer);
      }
      if (fallbackPollTimer) {
        clearTimeout(fallbackPollTimer);
      }
      if (degradedUiTimer) {
        clearTimeout(degradedUiTimer);
      }
      clearNoStateWatchdog();
      clearRequestTimeout();
      activeController?.abort();
      eventSource?.close();
      if (hardResetTimer) {
        clearTimeout(hardResetTimer);
      }
    };
  }, [apiBase, onCommand]);

  return { state, error, isConnected, connectionPhase, hydrationSource, timing };
}

/**
 * Hook for sending commands to the server.
 * Uses the standard fetch API - can be used alongside useFetcher for form-based submissions.
 */
export function useSendCommand(options: UseAppStateOptions = {}) {
  const { apiBase = '' } = options;
  const [isPending, setIsPending] = useState(false);

  // Detect device type: Tauri windows are Control Plane, browser is Mobile Remote
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  const deviceType = isTauri ? 'control_plane' : 'mobile_remote';

  const sendCommand = useCallback(async (command: string, payload?: unknown) => {
    setIsPending(true);
    try {
      const response = await fetch(`${apiBase}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload, deviceType }),
      });
      
      if (!response.ok) {
        throw new Error(`Command failed: ${response.statusText}`);
      }
      
      return await response.json();
    } finally {
      setIsPending(false);
    }
  }, [apiBase, deviceType]);

  return { sendCommand, isPending };
}
