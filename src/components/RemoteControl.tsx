import React, { useState, useEffect } from 'react';
import { Flame, Music, Signal, ChevronRight, Loader2 } from 'lucide-react';

interface AppState {
  mode: string;
  messages: string[];
}

export const RemoteControl: React.FC = () => {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch state from server and poll for updates
  useEffect(() => {
    let isInitialLoad = true;
    let abortController: AbortController | null = null;

    const fetchState = async () => {
      // Cancel any in-flight request to prevent stale data from overwriting fresh data
      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();

      try {
        const res = await fetch('/api/state', { signal: abortController.signal });
        if (!res.ok) throw new Error('Failed to fetch state');
        const state: AppState = await res.json();
        setAppState(state);
        if (isInitialLoad) {
          setLoading(false);
          isInitialLoad = false;
        }
        setError(null);
      } catch (err) {
        // Ignore abort errors - they're expected when we cancel stale requests
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        console.error('Failed to fetch state:', err);
        if (isInitialLoad) {
          // Only show error on initial load
          setError('Could not connect to visualizer');
          setLoading(false);
          isInitialLoad = false;
        }
      }
    };

    // Initial fetch
    fetchState();

    // Poll for updates every 3 seconds
    const pollInterval = setInterval(fetchState, 3000);

    return () => {
      clearInterval(pollInterval);
      if (abortController) {
        abortController.abort();
      }
    };
  }, []);

  // Derive current values from fetched state
  const currentMode = appState?.mode ?? 'fireplace';
  const messages = appState?.messages ?? [];

  const sendCommand = async (command: string, payload: any) => {
    try {
      // Optimistically update local state
      if (command === 'set-mode' && appState) {
        setAppState({ ...appState, mode: payload });
      }
      
      await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload }),
      });
    } catch (e) {
      console.error('Failed to send command', e);
    }
  };

  // Show loading state
  if (loading) {
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
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="text-center">
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

  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans flex flex-col gap-12 selection:bg-orange-500/30 overflow-hidden">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-orange-600/20 blur-[100px] rounded-full" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      <header className="relative pt-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Live Connection</span>
        </div>
        <h1 className="text-5xl font-black uppercase tracking-tighter italic bg-linear-to-b from-white to-zinc-500 bg-clip-text text-transparent">
          Remote
        </h1>
      </header>

      <section className="relative">
        <h2 className="text-zinc-500 text-[10px] font-bold uppercase mb-8 tracking-[0.2em] flex items-center gap-2">
          <Signal size={12} />
          Environment
        </h2>
        <div className="grid grid-cols-2 gap-5">
          <RemoteModeCard 
            active={currentMode === 'fireplace'}
            onClick={() => sendCommand('set-mode', 'fireplace')}
            icon={<Flame size={28} />}
            label="Fire"
            color="orange"
          />
          <RemoteModeCard 
            active={currentMode === 'techno'}
            onClick={() => sendCommand('set-mode', 'techno')}
            icon={<Music size={28} />}
            label="Techno"
            color="white"
          />
        </div>
      </section>

      <section className="relative flex-1 flex flex-col min-h-0">
        <h2 className="text-zinc-500 text-[10px] font-bold uppercase mb-8 tracking-[0.2em]">Signal Broadcast</h2>
        <div className="flex-1 space-y-3 overflow-y-auto pb-12 custom-scrollbar">
          {messages.map((msg, i) => (
            <button
              key={i}
              onClick={() => sendCommand('trigger-message', msg)}
              className="w-full p-6 bg-zinc-950 border border-zinc-800/50 rounded-2xl text-left active:scale-[0.98] transition-all flex justify-between items-center group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-linear-to-r from-orange-500/5 to-transparent opacity-0 group-active:opacity-100 transition-opacity" />
              <span className="relative z-10 font-bold text-lg text-zinc-200 group-active:text-white transition-colors">{msg}</span>
              <ChevronRight size={18} className="text-zinc-700 group-active:text-orange-500 transition-colors" />
            </button>
          ))}
        </div>
      </section>

      <footer className="relative text-center pb-8">
        <p className="text-zinc-800 text-[9px] font-black uppercase tracking-[0.5em]">Viz Controller v2.0</p>
      </footer>
    </div>
  );
};

const RemoteModeCard = ({ active, onClick, icon, label, color }: any) => {
  const activeStyles = color === 'orange' 
    ? 'bg-orange-500 text-white shadow-2xl shadow-orange-900/40 border-orange-400/50' 
    : 'bg-white text-black shadow-2xl shadow-white/10 border-white';

  return (
    <button
      onClick={onClick}
      className={`relative p-8 rounded-[2.5rem] flex flex-col items-center gap-4 transition-all duration-500 border ${
        active 
          ? activeStyles + ' scale-105' 
          : 'bg-zinc-900/50 border-zinc-800 text-zinc-500 active:bg-zinc-800'
      }`}
    >
      <div className={`transition-transform duration-500 ${active ? 'scale-110' : 'scale-100'}`}>
        {icon}
      </div>
      <span className="font-black uppercase tracking-widest text-[10px]">{label}</span>
    </button>
  );
};
