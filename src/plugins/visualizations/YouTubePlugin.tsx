/**
 * YouTube Visualization Plugin
 * 
 * Plays looping YouTube videos as a visualization background.
 * Supports YouTube Premium accounts for ad-free playback.
 * 
 * The plugin uses YouTube's iframe player API with autoplay and loop enabled.
 * If the user is logged into YouTube Premium in their browser, the video will
 * play without ads.
 */

import React, { useEffect, useRef, useState } from 'react';
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
// YouTube API Types
// ============================================================================

declare global {
  interface Window {
    YT: {
      Player: new (elementOrId: HTMLElement | string, config: YTPlayerConfig) => YTPlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
      loaded?: number;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerConfig {
  videoId: string;
  height?: string | number;
  width?: string | number;
  playerVars?: {
    autoplay?: 0 | 1;
    controls?: 0 | 1;
    loop?: 0 | 1;
    playlist?: string;
    modestbranding?: 0 | 1;
    rel?: 0 | 1;
    fs?: 0 | 1;
    playsinline?: 0 | 1;
    enablejsapi?: 0 | 1;
    mute?: 0 | 1;
  };
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: { data: number; target: YTPlayer }) => void;
    onError?: (event: { data: number }) => void;
  };
}

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  loadVideoById: (videoId: string) => void;
  mute: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  getPlayerState: () => number;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract video ID from various YouTube URL formats:
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 */
function extractVideoId(url: string): string | null {
  if (!url) return null;
  
  // Handle shortened youtu.be links
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch) return shortMatch[1];
  
  // Handle standard watch URLs
  const watchMatch = url.match(/[?&]v=([^?&]+)/);
  if (watchMatch) return watchMatch[1];
  
  // Handle embed URLs
  const embedMatch = url.match(/\/embed\/([^?&]+)/);
  if (embedMatch) return embedMatch[1];
  
  // If it's just a video ID (11 characters, alphanumeric with _ and -)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) {
    return url.trim();
  }
  
  return null;
}

// Global map to track video positions across component mounts/unmounts
const youtubePositions = new Map<string, number>();

/**
 * Load YouTube iframe API script
 */
function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    // Check if API is already loaded
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    
    // Check if script is already being loaded
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      // Wait for the API to load
      const checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      return;
    }
    
    // Load the API script
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    
    // Set up callback
    window.onYouTubeIframeAPIReady = () => {
      resolve();
    };
  });
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
  
  const playerRef = useRef<YTPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [playerId] = useState(() => `youtube-player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const positionSaveIntervalRef = useRef<number | null>(null);
  
  const videoId = extractVideoId(videoUrl);

  // Load YouTube API and initialize player
  useEffect(() => {
    if (!videoId) {
      setError('Invalid YouTube URL. Please provide a valid YouTube video URL.');
      return;
    }
    
    setError(null);
    
    let player: YTPlayer | null = null;
    
    const initPlayer = async () => {
      try {
        await loadYouTubeAPI();
        
        if (!containerRef.current) {
          console.log('YouTube: Container ref not available');
          return;
        }
        
        console.log('YouTube: Initializing player for video:', videoId);
        
        // Create a child div for YouTube to take over (don't let it mutate our container)
        const playerDiv = document.createElement('div');
        playerDiv.id = playerId;
        playerDiv.style.width = '100%';
        playerDiv.style.height = '100%';
        playerDiv.style.position = 'absolute';
        playerDiv.style.top = '0';
        playerDiv.style.left = '0';
        containerRef.current.appendChild(playerDiv);
        
        console.log('YouTube: Player div created and appended');
        
        // Use the player element directly as the target
        player = new window.YT.Player(playerDiv, {
          videoId,
          height: '100%',
          width: '100%',
          playerVars: {
            autoplay: 1,
            controls: showControls ? 1 : 0,
            loop: 1,
            playlist: videoId, // Required for looping a single video
            modestbranding: 1,
            rel: 0, // Don't show related videos
            fs: 1, // Allow fullscreen
            playsinline: 1,
            enablejsapi: 1,
            mute: muted ? 1 : 0,
          },
          events: {
            onReady: (event) => {
              console.log('YouTube: Player ready');
              playerRef.current = event.target;
              setIsReady(true);
              
              // Set initial volume
              if (!muted) {
                event.target.setVolume(volume);
              }
              
              // Restore saved position if available
              const saved = youtubePositions.get(videoId);
              if (saved && saved > 0) {
                event.target.seekTo(saved, true);
              }
              
              // Start playing
              event.target.playVideo();
              console.log('YouTube: Playback started');
            },
            onStateChange: (event) => {
              // If video ends, replay it (backup to loop parameter)
              if (event.data === window.YT.PlayerState.ENDED) {
                event.target.playVideo();
              }
            },
            onError: (event) => {
              console.error('YouTube player error:', event.data);
              switch (event.data) {
                case 2:
                  setError('Invalid video ID');
                  break;
                case 5:
                  setError('HTML5 player error');
                  break;
                case 100:
                  setError('Video not found');
                  break;
                case 101:
                case 150:
                  setError('Video cannot be embedded');
                  break;
                default:
                  setError('Failed to load video');
              }
            },
          },
        });
      } catch (err) {
        console.error('Failed to initialize YouTube player:', err);
        setError('Failed to load YouTube player');
      }
    };
    
    initPlayer();
    
    return () => {
      // Save position before cleanup
      if (playerRef.current && videoId) {
        try {
          const currentTime = playerRef.current.getCurrentTime();
          youtubePositions.set(videoId, currentTime);
        } catch (err) {
          console.error('Error saving position on cleanup:', err);
        }
      }
      
      // Destroy player
      if (player) {
        try {
          player.destroy();
        } catch (err) {
          console.error('Error destroying player:', err);
        }
      }
      
      // Clean up container to ensure React can render into it again
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      
      playerRef.current = null;
      setIsReady(false);
    };
  }, [videoId, showControls, playerId]);
  
  // Update mute state
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    
    if (muted) {
      playerRef.current.mute();
    } else {
      playerRef.current.unMute();
    }
  }, [muted, isReady]);
  
  // Update volume
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    
    if (!muted) {
      playerRef.current.setVolume(volume);
    }
  }, [volume, isReady, muted]);
  
  // Reload video when URL changes
  useEffect(() => {
    if (!isReady || !playerRef.current || !videoId) return;
    
    playerRef.current.loadVideoById(videoId);
  }, [videoId, isReady]);

  // Save video position periodically and on unmount
  useEffect(() => {
    if (!isReady || !playerRef.current || !videoId) return;
    
    // Save position every 2 seconds
    positionSaveIntervalRef.current = window.setInterval(() => {
      if (playerRef.current && videoId) {
        try {
          const currentTime = playerRef.current.getCurrentTime();
          youtubePositions.set(videoId, currentTime);
        } catch (err) {
          console.error('Error getting current time:', err);
        }
      }
    }, 2000);
    
    return () => {
      // Save position when unmounting (switching away)
      if (playerRef.current && videoId) {
        try {
          const currentTime = playerRef.current.getCurrentTime();
          youtubePositions.set(videoId, currentTime);
        } catch (err) {
          console.error('Error saving position on unmount:', err);
        }
      }
      if (positionSaveIntervalRef.current) {
        clearInterval(positionSaveIntervalRef.current);
      }
    };
  }, [isReady, videoId]);

  return (
    <div 
      className="relative w-full h-full bg-black overflow-hidden"
      style={{ opacity: dim }}
    >
      <style>{`
        /* Ensure YouTube iframe covers the entire container */
        #${playerId} iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: none;
        }
      `}</style>
      
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-8 max-w-md">
            <div className="text-red-500 text-xl mb-4">⚠️</div>
            <div className="text-zinc-300 font-medium mb-2">YouTube Player Error</div>
            <div className="text-zinc-500 text-sm">{error}</div>
            <div className="text-zinc-600 text-xs mt-4">
              Please check the video URL in settings.
            </div>
          </div>
        </div>
      ) : (
        <div 
          ref={containerRef}
          className="absolute inset-0 w-full h-full"
        />
      )}
      
      {!error && !isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-zinc-500">Loading video...</div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const YouTubePlugin: VisualizationPlugin = {
  id: 'youtube',
  name: 'YouTube',
  description: 'Loop YouTube videos with Premium support',
  icon: 'Video',
  settingsSchema,
  component: YouTubeVisualization,
};

