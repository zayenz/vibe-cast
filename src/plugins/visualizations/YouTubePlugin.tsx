/**
 * YouTube Visualization Plugin
 * 
 * Plays looping YouTube videos as a visualization background.
 * Uses an isolated iframe served from the local backend to avoid Origin/CORB issues
 * in Tauri production builds (Error 153).
 */

import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';
import { getStringSetting, getBooleanSetting, getNumberSetting } from '../utils/settings';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'text',
    id: 'videoUrl',
    label: 'YouTube Video URL',
    default: 'https://youtu.be/uNNk-V08J7k?si=0chlR1UB6XYRxPc3',
    placeholder: 'https://youtu.be/VIDEO_ID or https://www.youtube.com/watch?v=VIDEO_ID',
  },
  {
    type: 'boolean',
    id: 'showControls',
    label: 'Show Controls',
    default: false,
  },
  {
    type: 'boolean',
    id: 'muted',
    label: 'Muted',
    default: true,
  },
  {
    type: 'range',
    id: 'volume',
    label: 'Volume',
    min: 0,
    max: 100,
    step: 5,
    default: 50,
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

function extractVideoId(url: string): string | null {
  if (!url) return null;
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch) return shortMatch[1];
  const watchMatch = url.match(/[?&]v=([^?&]+)/);
  if (watchMatch) return watchMatch[1];
  const embedMatch = url.match(/\/embed\/([^?&]+)/);
  if (embedMatch) return embedMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) {
    return url.trim();
  }
  return null;
}

// ============================================================================
// Component
// ============================================================================

const YouTubeVisualization: React.FC<VisualizationProps> = ({
  commonSettings,
  customSettings,
}) => {
  const { dim } = commonSettings;
  const videoUrl = getStringSetting(customSettings.videoUrl, 'https://youtu.be/uNNk-V08J7k?si=0chlR1UB6XYRxPc3');
  const showControls = getBooleanSetting(customSettings.showControls, false);
  const muted = getBooleanSetting(customSettings.muted, false);
  const volume = getNumberSetting(customSettings.volume, 50, 0, 100);
  
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoId = extractVideoId(videoUrl);

  // Determine Server URL
  useEffect(() => {
    // If Web Remote (http/s) or Dev (http), use current origin or localhost:8080
    if (window.location.protocol.startsWith('http')) {
      if (import.meta.env.DEV) {
        setServerUrl('http://127.0.0.1:8080');
      } else {
        setServerUrl(window.location.origin);
      }
    } else {
      // Desktop Prod (tauri:// or asset://) -> Find server port
      invoke<{ port: number }>('get_server_info')
        .then(info => {
          setServerUrl(`http://127.0.0.1:${info.port}`);
        })
        .catch(err => {
          console.error('[YouTube] Failed to get server info:', err);
          setError('Failed to connect to internal server');
        });
    }
  }, []);

  // Send updates to iframe
  useEffect(() => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    
    // We send these as individual messages because the iframe handles them imperatively
    const win = iframeRef.current.contentWindow;
    
    win.postMessage({ type: 'setVolume', value: volume }, '*');
    win.postMessage({ type: 'setMuted', value: muted }, '*');
    
    // Note: videoId and controls changes trigger a full reload via key/src prop
  }, [volume, muted]);

  if (!videoId) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="text-zinc-500">Invalid YouTube URL</div>
      </div>
    );
  }

  if (!serverUrl) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="text-zinc-500">Connecting to player...</div>
      </div>
    );
  }

  const src = `${serverUrl}/youtube_player.html?videoId=${videoId}&controls=${showControls ? 1 : 0}&muted=${muted ? 1 : 0}&volume=${volume}`;

  return (
    <div 
      className="relative w-full h-full bg-black overflow-hidden"
      style={{ opacity: dim }}
    >
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-red-500">{error}</div>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          key={videoId} // Re-mount on video change to ensure clean state
          src={src}
          className="absolute inset-0 w-full h-full border-0"
          allow="autoplay; encrypted-media"
          title="YouTube Video"
        />
      )}
    </div>
  );
};

export const YouTubePlugin: VisualizationPlugin = {
  id: 'youtube',
  name: 'YouTube',
  description: 'Loop YouTube videos with Premium support',
  icon: 'Video',
  settingsSchema,
  component: YouTubeVisualization,
};

