export type E2EClientKind = 'remote' | 'control_plane' | 'visualizer' | 'server';
export type E2EConnectionPhase = 'connecting' | 'degraded' | 'live';

export interface E2EClientContext {
  sessionId: string;
  clientId: string;
  clientLabel: string;
  clientKind: E2EClientKind;
}

export interface E2EStateSnapshot {
  configRevision: number;
  runtimeRevision: number;
  activeVisualization: string;
  activeVisualizationPreset: string | null;
  triggeredMessageId: string | null;
  playbackSessionId: string | null;
  playbackIsPlaying: boolean;
  playbackCurrentMessageId: string | null;
  queueFolderId: string | null;
  queueCurrentIndex: number | null;
  queueCurrentMessageId: string | null;
  messageTriggerCounts: Record<string, number>;
  connectionPhase?: E2EConnectionPhase;
}

interface SnapshotLikeState {
  configRevision?: number;
  runtimeRevision?: number;
  activeVisualization?: string;
  activeVisualizationPreset?: string | null;
  triggeredMessage?: { id?: string | null } | null;
  playbackControl?: {
    sessionId?: string | null;
    currentMessage?: { id?: string | null } | null;
    isPlaying?: boolean;
  } | null;
  folderPlaybackQueue?: {
    folderId?: string | null;
    messageIds?: string[];
    currentIndex?: number;
  } | null;
  messageStats?: Record<string, { triggerCount?: number } | number>;
}

interface E2EConfigResponse {
  enabled?: boolean;
  activeSessionId?: string | null;
}

declare global {
  interface Window {
    __VIBECAST_E2E_CONTEXT__?: E2EClientContext | null;
    __VIBECAST_E2E_SNAPSHOT__?: E2EStateSnapshot | null;
    __VIBECAST_E2E__?: {
      getContext: () => E2EClientContext | null;
      getSnapshot: () => E2EStateSnapshot | null;
    };
  }
}

function getSearchParams(): URLSearchParams | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return new URLSearchParams(window.location.search);
}

function buildFallbackClientId(clientKind: E2EClientKind): string {
  return `${clientKind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureWindowBridge(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.__VIBECAST_E2E__ = {
    getContext: () => window.__VIBECAST_E2E_CONTEXT__ ?? null,
    getSnapshot: () => window.__VIBECAST_E2E_SNAPSHOT__ ?? null,
  };
}

export function setE2EContext(context: E2EClientContext | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.__VIBECAST_E2E_CONTEXT__ = context;
  ensureWindowBridge();
}

export function getE2EContext(): E2EClientContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.__VIBECAST_E2E_CONTEXT__ ?? null;
}

export function readE2EContextFromUrl(
  defaultKind: E2EClientKind,
  defaultLabel: string,
): E2EClientContext | null {
  const params = getSearchParams();
  if (!params) {
    return null;
  }

  const enabled = params.get('e2e');
  const sessionId = params.get('sessionId');
  if (enabled !== '1' || !sessionId) {
    return null;
  }

  const rawKind = params.get('clientKind') as E2EClientKind | null;
  const clientKind = rawKind ?? defaultKind;
  const context: E2EClientContext = {
    sessionId,
    clientId: params.get('clientId') ?? buildFallbackClientId(clientKind),
    clientLabel: params.get('clientLabel') ?? defaultLabel,
    clientKind,
  };
  setE2EContext(context);
  return context;
}

export async function discoverE2EContext(
  apiBase: string,
  defaultKind: E2EClientKind,
  defaultLabel: string,
): Promise<E2EClientContext | null> {
  const existing = getE2EContext();
  if (existing) {
    return existing;
  }

  const fromUrl = readE2EContextFromUrl(defaultKind, defaultLabel);
  if (fromUrl) {
    return fromUrl;
  }

  const effectiveBase = apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!effectiveBase) {
    return null;
  }

  try {
    const response = await fetch(`${effectiveBase}/api/e2e/config`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }

    const config = await response.json() as E2EConfigResponse;
    if (!config.enabled || !config.activeSessionId) {
      return null;
    }

    const context: E2EClientContext = {
      sessionId: config.activeSessionId,
      clientId: defaultKind === 'control_plane' ? 'control-plane' : defaultKind,
      clientLabel: defaultLabel,
      clientKind: defaultKind,
    };
    setE2EContext(context);
    return context;
  } catch {
    return null;
  }
}

export function getCommandE2EMetadata(): Partial<E2EClientContext> {
  const context = getE2EContext();
  if (!context) {
    return {};
  }
  return {
    sessionId: context.sessionId,
    clientId: context.clientId,
    clientLabel: context.clientLabel,
    clientKind: context.clientKind,
  };
}

export async function postE2EProbe(
  apiBase: string,
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  const context = getE2EContext();
  const effectiveBase = apiBase || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!context || !effectiveBase) {
    return false;
  }

  try {
    await fetch(`${effectiveBase}/api/e2e/session/${encodeURIComponent(context.sessionId)}/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        sessionId: context.sessionId,
        clientId: context.clientId,
        clientLabel: context.clientLabel,
        clientKind: context.clientKind,
        eventType,
        ts: Date.now(),
        payload,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

export function buildE2EStateSnapshot(
  state: SnapshotLikeState | null | undefined,
  connectionPhase?: E2EConnectionPhase,
): E2EStateSnapshot | null {
  if (!state) {
    return null;
  }

  const queue = state.folderPlaybackQueue ?? null;
  const queueCurrentIndex = typeof queue?.currentIndex === 'number' ? queue.currentIndex : null;
  const queueCurrentMessageId =
    queueCurrentIndex !== null && Array.isArray(queue?.messageIds)
      ? queue.messageIds[queueCurrentIndex] ?? null
      : null;

  const messageTriggerCounts = Object.fromEntries(
    Object.entries(state.messageStats ?? {}).map(([messageId, value]) => [
      messageId,
      typeof value === 'number' ? value : Number(value?.triggerCount ?? 0),
    ]),
  );

  return {
    configRevision: Number(state.configRevision ?? 0),
    runtimeRevision: Number(state.runtimeRevision ?? 0),
    activeVisualization: state.activeVisualization ?? 'fireplace',
    activeVisualizationPreset: state.activeVisualizationPreset ?? null,
    triggeredMessageId: state.triggeredMessage?.id ?? null,
    playbackSessionId: state.playbackControl?.sessionId ?? null,
    playbackIsPlaying: Boolean(state.playbackControl?.isPlaying),
    playbackCurrentMessageId: state.playbackControl?.currentMessage?.id ?? null,
    queueFolderId: queue?.folderId ?? null,
    queueCurrentIndex,
    queueCurrentMessageId,
    messageTriggerCounts,
    connectionPhase,
  };
}

export function publishE2EWindowSnapshot(snapshot: E2EStateSnapshot | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.__VIBECAST_E2E_SNAPSHOT__ = snapshot;
  ensureWindowBridge();
}
