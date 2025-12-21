import React, { useState } from 'react';
import { useFetcher } from 'react-router-dom';
import { Flame, Music, Signal, ChevronRight, Loader2, WifiOff, Sliders, Settings2 } from 'lucide-react';
import { useAppState } from '../hooks/useAppState';
import { getVisualization } from '../plugins/visualizations';
import { CommonSettings } from './settings/SettingsRenderer';
import { MessageConfig } from '../plugins/types';
import { useStore } from '../store';

// Remote runs in browser on the same origin as the Axum server, so no API base needed
const API_BASE = '';

// Icon map for visualizations
const iconMap: Record<string, React.ReactNode> = {
  'Flame': <Flame size={28} />,
  'Music': <Music size={28} />,
};

export const RemoteControl: React.FC = () => {
  // SSE-based state - single source of truth
  const { state, isConnected, error } = useAppState({ apiBase: API_BASE });
  
  // Store for presets
  const visualizationPresets = useStore((s) => s.visualizationPresets);
  const activeVisualizationPreset = useStore((s) => s.activeVisualizationPreset);
  const setActiveVisualizationPreset = useStore((s) => s.setActiveVisualizationPreset);
  
  // Fetcher for form submissions
  const fetcher = useFetcher();
  
  // Local UI state
  const [showSettings, setShowSettings] = useState(false);
  
  // Derive values with defaults
  const commonSettings = state?.commonSettings ?? { intensity: 1.0, dim: 1.0 };
  const messages = state?.messages ?? [];
  const isPending = fetcher.state !== 'idle';

  // Helper to send commands via fetcher
  const sendCommand = (command: string, payload: unknown) => {
    fetcher.submit(
      { command, payload: JSON.stringify(payload) },
      { method: 'post', action: '/' }
    );
  };

  const handleTriggerMessage = (msg: MessageConfig) => {
    sendCommand('trigger-message', msg);
  };

  // Show loading state while waiting for first SSE event
  if (!state && !error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-orange-500" />
          <span className="text-zinc-500 text-sm">Connecting...</span>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !state) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-center">
          <WifiOff size={48} className="text-red-500 mx-auto mb-4" />
          <p className="text-red-500 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-zinc-800 rounded-lg text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const handleSetActivePreset = (id: string | null) => {
    setActiveVisualizationPreset(id);
    sendCommand('set-active-visualization-preset', id);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans flex flex-col gap-8 selection:bg-orange-500/30 overflow-hidden">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-orange-600/20 blur-[100px] rounded-full" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      <header className="relative pt-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
                {isConnected ? 'Live' : 'Reconnecting...'}
              </span>
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tighter italic bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
              Remote
            </h1>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-3 rounded-xl transition-colors ${
              showSettings ? 'bg-orange-500 text-white' : 'bg-zinc-900 text-zinc-400'
            }`}
          >
            <Sliders size={20} />
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <section className="relative bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
          <h3 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">
            Settings
          </h3>
          <CommonSettings
            intensity={commonSettings.intensity}
            dim={commonSettings.dim}
            onIntensityChange={(v) => sendCommand('set-common-settings', { ...commonSettings, intensity: v })}
            onDimChange={(v) => sendCommand('set-common-settings', { ...commonSettings, dim: v })}
          />
        </section>
      )}

      <section className="relative">
        <h2 className="text-zinc-500 text-[10px] font-bold uppercase mb-6 tracking-[0.2em] flex items-center gap-2">
          <Signal size={12} />
          Visualization
        </h2>
        <div className={`grid gap-4 ${visualizationPresets.length > 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
          {visualizationPresets.length === 0 ? (
            <div className="col-span-2 text-center py-8 text-zinc-500 text-xs">
              No presets available
            </div>
          ) : (
            visualizationPresets.map((preset) => {
              const viz = getVisualization(preset.visualizationId);
              const isActive = preset.id === activeVisualizationPreset;
              return (
                <RemoteVizCard 
                  key={preset.id}
                  active={isActive}
                  onClick={() => handleSetActivePreset(isActive ? null : preset.id)}
                  icon={viz ? (iconMap[viz.icon] || <Settings2 size={28} />) : <Settings2 size={28} />}
                  label={preset.name}
                  disabled={isPending}
                />
              );
            })
          )}
        </div>
      </section>

      <section className="relative flex-1 flex flex-col min-h-0">
        <h2 className="text-zinc-500 text-[10px] font-bold uppercase mb-6 tracking-[0.2em]">Broadcast</h2>
        <div className="flex-1 space-y-3 overflow-y-auto pb-8 custom-scrollbar">
          {messages.map((msg) => (
            <button
              key={msg.id}
              onClick={() => handleTriggerMessage(msg)}
              disabled={isPending}
              className="w-full p-5 bg-zinc-950 border border-zinc-800/50 rounded-2xl text-left active:scale-[0.98] transition-all flex justify-between items-center group relative overflow-hidden disabled:opacity-50"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 to-transparent opacity-0 group-active:opacity-100 transition-opacity" />
              <div className="relative z-10 flex-1 min-w-0">
                <span className="font-bold text-base text-zinc-200 group-active:text-white transition-colors block truncate">
                  {msg.text}
                </span>
                <span className="text-[10px] text-zinc-600 uppercase tracking-wide">
                  {msg.textStyle.replace('-', ' ')}
                </span>
              </div>
              <ChevronRight size={18} className="text-zinc-700 group-active:text-orange-500 transition-colors shrink-0 ml-2" />
            </button>
          ))}
        </div>
      </section>

      <footer className="relative text-center pb-4">
        <p className="text-zinc-800 text-[9px] font-black uppercase tracking-[0.5em]">Viz Controller v3.0</p>
      </footer>
    </div>
  );
};

interface RemoteVizCardProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}

const RemoteVizCard: React.FC<RemoteVizCardProps> = ({ 
  active, onClick, icon, label, disabled 
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative p-6 rounded-3xl flex flex-col items-center gap-3 transition-all duration-300 border disabled:opacity-50 ${
        active 
          ? 'bg-orange-500 text-white shadow-2xl shadow-orange-900/40 border-orange-400/50 scale-105' 
          : 'bg-zinc-900/50 border-zinc-800 text-zinc-500 active:bg-zinc-800'
      }`}
    >
      <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'scale-100'}`}>
        {icon}
      </div>
      <span className="font-black uppercase tracking-widest text-[10px]">{label}</span>
    </button>
  );
};
