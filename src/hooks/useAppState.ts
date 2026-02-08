import { useEffect, useState, useCallback } from 'react';
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
  const parsePlaybackControl = (playbackControl: any): PlaybackControlState | undefined => {
    if (!playbackControl || typeof playbackControl !== 'object') {
      return undefined;
    }

    return {
      sessionId: playbackControl.sessionId || playbackControl.session_id || null,
      currentMessage: playbackControl.currentMessage || playbackControl.current_message || null,
      isPlaying: Boolean(playbackControl.isPlaying ?? playbackControl.is_playing ?? false),
      playbackPosition: Number(playbackControl.playbackPosition ?? playbackControl.playback_position ?? 0),
      canStop: Boolean(playbackControl.canStop ?? playbackControl.can_stop ?? false),
      canStart: Boolean(playbackControl.canStart ?? playbackControl.can_start ?? true),
      initiatedBy: playbackControl.initiatedBy ?? playbackControl.initiated_by ?? DeviceType.System,
      lastUpdated: Number(playbackControl.lastUpdated ?? playbackControl.last_updated ?? Date.now()),
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

  useEffect(() => {
    // When apiBase is empty (e.g. Remote on same origin as server), use current origin so SSE connects
    const effectiveBase = apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!effectiveBase) {
      console.log('[useAppState] No API base and no window origin, skipping SSE connection');
      return;
    }

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;
    let retryCount = 0;
    const MAX_RETRIES = 30; // Keep trying for ~60 seconds

    const sseUrl = `${effectiveBase}/api/events`;
    console.log(`[useAppState] Initializing SSE connection to: ${sseUrl}`);

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

    return () => {
      console.log('[useAppState] Cleanup: closing SSE connection');
      isMounted = false;
      clearTimeout(initialDelay);
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
