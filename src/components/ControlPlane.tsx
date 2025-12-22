import React, { useEffect, useState, useRef } from 'react';
import { useFetcher } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Flame, Music, Send, Monitor, Smartphone, MessageSquare, 
  Settings2, Loader2, Sliders, Save, Upload,
  ChevronDown, ChevronUp, Trash2, History, X, GripVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppState } from '../hooks/useAppState';
import { getVisualization } from '../plugins/visualizations';
import { textStyleRegistry, getTextStyle } from '../plugins/textStyles';
import { SettingsRenderer, CommonSettings } from './settings/SettingsRenderer';
import { VisualizationPresetsManager } from './settings/VisualizationPresetsManager';
import { TextStylePresetsManager } from './settings/TextStylePresetsManager';
import { MessageConfig, AppConfiguration, VisualizationPreset, TextStylePreset } from '../plugins/types';
import { useStore } from '../store';

// API base for Tauri windows - they need to hit the Axum server directly
const API_BASE = 'http://localhost:8080';

// Icon map for visualizations
const iconMap: Record<string, React.ReactNode> = {
  'Flame': <Flame size={32} />,
  'Music': <Music size={32} />,
};

export const ControlPlane: React.FC = () => {
  console.log('[ControlPlane] Component rendering');
  
  // SSE-based state - single source of truth
  const { state, isConnected } = useAppState({ apiBase: API_BASE });
  console.log('[ControlPlane] useAppState returned - state:', state, 'isConnected:', isConnected);
  
  // Loading state while SSE connects - but don't wait forever
  // CRITICAL: This must be declared BEFORE any conditional returns to maintain hook order
  const [showLoading, setShowLoading] = useState(true);
  
  // Use a simple boolean to track if state exists (always defined, never undefined)
  const hasState = state !== null;
  
  // Store for preset management (local state for now, will sync via commands)
  const visualizationPresets = useStore((s) => s.visualizationPresets);
  const activeVisualizationPreset = useStore((s) => s.activeVisualizationPreset);
  const addVisualizationPreset = useStore((s) => s.addVisualizationPreset);
  const updateVisualizationPreset = useStore((s) => s.updateVisualizationPreset);
  const deleteVisualizationPreset = useStore((s) => s.deleteVisualizationPreset);
  const setActiveVisualizationPreset = useStore((s) => s.setActiveVisualizationPreset);
  // Get message stats from SSE state (source of truth)
  // CRITICAL: Never call hooks conditionally.
  // This must ALWAYS call useStore, otherwise hook order changes between renders when SSE state arrives.
  const storeMessageStats = useStore((s) => s.messageStats);
  const messageStats = state?.messageStats ?? storeMessageStats;
  const activeMessages = useStore((s) => s.activeMessages);
  const clearActiveMessage = useStore((s) => s.clearActiveMessage);
  
  // Sync messageStats from SSE to store
  // CRITICAL: Use a ref to track the last synced value and only sync when state changes
  // Use a stable boolean dependency instead of computing a string key during render
  const messageStatsSyncedRef = useRef<string>('');
  const hasMessageStats = state?.messageStats != null;
  
  // Sync messageStats in useEffect with stable boolean dependency
  // CRITICAL: Only depend on hasMessageStats (always a boolean, never undefined)
  // Access state?.messageStats inside the effect via closure, not in dependency array
  useEffect(() => {
    if (!state?.messageStats) {
      if (messageStatsSyncedRef.current !== '') {
        messageStatsSyncedRef.current = '';
      }
      return;
    }
    
    try {
      const messageStatsKey = JSON.stringify(state.messageStats);
      if (messageStatsSyncedRef.current !== messageStatsKey) {
        console.log('[ControlPlane] Syncing messageStats to store');
        messageStatsSyncedRef.current = messageStatsKey;
        useStore.setState({ messageStats: state.messageStats });
      }
    } catch (e) {
      console.error('[ControlPlane] Error serializing messageStats:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMessageStats]); // ONLY hasMessageStats - state is accessed via closure
  
  // Store for text style presets
  const textStylePresets = useStore((s) => s.textStylePresets);
  const addTextStylePreset = useStore((s) => s.addTextStylePreset);
  const updateTextStylePreset = useStore((s) => s.updateTextStylePreset);
  const deleteTextStylePreset = useStore((s) => s.deleteTextStylePreset);
  
  // Local UI state
  const [newMessage, setNewMessage] = useState('');
  const [serverInfo, setServerInfo] = useState<{ ip: string; port: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Message reordering (pointer-based; HTML5 DnD is flaky in some WebViews)
  const [draggingMessageId, setDraggingMessageId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null); // insertion index [0..messages.length]
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [showTextStylePresetsManager, setShowTextStylePresetsManager] = useState(false);
  const [newMessageTextStylePresetId, setNewMessageTextStylePresetId] = useState<string>('');

  // Debug flag for message reordering
  const dndDebugRef = useRef<boolean>(false);
  useEffect(() => {
    try {
      dndDebugRef.current = window.localStorage.getItem('vibecast:dndDebug') === '1';
    } catch {
      dndDebugRef.current = false;
    }
  }, []);

  // Fetcher for form submissions - no navigation, just mutation
  const fetcher = useFetcher();
  
  // Get active preset
  const activePreset = activeVisualizationPreset 
    ? visualizationPresets.find(p => p.id === activeVisualizationPreset)
    : null;

  // Fetch server info from Tauri on mount
  useEffect(() => {
    invoke<{ ip: string; port: number }>('get_server_info').then((info) => {
      setServerInfo(info);
    }).catch((err) => {
      console.error('Failed to get server info:', err);
    });
  }, []);

  // Loading timeout effect - must be after all other hooks
  useEffect(() => {
    console.log('[ControlPlane] useEffect showLoading - state:', state, 'hasState:', hasState);
    // Give SSE 2 seconds to connect, then show UI anyway
    const timer = setTimeout(() => {
      console.log('[ControlPlane] Loading timeout expired, showing UI');
      setShowLoading(false);
    }, 2000);
    
    if (state) {
      console.log('[ControlPlane] State received, clearing loading timeout');
      setShowLoading(false);
      clearTimeout(timer);
    }
    
    return () => {
      console.log('[ControlPlane] Cleaning up loading timeout');
      clearTimeout(timer);
    };
  }, [hasState]); // Use boolean instead of state object

  // Default "current" text preset for newly created messages
  useEffect(() => {
    if (!newMessageTextStylePresetId && textStylePresets.length > 0) {
      setNewMessageTextStylePresetId(textStylePresets[0].id);
    }
  }, [newMessageTextStylePresetId, textStylePresets]);

  // CRITICAL: NO early returns - always render the same structure
  // Use defaults if state is not available yet - always have values to render
  const activeVisualization = state?.activeVisualization ?? 'fireplace';
  const enabledVisualizations = state?.enabledVisualizations ?? ['fireplace', 'techno'];
  const commonSettings = state?.commonSettings ?? { intensity: 1.0, dim: 1.0 };
  const visualizationSettings = state?.visualizationSettings ?? {};
  // Render messages from a local mirror so reorders can be optimistic and not snap back while SSE catches up.
  // IMPORTANT: don't use `state?.messages ?? []` directly as an effect dep, because `[]` creates a new ref every render.
  const sseMessages = state?.messages;
  const [messagesLocal, setMessagesLocal] = useState<MessageConfig[]>([]);
  useEffect(() => {
    setMessagesLocal(sseMessages ?? []);
  }, [sseMessages]);

  const messages = messagesLocal;
  const defaultTextStyle = state?.defaultTextStyle ?? 'scrolling-capitals';
  const textStyleSettings = state?.textStyleSettings ?? {};

  const toggleViz = async () => {
    try {
      const allWindows = await getAllWebviewWindows();
      const vizWindow = allWindows.find(w => w.label === 'viz');
      
      if (!vizWindow) {
        console.error('Viz window not found. Available windows:', allWindows.map(w => w.label));
        return;
      }
      
      const visible = await vizWindow.isVisible();
      console.log('Viz window visible:', visible);
      
      if (visible) {
        await vizWindow.hide();
        console.log('Viz window hidden');
      } else {
        await vizWindow.show();
        await vizWindow.setFocus();
        console.log('Viz window shown and focused');
      }
    } catch (error) {
      console.error('Error toggling viz window:', error);
    }
  };

  // Helper to send commands via fetcher
  const sendCommand = (command: string, payload: unknown) => {
    fetcher.submit(
      { command, payload: JSON.stringify(payload) },
      { method: 'post', action: '/' }
    );
  };

  const handleAddMessage = () => {
    if (newMessage.trim()) {
      const preset = newMessageTextStylePresetId
        ? textStylePresets.find((p) => p.id === newMessageTextStylePresetId)
        : null;
      const newMsg: MessageConfig = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        text: newMessage.trim(),
        textStyle: preset?.textStyleId ?? defaultTextStyle,
        textStylePreset: preset?.id || undefined,
      };
      const next = [...messages, newMsg];
      setMessagesLocal(next);
      sendCommand('set-messages', next);
      setNewMessage('');
    }
  };

  const handleDeleteMessage = (id: string) => {
    const next = messages.filter(m => m.id !== id);
    setMessagesLocal(next);
    sendCommand('set-messages', next);
    if (expandedMessage === id) setExpandedMessage(null);
  };

  const dndLog = (...args: unknown[]) => {
    if (dndDebugRef.current) console.log('[ControlPlane:DND]', ...args);
  };

  const computeDropIndexFromPointer = (clientY: number): number => {
    // Determine insertion point by comparing pointer to item midpoints.
    for (let i = 0; i < messages.length; i++) {
      const id = messages[i].id;
      const el = messageItemRefs.current.get(id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return messages.length;
  };

  const commitReorder = (id: string, insertionPoint: number) => {
    const from = messages.findIndex((m) => m.id === id);
    if (from === -1) return;
    let to = insertionPoint;
    if (from < to) to -= 1;

    const next = [...messages];
    const [moved] = next.splice(from, 1);
    const insertPos = Math.max(0, Math.min(next.length, to));
    next.splice(insertPos, 0, moved);

    if (from === insertPos) return;
    dndLog('commit', { id, from, insertPos });
    setMessagesLocal(next);
    sendCommand('set-messages', next);
  };

  const startPointerDrag = (e: React.PointerEvent, messageId: string) => {
    // Only left click / primary pointer
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    setDraggingMessageId(messageId);
    const startIdx = messages.findIndex((m) => m.id === messageId);
    setDropIndex(startIdx === -1 ? 0 : startIdx);
    dndLog('start', { messageId, startIdx, y: e.clientY });

    // Capture pointer so we continue receiving move/up even if we leave the element.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMoveList = (e: React.PointerEvent) => {
    if (!draggingMessageId) return;
    const idx = computeDropIndexFromPointer(e.clientY);
    setDropIndex(idx);
    dndLog('move', { y: e.clientY, dropIndex: idx });
  };

  const endPointerDrag = (e: React.PointerEvent) => {
    if (!draggingMessageId) return;
    const id = draggingMessageId;
    const insertion = dropIndex ?? computeDropIndexFromPointer(e.clientY);
    dndLog('end', { id, insertion, y: e.clientY });
    commitReorder(id, insertion);
    setDraggingMessageId(null);
    setDropIndex(null);
  };

  const handleUpdateMessageStyle = (id: string, textStyle: string) => {
    sendCommand('set-messages', messages.map(m => 
      m.id === id ? { ...m, textStyle } : m
    ));
  };

  const handleTriggerMessage = (msg: MessageConfig) => {
    sendCommand('trigger-message', msg);
  };

  const handleClearActiveMessage = (messageId: string) => {
    // Find all active instances of this message and clear them
    const activeInstances = activeMessages.filter(am => am.message.id === messageId);
    activeInstances.forEach(({ timestamp }) => {
      clearActiveMessage(messageId, timestamp, true);
      sendCommand('clear-active-message', { messageId, timestamp });
    });
  };

  const handleSaveConfig = async () => {
    // Create configuration object
    const config: AppConfiguration = {
      version: 1,
      activeVisualization,
      enabledVisualizations,
      commonSettings,
      visualizationSettings,
      messages,
      defaultTextStyle,
      textStyleSettings,
    };
    
    // Download as JSON file
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibecast-config-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadConfig = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        try {
          const config = JSON.parse(text) as AppConfiguration;
          sendCommand('load-configuration', config);
        } catch (err) {
          console.error('Failed to parse config file:', err);
        }
      }
    };
    input.click();
  };

  const remoteUrl = serverInfo ? `http://${serverInfo.ip}:${serverInfo.port}` : '';
  const isPending = fetcher.state !== 'idle';


  const activePlugin = activePreset 
    ? getVisualization(activePreset.visualizationId)
    : getVisualization(activeVisualization);

  // Preset management handlers
  const handleAddPreset = (preset: VisualizationPreset) => {
    addVisualizationPreset(preset);
    sendCommand('set-visualization-presets', [...visualizationPresets, preset]);
  };

  const handleUpdatePreset = (id: string, updates: Partial<VisualizationPreset>) => {
    updateVisualizationPreset(id, updates);
    const updated = visualizationPresets.map(p => p.id === id ? { ...p, ...updates } : p);
    sendCommand('set-visualization-presets', updated);
  };

  const handleDeletePreset = (id: string) => {
    deleteVisualizationPreset(id);
    const filtered = visualizationPresets.filter(p => p.id !== id);
    sendCommand('set-visualization-presets', filtered);
    if (activeVisualizationPreset === id) {
      setActiveVisualizationPreset(null);
      sendCommand('set-active-visualization-preset', null);
    }
  };

  const handleSetActivePreset = (id: string | null) => {
    setActiveVisualizationPreset(id);
    sendCommand('set-active-visualization-preset', id);
  };

  // Text style preset handlers
  const handleAddTextStylePreset = (preset: TextStylePreset) => {
    addTextStylePreset(preset);
    sendCommand('set-text-style-presets', [...textStylePresets, preset]);
  };

  const handleUpdateTextStylePreset = (id: string, updates: Partial<TextStylePreset>) => {
    updateTextStylePreset(id, updates);
    const updated = textStylePresets.map(p => p.id === id ? { ...p, ...updates } : p);
    sendCommand('set-text-style-presets', updated);
  };

  const handleDeleteTextStylePreset = (id: string) => {
    deleteTextStylePreset(id);
    const filtered = textStylePresets.filter(p => p.id !== id);
    sendCommand('set-text-style-presets', filtered);
  };

  // CRITICAL: NO early returns - always render the same structure
  // Conditionally render loading state in JSX to maintain hook order
  return (
    <>
      {showLoading && !state ? (
        <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={32} className="animate-spin text-orange-500" />
            <span className="text-zinc-500 text-sm">Connecting to server...</span>
          </div>
        </div>
      ) : (
        <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-orange-500/30 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-orange-600/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-600/5 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <header className="flex justify-between items-end mb-12">
          <div>
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 mb-2"
            >
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-orange-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] font-bold tracking-[0.3em] text-zinc-500 uppercase">
                {isConnected ? 'System Active' : 'Reconnecting...'}
              </span>
            </motion.div>
            <h1 className="text-5xl font-black tracking-tight bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
              VIBECAST
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Config buttons */}
            <button 
              onClick={handleSaveConfig}
              className="p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl transition-all active:scale-95"
              title="Save Configuration"
            >
              <Save size={18} className="text-zinc-400" />
            </button>
            <button 
              onClick={handleLoadConfig}
              className="p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl transition-all active:scale-95"
              title="Load Configuration"
            >
              <Upload size={18} className="text-zinc-400" />
            </button>
            
            <button 
              onClick={toggleViz}
              className="group relative px-6 py-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl transition-all active:scale-95 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex items-center gap-3 font-bold text-sm">
                <Monitor size={18} className="text-orange-500" />
                Toggle Stage
              </div>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-6">
          {/* Main Controls */}
          <div className="col-span-12 lg:col-span-8 space-y-6 order-1">
            {/* Visualization Selection */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Settings2 size={18} className="text-zinc-500" />
                  <h2 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Visualization</h2>
                </div>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                    showSettings ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Sliders size={14} />
                  Settings
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(!visualizationPresets || visualizationPresets.filter(p => p.enabled !== false).length === 0) ? (
                  <div className="col-span-2 text-center py-8 text-zinc-500 text-sm">
                    {visualizationPresets?.length === 0 
                      ? 'No enabled presets. Enable them in Settings.'
                      : 'Loading presets...'}
                  </div>
                ) : (
                  visualizationPresets
                    .filter(p => p.enabled !== false)
                    .map((preset) => {
                      const viz = getVisualization(preset.visualizationId);
                      // If we don't have an explicit active preset yet, fall back to the active visualization id
                      const isActive =
                        preset.id === activeVisualizationPreset ||
                        (!activeVisualizationPreset && preset.visualizationId === activeVisualization);
                      return (
                  <VisualizationCard 
                          key={preset.id}
                          active={isActive}
                          onClick={() => handleSetActivePreset(isActive ? null : preset.id)}
                          icon={viz ? (iconMap[viz.icon] || <Settings2 size={32} />) : <Settings2 size={32} />}
                          title={preset.name}
                          description={viz?.description || `${preset.visualizationId} preset`}
                    disabled={isPending}
                  />
                      );
                    })
                )}
              </div>
            </section>

            {/* Settings Panel */}
            <AnimatePresence>
              {showSettings && (
                <motion.section
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-6">
                    {/* Common Settings - Always visible */}
                    <div>
                      <h3 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">
                        Common Settings
                      </h3>
                      <CommonSettings
                        intensity={commonSettings.intensity}
                        dim={commonSettings.dim}
                        onIntensityChange={(v) => sendCommand('set-common-settings', { ...commonSettings, intensity: v })}
                        onDimChange={(v) => sendCommand('set-common-settings', { ...commonSettings, dim: v })}
                      />
                    </div>

                    {/* Visualization Presets Manager */}
                    <div className="space-y-6">
                      <div>
                        <VisualizationPresetsManager
                          presets={visualizationPresets}
                          activePresetId={activeVisualizationPreset}
                          onAddPreset={handleAddPreset}
                          onUpdatePreset={handleUpdatePreset}
                          onDeletePreset={handleDeletePreset}
                          onSetActivePreset={handleSetActivePreset}
                        />
                      </div>

                      {/* Active Preset Settings */}
                      {activePreset && activePlugin && activePlugin.settingsSchema.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">
                            {activePreset.name} Settings
                          </h3>
                          <SettingsRenderer
                            schema={activePlugin.settingsSchema}
                            values={activePreset.settings}
                            onChange={(key, value) => {
                              handleUpdatePreset(activePreset.id, {
                                settings: { ...activePreset.settings, [key]: value },
                              });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

          </div>

          {/* Sidebar - Messages */}
          <aside className="col-span-12 lg:col-span-4 order-2">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
              <MessageSquare size={18} className="text-zinc-500" />
              <h2 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Messages</h2>
              </div>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                  showHistory ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
                title="Show message history"
              >
                <History size={14} />
              </button>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 backdrop-blur-md flex flex-col max-h-[700px]">
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddMessage();
                    }
                  }}
                  placeholder="New message..."
                  className="flex-1 bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-orange-500/50 outline-none transition-all"
                />
                <button
                  onClick={handleAddMessage}
                  disabled={isPending || !newMessage.trim()}
                  className="p-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all active:scale-90 shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={18} />
                </button>
              </div>

              {/* New message style preset (current preset) */}
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">
                    Text Style Preset (new messages)
                  </label>
                  <button
                    onClick={() => setShowTextStylePresetsManager((v) => !v)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                      showTextStylePresetsManager
                        ? 'bg-orange-500 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                    title="Manage text style presets"
                  >
                    <Sliders size={14} />
                    Presets
                  </button>
                </div>
                <select
                  value={newMessageTextStylePresetId}
                  onChange={(e) => setNewMessageTextStylePresetId(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:border-orange-500/50 outline-none transition-all"
                >
                  <option value="">Default ({defaultTextStyle})</option>
                  {textStylePresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Text style presets manager (in Messages sidebar) */}
              <AnimatePresence>
                {showTextStylePresetsManager && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 border border-zinc-800 rounded-xl overflow-hidden"
                  >
                    <div className="p-4 bg-zinc-950">
                      <TextStylePresetsManager
                        presets={textStylePresets}
                        onAddPreset={handleAddTextStylePreset}
                        onUpdatePreset={handleUpdateTextStylePreset}
                        onDeletePreset={handleDeleteTextStylePreset}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                ref={messageListRef}
                className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar"
                onPointerMove={onPointerMoveList}
                onPointerUp={endPointerDrag}
                onPointerCancel={endPointerDrag}
              >
                <AnimatePresence initial={false}>
                  {messages.map((msg) => {
                    const stats = messageStats[msg.id];
                    const triggerCount = stats?.triggerCount ?? 0;
                    const isAnimating = activeMessages.some(am => am.message.id === msg.id);
                    const index = messages.findIndex(m => m.id === msg.id);
                    
                    return (
                      <div
                        key={msg.id}
                        ref={(el) => {
                          if (!el) {
                            messageItemRefs.current.delete(msg.id);
                            return;
                          }
                          messageItemRefs.current.set(msg.id, el);
                        }}
                        className={`${draggingMessageId === msg.id ? 'opacity-50' : ''}`}
                      >
                        {/* Drop indicator before this item */}
                        {draggingMessageId && dropIndex === index && (
                          <div className="h-2 flex items-center">
                            <div className="w-full h-[2px] bg-orange-500/70 rounded-full" />
                          </div>
                        )}
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                          className={`bg-zinc-950 border rounded-xl overflow-hidden transition-all ${
                            isAnimating ? 'border-orange-500/50 shadow-lg shadow-orange-500/20' : 'border-zinc-800/50'
                          }`}
                    >
                      <div className="flex items-center gap-2 p-3">
                        {/* Drag handle */}
                        <button
                          onPointerDown={(e) => startPointerDrag(e, msg.id)}
                          className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors cursor-grab active:cursor-grabbing"
                          title="Drag to reorder"
                        >
                          <GripVertical size={16} />
                        </button>
                          {/* Status indicator button */}
                        <button
                            onClick={() => isAnimating ? handleClearActiveMessage(msg.id) : handleTriggerMessage(msg)}
                          disabled={isPending}
                            className={`flex-1 text-left text-sm font-medium transition-colors disabled:opacity-50 truncate ${
                              isAnimating 
                                ? 'text-orange-500 hover:text-orange-400' 
                                : triggerCount > 0
                                ? 'text-zinc-200 hover:text-white'
                                : 'text-zinc-300 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {/* Status indicator */}
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isAnimating 
                                  ? 'bg-orange-500 animate-pulse' 
                                  : triggerCount > 0
                                  ? 'bg-green-500'
                                  : 'bg-zinc-600'
                              }`} />
                              <span>{msg.text}</span>
                              {/* Style indicator */}
                              <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500 border border-zinc-800 bg-zinc-900/40 rounded px-1.5 py-0.5">
                                {(() => {
                                  const preset = msg.textStylePreset
                                    ? textStylePresets.find(p => p.id === msg.textStylePreset)
                                    : null;
                                  if (preset) return preset.name;
                                  const style = getTextStyle(msg.textStyle);
                                  return style?.name ?? msg.textStyle;
                                })()}
                              </span>
                              {isAnimating && (
                                <span className="text-xs text-orange-500 font-bold animate-pulse">ANIMATING</span>
                              )}
                            </div>
                          </button>
                          {/* Counter badge */}
                          <div
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                              triggerCount === 0
                                ? 'bg-zinc-800 text-zinc-500'
                                : 'bg-orange-500/20 text-orange-400'
                            }`}
                            title={`Triggered ${triggerCount} time${triggerCount !== 1 ? 's' : ''}`}
                          >
                            {triggerCount}
                          </div>
                          {/* Clear button when animating */}
                          {isAnimating && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClearActiveMessage(msg.id);
                              }}
                              className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-bold hover:bg-red-500/30 transition-colors"
                              title="Clear message"
                            >
                              Clear
                        </button>
                          )}
                        <button
                          onClick={() => setExpandedMessage(expandedMessage === msg.id ? null : msg.id)}
                          className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                          {expandedMessage === msg.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                          title="Delete message"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <AnimatePresence>
                        {expandedMessage === msg.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="px-3 pb-3 border-t border-zinc-800/50"
                          >
                            <div className="pt-3 space-y-4">
                              {/* Text Style Preset Selector */}
                              <div>
                              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                                  Text Style Preset
                              </label>
                                <select
                                  value={msg.textStylePreset || ''}
                                  onChange={(e) => {
                                    const nextPresetId = e.target.value || '';
                                    const nextPreset = nextPresetId
                                      ? textStylePresets.find((p) => p.id === nextPresetId)
                                      : null;

                                    const updates: Partial<MessageConfig> = {
                                      textStylePreset: nextPreset?.id || undefined,
                                      // If switching style basis, clear per-message overrides to avoid mismatched schemas
                                      styleOverrides: undefined,
                                      // Keep a sensible fallback styleId on the message itself
                                      textStyle: nextPreset?.textStyleId ?? defaultTextStyle,
                                    };
                                    sendCommand('set-messages', messages.map(m => 
                                      m.id === msg.id ? { ...m, ...updates } : m
                                    ));
                                  }}
                                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors mb-2"
                                >
                                  <option value="">Default ({defaultTextStyle})</option>
                                  {textStylePresets.map((preset) => (
                                    <option key={preset.id} value={preset.id}>
                                      {preset.name}
                                    </option>
                                  ))}
                                </select>
                                {/* Fallback to text style if no preset */}
                                {!msg.textStylePreset && (
                              <select
                                value={msg.textStyle}
                                onChange={(e) => handleUpdateMessageStyle(msg.id, e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-orange-500 outline-none transition-colors"
                              >
                                {textStyleRegistry.map((style) => (
                                  <option key={style.id} value={style.id}>
                                    {style.name}
                                  </option>
                                ))}
                              </select>
                                )}
                              </div>

                              {/* Repeat Count */}
                              <div>
                                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                                  Repeat Count: {msg.repeatCount ?? 1}
                                </label>
                                <input
                                  type="range"
                                  min="1"
                                  max="10"
                                  value={msg.repeatCount ?? 1}
                                  onChange={(e) => {
                                    sendCommand('set-messages', messages.map(m => 
                                      m.id === msg.id ? { ...m, repeatCount: parseInt(e.target.value) } : m
                                    ));
                                  }}
                                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                                  <span>1</span>
                                  <span>10</span>
                                </div>
                              </div>

                              {/* Speed Multiplier */}
                              <div>
                                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                                  Speed: {(msg.speed ?? 1.0).toFixed(1)}x
                                </label>
                                <input
                                  type="range"
                                  min="0.5"
                                  max="2.0"
                                  step="0.1"
                                  value={msg.speed ?? 1.0}
                                  onChange={(e) => {
                                    sendCommand('set-messages', messages.map(m => 
                                      m.id === msg.id ? { ...m, speed: parseFloat(e.target.value) } : m
                                    ));
                                  }}
                                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                                  <span>0.5x</span>
                                  <span>2.0x</span>
                                </div>
                              </div>

                              {/* Per-Message Style Overrides */}
                              {(() => {
                                const preset = msg.textStylePreset 
                                  ? textStylePresets.find(p => p.id === msg.textStylePreset)
                                  : null;
                                const styleId = preset?.textStyleId || msg.textStyle;
                                const textStyle = getTextStyle(styleId);
                                
                                if (!textStyle || textStyle.settingsSchema.length === 0) {
                                  return null;
                                }

                                const presetSettings = preset?.settings || textStyleSettings[styleId] || {};
                                const overridesEnabled = msg.styleOverrides != null;
                                const overrides = msg.styleOverrides || {};
                                const mergedSettings = { ...presetSettings, ...overrides };

                                return (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                                        Per-message settings
                                      </label>
                                      <div className="flex items-center gap-3">
                                        <label className="flex items-center gap-2 text-xs text-zinc-400">
                                          <input
                                            type="checkbox"
                                            checked={overridesEnabled}
                                            onChange={(e) => {
                                              const enabled = e.target.checked;
                                              sendCommand('set-messages', messages.map(m =>
                                                m.id === msg.id
                                                  ? { ...m, styleOverrides: enabled ? {} : undefined }
                                                  : m
                                              ));
                                            }}
                                            className="accent-orange-500"
                                          />
                                          Override
                                        </label>
                                        {overridesEnabled && (
                                          <button
                                            onClick={() => {
                                              sendCommand('set-messages', messages.map(m =>
                                                m.id === msg.id ? { ...m, styleOverrides: {} } : m
                                              ));
                                            }}
                                            className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded text-xs font-bold hover:bg-zinc-700 transition-colors"
                                            title="Reset overrides to preset/default"
                                          >
                                            Reset
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    {overridesEnabled && (
                                      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                                        <SettingsRenderer
                                          schema={textStyle.settingsSchema}
                                          values={mergedSettings}
                                          onChange={(key, value) => {
                                            const newOverrides = { ...overrides, [key]: value };
                                            sendCommand('set-messages', messages.map(m => 
                                              m.id === msg.id ? { ...m, styleOverrides: newOverrides } : m
                                            ));
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                      </div>
                    );
                  })}
                  {/* Drop indicator at end */}
                  {draggingMessageId && dropIndex === messages.length && (
                    <div className="h-2 flex items-center">
                      <div className="w-full h-[2px] bg-orange-500/70 rounded-full" />
                    </div>
                  )}
                </AnimatePresence>
              </div>
              
              {/* History Pane */}
              <AnimatePresence>
                {showHistory && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 border-t border-zinc-800 pt-4 overflow-hidden"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Message History</h3>
                      <button
                        onClick={() => setShowHistory(false)}
                        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                        title="Close history"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                      {messages.length === 0 ? (
                        <div className="text-center py-4 text-zinc-500 text-xs">No messages</div>
                      ) : (
                        messages.map((msg) => {
                          const stats = messageStats[msg.id];
                          const history = stats?.history ?? [];
                          
                          return (
                            <div key={msg.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                              <div className="text-sm font-medium text-zinc-300 mb-2">{msg.text}</div>
                              {history.length === 0 ? (
                                <div className="text-xs text-zinc-500">Never triggered</div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="text-xs text-zinc-500 mb-1">
                                    Triggered {stats?.triggerCount ?? 0} time{stats?.triggerCount !== 1 ? 's' : ''}
                                  </div>
                                  <div className="space-y-0.5">
                                    {history.slice().reverse().map((entry, idx) => (
                                      <div key={idx} className="text-xs text-zinc-600 font-mono">
                                        {new Date(entry.timestamp).toLocaleString()}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </aside>

          {/* Remote Info Section - After messages in non-wide layout */}
          <section className="col-span-12 lg:col-span-8 order-3 lg:order-2 relative group">
            <div className="absolute -inset-px bg-gradient-to-r from-orange-500/20 via-zinc-800 to-blue-500/20 rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="relative bg-zinc-950 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-8">
              <div className="bg-white p-3 rounded-xl shadow-2xl shrink-0">
                {remoteUrl ? (
                  <QRCodeSVG value={remoteUrl} size={120} level="H" />
                ) : (
                  <div className="w-28 h-28 bg-zinc-100 animate-pulse rounded-lg" />
                )}
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2 mb-3">
                  <Smartphone size={18} className="text-orange-500" />
                  <h3 className="text-lg font-bold">Mobile Remote</h3>
                </div>
                <p className="text-zinc-400 mb-4 leading-relaxed text-sm max-w-md">
                  Control from your phone. Scan the QR code to open the remote.
                </p>
                <div className="inline-flex items-center gap-3 bg-black border border-zinc-800 px-4 py-2 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <code className="text-orange-500 font-mono text-xs">{remoteUrl || 'Detecting...'}</code>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
      )}
    </>
  );
};

interface VisualizationCardProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}

const VisualizationCard: React.FC<VisualizationCardProps> = ({ 
  active, onClick, icon, title, description, disabled 
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative p-6 rounded-2xl text-left transition-all duration-300 active:scale-[0.98] group overflow-hidden disabled:opacity-70 ${
        active 
          ? 'bg-gradient-to-br from-orange-600 to-red-600 text-white shadow-2xl shadow-orange-900/30' 
          : 'bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:bg-zinc-800/50 hover:border-zinc-700'
      }`}
    >
      <div className={`relative z-10 mb-4 p-2 w-fit rounded-xl ${active ? 'bg-white/20' : 'bg-zinc-800 group-hover:scale-110 transition-transform'}`}>
        {icon}
      </div>
      <div className="relative z-10">
        <h3 className={`text-xl font-black uppercase tracking-tight mb-1 ${active ? 'text-white' : 'text-zinc-200'}`}>
          {title}
        </h3>
        <p className={`text-xs ${active ? 'text-white/70' : 'text-zinc-500'}`}>
          {description}
        </p>
      </div>
      {active && (
        <motion.div 
          layoutId="viz-active-glow"
          className="absolute inset-0 bg-white/10 mix-blend-overlay" 
        />
      )}
    </button>
  );
};
