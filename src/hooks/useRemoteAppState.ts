import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_COMMON_SETTINGS,
  MessageStats,
  VisualizationPreset,
} from '../plugins/types';
import type { MessageConfig, MessageTreeNode } from '../plugins/types';
import type { AppState, ConnectionPhase, FolderPlaybackQueue, PlaybackControlState } from './useAppState';
import { DeviceType } from './useAppState';

interface UseRemoteAppStateOptions {
  apiBase?: string;
}

interface RemoteStartupPerfReport {
  clientId: string;
  payloadBytes?: number;
  serializeMs?: number;
  bootstrapLatencyMs?: number;
  sseOpenLatencyMs?: number;
  firstUsableRenderMs?: number;
  bootstrapSource?: 'bootstrap' | 'sse';
  userAgent?: string;
}

function generateClientId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `remote-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRemoteState(data: any): AppState {
  const parsePlaybackControl = (playbackControl: unknown): PlaybackControlState | undefined => {
    if (!playbackControl || typeof playbackControl !== 'object') {
      return undefined;
    }

    const control = playbackControl as Record<string, unknown>;
    return {
      sessionId: (control.sessionId as string | null | undefined) ?? null,
      currentMessage: (control.currentMessage as PlaybackControlState['currentMessage']) ?? null,
      isPlaying: Boolean(control.isPlaying ?? false),
      playbackPosition: Number(control.playbackPosition ?? 0),
      canStop: Boolean(control.canStop ?? false),
      canStart: Boolean(control.canStart ?? true),
      initiatedBy: (control.initiatedBy as DeviceType | undefined) ?? DeviceType.System,
      lastUpdated: Number(control.lastUpdated ?? Date.now()),
    };
  };

  const remotePresets: VisualizationPreset[] = Array.isArray(data.visualizationPresets)
    ? data.visualizationPresets.map((preset: Record<string, unknown>) => ({
        id: String(preset.id ?? ''),
        name: String(preset.name ?? ''),
        visualizationId: String(preset.visualizationId ?? ''),
        settings: {},
        enabled: preset.enabled === undefined ? true : Boolean(preset.enabled),
        icon: typeof preset.icon === 'string' ? preset.icon : undefined,
      }))
    : [];

  const messageStats: Record<string, MessageStats> = {};
  if (data.messageStats && typeof data.messageStats === 'object') {
    for (const [messageId, stats] of Object.entries(data.messageStats as Record<string, Record<string, unknown>>)) {
      messageStats[messageId] = {
        messageId: String(stats.messageId ?? messageId),
        triggerCount: Number(stats.triggerCount ?? 0),
        lastTriggered: Number(stats.lastTriggered ?? 0),
        history: [],
      };
    }
  }

  const enabledVisualizations = Array.from(
    new Set([
      typeof data.activeVisualization === 'string' ? data.activeVisualization : 'fireplace',
      ...remotePresets.map((preset) => preset.visualizationId),
    ].filter(Boolean)),
  );

  return {
    configRevision: Number(data.configRevision ?? 0),
    runtimeRevision: Number(data.runtimeRevision ?? 0),
    activeVisualization: typeof data.activeVisualization === 'string' ? data.activeVisualization : 'fireplace',
    enabledVisualizations,
    commonSettings: data.commonSettings ?? DEFAULT_COMMON_SETTINGS,
    visualizationSettings: {},
    visualizationPresets: remotePresets,
    activeVisualizationPreset: data.activeVisualizationPreset ?? null,
    messages: [],
    messageTree: (data.messageTree ?? []) as MessageTreeNode[],
    triggeredMessage: (data.triggeredMessage ?? null) as MessageConfig | null,
    messageStats,
    folderPlaybackQueue: (data.folderPlaybackQueue ?? null) as FolderPlaybackQueue | null,
    playbackControl: parsePlaybackControl(data.playbackControl),
    defaultTextStyle: 'scrolling-capitals',
    textStyleSettings: {},
    textStylePresets: [],
    mode: data.activeVisualization === 'techno' ? 'techno' : 'fireplace',
  };
}

export function useRemoteAppState(options: UseRemoteAppStateOptions = {}) {
  const { apiBase = '' } = options;
  const clientIdRef = useRef(generateClientId());
  const hasReportedPerfRef = useRef(false);
  const hasAnyStateRef = useRef(false);
  const perfRef = useRef<RemoteStartupPerfReport>({
    clientId: clientIdRef.current,
  });

  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>('connecting');

  useEffect(() => {
    const effectiveBase = apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!effectiveBase) {
      return;
    }

    const remoteLoadStartedAt = Date.now();
    const perfEnabled =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('perf') === '1';
    perfRef.current = { clientId: clientIdRef.current };
    hasReportedPerfRef.current = false;
    hasAnyStateRef.current = false;
    setError(null);
    setIsConnected(false);
    setConnectionPhase('connecting');

    let isMounted = true;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reportTimer: ReturnType<typeof setTimeout> | null = null;

    const maybeReportPerf = () => {
      if (!perfEnabled || hasReportedPerfRef.current || perfRef.current.firstUsableRenderMs === undefined) {
        return;
      }

      hasReportedPerfRef.current = true;
      const payload: RemoteStartupPerfReport = {
        ...perfRef.current,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };

      void fetch(`${effectiveBase}/api/perf/remote-startup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        hasReportedPerfRef.current = false;
      });
    };

    const markUsable = (source: 'bootstrap' | 'sse') => {
      if (perfRef.current.firstUsableRenderMs !== undefined) {
        return;
      }

      perfRef.current.firstUsableRenderMs = Date.now() - remoteLoadStartedAt;
      perfRef.current.bootstrapSource = source;
      reportTimer = setTimeout(maybeReportPerf, 500);
    };

    const applyState = (nextState: AppState, source: 'bootstrap' | 'sse') => {
      hasAnyStateRef.current = true;
      setState(nextState);
      setError(null);
      setConnectionPhase(source === 'bootstrap' ? 'degraded' : 'live');
      markUsable(source);
    };

    const connectSse = (attempt: number) => {
      if (!isMounted) {
        return;
      }

      const sseUrl = `${effectiveBase}/api/remote/events?clientId=${encodeURIComponent(clientIdRef.current)}`;
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        if (!isMounted) {
          return;
        }

        setIsConnected(true);
        setConnectionPhase(hasAnyStateRef.current ? 'live' : 'connecting');
        if (perfRef.current.sseOpenLatencyMs === undefined) {
          perfRef.current.sseOpenLatencyMs = Date.now() - remoteLoadStartedAt;
          maybeReportPerf();
        }
      };

      eventSource.addEventListener('state', (event) => {
        if (!isMounted) {
          return;
        }

        try {
          const parsed = parseRemoteState(JSON.parse(event.data));
          setIsConnected(true);
          applyState(parsed, 'sse');
        } catch (stateError) {
          setError(stateError instanceof Error ? stateError.message : 'Failed to parse remote state');
        }
      });

      eventSource.onerror = () => {
        if (!isMounted) {
          return;
        }

        setIsConnected(false);
        eventSource?.close();
        const backoffMs = Math.min(8000, 500 * (2 ** attempt));
        reconnectTimer = setTimeout(() => connectSse(attempt + 1), backoffMs);
        if (hasAnyStateRef.current) {
          setConnectionPhase('degraded');
        }
      };
    };

    const bootstrap = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      try {
        const response = await fetch(
          `${effectiveBase}/api/remote/state${perfEnabled ? '?perf=1' : ''}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        );

        if (!response.ok || !isMounted) {
          return;
        }

        if (perfEnabled) {
          const payloadBytes = response.headers.get('x-vibecast-payload-bytes');
          const serializeMs = response.headers.get('x-vibecast-serialize-ms');
          perfRef.current.payloadBytes = payloadBytes ? Number(payloadBytes) : undefined;
          perfRef.current.serializeMs = serializeMs ? Number(serializeMs) : undefined;
        }

        const nextState = parseRemoteState(await response.json());
        perfRef.current.bootstrapLatencyMs = Date.now() - remoteLoadStartedAt;
        applyState(nextState, 'bootstrap');
      } catch (bootstrapError) {
        if (bootstrapError instanceof Error && bootstrapError.name !== 'AbortError') {
          setError((current) => current ?? bootstrapError.message);
        }
      } finally {
        clearTimeout(timeoutId);
        connectSse(0);
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (reportTimer) {
        clearTimeout(reportTimer);
      }
      eventSource?.close();
    };
  }, [apiBase]);

  return { state, error, isConnected, connectionPhase };
}
