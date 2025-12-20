import React, { useEffect, useState } from 'react';
import { useFetcher } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';
import { QRCodeSVG } from 'qrcode.react';
import { Flame, Music, Send, Monitor, Smartphone, MessageSquare, Settings2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppState } from '../hooks/useAppState';

// API base for Tauri windows - they need to hit the Axum server directly
const API_BASE = 'http://localhost:8080';

export const ControlPlane: React.FC = () => {
  // SSE-based state - single source of truth
  const { state, isConnected } = useAppState({ apiBase: API_BASE });
  
  // Local UI state
  const [newMessage, setNewMessage] = useState('');
  const [serverInfo, setServerInfo] = useState<{ ip: string; port: number } | null>(null);

  // Fetcher for form submissions - no navigation, just mutation
  const fetcher = useFetcher();
  
  // Derive state values (with defaults while loading)
  const mode = state?.mode ?? 'fireplace';
  const messages = state?.messages ?? [];

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
      sendCommand('set-messages', [...messages, newMessage.trim()]);
      setNewMessage('');
    }
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

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-orange-500/30 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-orange-600/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-600/5 blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <header className="flex justify-between items-end mb-16">
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
            <h1 className="text-6xl font-black tracking-tight bg-linear-to-b from-white to-zinc-500 bg-clip-text text-transparent">
              VISUALIZER
            </h1>
          </div>
          
          <button 
            onClick={toggleViz}
            className="group relative px-8 py-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-2xl transition-all active:scale-95 overflow-hidden"
          >
            <div className="absolute inset-0 bg-linear-to-tr from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex items-center gap-3 font-bold text-sm">
              <Monitor size={18} className="text-orange-500" />
              Toggle Stage
            </div>
          </button>
        </header>

        <div className="grid grid-cols-12 gap-8">
          {/* Main Controls */}
          <div className="col-span-12 lg:col-span-8 space-y-8">
            <section>
              <div className="flex items-center gap-3 mb-8">
                <Settings2 size={18} className="text-zinc-500" />
                <h2 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Environment Control</h2>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <EnvironmentCard 
                  active={mode === 'fireplace'}
                  onClick={() => sendCommand('set-mode', 'fireplace')}
                  icon={<Flame size={32} />}
                  title="Fireplace"
                  description="Procedural ambient warmth"
                  color="orange"
                  disabled={isPending}
                />
                <EnvironmentCard 
                  active={mode === 'techno'}
                  onClick={() => sendCommand('set-mode', 'techno')}
                  icon={<Music size={32} />}
                  title="Techno"
                  description="Audio-reactive 3D stage"
                  color="blue"
                  disabled={isPending}
                />
              </div>
            </section>

            {/* Remote Info Section */}
            <section className="relative group">
              <div className="absolute -inset-px bg-linear-to-r from-orange-500/20 via-zinc-800 to-blue-500/20 rounded-[2rem] opacity-50 group-hover:opacity-100 transition-opacity" />
              <div className="relative bg-zinc-950 rounded-[2rem] p-8 flex flex-col md:flex-row items-center gap-10">
                <div className="bg-white p-4 rounded-2xl shadow-2xl shrink-0">
                  {remoteUrl ? (
                    <QRCodeSVG value={remoteUrl} size={160} level="H" />
                  ) : (
                    <div className="w-40 h-40 bg-zinc-100 animate-pulse rounded-lg" />
                  )}
                </div>
                <div className="flex-1 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2 mb-4">
                    <Smartphone size={20} className="text-orange-500" />
                    <h3 className="text-xl font-bold">Mobile Remote</h3>
                  </div>
                  <p className="text-zinc-400 mb-6 leading-relaxed text-sm max-w-md">
                    Control the entire experience from your phone. Scan the QR code to open the 
                    instant remote interface on your local network.
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
            <div className="flex items-center gap-3 mb-8">
              <MessageSquare size={18} className="text-zinc-500" />
              <h2 className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Messages</h2>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-[2rem] p-6 backdrop-blur-md flex flex-col h-[600px]">
              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddMessage();
                    }
                  }}
                  placeholder="New preset..."
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

              <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <motion.button
                      key={msg + i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => sendCommand('trigger-message', msg)}
                      disabled={isPending}
                      className="w-full group relative px-5 py-4 bg-zinc-950 border border-zinc-800/50 rounded-xl hover:border-orange-500/30 transition-all text-left overflow-hidden disabled:opacity-50"
                    >
                      <div className="absolute inset-0 bg-linear-to-r from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="relative z-10 text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">{msg}</span>
                    </motion.button>
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

interface EnvironmentCardProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'orange' | 'blue';
  disabled?: boolean;
}

const EnvironmentCard: React.FC<EnvironmentCardProps> = ({ 
  active, onClick, icon, title, description, color, disabled 
}) => {
  const colorClasses = color === 'orange' 
    ? 'from-orange-600 to-red-600 shadow-orange-900/20' 
    : 'from-blue-600 to-indigo-600 shadow-blue-900/20';
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative p-8 rounded-[2rem] text-left transition-all duration-500 active:scale-[0.98] group overflow-hidden disabled:opacity-70 ${
        active 
          ? `bg-linear-to-br ${colorClasses} text-white shadow-2xl` 
          : 'bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:bg-zinc-800/50 hover:border-zinc-700'
      }`}
    >
      <div className={`relative z-10 mb-6 p-3 w-fit rounded-2xl ${active ? 'bg-white/20' : 'bg-zinc-800 group-hover:scale-110 transition-transform'}`}>
        {icon}
      </div>
      <div className="relative z-10">
        <h3 className={`text-2xl font-black uppercase tracking-tight mb-1 ${active ? 'text-white' : 'text-zinc-200'}`}>
          {title}
        </h3>
        <p className={`text-xs ${active ? 'text-white/70' : 'text-zinc-500'}`}>
          {description}
        </p>
      </div>
      {active && (
        <motion.div 
          layoutId="active-glow"
          className="absolute inset-0 bg-white/10 mix-blend-overlay" 
        />
      )}
    </button>
  );
};
