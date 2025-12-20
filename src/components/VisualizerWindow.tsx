import React, { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../store';
import { getVisualization } from '../plugins/visualizations';
import { getTextStyle } from '../plugins/textStyles';
import { MessageConfig, CommonVisualizationSettings, getDefaultsFromSchema } from '../plugins/types';

/**
 * Text Style Renderer Component
 * Renders the active message using the appropriate text style plugin
 */
const TextStyleRenderer: React.FC<{
  message: MessageConfig | null;
  messageTimestamp: number;
  textStyleSettings: Record<string, Record<string, unknown>>;
}> = ({ message, messageTimestamp, textStyleSettings }) => {
  if (!message) return null;

  const textStylePlugin = getTextStyle(message.textStyle);
  if (!textStylePlugin) {
    // Fallback to scrolling-capitals if style not found
    const fallback = getTextStyle('scrolling-capitals');
    if (!fallback) return null;
    
    const TextStyleComponent = fallback.component;
    const settings = {
      ...textStyleSettings['scrolling-capitals'] || {},
      ...message.styleOverrides || {},
    };
    
    return (
      <TextStyleComponent
        message={message.text}
        messageTimestamp={messageTimestamp}
        settings={settings}
      />
    );
  }

  const TextStyleComponent = textStylePlugin.component;
  const settings = {
    ...textStyleSettings[message.textStyle] || {},
    ...message.styleOverrides || {},
  };

  return (
    <TextStyleComponent
      message={message.text}
      messageTimestamp={messageTimestamp}
      settings={settings}
    />
  );
};

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
  const audioData = useStore((state) => state.audioData);
  const commonSettings = useStore((state) => state.commonSettings);
  const visualizationSettings = useStore((state) => state.visualizationSettings);
  const activeMessage = useStore((state) => state.activeMessage);
  const messageTimestamp = useStore((state) => state.messageTimestamp);
  const textStyleSettings = useStore((state) => state.textStyleSettings);
  
  // Actions
  const setAudioData = useStore((state) => state.setAudioData);
  const setActiveVisualization = useStore((state) => state.setActiveVisualization);
  const setMessages = useStore((state) => state.setMessages);
  const triggerMessage = useStore((state) => state.triggerMessage);
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
        case 'SET_TEXT_STYLE_SETTINGS':
          // Full replacement of text style settings
          Object.entries(payload || {}).forEach(([styleId, settings]) => {
            Object.entries(settings as Record<string, unknown>).forEach(([key, value]) => {
              setTextStyleSetting(styleId, key, value, false);
            });
          });
          break;
        case 'LOAD_CONFIGURATION':
          loadConfiguration(payload, false);
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
    setCommonSettings,
    setVisualizationSetting,
    setVisualizationSettings,
    setTextStyleSetting,
    loadConfiguration,
  ]);

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden">
      <VisualizationRenderer
        visualizationId={activeVisualization}
        audioData={audioData}
        commonSettings={commonSettings}
        visualizationSettings={visualizationSettings}
      />
      <TextStyleRenderer
        message={activeMessage}
        messageTimestamp={messageTimestamp}
        textStyleSettings={textStyleSettings}
      />
    </div>
  );
};
