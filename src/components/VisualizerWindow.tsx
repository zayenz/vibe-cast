import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../store';
import { getVisualization } from '../plugins/visualizations';
import { getTextStyle } from '../plugins/textStyles';
import { MessageConfig, CommonVisualizationSettings, getDefaultsFromSchema } from '../plugins/types';
import { getDefaultsFromSchema as getDefaults } from '../plugins/types';
import { computeSplitSequence } from '../utils/messageParts';
import { useAppState } from '../hooks/useAppState';

// API base for sending commands to Rust backend
const API_BASE = 'http://localhost:8080';

/**
 * Helper to calculate the effective height for a message based on its text style settings.
 * This is used to properly stack multiple simultaneous messages without overlap.
 */
function getMessageHeight(
  message: MessageConfig,
  textStyleSettings: Record<string, Record<string, unknown>>,
  textStylePresets: Array<{ id: string; name: string; textStyleId: string; settings: Record<string, unknown> }>
): number {
  // Determine which text style to use
  const preset = message.textStylePreset
    ? textStylePresets.find(p => p.id === message.textStylePreset)
    : null;
  const styleId = preset?.textStyleId || message.textStyle || 'scrolling-capitals';
  
  // Get the settings (preset settings take priority, then global settings, then defaults)
  const baseSettings = preset?.settings || textStyleSettings[styleId] || {};
  const settings = { ...baseSettings, ...message.styleOverrides };
  
  // Get fontSize - different text styles have different default sizes
  // Most use fontSize in rem, but we need to handle variations
  let fontSizeRem = 8; // Default for scrolling-capitals
  
  if (typeof settings.fontSize === 'number') {
    fontSizeRem = settings.fontSize;
  } else if (styleId === 'fade' || styleId === 'bounce' || styleId === 'typewriter') {
    // These styles typically have smaller defaults
    fontSizeRem = typeof settings.fontSize === 'number' ? settings.fontSize : 4;
  } else if (styleId === 'dot-matrix') {
    // Dot matrix uses charHeight in pixels
    const charHeight = typeof settings.charHeight === 'number' ? settings.charHeight : 100;
    return charHeight + 40; // Add some margin
  }
  
  // Convert rem to pixels (1rem = 16px) and add margin
  const fontSizePx = fontSizeRem * 16;
  return fontSizePx + 40; // Add 40px margin between messages
}

/**
 * Send a command to the Rust backend via HTTP
 * This is the single source of truth for state changes
 */
async function sendCommand(command: string, payload: unknown): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, payload }),
    });
  } catch (err) {
    console.error(`[VisualizerWindow] Failed to send command ${command}:`, err);
  }
}

/**
 * Text Style Renderer Component
 * Renders a single message using the appropriate text style plugin
 */
const TextStyleRenderer: React.FC<{
  message: MessageConfig;
  messageTimestamp: number;
  textStyleSettings: Record<string, Record<string, unknown>>;
  textStylePresets: Array<{ id: string; name: string; textStyleId: string; settings: Record<string, unknown> }>;
  verticalOffset?: number;
  repeatCount?: number;
  onComplete: () => void;
}> = ({ message, messageTimestamp, textStyleSettings, textStylePresets, verticalOffset = 0, repeatCount = 1, onComplete }) => {
  const effectiveRepeatCount = repeatCount ?? 1;
  const { splitActive, sequence } = useMemo(
    () => computeSplitSequence({ ...message, repeatCount: effectiveRepeatCount }),
    [effectiveRepeatCount, message]
  );
  const [partIndex, setPartIndex] = useState(0);
  const [partTimestamp, setPartTimestamp] = useState(messageTimestamp);
  const currentMessage = sequence[Math.min(partIndex, sequence.length - 1)] ?? '';
  const pluginRepeatCount = splitActive ? 1 : effectiveRepeatCount;

  useEffect(() => {
    setPartIndex(0);
    setPartTimestamp(messageTimestamp);
  }, [messageTimestamp, message.text, message.splitEnabled, message.splitSeparator, effectiveRepeatCount]);

  const handleComplete = useCallback(() => {
    if (splitActive && partIndex + 1 < sequence.length) {
      const nextIndex = partIndex + 1;
      setPartIndex(nextIndex);
      setPartTimestamp(messageTimestamp + nextIndex);
      return;
    }
    onComplete?.();
  }, [splitActive, partIndex, sequence.length, messageTimestamp, onComplete]);

  // Determine which text style to use
  const preset = message.textStylePreset 
    ? textStylePresets.find(p => p.id === message.textStylePreset)
    : null;
  
  const styleId = preset?.textStyleId || message.textStyle;
  const textStylePlugin = getTextStyle(styleId);
  
  if (!textStylePlugin) {
    // Fallback to scrolling-capitals if style not found
    const fallback = getTextStyle('scrolling-capitals');
    if (!fallback) return null;
    
    const TextStyleComponent = fallback.component;
    const baseSettings = preset?.settings || textStyleSettings['scrolling-capitals'] || {};
    const settings = applySpeedMultiplier(
      { ...baseSettings, ...message.styleOverrides },
      message.speed ?? 1.0
    );
    
    return (
      <TextStyleComponent
        message={currentMessage}
        messageTimestamp={partTimestamp}
        settings={settings}
        verticalOffset={verticalOffset}
        repeatCount={pluginRepeatCount}
        onComplete={handleComplete}
      />
    );
  }

  const TextStyleComponent = textStylePlugin.component;
  const baseSettings = preset?.settings || textStyleSettings[styleId] || getDefaults(textStylePlugin.settingsSchema);
  const settings = applySpeedMultiplier(
    { ...baseSettings, ...message.styleOverrides },
    message.speed ?? 1.0
  );

  // Credits displays all split lines simultaneously as a credits roll
  // Join all parts with newlines instead of showing them sequentially
  const messageToDisplay = (styleId === 'credits' && splitActive)
    ? sequence.join('\n')
    : currentMessage;

  return (
    <TextStyleComponent
      message={messageToDisplay}
      messageTimestamp={partTimestamp}
      settings={settings}
      verticalOffset={verticalOffset}
      repeatCount={pluginRepeatCount}
      onComplete={handleComplete}
    />
  );
};

/**
 * Apply speed multiplier to duration-based settings
 * Speed > 1.0 makes it faster (shorter duration), speed < 1.0 makes it slower (longer duration)
 */
function applySpeedMultiplier(
  settings: Record<string, unknown>,
  speed: number
): Record<string, unknown> {
  if (speed === 1.0) return settings;
  
  const durationKeys = ['duration', 'displayDuration', 'fadeInDuration', 'fadeOutDuration', 'typingSpeed'];
  const result = { ...settings };
  
  durationKeys.forEach(key => {
    if (result[key] !== undefined && typeof result[key] === 'number') {
      // Divide by speed: speed 2.0 = half duration (faster), speed 0.5 = double duration (slower)
      result[key] = (result[key] as number) / speed;
    }
  });
  
  return result;
}

/**
 * Visualization Renderer Component
 * Renders the active visualization using the appropriate plugin
 */
const VisualizationRenderer: React.FC<{
  visualizationId: string;
  audioData: number[];
  commonSettings: CommonVisualizationSettings;
  visualizationSettings: Record<string, Record<string, unknown>>;
  presetSettings?: Record<string, unknown>;
}> = ({ visualizationId, audioData, commonSettings, visualizationSettings, presetSettings }) => {
  const plugin = getVisualization(visualizationId);
  
  // Debug logging - log once when key settings change
  const lastLoggedRef = useRef<string>('');
  const logKey = JSON.stringify({ visualizationId, presetSettings, storedKeys: Object.keys(visualizationSettings) });
  if (logKey !== lastLoggedRef.current) {
    lastLoggedRef.current = logKey;
    console.log('[VisualizationRenderer] Settings update:', {
      visualizationId,
      pluginFound: !!plugin,
      presetSettings: presetSettings ? Object.keys(presetSettings) : 'none',
      presetSettingsValues: presetSettings,
      storedSettingsKeys: Object.keys(visualizationSettings),
      storedForThisViz: visualizationSettings[visualizationId],
    });
  }
  
  if (!plugin) {
    // Fallback to fireplace if visualization not found
    const fallback = getVisualization('fireplace');
    if (!fallback) return <div className="absolute inset-0 bg-black" />;
    
    const VizComponent = fallback.component;
    // Merge stored settings with defaults from schema
    const defaultSettings = getDefaultsFromSchema(fallback.settingsSchema);
    const storedSettings = visualizationSettings['fireplace'] || {};
    const customSettings = { ...defaultSettings, ...storedSettings };
    
    return (
      <div className="absolute inset-0">
        <VizComponent
          audioData={audioData}
          commonSettings={commonSettings}
          customSettings={customSettings}
        />
      </div>
    );
  }

  const VizComponent = plugin.component;
  // Merge stored settings with defaults from schema
  const defaultSettings = getDefaultsFromSchema(plugin.settingsSchema);
  const storedSettings = visualizationSettings[visualizationId] || {};
  // If an active preset is selected, merge its settings as well (preset overrides default, but per-visualization stored settings win last)
  // Order: defaults -> stored -> active preset (preset wins over stored)
  const customSettings = { ...defaultSettings, ...storedSettings, ...(presetSettings || {}) };
  
  // Debug log the final merged settings
  if (logKey !== lastLoggedRef.current || !lastLoggedRef.current) {
    console.log('[VisualizationRenderer] Final customSettings:', {
      visualizationId,
      folderPath: customSettings.folderPath,
      videoUrl: customSettings.videoUrl,
      allKeys: Object.keys(customSettings),
    });
  }

  return (
    <div className="absolute inset-0">
      <VizComponent
        audioData={audioData}
        commonSettings={commonSettings}
        customSettings={customSettings}
      />
    </div>
  );
};

export const VisualizerWindow: React.FC = () => {
  // Get state from store
  const activeVisualization = useStore((state) => state.activeVisualization);
  const activeVisualizationPreset = useStore((state) => state.activeVisualizationPreset);
  const visualizationPresets = useStore((state) => state.visualizationPresets);
  const audioData = useStore((state) => state.audioData);
  const commonSettings = useStore((state) => state.commonSettings);
  const visualizationSettings = useStore((state) => state.visualizationSettings);
  const activeMessages = useStore((state) => state.activeMessages);
  const textStyleSettings = useStore((state) => state.textStyleSettings);
  const textStylePresets = useStore((state) => state.textStylePresets);
  
  // Get active preset if available
  const activePreset = activeVisualizationPreset 
    ? visualizationPresets.find(p => p.id === activeVisualizationPreset)
    : null;
  
  // Actions
  const setAudioData = useStore((state) => state.setAudioData);
  const setActiveVisualization = useStore((state) => state.setActiveVisualization);
  const setMessages = useStore((state) => state.setMessages);
  const triggerMessage = useStore((state) => state.triggerMessage);
  const clearMessage = useStore((state) => state.clearMessage);
  const setCommonSettings = useStore((state) => state.setCommonSettings);
  const setVisualizationSetting = useStore((state) => state.setVisualizationSetting);
  const setVisualizationSettings = useStore((state) => state.setVisualizationSettings);
  const setTextStyleSetting = useStore((state) => state.setTextStyleSetting);
  const loadConfiguration = useStore((state) => state.loadConfiguration);
  
  // Legacy compatibility
  const setMode = useStore((state) => state.setMode);

  // Subscribe to SSE stream for initial configuration load
  // This ensures VisualizerWindow gets the same config as ControlPlane on startup
  // Must use the same API base as ControlPlane to connect to the Axum server
  const { state: sseState, isConnected: sseConnected } = useAppState({ apiBase: 'http://localhost:8080' });

  // Load SSE state into local zustand store when it arrives
  useEffect(() => {
    console.log('[VisualizerWindow] SSE effect triggered:', {
      sseState: sseState ? 'received' : 'null',
      sseConnected,
    });
    
    if (!sseState) {
      console.log('[VisualizerWindow] SSE state is null, waiting...');
      return;
    }
    
    console.log('[VisualizerWindow] SSE state received:', {
      activeVisualization: sseState.activeVisualization,
      activeVisualizationPreset: sseState.activeVisualizationPreset,
      presetsCount: sseState.visualizationPresets?.length ?? 0,
      presetIds: sseState.visualizationPresets?.map(p => ({ id: p.id, name: p.name, vizId: p.visualizationId })),
    });
    
    loadConfiguration({
      version: 1,
      activeVisualization: sseState.activeVisualization,
      activeVisualizationPreset: sseState.activeVisualizationPreset ?? undefined,
      enabledVisualizations: sseState.enabledVisualizations,
      commonSettings: sseState.commonSettings,
      visualizationSettings: sseState.visualizationSettings ?? {},
      visualizationPresets: sseState.visualizationPresets ?? [],
      messages: sseState.messages ?? [],
      messageTree: sseState.messageTree,
      defaultTextStyle: sseState.defaultTextStyle,
      textStyleSettings: sseState.textStyleSettings ?? {},
      textStylePresets: sseState.textStylePresets ?? [],
      messageStats: sseState.messageStats ?? {},
    }, false); // sync=false to avoid broadcasting back
    
    console.log('[VisualizerWindow] Config loaded into store');
  }, [sseState, loadConfiguration]);

  // Sync folderPlaybackQueue from SSE state to zustand store
  // This is runtime state (not config), so sync it separately
  useEffect(() => {
    if (!sseState) return;
    
    const sseQueue = sseState.folderPlaybackQueue;
    const currentQueue = useStore.getState().folderPlaybackQueue;
    
    // Only update if different to avoid unnecessary re-renders
    if (JSON.stringify(sseQueue) !== JSON.stringify(currentQueue)) {
      console.log('[VisualizerWindow] Syncing folderPlaybackQueue from SSE:', sseQueue);
      useStore.setState({ folderPlaybackQueue: sseQueue ?? null });
    }
  }, [sseState?.folderPlaybackQueue]);

  // Debug: Log current state after store updates
  useEffect(() => {
    console.log('[VisualizerWindow] Store state:', {
      activeVisualization,
      activeVisualizationPreset,
      presetsCount: visualizationPresets.length,
      presetNames: visualizationPresets.map(p => p.name),
      activePreset: activePreset ? { 
        id: activePreset.id, 
        name: activePreset.name, 
        vizId: activePreset.visualizationId,
        settings: activePreset.settings 
      } : null,
    });
  }, [activeVisualization, activeVisualizationPreset, visualizationPresets, activePreset]);

  // Determine which visualization and settings to use based on preset
  const targetVizId = activePreset ? activePreset.visualizationId : activeVisualization;
  
  console.log('[VisualizerWindow] Target visualization:', targetVizId, 'from preset:', activePreset?.name ?? 'none');

  // Health watchdog: detect long-running stalls and attempt a safe remount.
  const [vizRemountKey, setVizRemountKey] = useState(0);
  const lastRafRef = useRef<number>(performance.now());
  const lastAudioRef = useRef<number>(Date.now());
  const [recoveryCount, setRecoveryCount] = useState(0);

  // Throttle audio updates to at most one store update per animation frame.
  const audioRafRef = useRef<number | null>(null);
  const latestAudioRef = useRef<number[] | null>(null);

  useEffect(() => {
    // Listen for audio data from Rust
    const unlistenAudio = listen<number[]>('audio-data', (event) => {
      latestAudioRef.current = event.payload;
      // Coalesce multiple audio events into a single store update per frame.
      if (audioRafRef.current == null) {
        audioRafRef.current = requestAnimationFrame(() => {
          audioRafRef.current = null;
          if (latestAudioRef.current) {
            setAudioData(latestAudioRef.current);
          }
        });
      }
      lastAudioRef.current = Date.now();
    });

    // Listen for remote commands
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unlistenRemote = listen<{ command: string, payload?: any }>('remote-command', (event) => {
      console.log('Received remote-command:', event.payload);
      const { command, payload } = event.payload;
      
      switch (command) {
        case 'set-mode':
          setMode(payload, false);
          break;
        case 'set-active-visualization':
          setActiveVisualization(payload, false);
          break;
        case 'set-active-visualization-preset':
          // Handle preset activation from remote
          useStore.setState({ activeVisualizationPreset: payload });
          // Also update active visualization based on preset
          if (payload) {
            const preset = useStore.getState().visualizationPresets.find(p => p.id === payload);
            if (preset) {
              setActiveVisualization(preset.visualizationId, false);
            }
          }
          break;
        case 'set-visualization-presets':
          // Update visualization presets from remote
          if (payload && Array.isArray(payload)) {
            useStore.setState({ visualizationPresets: payload });
          }
          break;
        case 'trigger-message': {
          // Handle both legacy string and new MessageConfig formats
          const msg =
            typeof payload === 'string'
              ? { id: 'triggered', text: payload, textStyle: 'scrolling-capitals' }
              : (payload as MessageConfig);
          // Avoid duplicate triggers if already active
          const isActive = useStore.getState().activeMessages.some((am) => am.message.id === msg.id);
          if (!isActive) {
            triggerMessage(msg, false);
          }
          break;
        }
        case 'set-common-settings':
          setCommonSettings(payload, false);
          break;
        case 'set-visualization-settings':
          console.log('VisualizerWindow: Received set-visualization-settings', payload);
          if (payload && typeof payload === 'object') {
            setVisualizationSettings(payload as Record<string, Record<string, unknown>>, false);
          }
          break;
        case 'load-configuration':
          loadConfiguration(payload, false);
          break;
        case 'clear-active-message': {
          if (payload && typeof payload === 'object' && 'messageId' in payload) {
            const { messageId, timestamp } = payload as { messageId: string; timestamp?: number };
            const ts = typeof timestamp === 'number' ? timestamp : 0;
            useStore.getState().clearActiveMessage(messageId, ts, false);
          }
          break;
        }
        case 'play-folder':
          // Folder playback handled by ControlPlane, visualizer just needs to display triggered messages
          break;
        case 'cancel-folder-playback':
          // Cancel folder queue and clear current message
          useStore.getState().cancelFolderPlayback(false);
          break;
        case 'clear-message':
          // Clear all active messages (used by folder cancellation)
          useStore.setState({ activeMessages: [], activeMessage: null, messageTimestamp: 0 });
          break;
      }
    });

    // Listen for state changes from other windows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unlistenState = listen<{ type: string, payload: any }>('state-changed', (event) => {
      console.log('Received state-changed:', event.payload);
      const { type, payload } = event.payload;
      
      switch (type) {
        case 'SET_MODE':
          setMode(payload, false);
          break;
        case 'SET_ACTIVE_VISUALIZATION':
          setActiveVisualization(payload, false);
          break;
        case 'SET_MESSAGES':
          setMessages(payload, false);
          break;
        case 'TRIGGER_MESSAGE': {
          // Handle both legacy string and new MessageConfig formats
          const msg =
            typeof payload === 'string'
              ? { id: 'triggered', text: payload, textStyle: 'scrolling-capitals' }
              : (payload as MessageConfig);
          const isActive = useStore.getState().activeMessages.some((am) => am.message.id === msg.id);
          if (!isActive) {
            triggerMessage(msg, false);
          }
          break;
        }
        case 'SET_COMMON_SETTINGS':
          setCommonSettings(payload, false);
          break;
        case 'SET_VISUALIZATION_SETTINGS':
          // Full replacement of visualization settings
          if (payload && typeof payload === 'object') {
            setVisualizationSettings(payload as Record<string, Record<string, unknown>>, false);
          }
          break;
        case 'SET_VISUALIZATION_PRESETS':
          // Update visualization presets
          if (payload && Array.isArray(payload)) {
            useStore.setState({ visualizationPresets: payload });
          }
          break;
        case 'SET_ACTIVE_VISUALIZATION_PRESET':
          // Update active preset
          useStore.setState({ activeVisualizationPreset: payload });
          break;
        case 'SET_TEXT_STYLE_SETTINGS':
          // Full replacement of text style settings
          Object.entries(payload || {}).forEach(([styleId, settings]) => {
            Object.entries(settings as Record<string, unknown>).forEach(([key, value]) => {
              setTextStyleSetting(styleId, key, value, false);
            });
          });
          break;
        case 'SET_TEXT_STYLE_PRESETS':
          // Update text style presets
          if (payload && Array.isArray(payload)) {
            useStore.setState({ textStylePresets: payload });
          }
          break;
        case 'LOAD_CONFIGURATION':
          loadConfiguration(payload, false);
          break;
        case 'CLEAR_MESSAGE':
          // Clear message by timestamp (handled locally, no sync needed)
          // Payload can be { timestamp, messageId } or just timestamp (legacy)
          if (payload && typeof payload === 'object' && 'timestamp' in payload) {
            const { timestamp, messageId } = payload as { timestamp: number; messageId?: string };
            clearMessage(timestamp, false, messageId);
          } else if (typeof payload === 'number') {
            clearMessage(payload, false);
          }
          break;
        case 'CLEAR_ACTIVE_MESSAGE': {
          // Clear specific active message; allow missing timestamp (clear by id)
          if (payload && typeof payload === 'object' && 'messageId' in payload) {
            const { messageId, timestamp } = payload as { messageId: string; timestamp?: number };
            const ts = typeof timestamp === 'number' ? timestamp : 0;
            useStore.getState().clearActiveMessage(messageId, ts, false);
          }
          break;
        }
      }
    });

    return () => {
      unlistenAudio.then((u) => u());
      unlistenRemote.then((u) => u());
      unlistenState.then((u) => u());
      if (audioRafRef.current != null) {
        cancelAnimationFrame(audioRafRef.current);
        audioRafRef.current = null;
      }
    };
  }, [
    setAudioData, 
    setMode, 
    setActiveVisualization, 
    setMessages, 
    triggerMessage,
    clearMessage,
    setCommonSettings,
    setVisualizationSetting,
    setVisualizationSettings,
    setTextStyleSetting,
    loadConfiguration,
  ]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      lastRafRef.current = performance.now();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Get settings for the target visualization
  const vizSettings = activePreset 
    ? { [targetVizId]: activePreset.settings }
    : visualizationSettings;
  
  // Debug: Log the settings being computed
  console.log('[VisualizerWindow] vizSettings computed:', {
    hasActivePreset: !!activePreset,
    targetVizId,
    vizSettingsKeys: Object.keys(vizSettings),
    presetSettingsForRenderer: activePreset && activePreset.visualizationId === targetVizId
      ? { hasSettings: true, folderPath: activePreset.settings?.folderPath, videoUrl: activePreset.settings?.videoUrl }
      : 'undefined (no preset or vizId mismatch)',
  });

  useEffect(() => {
    // Only run in dev; we don't want surprise remounts in production without explicit opt-in.
    if (!import.meta.env.DEV) return;
    const interval = window.setInterval(() => {
      // Avoid false positives when app is not visible/focused and RAF is throttled.
      if (document.hidden) return;
      const nowPerf = performance.now();
      const now = Date.now();
      const msSinceRaf = nowPerf - lastRafRef.current;
      const msSinceAudio = now - lastAudioRef.current;

      // If RAF is stalled for a long time while visible, attempt a remount.
      // This helps recover from intermittent compositor/GPU hiccups without restarting the app.
      if (msSinceRaf > 15_000) {
        console.warn('[VisualizerWindow] RAF stalled, attempting visualization remount', {
          msSinceRaf,
          msSinceAudio,
          targetVizId,
        });
        setRecoveryCount((c) => c + 1);
        setVizRemountKey((k) => k + 1);
      }
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [targetVizId]);

  // Dev overlay (default OFF; opt-in via localStorage or query param)
  const devOverlayEnabledByQuery = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('vizDebug') === '1';
    } catch {
      return false;
    }
  }, []);
  const [showDevOverlay, setShowDevOverlay] = useState<boolean>(() => {
    // Only show in dev mode, and only if query param is set
    // (localStorage disabled by default to avoid showing debug overlay unexpectedly)
    if (!import.meta.env.DEV) return false;
    if (devOverlayEnabledByQuery) return true;
    return false;
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    try {
      window.localStorage.setItem('vibecast:vizDebug', showDevOverlay ? '1' : '0');
    } catch {
      // ignore
    }
  }, [showDevOverlay]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + D toggles overlay
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setShowDevOverlay((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden" style={{ backgroundColor: '#000' }}>
      {/* Debug overlay (dev-only): helps diagnose "blank/grey visualizer" reports */}
      {import.meta.env.DEV && showDevOverlay && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 9999,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: 11,
            lineHeight: 1.35,
            padding: '6px 8px',
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.85)',
            pointerEvents: 'none',
          }}
        >
          <div>targetVizId: {String(targetVizId)}</div>
          <div>activePreset: {activePreset ? `${activePreset.name} (${activePreset.id})` : 'none'}</div>
          <div>audioData: {Array.isArray(audioData) ? audioData.length : 'n/a'}</div>
          <div>common: {commonSettings ? `intensity=${commonSettings.intensity} dim=${commonSettings.dim}` : 'n/a'}</div>
          <div>recoveryCount: {recoveryCount}</div>
        </div>
      )}
      <div className="absolute inset-0">
        <VisualizationRenderer
          key={vizRemountKey}
          visualizationId={targetVizId}
          audioData={audioData}
          commonSettings={commonSettings}
          visualizationSettings={vizSettings}
          presetSettings={
            activePreset && activePreset.visualizationId === targetVizId
              ? activePreset.settings
              : undefined
          }
        />
      </div>
      {/* Render all active messages - they can coexist with higher z-index */}
      <div className="absolute inset-0 pointer-events-none z-[100]">
        {activeMessages.map(({ message, timestamp }, index) => {
          // Calculate cumulative vertical offset based on heights of previous messages
          let cumulativeOffset = 0;
          for (let i = 0; i < index; i++) {
            cumulativeOffset += getMessageHeight(
              activeMessages[i].message,
              textStyleSettings,
              textStylePresets
            );
          }
          
          return (
            <TextStyleRenderer
              key={timestamp}
              message={message}
              messageTimestamp={timestamp}
              textStyleSettings={textStyleSettings}
              textStylePresets={textStylePresets}
              verticalOffset={cumulativeOffset}
              repeatCount={message.repeatCount ?? 1}
              onComplete={() => {
                // Clear from local state
                clearMessage(timestamp, false, message.id);
                // Notify Rust backend - it handles queue advancement
                sendCommand('message-complete', { messageId: message.id });
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
