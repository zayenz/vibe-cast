import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { 
  AppConfiguration, 
  CommonVisualizationSettings, 
  MessageConfig,
  DEFAULT_COMMON_SETTINGS,
} from './plugins/types';
import { getDefaultVisualizationSettings } from './plugins/visualizations';
import { getDefaultTextStyleSettings } from './plugins/textStyles';
import defaultConfig from './config/defaultConfig.json';

// ============================================================================
// State Types
// ============================================================================

export interface AppState {
  // Visualization state
  activeVisualization: string;
  enabledVisualizations: string[];
  commonSettings: CommonVisualizationSettings;
  visualizationSettings: Record<string, Record<string, unknown>>;
  
  // Message state
  messages: MessageConfig[];
  activeMessage: MessageConfig | null;
  messageTimestamp: number;
  
  // Text style state
  defaultTextStyle: string;
  textStyleSettings: Record<string, Record<string, unknown>>;
  
  // Audio data (not persisted)
  audioData: number[];
  
  // Server info (not persisted)
  serverInfo: { ip: string; port: number } | null;
  
  // Legacy compatibility
  mode: 'fireplace' | 'techno';
  
  // Actions
  setActiveVisualization: (id: string, sync?: boolean) => void;
  setEnabledVisualizations: (ids: string[], sync?: boolean) => void;
  setCommonSettings: (settings: Partial<CommonVisualizationSettings>, sync?: boolean) => void;
  setVisualizationSetting: (vizId: string, key: string, value: unknown, sync?: boolean) => void;
  
  setMessages: (messages: MessageConfig[], sync?: boolean) => void;
  addMessage: (text: string, sync?: boolean) => void;
  updateMessage: (id: string, updates: Partial<MessageConfig>, sync?: boolean) => void;
  removeMessage: (id: string, sync?: boolean) => void;
  triggerMessage: (message: MessageConfig, sync?: boolean) => void;
  
  setDefaultTextStyle: (id: string, sync?: boolean) => void;
  setTextStyleSetting: (styleId: string, key: string, value: unknown, sync?: boolean) => void;
  
  setAudioData: (data: number[]) => void;
  setServerInfo: (info: { ip: string; port: number }) => void;
  
  // Legacy actions for compatibility
  setMode: (mode: 'fireplace' | 'techno', sync?: boolean) => void;
  
  // Configuration
  getConfiguration: () => AppConfiguration;
  loadConfiguration: (config: AppConfiguration, sync?: boolean) => void;
  resetToDefaults: (sync?: boolean) => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function parseDefaultConfig(): Partial<AppState> {
  const config = defaultConfig as AppConfiguration;
  return {
    activeVisualization: config.activeVisualization,
    enabledVisualizations: config.enabledVisualizations,
    commonSettings: config.commonSettings,
    visualizationSettings: config.visualizationSettings,
    messages: config.messages,
    defaultTextStyle: config.defaultTextStyle,
    textStyleSettings: config.textStyleSettings,
    mode: config.activeVisualization === 'techno' ? 'techno' : 'fireplace',
  };
}

// Sync helper - emits state to other windows/remote
function syncState(eventType: string, payload: unknown) {
  invoke('emit_state_change', { eventType, payload: JSON.stringify(payload) })
    .catch(err => console.error('Failed to invoke emit_state_change', err));
}

// ============================================================================
// Store
// ============================================================================

const defaults = parseDefaultConfig();

export const useStore = create<AppState>((set, get) => ({
  // Initial state from defaults
  activeVisualization: defaults.activeVisualization ?? 'fireplace',
  enabledVisualizations: defaults.enabledVisualizations ?? ['fireplace', 'techno'],
  commonSettings: defaults.commonSettings ?? DEFAULT_COMMON_SETTINGS,
  visualizationSettings: defaults.visualizationSettings ?? getDefaultVisualizationSettings(),
  
  messages: defaults.messages ?? [],
  activeMessage: null,
  messageTimestamp: 0,
  
  defaultTextStyle: defaults.defaultTextStyle ?? 'scrolling-capitals',
  textStyleSettings: defaults.textStyleSettings ?? getDefaultTextStyleSettings(),
  
  audioData: new Array(128).fill(0),
  serverInfo: null,
  
  // Legacy compatibility
  mode: defaults.mode ?? 'fireplace',

  // Visualization actions
  setActiveVisualization: (id, sync = true) => {
    console.log(`Setting active visualization to ${id}, sync=${sync}`);
    const mode = id === 'techno' ? 'techno' : 'fireplace';
    set({ activeVisualization: id, mode });
    if (sync) {
      syncState('SET_ACTIVE_VISUALIZATION', id);
    }
  },

  setEnabledVisualizations: (ids, sync = true) => {
    set({ enabledVisualizations: ids });
    if (sync) {
      syncState('SET_ENABLED_VISUALIZATIONS', ids);
    }
  },

  setCommonSettings: (settings, sync = true) => {
    set(state => ({
      commonSettings: { ...state.commonSettings, ...settings }
    }));
    if (sync) {
      syncState('SET_COMMON_SETTINGS', get().commonSettings);
    }
  },

  setVisualizationSetting: (vizId, key, value, sync = true) => {
    set(state => ({
      visualizationSettings: {
        ...state.visualizationSettings,
        [vizId]: {
          ...(state.visualizationSettings[vizId] || {}),
          [key]: value,
        }
      }
    }));
    if (sync) {
      syncState('SET_VISUALIZATION_SETTINGS', get().visualizationSettings);
    }
  },

  // Message actions
  setMessages: (messages, sync = true) => {
    set({ messages });
    if (sync) {
      syncState('SET_MESSAGES', messages);
    }
  },

  addMessage: (text, sync = true) => {
    const state = get();
    const newMessage: MessageConfig = {
      id: generateId(),
      text,
      textStyle: state.defaultTextStyle,
    };
    const messages = [...state.messages, newMessage];
    set({ messages });
    if (sync) {
      syncState('SET_MESSAGES', messages);
    }
  },

  updateMessage: (id, updates, sync = true) => {
    set(state => ({
      messages: state.messages.map(m => 
        m.id === id ? { ...m, ...updates } : m
      )
    }));
    if (sync) {
      syncState('SET_MESSAGES', get().messages);
    }
  },

  removeMessage: (id, sync = true) => {
    set(state => ({
      messages: state.messages.filter(m => m.id !== id)
    }));
    if (sync) {
      syncState('SET_MESSAGES', get().messages);
    }
  },

  triggerMessage: (message, sync = true) => {
    console.log(`Triggering message: ${message.text}, sync=${sync}`);
    set({ activeMessage: message, messageTimestamp: Date.now() });
    if (sync) {
      syncState('TRIGGER_MESSAGE', message);
    }
  },

  // Text style actions
  setDefaultTextStyle: (id, sync = true) => {
    set({ defaultTextStyle: id });
    if (sync) {
      syncState('SET_DEFAULT_TEXT_STYLE', id);
    }
  },

  setTextStyleSetting: (styleId, key, value, sync = true) => {
    set(state => ({
      textStyleSettings: {
        ...state.textStyleSettings,
        [styleId]: {
          ...(state.textStyleSettings[styleId] || {}),
          [key]: value,
        }
      }
    }));
    if (sync) {
      syncState('SET_TEXT_STYLE_SETTINGS', get().textStyleSettings);
    }
  },

  // Non-synced state
  setAudioData: (audioData) => set({ audioData }),
  setServerInfo: (serverInfo) => set({ serverInfo }),

  // Legacy compatibility action
  setMode: (mode, sync = true) => {
    console.log(`Setting mode to ${mode}, sync=${sync}`);
    set({ mode, activeVisualization: mode });
    if (sync) {
      syncState('SET_ACTIVE_VISUALIZATION', mode);
    }
  },

  // Configuration management
  getConfiguration: () => {
    const state = get();
    return {
      version: 1,
      activeVisualization: state.activeVisualization,
      enabledVisualizations: state.enabledVisualizations,
      commonSettings: state.commonSettings,
      visualizationSettings: state.visualizationSettings,
      messages: state.messages,
      defaultTextStyle: state.defaultTextStyle,
      textStyleSettings: state.textStyleSettings,
    };
  },

  loadConfiguration: (config, sync = true) => {
    console.log('Loading configuration:', config);
    const mode = config.activeVisualization === 'techno' ? 'techno' : 'fireplace';
    set({
      activeVisualization: config.activeVisualization,
      enabledVisualizations: config.enabledVisualizations,
      commonSettings: config.commonSettings,
      visualizationSettings: config.visualizationSettings,
      messages: config.messages,
      defaultTextStyle: config.defaultTextStyle,
      textStyleSettings: config.textStyleSettings,
      mode,
    });
    if (sync) {
      syncState('LOAD_CONFIGURATION', config);
    }
  },

  resetToDefaults: (sync = true) => {
    const config = defaultConfig as AppConfiguration;
    get().loadConfiguration(config, sync);
  },
}));

// Legacy compatibility - map mode to activeVisualization
// This helps during the transition period
export function modeToVisualization(mode: 'fireplace' | 'techno'): string {
  return mode;
}

export function visualizationToMode(vizId: string): 'fireplace' | 'techno' {
  return vizId === 'techno' ? 'techno' : 'fireplace';
}
