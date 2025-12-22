import React, { useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../store';
import { getVisualization } from '../plugins/visualizations';
import { getTextStyle } from '../plugins/textStyles';
import { MessageConfig, CommonVisualizationSettings, getDefaultsFromSchema } from '../plugins/types';
import { getDefaultsFromSchema as getDefaults } from '../plugins/types';

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
  onComplete: () => void;
}> = ({ message, messageTimestamp, textStyleSettings, textStylePresets, verticalOffset = 0, onComplete }) => {
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
        message={message.text}
        messageTimestamp={messageTimestamp}
        settings={settings}
        verticalOffset={verticalOffset}
        onComplete={onComplete}
      />
    );
  }

  const TextStyleComponent = textStylePlugin.component;
  const baseSettings = preset?.settings || textStyleSettings[styleId] || getDefaults(textStylePlugin.settingsSchema);
  const settings = applySpeedMultiplier(
    { ...baseSettings, ...message.styleOverrides },
    message.speed ?? 1.0
  );

  return (
    <TextStyleComponent
      message={message.text}
      messageTimestamp={messageTimestamp}
      settings={settings}
      verticalOffset={verticalOffset}
      onComplete={onComplete}
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
}> = ({ visualizationId, audioData, commonSettings, visualizationSettings }) => {
  const plugin = getVisualization(visualizationId);
  
  if (!plugin) {
    // Fallback to fireplace if visualization not found
    const fallback = getVisualization('fireplace');
    if (!fallback) return <div className="w-full h-full bg-black" />;
    
    const VizComponent = fallback.component;
    // Merge stored settings with defaults from schema
    const defaultSettings = getDefaultsFromSchema(fallback.settingsSchema);
    const storedSettings = visualizationSettings['fireplace'] || {};
    const customSettings = { ...defaultSettings, ...storedSettings };
    
    return (
      <VizComponent
        audioData={audioData}
        commonSettings={commonSettings}
        customSettings={customSettings}
      />
    );
  }

  const VizComponent = plugin.component;
  // Merge stored settings with defaults from schema
  const defaultSettings = getDefaultsFromSchema(plugin.settingsSchema);
  const storedSettings = visualizationSettings[visualizationId] || {};
  const customSettings = { ...defaultSettings, ...storedSettings };
  
  console.log(`VisualizationRenderer [${visualizationId}]:`, {
    storedSettings,
    defaultSettings,
    customSettings,
  });

  return (
    <VizComponent
      audioData={audioData}
      commonSettings={commonSettings}
      customSettings={customSettings}
    />
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

  useEffect(() => {
    // Listen for audio data from Rust
    const unlistenAudio = listen<number[]>('audio-data', (event) => {
      setAudioData(event.payload);
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
        case 'trigger-message':
          // Handle both legacy string and new MessageConfig formats
          if (typeof payload === 'string') {
            triggerMessage({ id: 'triggered', text: payload, textStyle: 'scrolling-capitals' }, false);
          } else {
            triggerMessage(payload, false);
          }
          break;
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
        case 'TRIGGER_MESSAGE':
          // Handle both legacy string and new MessageConfig formats
          if (typeof payload === 'string') {
            triggerMessage({ id: 'triggered', text: payload, textStyle: 'scrolling-capitals' }, false);
          } else {
            triggerMessage(payload, false);
          }
          break;
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
          clearMessage(payload as number, false);
          break;
        case 'CLEAR_ACTIVE_MESSAGE':
          // Clear specific active message
          if (payload && typeof payload === 'object' && 'messageId' in payload && 'timestamp' in payload) {
            const { messageId, timestamp } = payload as { messageId: string; timestamp: number };
            useStore.getState().clearActiveMessage(messageId, timestamp, false);
          }
          break;
      }
    });

    return () => {
      unlistenAudio.then((u) => u());
      unlistenRemote.then((u) => u());
      unlistenState.then((u) => u());
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

  // Determine which visualization and settings to use
  const vizId = activePreset ? activePreset.visualizationId : activeVisualization;
  const vizSettings = activePreset 
    ? { [vizId]: activePreset.settings }
    : visualizationSettings;

  // Dev overlay (default OFF; opt-in via localStorage or query param)
  const devOverlayEnabledByQuery = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('vizDebug') === '1';
    } catch {
      return false;
    }
  }, []);
  const [showDevOverlay, setShowDevOverlay] = useState<boolean>(() => {
    if (!import.meta.env.DEV) return false;
    if (devOverlayEnabledByQuery) return true;
    try {
      return window.localStorage.getItem('vibecast:vizDebug') === '1';
    } catch {
      return false;
    }
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
          <div>vizId: {String(vizId)}</div>
          <div>activePreset: {activePreset ? `${activePreset.name} (${activePreset.id})` : 'none'}</div>
          <div>audioData: {Array.isArray(audioData) ? audioData.length : 'n/a'}</div>
          <div>common: {commonSettings ? `intensity=${commonSettings.intensity} dim=${commonSettings.dim}` : 'n/a'}</div>
        </div>
      )}
      <VisualizationRenderer
        visualizationId={vizId}
        audioData={audioData}
        commonSettings={commonSettings}
        visualizationSettings={vizSettings}
      />
      {/* Render all active messages - they can coexist with higher z-index */}
      <div className="absolute inset-0 pointer-events-none z-[100]">
        {activeMessages.map(({ message, timestamp }, index) => (
          <TextStyleRenderer
            key={timestamp}
            message={message}
            messageTimestamp={timestamp}
            textStyleSettings={textStyleSettings}
            textStylePresets={textStylePresets}
            verticalOffset={index * 80} // Stack messages with 80px spacing
            onComplete={() => clearMessage(timestamp, false)}
          />
        ))}
      </div>
    </div>
  );
};
