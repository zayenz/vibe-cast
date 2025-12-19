import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface AppState {
  mode: 'fireplace' | 'techno';
  messages: string[];
  activeMessage: string | null;
  messageTimestamp: number;
  audioData: number[];
  serverInfo: { ip: string, port: number } | null;
  
  setMode: (mode: 'fireplace' | 'techno', sync?: boolean) => void;
  setMessages: (messages: string[]) => void;
  triggerMessage: (message: string, sync?: boolean) => void;
  setAudioData: (data: number[]) => void;
  setServerInfo: (info: { ip: string, port: number }) => void;
}

export const useStore = create<AppState>((set) => ({
  mode: 'fireplace',
  messages: ["Hello World!", "Keep it calm...", "TECHNO TIME"],
  activeMessage: null,
  messageTimestamp: 0,
  audioData: new Array(128).fill(0),
  serverInfo: null,

  setMode: (mode, sync = true) => {
    console.log(`Setting mode to ${mode}, sync=${sync}`);
    set({ mode });
    if (sync) {
      invoke('emit_state_change', { eventType: 'SET_MODE', payload: mode })
        .catch(err => console.error('Failed to invoke emit_state_change', err));
    }
  },
  setMessages: (messages) => set({ messages }),
  triggerMessage: (message, sync = true) => {
    console.log(`Triggering message: ${message}, sync=${sync}`);
    set({ activeMessage: message, messageTimestamp: Date.now() });
    if (sync) {
      invoke('emit_state_change', { eventType: 'TRIGGER_MESSAGE', payload: message })
        .catch(err => console.error('Failed to invoke emit_state_change', err));
    }
  },
  setAudioData: (audioData) => set({ audioData }),
  setServerInfo: (serverInfo) => set({ serverInfo }),
}));



