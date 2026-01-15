import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { useStore } from '../store';
import { getVisualization } from '../plugins/visualizations';
import { getTextStyle } from '../plugins/textStyles';
import { MessageConfig, CommonVisualizationSettings, RemoteCommand, getDefaultsFromSchema } from '../plugins/types';
import { getDefaultsFromSchema as getDefaults } from '../plugins/types';
import { computeSplitSequence } from '../utils/messageParts';
import { useAppState } from '../hooks/useAppState';
import { resolveMessageText } from '../utils/messageLoader';

// API base for sending commands to Rust backend
const API_BASE = import.meta.env.DEV ? 'http://localhost:8080' : '';

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
    const response = await fetch(`${API_BASE}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, payload }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    console.log(`[VisualizerWindow] Successfully sent command ${command}`);
  } catch (err) {
    console.error(`[VisualizerWindow] Failed to send command ${command}:`, err);
    throw err; // Re-throw so callers can handle it
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
}> = ({ message, messageTimestamp, textStyleSettings, textStylePresets = [], verticalOffset = 0, repeatCount = 1, onComplete }) => {
  const effectiveRepeatCount = repeatCount ?? 1;
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  
  // State for resolved message (with text loaded from file if needed)
  const [resolvedMessage, setResolvedMessage] = useState<MessageConfig>(message);
  const [isLoading, setIsLoading] = useState(false);
  
  // Load message text from file if textFile is specified
  useEffect(() => {
    if (message.textFile) {
      setIsLoading(true);
      resolveMessageText(message).then(resolved => {
        setResolvedMessage(resolved);
        setIsLoading(false);
      }).catch(err => {
        console.error('Failed to resolve message text:', err);
        setResolvedMessage({
          ...message,
          text: `[Error loading file: ${message.textFile}]`
        });
        setIsLoading(false);
      });
    } else {
      setResolvedMessage(message);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.textFile, message.text, messageTimestamp]);
  
  const { splitActive, sequence } = useMemo(
    () => computeSplitSequence({ ...resolvedMessage, repeatCount: effectiveRepeatCount }),
    [effectiveRepeatCount, resolvedMessage]
  );
  const [partIndex, setPartIndex] = useState(0);
  const [partTimestamp, setPartTimestamp] = useState(messageTimestamp);
  const currentMessage = sequence[Math.min(partIndex, sequence.length - 1)] ?? '';

  useEffect(() => {
    setPartIndex(0);
    setPartTimestamp(messageTimestamp);
  }, [messageTimestamp, resolvedMessage.text, resolvedMessage.splitEnabled, resolvedMessage.splitSeparator, effectiveRepeatCount]);

  // Determine which text style to use
  const preset = resolvedMessage.textStylePreset 
    ? textStylePresets.find(p => p.id === resolvedMessage.textStylePreset)
    : null;
  
  const styleId = preset?.textStyleId || resolvedMessage.textStyle;
  const splitForSequencing = splitActive && styleId !== 'credits';
  const pluginRepeatCount = splitForSequencing ? 1 : effectiveRepeatCount;

  const handleComplete = useCallback(() => {
    if (splitForSequencing && partIndex + 1 < sequence.length) {
      const nextIndex = partIndex + 1;
      setPartIndex(nextIndex);
      setPartTimestamp(messageTimestamp + nextIndex);
      return;
    }
    onCompleteRef.current?.();
  }, [splitForSequencing, partIndex, sequence.length, messageTimestamp]);
  const textStylePlugin = getTextStyle(styleId);
  
  if (!textStylePlugin) {
    // Fallback to scrolling-capitals if style not found
    const fallback = getTextStyle('scrolling-capitals');
    if (!fallback) return null;
    
    const TextStyleComponent = fallback.component;
    const baseSettings = preset?.settings || textStyleSettings['scrolling-capitals'] || {};
    const settings = applySpeedMultiplier(
      { ...baseSettings, ...resolvedMessage.styleOverrides },
      resolvedMessage.speed ?? 1.0
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
    { ...baseSettings, ...resolvedMessage.styleOverrides },
    resolvedMessage.speed ?? 1.0
  );

  // Credits displays all split lines simultaneously as a credits roll
  // Join all parts with newlines instead of showing them sequentially
  const messageToDisplay = (styleId === 'credits' && splitActive)
    ? sequence.join('\n')
    : currentMessage;

  // Don't render while loading text from file (but keep hooks above this point stable)
  if (isLoading) {
    return null;
  }

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
  debug?: boolean;
}> = ({ visualizationId, audioData, commonSettings, visualizationSettings, presetSettings, debug = false }) => {
  const requestedPlugin = getVisualization(visualizationId);
  const fallbackPlugin = getVisualization('fireplace');
  // Use requested plugin if found, otherwise fallback
  const plugin = requestedPlugin || fallbackPlugin;
  
  // Debug logging (opt-in): avoid heavy JSON/logging in the hot path for long-running stability.
  const lastLoggedRef = useRef<string>('');
  useEffect(() => {
    if (debug && import.meta.env.DEV) {
      const logKey = `${visualizationId}|${presetSettings ? Object.keys(presetSettings).join(',') : 'none'}|${Object.keys(visualizationSettings).join(',')}`;
      if (logKey !== lastLoggedRef.current) {
        lastLoggedRef.current = logKey;
        console.log('[VisualizationRenderer] Settings update:', {
          visualizationId,
          pluginFound: !!requestedPlugin,
          usingFallback: !requestedPlugin && !!plugin,
          presetSettings: presetSettings ? Object.keys(presetSettings) : 'none',
          storedSettingsKeys: Object.keys(visualizationSettings),
        });
      }
    }
  }, [debug, visualizationId, presetSettings, visualizationSettings, requestedPlugin, plugin]);
  
  // Memoize default settings (safely handle null plugin just in case)
  const defaultSettings = useMemo(() => 
    plugin ? getDefaultsFromSchema(plugin.settingsSchema) : {}, 
    [plugin]
  );

  // Memoize merged settings
  // If we are using the requested plugin, we use its ID for stored settings and mix in presetSettings.
  // If we fell back, we use 'fireplace' ID and IGNORE presetSettings (since they were for the missing viz).
  const customSettings = useMemo(() => {
    if (!plugin) return {};
    
    const isFallback = plugin !== requestedPlugin;
    const targetId = plugin.id;
    const stored = visualizationSettings[targetId] || {};
    
    if (isFallback) {
      return { ...defaultSettings, ...stored };
    } else {
      return { ...defaultSettings, ...stored, ...(presetSettings || {}) };
    }
  }, [plugin, requestedPlugin, defaultSettings, visualizationSettings, presetSettings]);
  
  // Debug log the final merged settings (opt-in)
  if (debug && import.meta.env.DEV) {
    console.log('[VisualizationRenderer] Final customSettings keys:', {
      visualizationId: plugin?.id || 'none',
      keys: Object.keys(customSettings),
    });
  }

  if (!plugin) return <div className="absolute inset-0 bg-black" />;

  const VizComponent = plugin.component;

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

// In-memory log buffer for production debugging (when console isn't accessible)
const debugLogBuffer: Array<{ timestamp: number; level: string; message: string; data?: unknown }> = [];
const MAX_LOG_ENTRIES = 50;

function addDebugLog(level: string, message: string, data?: unknown) {
  debugLogBuffer.push({
    timestamp: Date.now(),
    level,
    message,
    data,
  });
  // Keep only last MAX_LOG_ENTRIES
  if (debugLogBuffer.length > MAX_LOG_ENTRIES) {
    debugLogBuffer.shift();
  }
  // Also log to console if available
  const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  logFn(`[VisualizerWindow] ${message}`, data || '');
}

export const VisualizerWindow: React.FC = () => {
  // State for showing log viewer in debug overlay
  const [showLogs, setShowLogs] = useState(false);
  
  // Get state from store
  const activeVisualization = useStore((state) => state.activeVisualization);
  const activeVisualizationPreset = useStore((state) => state.activeVisualizationPreset);
  const visualizationPresets = useStore((state) => state.visualizationPresets);
  const audioData = useStore((state) => state.audioData);
  const commonSettings = useStore((state) => state.commonSettings);
  const visualizationSettings = useStore((state) => state.visualizationSettings);
  const activeMessages = useStore((state) => state.activeMessages);
  
  // Debug overlay - works in both dev and production
  // Enable via query param ?vizDebug=1, localStorage key 'vibecast:vizDebug', or click the debug button
  const devOverlayEnabledByQuery = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('vizDebug') === '1';
    } catch {
      return false;
    }
  }, []);
  
  // Check for auto-enable conditions (production-friendly)
  const shouldAutoEnableDebug = useMemo(() => {
    // Auto-enable if query param is set
    if (devOverlayEnabledByQuery) return true;
    
    // Auto-enable if localStorage flag is set
    try {
      const stored = window.localStorage.getItem('vibecast:vizDebug');
      if (stored === '1') return true;
    } catch {
      // ignore
    }
    
    // Auto-enable if we detect we're in a problematic state (no SSE connection after 3 seconds)
    // This helps diagnose issues automatically
    return false;
  }, [devOverlayEnabledByQuery]);
  
  const [showDevOverlay, setShowDevOverlay] = useState<boolean>(shouldAutoEnableDebug);

  // Persist debug overlay state to localStorage (works in both dev and production)
  useEffect(() => {
    try {
      window.localStorage.setItem('vibecast:vizDebug', showDevOverlay ? '1' : '0');
    } catch {
      // ignore
    }
  }, [showDevOverlay]);
  
  // Debug: Log activeMessages changes
  useEffect(() => {
    addDebugLog('log', 'activeMessages changed', {
      count: activeMessages.length,
      messages: activeMessages.map(am => ({ id: am.message.id, text: am.message.text?.substring(0, 30), timestamp: am.timestamp })),
    });
  }, [activeMessages]);
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

  // Helper to handle remote commands (from both Tauri events and SSE)
  const handleRemoteCommand = useCallback((command: string, payload: unknown) => {
    console.log('Received remote-command:', command, payload);
      
    switch (command) {
      case 'set-mode':
        if (typeof payload === 'string') setMode(payload as 'fireplace' | 'techno', false);
        break;
      case 'set-active-visualization':
        if (typeof payload === 'string') setActiveVisualization(payload, false);
        break;
      case 'set-active-visualization-preset':
        // Handle preset activation from remote
        if (payload === null || typeof payload === 'string') {
          useStore.setState({ activeVisualizationPreset: payload });
          // Also update active visualization based on preset
          if (payload) {
            const preset = useStore.getState().visualizationPresets.find(p => p.id === payload);
            if (preset) {
              setActiveVisualization(preset.visualizationId, false);
            }
          }
        }
        break;
      case 'set-visualization-presets':
        // Update visualization presets from remote
        if (payload && Array.isArray(payload)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          useStore.setState({ visualizationPresets: payload as any[] });
        }
        break;
      case 'trigger-message': {
        // Handle both legacy string and new MessageConfig formats
        const msg =
          typeof payload === 'string'
            ? { id: 'triggered', text: payload, textStyle: 'scrolling-capitals' }
            : (payload as MessageConfig);
        console.log('[VisualizerWindow] Received trigger-message:', { id: msg.id, text: msg.text?.substring(0, 50) });
        // Avoid duplicate triggers if already active
        const isActive = useStore.getState().activeMessages.some((am) => am.message.id === msg.id);
        if (!isActive) {
          console.log('[VisualizerWindow] Triggering message');
          triggerMessage(msg, false);
        } else {
          console.log('[VisualizerWindow] Message already active, skipping trigger');
        }
        break;
      }
      case 'set-common-settings':
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setCommonSettings(payload as any, false);
        break;
      case 'set-visualization-settings':
        console.log('VisualizerWindow: Received set-visualization-settings', payload);
        if (payload && typeof payload === 'object') {
          setVisualizationSettings(payload as Record<string, Record<string, unknown>>, false);
        }
        break;
      case 'load-configuration':
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        loadConfiguration(payload as any, false);
        break;
      case 'toggle-debug-overlay':
        // Enable debug overlay via remote command (useful when keyboard shortcuts don't work)
        setShowDevOverlay((v) => !v);
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
      case 'report-status': {
        console.log('[VisualizerWindow] Generating E2E report...');
        const currentStore = useStore.getState();
        const report = {
          timestamp: Date.now(),
          activeVisualization: currentStore.activeVisualization,
          activeMessages: currentStore.activeMessages.map(am => am.message.id),
          fps: undefined,
          messageCount: currentStore.activeMessages.length
        };
        fetch(`${API_BASE}/api/e2e/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report)
        })
        .then(() => console.log('[VisualizerWindow] Sent E2E report'))
        .catch(err => console.error('[VisualizerWindow] Failed to send E2E report', err));
        break;
      }
    }
  }, [
    setMode, 
    setActiveVisualization, 
    setCommonSettings, 
    setVisualizationSettings, 
    loadConfiguration, 
    triggerMessage
  ]);

  const handleRemoteCommandCallback = useCallback((cmd: RemoteCommand) => {
    handleRemoteCommand(cmd.command, cmd.payload);
  }, [handleRemoteCommand]);

  // Subscribe to SSE stream for initial configuration load
  // This ensures VisualizerWindow gets the same config as ControlPlane on startup
  // Must use the same API base as ControlPlane to connect to the Axum server
  const { state: sseState, isConnected: sseConnected } = useAppState({ 
    apiBase: API_BASE,
    onCommand: handleRemoteCommandCallback
  });

  // Track whether initial SSE state has been loaded
  // This is critical for production builds where the window is recreated
  // We need to ensure textStylePresets is loaded before rendering messages
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [hasReceivedSSEState, setHasReceivedSSEState] = useState(false);

  // Load SSE state into local zustand store when it arrives
  useEffect(() => {
    addDebugLog('log', 'SSE effect triggered', {
      sseState: sseState ? 'received' : 'null',
      sseConnected,
      hasReceivedSSEState,
    });
    
    if (!sseState) {
      addDebugLog('log', 'SSE state is null, waiting...');
      setIsStateLoaded(false);
      setHasReceivedSSEState(false);
      return;
    }
    
    // Mark that we've received SSE state
    if (!hasReceivedSSEState) {
      setHasReceivedSSEState(true);
    }
    
    addDebugLog('log', 'SSE state received', {
      activeVisualization: sseState.activeVisualization,
      activeVisualizationPreset: sseState.activeVisualizationPreset,
      presetsCount: sseState.visualizationPresets?.length ?? 0,
      presetIds: sseState.visualizationPresets?.map(p => ({ id: p.id, name: p.name, vizId: p.visualizationId })),
      textStylePresetsCount: sseState.textStylePresets?.length ?? 0,
      triggeredMessage: sseState.triggeredMessage ? {
        id: sseState.triggeredMessage.id,
        text: sseState.triggeredMessage.text?.substring(0, 50),
      } : null,
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
    
    // Mark state as loaded once we have textStylePresets (even if empty array)
    // This ensures messages can render safely with proper text style plugins
    // Also ensure we have at least received SSE state once
    const stateIsReady = Array.isArray(sseState.textStylePresets) && hasReceivedSSEState;
    setIsStateLoaded(stateIsReady);
    
    addDebugLog('log', 'Config loaded into store', {
      isStateLoaded: stateIsReady,
      hasTextStylePresets: Array.isArray(sseState.textStylePresets),
      hasReceivedSSEState,
    });
  }, [sseState, sseConnected, loadConfiguration, hasReceivedSSEState]);

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

  // Sync triggeredMessage from SSE to activeMessages store
  // This is critical for production builds where Tauri events may not work
  // Use a ref to track the last processed triggered message to avoid duplicates
  const lastTriggeredMessageRef = useRef<{ id: string; timestamp: number } | null>(null);
  
  useEffect(() => {
    if (!sseState?.triggeredMessage) {
      // Clear ref when triggeredMessage is cleared (so we can process new ones)
      if (lastTriggeredMessageRef.current) {
        console.log('[VisualizerWindow] triggeredMessage cleared in SSE state');
        lastTriggeredMessageRef.current = null;
      }
      return;
    }
    
    const triggeredMsg = sseState.triggeredMessage;
    const now = Date.now();
    
    // Check if we've already processed this exact message
    if (lastTriggeredMessageRef.current?.id === triggeredMsg.id) {
      const timeSinceLastProcess = now - lastTriggeredMessageRef.current.timestamp;
      if (timeSinceLastProcess < 3000) {
        // Already processed this message recently, skip
        return;
      }
    }
    
    const currentActiveMessages = useStore.getState().activeMessages;
    
    // Check if this message is already active (avoid duplicates)
    const isAlreadyActive = currentActiveMessages.some(
      am => am.message.id === triggeredMsg.id
    );
    
    if (!isAlreadyActive) {
      console.log('[VisualizerWindow] Syncing triggeredMessage from SSE to store:', {
        id: triggeredMsg.id,
        text: triggeredMsg.text,
        textStyle: triggeredMsg.textStyle,
      });
      triggerMessage(triggeredMsg, false);
      lastTriggeredMessageRef.current = { id: triggeredMsg.id, timestamp: now };
    } else {
      addDebugLog('log', 'triggeredMessage already active, skipping', { id: triggeredMsg.id });
    }
  }, [sseState?.triggeredMessage, triggerMessage]);

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
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Only log on changes (avoid per-frame spam; audio updates cause frequent renders)
    console.log('[VisualizerWindow] Target visualization:', targetVizId, 'from preset:', activePreset?.name ?? 'none');
  }, [targetVizId, activePreset?.name]);

  // Health watchdog: detect long-running stalls and attempt a safe remount.
  const [vizRemountKey, setVizRemountKey] = useState(0);
  const lastRafRef = useRef<number>(performance.now());
  const lastAudioRef = useRef<number>(Date.now());
  const [recoveryCount, setRecoveryCount] = useState(0);

  // Throttle audio updates to at most one store update per animation frame.
  const audioRafRef = useRef<number | null>(null);
  const latestAudioRef = useRef<number[] | null>(null);

  // Keyboard shortcut to toggle debug overlay (works in both dev and production)
  useEffect(() => {
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

  // Initialize event listeners on mount - these are critical for message processing
  // This ensures messages can be received even if SSE state hasn't loaded yet
  useEffect(() => {
    addDebugLog('log', 'Initializing event listeners for message processing');
    
    // Listen for audio data from Rust
    const unlistenAudioPromise = listen<number[]>('audio-data', (event) => {
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
    
    // Catch errors for audio listener
    unlistenAudioPromise.catch(err => {
      addDebugLog('warn', 'Failed to listen to audio-data (expected in production if Tauri API is missing)', { err });
    });

    // Listen for remote commands
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unlistenRemotePromise = listen<{ command: string, payload?: any }>('remote-command', (event) => {
      handleRemoteCommand(event.payload.command, event.payload.payload);
    });
    
    // Catch errors for remote command listener
    unlistenRemotePromise.catch(err => {
      addDebugLog('warn', 'Failed to listen to remote-command (expected in production)', { err });
    });

    // Listen for state changes from other windows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unlistenStatePromise = listen<{ type: string, payload: unknown }>('state-changed', (event) => {
      console.log('Received state-changed:', event.payload);
      const { type, payload } = event.payload;
      
      switch (type) {
        case 'SET_MODE':
          if (typeof payload === 'string') setMode(payload as 'fireplace' | 'techno', false);
          break;
        case 'SET_ACTIVE_VISUALIZATION':
          if (typeof payload === 'string') setActiveVisualization(payload, false);
          break;
        case 'SET_MESSAGES':
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setMessages(payload as any[], false);
          break;
        case 'TRIGGER_MESSAGE': {
          // Handle both legacy string and new MessageConfig formats
          const msg =
            typeof payload === 'string'
              ? { id: 'triggered', text: payload, textStyle: 'scrolling-capitals' }
              : (payload as MessageConfig);
          console.log('[VisualizerWindow] Received TRIGGER_MESSAGE via state-changed event:', { id: msg.id, text: msg.text?.substring(0, 50) });
          const isActive = useStore.getState().activeMessages.some((am) => am.message.id === msg.id);
          if (!isActive) {
            console.log('[VisualizerWindow] Triggering message via state-changed event');
            triggerMessage(msg, false);
          } else {
            console.log('[VisualizerWindow] Message already active, skipping state-changed trigger');
          }
          break;
        }
        case 'SET_COMMON_SETTINGS':
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setCommonSettings(payload as any, false);
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            useStore.setState({ visualizationPresets: payload as any[] });
          }
          break;
        case 'SET_ACTIVE_VISUALIZATION_PRESET':
          // Update active preset
          if (typeof payload === 'string' || payload === null) {
            useStore.setState({ activeVisualizationPreset: payload });
          }
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            useStore.setState({ textStylePresets: payload as any[] });
          }
          break;
        case 'LOAD_CONFIGURATION':
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          loadConfiguration(payload as any, false);
          break;
        case 'REMOUNT_VIZ':
          setRecoveryCount((c) => c + 1);
          setVizRemountKey((k) => k + 1);
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
    
    // Catch errors for state listener
    unlistenStatePromise.catch(err => {
        addDebugLog('warn', 'Failed to listen to state-changed (expected in production)', { err });
    });

    return () => {
      // Clean up using the promise results if they resolved
      unlistenAudioPromise.then((u) => u && u()).catch(() => {});
      unlistenRemotePromise.then((u) => u && u()).catch(() => {});
      unlistenStatePromise.then((u) => u && u()).catch(() => {});
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
    handleRemoteCommand,
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
  const vizSettings = useMemo(() => activePreset 
    ? { [targetVizId]: activePreset.settings }
    : visualizationSettings, [activePreset, targetVizId, visualizationSettings]);
  
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Avoid per-frame logging
    console.log('[VisualizerWindow] vizSettings computed:', {
      hasActivePreset: !!activePreset,
      targetVizId,
      vizSettingsKeys: Object.keys(vizSettings),
    });
  }, [targetVizId, activePreset, vizSettings]);

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

  // Fireplace-specific watchdog (dev + prod): if the fireplace heartbeat stops while visible, remount the viz.
  useEffect(() => {
    if (targetVizId !== 'fireplace') return;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      let lastTick = 0;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lastTick = Number((window as any).__vibecast_fireplace_lastTick || 0);
      } catch {
        lastTick = 0;
      }
      if (!lastTick) return;
      const msSince = Date.now() - lastTick;
      if (msSince > 20_000) {
        console.warn('[VisualizerWindow] Fireplace heartbeat stalled; remounting visualization', { msSince });
        setRecoveryCount((c) => c + 1);
        setVizRemountKey((k) => k + 1);
      }
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [targetVizId]);

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden" style={{ backgroundColor: '#000' }}>
      {/* Debug overlay: helps diagnose issues in both dev and production */}
      {showDevOverlay && (
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
            pointerEvents: 'auto', // Allow clicking the button
          }}
        >
          <div>targetVizId: {String(targetVizId)}</div>
          <div>activePreset: {activePreset ? `${activePreset.name} (${activePreset.id})` : 'none'}</div>
          <div>audioData: {Array.isArray(audioData) ? audioData.length : 'n/a'}</div>
          <div>common: {commonSettings ? `intensity=${commonSettings.intensity} dim=${commonSettings.dim}` : 'n/a'}</div>
          <div>recoveryCount: {recoveryCount}</div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: '4px', paddingTop: '4px' }}>--- Message State ---</div>
          <div>isStateLoaded: <strong style={{ color: isStateLoaded ? '#4ade80' : '#f87171' }}>{String(isStateLoaded)}</strong></div>
          <div>sseConnected: <strong style={{ color: sseConnected ? '#4ade80' : '#f87171' }}>{String(sseConnected)}</strong></div>
          <div>hasReceivedSSEState: <strong style={{ color: hasReceivedSSEState ? '#4ade80' : '#f87171' }}>{String(hasReceivedSSEState)}</strong></div>
          <div>activeMessages: <strong>{activeMessages.length}</strong></div>
          {activeMessages.length > 0 && (
            <div style={{ fontSize: 10, marginLeft: '8px', color: 'rgba(255,255,255,0.7)' }}>
              {activeMessages.map(am => (
                <div key={am.timestamp}>• {am.message.id}: {am.message.text?.substring(0, 25)}...</div>
              ))}
            </div>
          )}
          <div>triggeredMsg (SSE): {sseState?.triggeredMessage ? `${sseState.triggeredMessage.id} (${sseState.triggeredMessage.text?.substring(0, 20)}...)` : 'none'}</div>
          <div>textStylePresets: {textStylePresets.length}</div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: '4px', paddingTop: '4px', fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>
            <button
              onClick={() => setShowDevOverlay(false)}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.85)',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 9,
                cursor: 'pointer',
                marginRight: '4px',
              }}
            >
              Hide
            </button>
            Enable: Cmd+Shift+D | Add ?vizDebug=1 to URL | localStorage: vibecast:vizDebug=1
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: '4px', paddingTop: '4px' }}>
            <button
              onClick={() => setShowLogs(!showLogs)}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.85)',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 9,
                cursor: 'pointer',
              }}
            >
              {showLogs ? 'Hide' : 'Show'} Logs ({debugLogBuffer.length})
            </button>
          </div>
          {showLogs && (
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.2)',
              marginTop: '4px',
              paddingTop: '4px',
              maxHeight: '200px',
              overflowY: 'auto',
              fontSize: 9,
              fontFamily: 'ui-monospace, monospace',
            }}>
              {debugLogBuffer.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No logs yet</div>
              ) : (
                debugLogBuffer.slice().reverse().map((log, idx) => (
                  <div key={idx} style={{
                    marginBottom: '2px',
                    padding: '2px 4px',
                    background: log.level === 'error' ? 'rgba(239,68,68,0.2)' : log.level === 'warn' ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.05)',
                    borderRadius: 2,
                    color: log.level === 'error' ? '#fca5a5' : log.level === 'warn' ? '#fde047' : 'rgba(255,255,255,0.7)',
                  }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>{' '}
                    <strong>[{log.level}]</strong> {log.message}
                    {log.data !== undefined && (
                      <div style={{ 
                        marginLeft: '8px', 
                        fontSize: 8, 
                        color: 'rgba(255,255,255,0.5)', 
                        whiteSpace: 'pre-wrap', 
                        maxHeight: '300px', 
                        overflowY: 'auto' 
                      }}>
                        {(() => {
                          const str = JSON.stringify(log.data, null, 2);
                          return str.length > 2000 ? str.substring(0, 2000) + '...' : str;
                        })()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
      <div className="absolute inset-0">
        {/* Only render visualization when state is loaded to prevent flashing defaults */}
        {isStateLoaded ? (
          <VisualizationRenderer
            key={vizRemountKey}
            visualizationId={targetVizId}
            audioData={audioData}
            commonSettings={commonSettings}
            visualizationSettings={vizSettings}
            debug={import.meta.env.DEV && showDevOverlay}
            presetSettings={
              activePreset && activePreset.visualizationId === targetVizId
                ? activePreset.settings
                : undefined
            }
          />
        ) : (
          /* Loading / Connecting state - keep black to be unobtrusive */
          <div className="w-full h-full bg-black" />
        )}
      </div>
      {/* Message overlay container - always created to ensure proper initialization */}
      {/* This container must exist even when window is recreated in production */}
      {/* Only render message content once state is loaded (critical for production window restart) */}
      <div className="absolute inset-0 pointer-events-none z-[100]" data-message-overlay="true">
        {isStateLoaded ? (
          <>
            {activeMessages.length > 0 && console.log('[VisualizerWindow] Rendering activeMessages:', activeMessages.map(am => ({ id: am.message.id, text: am.message.text?.substring(0, 30) })))}
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
                  console.log('[VisualizerWindow] Message completed:', message.id, 'timestamp:', timestamp);
                  // 1) Clear local UI immediately
                  clearMessage(timestamp, false, message.id);
                  // 2) Notify ControlPlane immediately (hybrid model)
                  emit('state-changed', {
                    type: 'CLEAR_MESSAGE',
                    payload: { timestamp, messageId: message.id },
                  }).catch((err) => {
                    console.warn('[VisualizerWindow] Failed to emit state-changed event:', err);
                  });
                  // 3) Notify Rust backend - it handles queue advancement + SSE canonical state
                  sendCommand('message-complete', { messageId: message.id }).catch((err) => {
                    console.error('[VisualizerWindow] Failed to send message-complete command:', err);
                  });
                }}
              />
            );
          })}
          </>
        ) : (
          // Show loading state for messages while state is being loaded
          // This ensures the overlay container exists even during initialization
          null
        )}
      </div>
    </div>
  );
};
