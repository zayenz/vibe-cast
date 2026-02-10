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
import { visualizationRegistry, getDefaultVisualizationSettings } from '../plugins/visualizations';
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

/**
 * Hook configuration
 */
interface UseAppStateOptions {
  /** Base URL for API calls. Defaults to '' for same-origin */
  apiBase?: string;
  /** Callback for commands received via SSE */
  onCommand?: (command: RemoteCommand) => void;
}

/**
 * Parse SSE state into AppState, handling both legacy and new formats
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSSEState(data: any): AppState {
  const buildFallbackPresets = (settings: Record<string, Record<string, unknown>> = {}): VisualizationPreset[] => {
    const defaults = getDefaultVisualizationSettings();
    return visualizationRegistry.map((viz) => ({
      id: `${viz.id}-default`,
      name: `${viz.name} Default`,
      visualizationId: viz.id,
      settings: settings[viz.id] ?? defaults[viz.id] ?? {},
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
  
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const hasReceivedState = useRef(false);
  const hasReceivedSSEState = useRef(false);

  useEffect(() => {
    // When apiBase is empty (e.g. Remote on same origin as server), use current origin so SSE connects
    const effectiveBase = apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!effectiveBase) {
      console.log('[useAppState] No API base and no window origin, skipping SSE connection');
      return;
    }

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let bootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPollTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPollStartTimer: ReturnType<typeof setTimeout> | null = null;
    let requestTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let activeController: AbortController | null = null;
    let isMounted = true;
    let retryCount = 0;
    let bootstrapAttempt = 0;
    let pollInFlight = false;
    const MAX_RETRIES = 30; // Keep trying for ~60 seconds
    const BOOTSTRAP_RETRY_DELAYS_MS = [0, 500, 1500, 3000, 5000];
    const BOOTSTRAP_TIMEOUT_MS = 4000;
    const FALLBACK_POLL_START_MS = 3000;
    const FALLBACK_POLL_INTERVAL_MS = 3000;
    const FALLBACK_POLL_TIMEOUT_MS = 3000;

    const sseUrl = `${effectiveBase}/api/events`;
    console.log(`[useAppState] Initializing SSE connection to: ${sseUrl}`);

    const clearRequestTimeout = () => {
      if (requestTimeoutTimer) {
        clearTimeout(requestTimeoutTimer);
        requestTimeoutTimer = null;
      }
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
        const response = await fetch(`${effectiveBase}/api/state`, {
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
      
      retryCount++;
      console.log(`[useAppState] SSE connect attempt #${retryCount} to: ${sseUrl}`);
      
      try {
        eventSource = new EventSource(sseUrl);
        console.log('[useAppState] EventSource created, readyState:', eventSource.readyState);
      } catch (err) {
        console.error('[useAppState] Failed to create EventSource:', err);
        if (retryCount < MAX_RETRIES) {
          reconnectTimer = setTimeout(connect, 2000);
        }
        return;
      }

      eventSource.addEventListener('state', (event) => {
        if (!isMounted) return;
        console.log('[useAppState] Received state event, data length:', event.data?.length);
        try {
          const data = JSON.parse(event.data);
          const parsedState = parseSSEState(data);
          setState(parsedState);
          setError(null);
          setIsConnected(true);
          hasReceivedState.current = true;
          hasReceivedSSEState.current = true;
          retryCount = 0; // Reset retry count on successful state
          console.log('[useAppState] State parsed and set successfully');
        } catch (e) {
          console.error('[useAppState] Failed to parse SSE state:', e);
        }
      });

      if (onCommand) {
        eventSource.addEventListener('command', (event) => {
          if (!isMounted) return;
          console.log('[useAppState] Received command event');
          try {
            const command = JSON.parse(event.data);
            onCommand(command);
          } catch (e) {
            console.error('[useAppState] Failed to parse SSE command:', e);
          }
        });
      }

      eventSource.onerror = (e) => {
        if (!isMounted) return;
        console.error('[useAppState] SSE connection error:', {
          readyState: eventSource?.readyState,
          retryCount,
          error: e
        });
        setIsConnected(false);
        eventSource?.close();
        
        // Reconnect with exponential backoff, capped at 5 seconds
        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(1.5, Math.min(retryCount, 5)), 5000);
          console.log(`[useAppState] Will retry in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          reconnectTimer = setTimeout(connect, delay);
        } else {
          console.error('[useAppState] Max retries reached, SSE connection failed permanently');
          setError('SSE connection failed after maximum retries');
        }
      };

      eventSource.onopen = () => {
        if (!isMounted) return;
        console.log('[useAppState] SSE connection opened successfully');
        setIsConnected(true);
        setError(null);
      };
    };

    // In Tauri windows (Control Plane, Visualizer), the server starts concurrently with the
    // frontend, so we add a small delay to let it initialize. In a browser (Remote), the
    // server is already running since it served the page — connect immediately.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
    const startupDelay = isTauri ? 500 : 0;

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
      clearRequestTimeout();
      activeController?.abort();
      eventSource?.close();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [apiBase, onCommand]);

  return { state, error, isConnected };
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
