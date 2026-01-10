import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { 
  AppConfiguration, 
  CommonVisualizationSettings, 
  MessageConfig,
  MessageTreeNode,
  VisualizationPreset,
  TextStylePreset,
  MessageStats,
  DEFAULT_COMMON_SETTINGS,
} from './plugins/types';
import { getDefaultVisualizationSettings, visualizationRegistry } from './plugins/visualizations';
import { getDefaultTextStyleSettings, textStyleRegistry } from './plugins/textStyles';
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
  messageTree: MessageTreeNode[];
  activeMessages: Array<{ message: MessageConfig; timestamp: number }>;
  activeMessage: MessageConfig | null; // Legacy - kept for compatibility
  messageTimestamp: number; // Legacy - kept for compatibility
  messageStats: Record<string, MessageStats>;
  
  // Folder playback queue
  folderPlaybackQueue: { folderId: string; messageIds: string[]; currentIndex: number } | null;
  
  // Text style state
  defaultTextStyle: string;
  textStyleSettings: Record<string, Record<string, unknown>>;
  
  // Text style presets
  textStylePresets: TextStylePreset[];
  
  // Audio data (not persisted)
  audioData: number[];
  
  // Server info (not persisted)
  serverInfo: { ip: string; port: number } | null;
  
  // Configuration base path (for resolving relative paths)
  configBasePath: string | null;
  
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
  setMessageTree: (tree: MessageTreeNode[], sync?: boolean) => void;
  addMessage: (text: string, sync?: boolean) => void;
  updateMessage: (id: string, updates: Partial<MessageConfig>, sync?: boolean) => void;
  removeMessage: (id: string, sync?: boolean) => void;
  triggerMessage: (message: MessageConfig, sync?: boolean) => void;
  clearMessage: (timestamp: number, sync?: boolean, messageId?: string) => void;
  clearActiveMessage: (messageId: string, timestamp: number, sync?: boolean) => void;
  resetMessageStats: (sync?: boolean) => void;
  
  // Folder playback actions
  playFolder: (folderId: string, messageTree: MessageTreeNode[], sync?: boolean) => void;
  cancelFolderPlayback: (sync?: boolean) => void;
  
  setDefaultTextStyle: (id: string, sync?: boolean) => void;
  setTextStyleSetting: (styleId: string, key: string, value: unknown, sync?: boolean) => void;
  
  // Text style preset actions
  addTextStylePreset: (preset: TextStylePreset, sync?: boolean) => void;
  updateTextStylePreset: (id: string, updates: Partial<TextStylePreset>, sync?: boolean) => void;
  deleteTextStylePreset: (id: string, sync?: boolean) => void;
  setTextStylePresets: (presets: TextStylePreset[], sync?: boolean) => void;
  
  setAudioData: (data: number[]) => void;
  setServerInfo: (info: { ip: string; port: number }) => void;
  
  // Configuration base path actions
  setConfigBasePath: (path: string | null, sync?: boolean) => void;
  
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

function buildFlatMessageTree(messages: MessageConfig[]): MessageTreeNode[] {
  return messages.map((m) => ({ type: 'message', id: m.id, message: m }));
}

function flattenMessageTree(tree: MessageTreeNode[]): MessageConfig[] {
  const out: MessageConfig[] = [];
  const walk = (nodes: MessageTreeNode[]) => {
    nodes.forEach((n) => {
      if (n.type === 'message') {
        out.push(n.message);
      } else {
        walk(n.children ?? []);
      }
    });
  };
  walk(tree);
  return out;
}

let lastAugmentedConfigKeySent = '';

function ensureDefaultTextStylePresets(
  basePresets: TextStylePreset[],
  textStyleSettings: Record<string, Record<string, unknown>> | undefined
): TextStylePreset[] {
  const presets = [...basePresets];
  const existingByStyleId = new Map<string, TextStylePreset[]>();
  presets.forEach((p) => {
    const arr = existingByStyleId.get(p.textStyleId) ?? [];
    arr.push(p);
    existingByStyleId.set(p.textStyleId, arr);
  });

  const defaultsByStyleId = getDefaultTextStyleSettings();

  textStyleRegistry.forEach((style) => {
    if ((existingByStyleId.get(style.id) ?? []).length > 0) return;
    presets.push({
      id: `default-${style.id}`,
      name: style.name,
      textStyleId: style.id,
      settings: textStyleSettings?.[style.id] || defaultsByStyleId[style.id] || {},
    });
  });

  return presets;
}

function findPresetById(presets: TextStylePreset[], id: string | undefined): TextStylePreset | undefined {
  if (!id) return undefined;
  return presets.find((p) => p.id === id);
}

function findDefaultPresetForStyle(presets: TextStylePreset[], styleId: string): TextStylePreset | undefined {
  const stableId = `default-${styleId}`;
  return presets.find((p) => p.id === stableId) ?? presets.find((p) => p.textStyleId === styleId);
}

function normalizeMessageTextStyle(msg: MessageConfig, presets: TextStylePreset[]): MessageConfig {
  const styleId = msg.textStyle || 'scrolling-capitals';
  const preset = findPresetById(presets, msg.textStylePreset);
  if (preset) {
    // If preset exists but style doesn't match, keep preset and align style to it (preset is what user selected).
    if (msg.textStyle !== preset.textStyleId) {
      return { ...msg, textStyle: preset.textStyleId };
    }
    return msg;
  }

  const fallback = findDefaultPresetForStyle(presets, styleId);
  if (!fallback) return msg;
  return { ...msg, textStyle: styleId, textStylePreset: fallback.id };
}

function parseDefaultConfig(): Partial<AppState> {
  const config = defaultConfig as AppConfiguration;
  
  // Create default presets from existing settings if presets don't exist
  const visualizationPresets: VisualizationPreset[] = config.visualizationPresets ?? [];
  const textStylePresets: TextStylePreset[] = config.textStylePresets ?? [];
  
  // Ensure one preset per visualization exists
  // Use the statically imported registry (works in app + Vitest; avoids CJS require issues)
  const existingVizIds = new Set(visualizationPresets.map(p => p.visualizationId));
  if (Array.isArray(visualizationRegistry) && visualizationRegistry.length > 0) {
    visualizationRegistry.forEach((viz) => {
      if (!existingVizIds.has(viz.id)) {
        const defaultSettings =
          config.visualizationSettings?.[viz.id] ||
          getDefaultVisualizationSettings()[viz.id] ||
          {};
        visualizationPresets.push({
          id: generateId(),
          name: viz.name,
          visualizationId: viz.id,
          settings: defaultSettings,
          enabled: true,
        });
      }
    });
  }
  
  // If no presets exist at all, create from existing settings
  if (visualizationPresets.length === 0 && config.visualizationSettings) {
    Object.entries(config.visualizationSettings).forEach(([vizId, settings]) => {
      visualizationPresets.push({
        id: generateId(),
        name: vizId.charAt(0).toUpperCase() + vizId.slice(1).replace(/-/g, ' '),
        visualizationId: vizId,
        settings,
        enabled: true,
      });
    });
  }
  
  // If no text style presets exist, create defaults from existing settings
  if (textStylePresets.length === 0 && config.textStyleSettings) {
    Object.entries(config.textStyleSettings).forEach(([styleId, settings]) => {
      const registryStyle = textStyleRegistry.find(s => s.id === styleId);
      textStylePresets.push({
        id: generateId(),
        // Default presets should read like the style name, not "Default"/"Preset"
        name: registryStyle?.name ?? (styleId.charAt(0).toUpperCase() + styleId.slice(1).replace(/-/g, ' ')),
        textStyleId: styleId,
        settings,
      });
    });
  }

  // Ensure one default preset per registered text style exists (stable ids like default-credits)
  const augmentedTextStylePresets = ensureDefaultTextStylePresets(
    textStylePresets,
    config.textStyleSettings ?? {}
  );
  console.log('[Store] Final text style presets:', textStylePresets.map(p => ({ id: p.id, name: p.name, styleId: p.textStyleId })));
  
  return {
    activeVisualization: config.activeVisualization ?? 'fireplace',
    enabledVisualizations: config.enabledVisualizations ?? ['fireplace', 'techno'],
    commonSettings: config.commonSettings,
    visualizationSettings: config.visualizationSettings ?? {},
    visualizationPresets,
    activeVisualizationPreset: config.activeVisualizationPreset ?? null,
    messages: config.messages ?? [],
    messageTree: config.messageTree ?? buildFlatMessageTree(config.messages ?? []),
    defaultTextStyle: config.defaultTextStyle ?? 'scrolling-capitals',
    textStyleSettings: config.textStyleSettings ?? {},
    textStylePresets: augmentedTextStylePresets,
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
  messageTree: defaults.messageTree ?? buildFlatMessageTree(defaults.messages ?? []),
  activeMessages: [],
  activeMessage: null, // Legacy compatibility
  messageTimestamp: 0, // Legacy compatibility
  messageStats: defaults.messageStats ?? {},
  folderPlaybackQueue: null,
  
  defaultTextStyle: defaults.defaultTextStyle ?? 'scrolling-capitals',
  textStyleSettings: defaults.textStyleSettings ?? getDefaultTextStyleSettings(),
  textStylePresets: defaults.textStylePresets ?? [],
  
  audioData: new Array(128).fill(0),
  serverInfo: null,
  configBasePath: null,
  
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
    set({ messages, messageTree: buildFlatMessageTree(messages) });
    if (sync) {
      syncState('SET_MESSAGES', messages);
    }
  },

  setMessageTree: (tree, sync = true) => {
    const flat = flattenMessageTree(tree);
    set({ messageTree: tree, messages: flat });
    if (sync) {
      // Backward compatible: still sync SET_MESSAGES for existing listeners
      syncState('SET_MESSAGES', flat);
      // New: message tree for folder-aware UIs (backend may ignore if not implemented)
      syncState('SET_MESSAGE_TREE', tree);
    }
  },

  addMessage: (text, sync = true) => {
    const state = get();
    const newMessage: MessageConfig = {
      id: generateId(),
      text,
      textStyle: state.defaultTextStyle,
      splitEnabled: false,
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
    
    // Note: repeatCount is now handled by the text style plugins themselves
    // They will repeat the animation internally before calling onComplete
    
    if (sync) {
      syncState('TRIGGER_MESSAGE', message);
    }
  },

  clearMessage: (timestamp, sync = true, messageId) => {
    const state = get();
    // First try to find by timestamp, then fall back to messageId (cross-window case)
    let clearedMessage = state.activeMessages.find(m => m.timestamp === timestamp);
    if (!clearedMessage && messageId) {
      clearedMessage = state.activeMessages.find(m => m.message.id === messageId);
    }
    
    // If no message to remove, nothing to do
    if (!clearedMessage) {
      return;
    }
    
    set(currentState => {
      // Remove the specific message we found
      const newActiveMessages = currentState.activeMessages.filter(
        m => m.timestamp !== clearedMessage.timestamp
      );
      
      // Legacy compatibility
      const legacyMessage = newActiveMessages.length > 0 ? newActiveMessages[newActiveMessages.length - 1].message : null;
      const legacyTimestamp = newActiveMessages.length > 0 ? newActiveMessages[newActiveMessages.length - 1].timestamp : 0;
      
      return {
        activeMessages: newActiveMessages,
        activeMessage: legacyMessage,
        messageTimestamp: legacyTimestamp,
      };
    });
    
    if (sync) {
      syncState('CLEAR_MESSAGE', { timestamp, messageId: clearedMessage.message.id });
    }
  },

  clearActiveMessage: (messageId, timestamp, sync = true) => {
    // Clear instances of this message that are currently active
    // First try to match by both messageId and timestamp
    // If no exact match, clear by messageId only (handles cross-window timestamp differences)
    set(state => {
      const exactMatch = state.activeMessages.find(
        m => m.message.id === messageId && m.timestamp === timestamp
      );
      
      let newActiveMessages: typeof state.activeMessages;
      if (exactMatch) {
        // Exact match found - remove just that one
        newActiveMessages = state.activeMessages.filter(
          m => !(m.message.id === messageId && m.timestamp === timestamp)
        );
      } else {
        // No exact match - remove all with this messageId (cross-window case)
        newActiveMessages = state.activeMessages.filter(
          m => m.message.id !== messageId
        );
      }
      
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

  resetMessageStats: (sync = true) => {
    set({ messageStats: {} });
    if (sync) {
      syncState('RESET_MESSAGE_STATS', {});
    }
  },

  // Folder playback actions
  // NOTE: These are now primarily for local state display.
  // Actual queue logic is handled by Rust backend via HTTP commands.
  playFolder: (_folderId, _messageTree, _sync = true) => {
    // Deprecated: Use HTTP command 'play-folder' instead
    // This action is kept for backward compatibility but does nothing
    console.warn('[playFolder] Deprecated: Use HTTP command play-folder instead');
  },

  cancelFolderPlayback: (sync = true) => {
    // Clear local state only - actual cancellation via HTTP command
    console.log('[cancelFolderPlayback] Clearing local folder playback state');
    
    const state = get();
    if (!state.folderPlaybackQueue) {
      return;
    }
    
    // Clear the queue
    set({ folderPlaybackQueue: null });
    
    // Clear active messages locally (UI will update)
    set({ activeMessages: [], activeMessage: null, messageTimestamp: 0 });
    
    if (sync) {
      syncState('CANCEL_FOLDER_PLAYBACK', {});
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

  // Configuration base path action
  setConfigBasePath: (path, sync = true) => {
    console.log('[Store] Setting config base path:', path, 'sync:', sync);
    set({ configBasePath: path });
    if (sync) {
      console.log('[Store] Syncing config base path to backend');
      syncState('SET_CONFIG_BASE_PATH', path);
    }
  },

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
      messageTree: state.messageTree,
      defaultTextStyle: state.defaultTextStyle,
      textStyleSettings: state.textStyleSettings,
      textStylePresets: state.textStylePresets,
      messageStats: state.messageStats,
    };
  },

  loadConfiguration: (config, sync = true) => {
    console.log('[Store] Loading configuration:', config);
    const mode = (config.activeVisualization ?? 'fireplace') === 'techno' ? 'techno' : 'fireplace';
    const messageTree = config.messageTree ?? buildFlatMessageTree(config.messages ?? []);
    let messages = config.messages ?? flattenMessageTree(messageTree);
    
    // Ensure all registered text styles have stable default presets (id: default-<styleId>)
    const originalPresets = config.textStylePresets ?? [];
    const textStylePresets = ensureDefaultTextStylePresets(
      originalPresets,
      config.textStyleSettings ?? {}
    );
    const didAugmentPresets = textStylePresets.length !== originalPresets.length;
    
    // Normalize messages: if preset missing/invalid, assign default-<textStyle>
    const beforeKey = JSON.stringify(messages.map(m => ({ id: m.id, textStyle: m.textStyle, textStylePreset: m.textStylePreset })));
    messages = messages.map((m) => normalizeMessageTextStyle(m, textStylePresets));
    const afterKey = JSON.stringify(messages.map(m => ({ id: m.id, textStyle: m.textStyle, textStylePreset: m.textStylePreset })));
    const didNormalizeMessages = beforeKey !== afterKey;
    
    // Also fix messages in the tree
    const fixMessageTree = (nodes: MessageTreeNode[]): MessageTreeNode[] => {
      return nodes.map(node => {
        if (node.type === 'message') {
          return {
            ...node,
            message: normalizeMessageTextStyle(node.message, textStylePresets),
          };
        } else {
          return {
            ...node,
            children: fixMessageTree(node.children)
          };
        }
      });
    };
    const fixedMessageTree = fixMessageTree(messageTree);
    
    set({
      activeVisualization: config.activeVisualization ?? 'fireplace',
      activeVisualizationPreset: config.activeVisualizationPreset ?? null,
      enabledVisualizations: config.enabledVisualizations ?? ['fireplace', 'techno'],
      commonSettings: config.commonSettings,
      visualizationSettings: config.visualizationSettings ?? {},
      visualizationPresets: config.visualizationPresets ?? [],
      messages,
      messageTree: fixedMessageTree,
      defaultTextStyle: config.defaultTextStyle ?? 'scrolling-capitals',
      textStyleSettings: config.textStyleSettings ?? {},
      textStylePresets,
      messageStats: config.messageStats ?? {},
      mode,
    });

    // Hybrid: if we had to augment presets / normalize messages, sync back once so SSE becomes canonical.
    // This is idempotent because default preset ids are stable.
    if (!sync && (didAugmentPresets || didNormalizeMessages)) {
      const normalizedConfig: AppConfiguration = {
        ...config,
        textStylePresets,
        messages,
        messageTree: fixedMessageTree,
      };
      const key = JSON.stringify({
        textStylePresets: textStylePresets.map(p => ({ id: p.id, textStyleId: p.textStyleId })),
        messages: messages.map(m => ({ id: m.id, textStyle: m.textStyle, textStylePreset: m.textStylePreset })),
      });
      if (lastAugmentedConfigKeySent !== key) {
        lastAugmentedConfigKeySent = key;
        console.log('[Store] Syncing normalized config back to backend (idempotent)');
        syncState('LOAD_CONFIGURATION', normalizedConfig);
      }
    }

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
