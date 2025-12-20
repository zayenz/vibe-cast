import React, { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useStore } from '../store';
import { Fireplace } from './Fireplace';
import { TechnoViz } from './TechnoViz';
import { Marquee } from './Marquee';

export const VisualizerWindow: React.FC = () => {
  const mode = useStore((state) => state.mode);
  const setAudioData = useStore((state) => state.setAudioData);
  const setMode = useStore((state) => state.setMode);
  const setMessages = useStore((state) => state.setMessages);
  const triggerMessage = useStore((state) => state.triggerMessage);

  useEffect(() => {
    // Listen for audio data from Rust
    const unlistenAudio = listen<number[]>('audio-data', (event) => {
      setAudioData(event.payload);
    });

    // Listen for remote commands
    const unlistenRemote = listen<{ command: string, payload?: any }>('remote-command', (event) => {
      console.log('Received remote-command:', event.payload);
      const { command, payload } = event.payload;
      if (command === 'set-mode') {
        setMode(payload, false);
      } else if (command === 'trigger-message') {
        triggerMessage(payload, false);
      }
    });

    // Listen for state changes from other windows
    const unlistenState = listen<{ type: string, payload: any }>('state-changed', (event) => {
      console.log('Received state-changed:', event.payload);
      const { type, payload } = event.payload;
      if (type === 'SET_MODE') {
        setMode(payload, false);
      } else if (type === 'TRIGGER_MESSAGE') {
        triggerMessage(payload, false);
      } else if (type === 'SET_MESSAGES') {
        setMessages(payload, false);
      }
    });

    return () => {
      unlistenAudio.then((u) => u());
      unlistenRemote.then((u) => u());
      unlistenState.then((u) => u());
    };
  }, [setAudioData, setMode, setMessages, triggerMessage]);

  return (
    <div className="w-screen h-screen bg-black relative">
      {mode === 'fireplace' ? <Fireplace /> : <TechnoViz />}
      <Marquee />
    </div>
  );
};



