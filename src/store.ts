import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { 
  AppConfiguration, 
  CommonVisualizationSettings, 
  MessageConfig,
  VisualizationPreset,
  TextStylePreset,
  MessageStats,
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
  
  // Visualization presets
  visualizationPresets: VisualizationPreset[];
  activeVisualizationPreset: string | null;
  
  // Message state
  messages: MessageConfig[];
  activeMessages: Array<{ message: MessageConfig; timestamp: number }>;
  activeMessage: MessageConfig | null; // Legacy - kept for compatibility
  messageTimestamp: number; // Legacy - kept for compatibility
  messageStats: Record<string, MessageStats>;
  
  // Text style state
  defaultTextStyle: string;
  textStyleSettings: Record<string, Record<string, unknown>>;
  
  // Text style presets
  textStylePresets: TextStylePreset[];
  
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
  setVisualizationSettings: (settings: Record<string, Record<string, unknown>>, sync?: boolean) => void;
  
  // Visualization preset actions
  addVisualizationPreset: (preset: VisualizationPreset, sync?: boolean) => void;
  updateVisualizationPreset: (id: string, updates: Partial<VisualizationPreset>, sync?: boolean) => void;
  deleteVisualizationPreset: (id: string, sync?: boolean) => void;
  setActiveVisualizationPreset: (id: string | null, sync?: boolean) => void;
  setVisualizationPresets: (presets: VisualizationPreset[], sync?: boolean) => void;
  
  setMessages: (messages: MessageConfig[], sync?: boolean) => void;
  addMessage: (text: string, sync?: boolean) => void;
  updateMessage: (id: string, updates: Partial<MessageConfig>, sync?: boolean) => void;
  removeMessage: (id: string, sync?: boolean) => void;
  triggerMessage: (message: MessageConfig, sync?: boolean) => void;
  clearMessage: (timestamp: number, sync?: boolean) => void;
  clearActiveMessage: (messageId: string, timestamp: number, sync?: boolean) => void;
  
  setDefaultTextStyle: (id: string, sync?: boolean) => void;
  setTextStyleSetting: (styleId: string, key: string, value: unknown, sync?: boolean) => void;
  
  // Text style preset actions
  addTextStylePreset: (preset: TextStylePreset, sync?: boolean) => void;
  updateTextStylePreset: (id: string, updates: Partial<TextStylePreset>, sync?: boolean) => void;
  deleteTextStylePreset: (id: string, sync?: boolean) => void;
  setTextStylePresets: (presets: TextStylePreset[], sync?: boolean) => void;
  
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
  
  // Create default presets from existing settings if presets don't exist
  const visualizationPresets: VisualizationPreset[] = config.visualizationPresets ?? [];
  const textStylePresets: TextStylePreset[] = config.textStylePresets ?? [];
  
  // If no visualization presets exist, create defaults from existing settings
  if (visualizationPresets.length === 0 && config.visualizationSettings) {
    Object.entries(config.visualizationSettings).forEach(([vizId, settings]) => {
      visualizationPresets.push({
        id: generateId(),
        name: `${vizId.charAt(0).toUpperCase() + vizId.slice(1)} Default`,
        visualizationId: vizId,
        settings,
      });
    });
  }
  
  // If no text style presets exist, create defaults from existing settings
  if (textStylePresets.length === 0 && config.textStyleSettings) {
    Object.entries(config.textStyleSettings).forEach(([styleId, settings]) => {
      textStylePresets.push({
        id: generateId(),
        name: `${styleId.charAt(0).toUpperCase() + styleId.slice(1).replace(/-/g, ' ')} Default`,
        textStyleId: styleId,
        settings,
      });
    });
  }
  
  return {
    activeVisualization: config.activeVisualization ?? 'fireplace',
    enabledVisualizations: config.enabledVisualizations ?? ['fireplace', 'techno'],
    commonSettings: config.commonSettings,
    visualizationSettings: config.visualizationSettings ?? {},
    visualizationPresets,
    activeVisualizationPreset: config.activeVisualizationPreset ?? null,
    messages: config.messages ?? [],
    defaultTextStyle: config.defaultTextStyle ?? 'scrolling-capitals',
    textStyleSettings: config.textStyleSettings ?? {},
    textStylePresets,
    messageStats: config.messageStats ?? {},
    mode: (config.activeVisualization ?? 'fireplace') === 'techno' ? 'techno' : 'fireplace',
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
  visualizationPresets: defaults.visualizationPresets ?? [],
  activeVisualizationPreset: defaults.activeVisualizationPreset ?? null,
  
  messages: defaults.messages ?? [],
  activeMessages: [],
  activeMessage: null, // Legacy compatibility
  messageTimestamp: 0, // Legacy compatibility
  messageStats: defaults.messageStats ?? {},
  
  defaultTextStyle: defaults.defaultTextStyle ?? 'scrolling-capitals',
  textStyleSettings: defaults.textStyleSettings ?? getDefaultTextStyleSettings(),
  textStylePresets: defaults.textStylePresets ?? [],
  
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

  setVisualizationSettings: (settings, sync = true) => {
    console.log('Setting visualization settings:', settings);
    set({ visualizationSettings: settings });
    if (sync) {
      syncState('SET_VISUALIZATION_SETTINGS', settings);
    }
  },

  // Visualization preset actions
  addVisualizationPreset: (preset, sync = true) => {
    set(state => ({
      visualizationPresets: [...state.visualizationPresets, preset]
    }));
    if (sync) {
      syncState('SET_VISUALIZATION_PRESETS', get().visualizationPresets);
    }
  },

  updateVisualizationPreset: (id, updates, sync = true) => {
    set(state => ({
      visualizationPresets: state.visualizationPresets.map(p =>
        p.id === id ? { ...p, ...updates } : p
      )
    }));
    if (sync) {
      syncState('SET_VISUALIZATION_PRESETS', get().visualizationPresets);
    }
  },

  deleteVisualizationPreset: (id, sync = true) => {
    set(state => {
      const newPresets = state.visualizationPresets.filter(p => p.id !== id);
      // If deleting active preset, clear it
      const newActivePreset = state.activeVisualizationPreset === id ? null : state.activeVisualizationPreset;
      return {
        visualizationPresets: newPresets,
        activeVisualizationPreset: newActivePreset,
      };
    });
    if (sync) {
      syncState('SET_VISUALIZATION_PRESETS', get().visualizationPresets);
      if (get().activeVisualizationPreset === null) {
        syncState('SET_ACTIVE_VISUALIZATION_PRESET', null);
      }
    }
  },

  setActiveVisualizationPreset: (id, sync = true) => {
    set({ activeVisualizationPreset: id });
    // Also update active visualization based on preset
    if (id) {
      const preset = get().visualizationPresets.find(p => p.id === id);
      if (preset) {
        set({ activeVisualization: preset.visualizationId });
      }
    }
    if (sync) {
      syncState('SET_ACTIVE_VISUALIZATION_PRESET', id);
      const preset = get().visualizationPresets.find(p => p.id === id);
      if (preset) {
        syncState('SET_ACTIVE_VISUALIZATION', preset.visualizationId);
      }
    }
  },

  setVisualizationPresets: (presets, sync = true) => {
    set({ visualizationPresets: presets });
    if (sync) {
      syncState('SET_VISUALIZATION_PRESETS', presets);
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
    const timestamp = Date.now();
    const repeatCount = message.repeatCount ?? 1;
    
    set(state => {
      // Update message stats
      const currentStats = state.messageStats[message.id] || {
        messageId: message.id,
        triggerCount: 0,
        lastTriggered: 0,
        history: [],
      };
      
      const newStats: MessageStats = {
        messageId: message.id,
        triggerCount: currentStats.triggerCount + 1,
        lastTriggered: timestamp,
        history: [...currentStats.history, { timestamp }].slice(-50), // Keep last 50
      };
      
      // Limit to max 5 concurrent messages to prevent performance issues
      const maxMessages = 5;
      const newActiveMessages = [...state.activeMessages, { message, timestamp }];
      const trimmedMessages = newActiveMessages.slice(-maxMessages);
      
      return {
        activeMessages: trimmedMessages,
        messageStats: {
          ...state.messageStats,
          [message.id]: newStats,
        },
        // Legacy compatibility
        activeMessage: message,
        messageTimestamp: timestamp,
      };
    });
    
    // Trigger multiple times if repeatCount > 1
    if (repeatCount > 1) {
      const delays = Array.from({ length: repeatCount - 1 }, (_, i) => i + 1);
      delays.forEach(delay => {
        setTimeout(() => {
          const newTimestamp = Date.now();
          set(state => {
            const newActiveMessages = [...state.activeMessages, { message, timestamp: newTimestamp }];
            const trimmedMessages = newActiveMessages.slice(-5);
            return { activeMessages: trimmedMessages };
          });
        }, delay * 1000); // 1 second between repeats
      });
    }
    
    if (sync) {
      syncState('TRIGGER_MESSAGE', message);
    }
  },

  clearMessage: (timestamp, sync = true) => {
    set(state => {
      const newActiveMessages = state.activeMessages.filter(m => m.timestamp !== timestamp);
      // Legacy compatibility - clear if no active messages
      const legacyMessage = newActiveMessages.length > 0 ? newActiveMessages[newActiveMessages.length - 1].message : null;
      const legacyTimestamp = newActiveMessages.length > 0 ? newActiveMessages[newActiveMessages.length - 1].timestamp : 0;
      return {
        activeMessages: newActiveMessages,
        activeMessage: legacyMessage,
        messageTimestamp: legacyTimestamp,
      };
    });
    if (sync) {
      syncState('CLEAR_MESSAGE', timestamp);
    }
  },

  clearActiveMessage: (messageId, timestamp, sync = true) => {
    // Clear all instances of this message that are currently active
    set(state => {
      const newActiveMessages = state.activeMessages.filter(
        m => !(m.message.id === messageId && m.timestamp === timestamp)
      );
      const legacyMessage = newActiveMessages.length > 0 ? newActiveMessages[newActiveMessages.length - 1].message : null;
      const legacyTimestamp = newActiveMessages.length > 0 ? newActiveMessages[newActiveMessages.length - 1].timestamp : 0;
      return {
        activeMessages: newActiveMessages,
        activeMessage: legacyMessage,
        messageTimestamp: legacyTimestamp,
      };
    });
    if (sync) {
      syncState('CLEAR_ACTIVE_MESSAGE', { messageId, timestamp });
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

  // Text style preset actions
  addTextStylePreset: (preset, sync = true) => {
    set(state => ({
      textStylePresets: [...state.textStylePresets, preset]
    }));
    if (sync) {
      syncState('SET_TEXT_STYLE_PRESETS', get().textStylePresets);
    }
  },

  updateTextStylePreset: (id, updates, sync = true) => {
    set(state => ({
      textStylePresets: state.textStylePresets.map(p =>
        p.id === id ? { ...p, ...updates } : p
      )
    }));
    if (sync) {
      syncState('SET_TEXT_STYLE_PRESETS', get().textStylePresets);
    }
  },

  deleteTextStylePreset: (id, sync = true) => {
    set(state => ({
      textStylePresets: state.textStylePresets.filter(p => p.id !== id)
    }));
    if (sync) {
      syncState('SET_TEXT_STYLE_PRESETS', get().textStylePresets);
    }
  },

  setTextStylePresets: (presets, sync = true) => {
    set({ textStylePresets: presets });
    if (sync) {
      syncState('SET_TEXT_STYLE_PRESETS', presets);
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
      activeVisualizationPreset: state.activeVisualizationPreset ?? undefined,
      enabledVisualizations: state.enabledVisualizations,
      commonSettings: state.commonSettings,
      visualizationSettings: state.visualizationSettings,
      visualizationPresets: state.visualizationPresets,
      messages: state.messages,
      defaultTextStyle: state.defaultTextStyle,
      textStyleSettings: state.textStyleSettings,
      textStylePresets: state.textStylePresets,
      messageStats: state.messageStats,
    };
  },

  loadConfiguration: (config, sync = true) => {
    console.log('Loading configuration:', config);
    const mode = (config.activeVisualization ?? 'fireplace') === 'techno' ? 'techno' : 'fireplace';
    set({
      activeVisualization: config.activeVisualization ?? 'fireplace',
      activeVisualizationPreset: config.activeVisualizationPreset ?? null,
      enabledVisualizations: config.enabledVisualizations ?? ['fireplace', 'techno'],
      commonSettings: config.commonSettings,
      visualizationSettings: config.visualizationSettings ?? {},
      visualizationPresets: config.visualizationPresets ?? [],
      messages: config.messages ?? [],
      defaultTextStyle: config.defaultTextStyle ?? 'scrolling-capitals',
      textStyleSettings: config.textStyleSettings ?? {},
      textStylePresets: config.textStylePresets ?? [],
      messageStats: config.messageStats ?? {},
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
