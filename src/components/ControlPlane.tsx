import React, { useEffect, useState } from 'react';
import { useFetcher } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Flame, Music, Send, Monitor, Smartphone, MessageSquare, 
  Settings2, Loader2, Sliders, Save, Upload,
  ChevronDown, ChevronUp, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppState } from '../hooks/useAppState';
import { visualizationRegistry, getVisualization } from '../plugins/visualizations';
import { textStyleRegistry } from '../plugins/textStyles';
import { SettingsRenderer, CommonSettings } from './settings/SettingsRenderer';
import { MessageConfig, AppConfiguration } from '../plugins/types';

// API base for Tauri windows - they need to hit the Axum server directly
const API_BASE = 'http://localhost:8080';

// Icon map for visualizations
const iconMap: Record<string, React.ReactNode> = {
  'Flame': <Flame size={32} />,
  'Music': <Music size={32} />,
};

export const ControlPlane: React.FC = () => {
  // SSE-based state - single source of truth
  const { state, isConnected } = useAppState({ apiBase: API_BASE });
  
  // Local UI state
  const [newMessage, setNewMessage] = useState('');
  const [serverInfo, setServerInfo] = useState<{ ip: string; port: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);

  // Fetcher for form submissions - no navigation, just mutation
  const fetcher = useFetcher();
  
  // Derive state values (with defaults while loading)
  const activeVisualization = state?.activeVisualization ?? 'fireplace';
  const enabledVisualizations = state?.enabledVisualizations ?? ['fireplace', 'techno'];
  const commonSettings = state?.commonSettings ?? { intensity: 1.0, dim: 1.0 };
  const visualizationSettings = state?.visualizationSettings ?? {};
  const messages = state?.messages ?? [];
  const defaultTextStyle = state?.defaultTextStyle ?? 'scrolling-capitals';
  const textStyleSettings = state?.textStyleSettings ?? {};

  // Fetch server info from Tauri on mount
  useEffect(() => {
    invoke('get_server_info').then((info: any) => {
      setServerInfo(info);
    });
  }, []);

  const toggleViz = async () => {
    const allWindows = await getAllWebviewWindows();
    const vizWindow = allWindows.find(w => w.label === 'viz');
    
    if (vizWindow) {
      const visible = await vizWindow.isVisible();
      if (visible) {
        await vizWindow.hide();
      } else {
        await vizWindow.show();
        await vizWindow.setFocus();
      }
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
      const newMsg: MessageConfig = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        text: newMessage.trim(),
        textStyle: defaultTextStyle,
      };
      sendCommand('set-messages', [...messages, newMsg]);
      setNewMessage('');
    }
  };

  const handleDeleteMessage = (id: string) => {
    sendCommand('set-messages', messages.filter(m => m.id !== id));
    if (expandedMessage === id) setExpandedMessage(null);
  };

  const handleUpdateMessageStyle = (id: string, textStyle: string) => {
    sendCommand('set-messages', messages.map(m => 
      m.id === id ? { ...m, textStyle } : m
    ));
  };

  const handleTriggerMessage = (msg: MessageConfig) => {
    sendCommand('trigger-message', msg);
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
    a.download = `visualizer-config-${new Date().toISOString().slice(0,10)}.json`;
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

  // Loading state while SSE connects
  if (!state) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-orange-500" />
          <span className="text-zinc-500 text-sm">Connecting to server...</span>
        </div>
      </div>
    );
  }

  const activePlugin = getVisualization(activeVisualization);

  return (
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
              VISUALIZER
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
          <div className="col-span-12 lg:col-span-8 space-y-6">
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
                {visualizationRegistry.filter(v => enabledVisualizations.includes(v.id)).map((viz) => (
                  <VisualizationCard 
                    key={viz.id}
                    active={activeVisualization === viz.id}
                    onClick={() => sendCommand('set-active-visualization', viz.id)}
                    icon={iconMap[viz.icon] || <Settings2 size={32} />}
                    title={viz.name}
                    description={viz.description}
                    disabled={isPending}
                  />
                ))}
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
                    {/* Common Settings */}
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

                    {/* Active Visualization Settings */}
                    {activePlugin && activePlugin.settingsSchema.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">
                          {activePlugin.name} Settings
                        </h3>
                        <SettingsRenderer
                          schema={activePlugin.settingsSchema}
                          values={visualizationSettings[activeVisualization] || {}}
                          onChange={(key, value) => {
                            const newSettings = {
                              ...visualizationSettings,
                              [activeVisualization]: {
                                ...(visualizationSettings[activeVisualization] || {}),
                                [key]: value,
                              }
                            };
                            sendCommand('set-visualization-settings', newSettings);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* Remote Info Section */}
            <section className="relative group">
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

          {/* Sidebar - Messages */}
          <aside className="col-span-12 lg:col-span-4">
            <div className="flex items-center gap-3 mb-6">
              <MessageSquare size={18} className="text-zinc-500" />
              <h2 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Messages</h2>
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

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="bg-zinc-950 border border-zinc-800/50 rounded-xl overflow-hidden"
                    >
                      <div className="flex items-center gap-2 p-3">
                        <button
                          onClick={() => handleTriggerMessage(msg)}
                          disabled={isPending}
                          className="flex-1 text-left text-sm font-medium text-zinc-300 hover:text-white transition-colors disabled:opacity-50 truncate"
                        >
                          {msg.text}
                        </button>
                        <button
                          onClick={() => setExpandedMessage(expandedMessage === msg.id ? null : msg.id)}
                          className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                          {expandedMessage === msg.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
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
                            <div className="pt-3">
                              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 block">
                                Text Style
                              </label>
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
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
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
