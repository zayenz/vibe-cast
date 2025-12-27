import { useEffect, useState, useCallback } from 'react';
import { 
  CommonVisualizationSettings, 
  MessageConfig,
  VisualizationPreset,
  TextStylePreset,
  MessageStats,
  DEFAULT_COMMON_SETTINGS,
} from '../plugins/types';
import { visualizationRegistry, getDefaultVisualizationSettings } from '../plugins/visualizations';
import type { MessageTreeNode } from '../plugins/types';

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
  const { apiBase = '' } = options;
  
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;
      
      eventSource = new EventSource(`${apiBase}/api/events`);

      eventSource.addEventListener('state', (event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(event.data);
          const parsedState = parseSSEState(data);
          setState(parsedState);
          setError(null);
          setIsConnected(true);
        } catch (e) {
          console.error('Failed to parse SSE state:', e);
        }
      });

      eventSource.onerror = () => {
        if (!isMounted) return;
        setIsConnected(false);
        eventSource?.close();
        
        // Reconnect after 2 seconds
        reconnectTimer = setTimeout(connect, 2000);
      };

      eventSource.onopen = () => {
        if (!isMounted) return;
        setIsConnected(true);
        setError(null);
      };
    };

    connect();

    return () => {
      isMounted = false;
      eventSource?.close();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [apiBase]);

  return { state, error, isConnected };
}

/**
 * Hook for sending commands to the server.
 * Uses the standard fetch API - can be used alongside useFetcher for form-based submissions.
 */
export function useSendCommand(options: UseAppStateOptions = {}) {
  const { apiBase = '' } = options;
  const [isPending, setIsPending] = useState(false);

  const sendCommand = useCallback(async (command: string, payload?: unknown) => {
    setIsPending(true);
    try {
      const response = await fetch(`${apiBase}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload }),
      });
      
      if (!response.ok) {
        throw new Error(`Command failed: ${response.statusText}`);
      }
      
      return await response.json();
    } finally {
      setIsPending(false);
    }
  }, [apiBase]);

  return { sendCommand, isPending };
}
