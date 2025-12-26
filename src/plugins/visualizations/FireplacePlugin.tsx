/**
 * Fireplace Visualization Plugin
 * 
 * A procedural ambient fire effect with embers, flames, and logs.
 * Audio reactivity makes flames dance with the music.
 * 
 * Performance notes:
 * - Uses CSS transforms instead of framer-motion for per-frame updates
 * - Stable keys to avoid remounting when counts change
 * - Embers use pure CSS animations to reduce JS overhead
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';
import { getNumberSetting, getStringSetting, getBooleanSetting } from '../utils/settings';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'emberCount',
    label: 'Ember Count',
    min: 0,
    max: 30,
    step: 1,
    default: 15,
  },
  {
    type: 'range',
    id: 'flameCount',
    label: 'Flame Count',
    min: 0,
    max: 20,
    step: 1,
    default: 12,
  },
  {
    type: 'range',
    id: 'flameHeight',
    label: 'Flame Height',
    min: 0.5,
    max: 2.0,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'color',
    id: 'glowColor',
    label: 'Glow Color',
    default: '#ea580c', // orange-600
  },
  {
    type: 'boolean',
    id: 'showLogs',
    label: 'Show Logs',
    default: true,
  },
];

// ============================================================================
// Component
// ============================================================================

const FireplaceVisualization: React.FC<VisualizationProps> = ({
  audioData,
  commonSettings,
  customSettings,
}) => {
  const { intensity, dim } = commonSettings;
  // Use utility functions to properly handle 0, false, and empty string as valid values
  const emberCount = Math.round(getNumberSetting(customSettings.emberCount, 15, 0, 30));
  const flameCount = Math.round(getNumberSetting(customSettings.flameCount, 12, 0, 20));
  const flameHeight = getNumberSetting(customSettings.flameHeight, 1.0, 0.5, 2.0);
  const glowColor = getStringSetting(customSettings.glowColor, '#ea580c');
  const showLogs = getBooleanSetting(customSettings.showLogs, true);

  // Refs for direct DOM manipulation (more efficient than React state for audio-reactive updates)
  const glowRef = useRef<HTMLDivElement>(null);
  const floorShadowRef = useRef<HTMLDivElement>(null);
  const flameRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Generate stable random values for flames (only regenerate when max count increases)
  const flameRandomValues = useMemo(() => {
    // Generate values for max possible flames (20) to avoid remounting
    return Array.from({ length: 20 }, () => ({
      heightOffset: Math.random() * 10,
      xOffset: (Math.random() - 0.5) * 15,
      opacityOffset: Math.random() * 0.4,
    }));
  }, []);

  // Generate stable ember configurations
  const emberConfigs = useMemo(() => {
    // Generate values for max possible embers (30)
    return Array.from({ length: 30 }, () => ({
      initialX: (Math.random() - 0.5) * 200,
      animateX: (Math.random() - 0.5) * 300,
      duration: 2 + Math.random() * 2,
      delay: Math.random() * 5,
    }));
  }, []);

  // Use RAF for smooth audio-reactive updates without triggering React re-renders
  useEffect(() => {
    const rawIntensity = audioData.slice(0, 15).reduce((a, b) => a + b, 0) / 15;
    const smoothedIntensity = rawIntensity * intensity;
    const flickerScale = 1 + smoothedIntensity * 1.5 * flameHeight;
    
    // Update glow via direct DOM manipulation
    if (glowRef.current) {
      glowRef.current.style.transform = `scale(${flickerScale})`;
      glowRef.current.style.opacity = String((0.3 + smoothedIntensity * 0.4) * dim);
    }
    
    // Update floor shadow
    if (floorShadowRef.current) {
      floorShadowRef.current.style.opacity = String((0.2 + smoothedIntensity * 0.5) * dim);
    }
    
    // Update flames via direct DOM manipulation
    flameRefs.current.forEach((flameEl, i) => {
      if (flameEl && i < flameCount) {
        const rv = flameRandomValues[i];
        const height = (60 + smoothedIntensity * 40 + rv.heightOffset) * flameHeight;
        flameEl.style.height = `${height}%`;
        flameEl.style.opacity = String(0.6 + rv.opacityOffset);
      }
    });
  }, [audioData, intensity, dim, flameHeight, flameCount, flameRandomValues]);

  return (
    <div 
      className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center"
      style={{ opacity: dim }}
    >
      {/* Background depth */}
      <div 
        className="absolute inset-0"
        style={{ background: `linear-gradient(to top, ${glowColor}26, black, black)` }}
      />
      
      {/* Dynamic Floor Shadow - using ref for direct updates */}
      <div 
        ref={floorShadowRef}
        className="absolute bottom-0 w-full h-1/3 blur-3xl transition-opacity duration-150" 
        style={{ background: `linear-gradient(to top, ${glowColor}4d, transparent)` }}
      />
      
      <div className="relative w-160 h-160">
        {/* Core fire glow - using ref for direct updates */}
        <div 
          ref={glowRef}
          className="absolute inset-0 rounded-full blur-[120px] mix-blend-screen transition-transform duration-150" 
          style={{ backgroundColor: glowColor, willChange: 'transform, opacity' }}
        />
        
        {/* Flames container - only render visible flames */}
        {flameCount > 0 && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-96 h-128 flex items-end justify-center gap-1 overflow-hidden">
            {Array.from({ length: flameCount }, (_, i) => (
              <div
                key={`flame-${i}`}
                ref={(el) => { flameRefs.current[i] = el; }}
                className="w-8 bg-gradient-to-t from-red-600 via-orange-500 to-yellow-200 rounded-t-full blur-sm mix-blend-screen"
                style={{ 
                  transform: `translateX(${flameRandomValues[i].xOffset}px)`,
                  willChange: 'height, opacity',
                  transition: 'height 0.1s ease-out',
                }}
              />
            ))}
          </div>
        )}

        {/* Embers - using pure CSS animations for better performance */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-80 h-80 pointer-events-none">
          {Array.from({ length: emberCount }, (_, i) => (
            <Ember key={`ember-${i}`} config={emberConfigs[i]} />
          ))}
        </div>

        {/* Logs */}
        {showLogs && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-120 h-24 flex items-center justify-center gap-0">
            <div className="w-64 h-12 bg-zinc-900 rounded-lg -rotate-6 translate-y-3 shadow-2xl border-t border-zinc-800" />
            <div className="w-64 h-14 bg-zinc-950 rounded-lg rotate-3 shadow-2xl border-t border-zinc-800" />
          </div>
        )}
      </div>
    </div>
  );
};

interface EmberConfig {
  initialX: number;
  animateX: number;
  duration: number;
  delay: number;
}

interface EmberProps {
  config: EmberConfig;
}

/**
 * Ember component using pure CSS animations for better performance
 * No framer-motion overhead - just CSS keyframes
 */
const Ember: React.FC<EmberProps> = ({ config }) => {
  // Generate unique animation keyframes for this ember
  const keyframeName = useMemo(() => `ember-float-${Math.random().toString(36).substr(2, 9)}`, []);
  
  // Create the keyframe animation dynamically
  const animationStyle = useMemo(() => {
    // Inject keyframe if not already present
    const styleId = `style-${keyframeName}`;
    if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes ${keyframeName} {
          0% {
            bottom: 0px;
            opacity: 0;
            transform: translateX(${config.initialX}px);
          }
          10% {
            opacity: 1;
          }
          80% {
            opacity: 0.8;
          }
          100% {
            bottom: 400px;
            opacity: 0;
            transform: translateX(${config.animateX}px);
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    return {
      animation: `${keyframeName} ${config.duration}s linear ${config.delay}s infinite`,
    };
  }, [keyframeName, config]);

  return (
    <div
      className="absolute w-1 h-1 bg-orange-200 rounded-full blur-[1px]"
      style={animationStyle}
    />
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const FireplacePlugin: VisualizationPlugin = {
  id: 'fireplace',
  name: 'Fireplace',
  description: 'Procedural ambient warmth with dancing flames',
  icon: 'Flame',
  settingsSchema,
  component: FireplaceVisualization,
};
