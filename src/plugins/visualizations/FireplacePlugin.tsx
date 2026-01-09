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
  const containerRef = useRef<HTMLDivElement>(null);

  // Latest inputs in refs to avoid coupling animation to React render cadence
  const audioRef = useRef<number[]>(audioData);
  const settingsRef = useRef({
    intensity,
    dim,
    flameHeight,
    flameCount,
  });
  const lastAppliedRef = useRef({
    glowScale: 0,
    glowOpacity: 0,
    floorOpacity: 0,
    flameHeights: new Array<number>(20).fill(0),
    flameOpacities: new Array<number>(20).fill(0),
  });
  const rafRef = useRef<number | null>(null);
  const lastHeavyUpdateRef = useRef<number>(0);

  useEffect(() => {
    audioRef.current = audioData;
  }, [audioData]);

  useEffect(() => {
    settingsRef.current = { intensity, dim, flameHeight, flameCount };
  }, [intensity, dim, flameHeight, flameCount]);

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

  // RAF loop: decouple animation from React render frequency, reduce compositor churn, and add heartbeat.
  useEffect(() => {
    let last = performance.now();
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      
      try {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;

        // Heartbeat for watchdog (best-effort)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__vibecast_fireplace_lastTick = Date.now();
        } catch {
          // ignore
        }

        const s = settingsRef.current;
        const data = audioRef.current;
        const base = data && data.length > 0 ? data : [];
        const n = Math.min(15, base.length);
        let sum = 0;
        for (let i = 0; i < n; i++) sum += base[i] || 0;
        const rawIntensity = n > 0 ? sum / n : 0;

        // Smooth intensity to avoid spikes that trigger expensive repaints
        const target = rawIntensity * s.intensity;
        // simple EMA
        const prevScale = lastAppliedRef.current.glowScale || 1;
        const prevIntensity = Math.max(0, (prevScale - 1) / (1.5 * Math.max(0.5, s.flameHeight)));
        const alpha = 1 - Math.exp(-dt * 10); // ~100ms time constant
        const smoothedIntensity = prevIntensity + (target - prevIntensity) * alpha;

        const flickerScale = 1 + smoothedIntensity * 1.5 * s.flameHeight;
        const glowOpacity = (0.3 + smoothedIntensity * 0.4) * s.dim;
        const floorOpacity = (0.2 + smoothedIntensity * 0.5) * s.dim;

        // Only update cheap properties frequently; heavy properties at ~30fps.
        const heavyNow = now - lastHeavyUpdateRef.current >= 33;
        if (heavyNow) lastHeavyUpdateRef.current = now;

        const eps = 0.003;
        const apply = lastAppliedRef.current;

        // Safe DOM updates with error handling
        try {
          if (glowRef.current) {
            if (Math.abs(apply.glowScale - flickerScale) > eps) {
              glowRef.current.style.transform = `scale(${flickerScale.toFixed(4)})`;
              apply.glowScale = flickerScale;
            }
            if (Math.abs(apply.glowOpacity - glowOpacity) > eps) {
              glowRef.current.style.opacity = String(Math.max(0, Math.min(1, glowOpacity)));
              apply.glowOpacity = glowOpacity;
            }
          }
        } catch (err) {
          console.warn('[Fireplace] Error updating glow:', err);
        }

        try {
          if (floorShadowRef.current && heavyNow) {
            if (Math.abs(apply.floorOpacity - floorOpacity) > eps) {
              floorShadowRef.current.style.opacity = String(Math.max(0, Math.min(1, floorOpacity)));
              apply.floorOpacity = floorOpacity;
            }
          }
        } catch (err) {
          console.warn('[Fireplace] Error updating floor shadow:', err);
        }

        // Flames: update at ~30fps, thresholded
        if (heavyNow) {
          try {
            const maxFlames = Math.min(20, Math.max(0, Math.floor(s.flameCount)));
            for (let i = 0; i < maxFlames; i++) {
              const flameEl = flameRefs.current[i];
              if (!flameEl) continue;
              const rv = flameRandomValues[i];
              const height = (60 + smoothedIntensity * 40 + rv.heightOffset) * s.flameHeight;
              const opacity = 0.6 + rv.opacityOffset;

              if (Math.abs(apply.flameHeights[i] - height) > 0.15) {
                // Combine stable X offset with dynamic Y scale
                // height is in %, so we divide by 100 for scale factor
                flameEl.style.transform = `translateX(${rv.xOffset}px) scaleY(${Math.max(0, height / 100)})`;
                apply.flameHeights[i] = height;
              }
              if (Math.abs(apply.flameOpacities[i] - opacity) > eps) {
                flameEl.style.opacity = String(opacity);
                apply.flameOpacities[i] = opacity;
              }
            }
          } catch (err) {
            console.warn('[Fireplace] Error updating flames:', err);
          }
        }
      } catch (err) {
        // Catch any unexpected errors in the animation loop to prevent crashes
        console.error('[Fireplace] Error in animation tick:', err);
        // Continue the loop - don't let one error stop the animation
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [flameRandomValues]);

  return (
    <div 
      ref={containerRef}
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
        className="absolute bottom-0 w-full h-1/3 blur-3xl" 
        style={{ background: `linear-gradient(to top, ${glowColor}4d, transparent)` }}
      />
      
      <div className="relative w-160 h-160">
        {/* Core fire glow - using ref for direct updates */}
        <div 
          ref={glowRef}
          className="absolute inset-0 rounded-full blur-[120px] mix-blend-screen" 
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
                  transformOrigin: 'bottom',
                  transform: `translateX(${flameRandomValues[i].xOffset}px) scaleY(0.6)`, // Initial state
                  willChange: 'transform, opacity',
                  height: '100%', // Fixed height, scaled via transform
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

// Shared registry to track and reuse keyframes across ember instances
// This prevents DOM bloat from accumulating thousands of style elements
const keyframeRegistry = new Map<string, { count: number; styleId: string }>();
const MAX_KEYFRAMES = 50; // Limit total keyframes in DOM

/**
 * Ember component using pure CSS animations for better performance
 * No framer-motion overhead - just CSS keyframes
 * 
 * Memory leak fix: Cleanup CSS keyframes on unmount and reuse existing keyframes
 * when possible to prevent DOM bloat during long-running sessions.
 */
const Ember: React.FC<EmberProps> = ({ config }) => {
  // Generate a stable keyframe name based on config to enable reuse
  const configHash = `${config.initialX.toFixed(1)}-${config.animateX.toFixed(1)}-${config.duration.toFixed(1)}`;
  const keyframeName = useMemo(() => {
    // Check if we can reuse an existing keyframe with the same config
    for (const [name, data] of keyframeRegistry.entries()) {
      if (name.includes(configHash)) {
        data.count++;
        return name;
      }
    }
    
    // Create new keyframe name
    const newName = `ember-float-${configHash}-${Math.random().toString(36).substr(2, 9)}`;
    keyframeRegistry.set(newName, { count: 1, styleId: `style-${newName}` });
    return newName;
  }, [configHash]);
  
  const styleId = `style-${keyframeName}`;
  
  // Create the keyframe animation dynamically
  const animationStyle = useMemo(() => {
    // Inject keyframe if not already present
    if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
      // Cleanup old keyframes if we're approaching the limit
      if (keyframeRegistry.size >= MAX_KEYFRAMES) {
        // Remove the oldest keyframe (first in map)
        const firstEntry = keyframeRegistry.entries().next().value;
        if (firstEntry) {
          const [oldName, oldData] = firstEntry;
          const oldStyleEl = document.getElementById(oldData.styleId);
          if (oldStyleEl) {
            oldStyleEl.remove();
          }
          keyframeRegistry.delete(oldName);
        }
      }
      
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
  }, [keyframeName, config, styleId]);

  // Cleanup: remove keyframe when component unmounts (if no other embers are using it)
  useEffect(() => {
    return () => {
      const registryEntry = keyframeRegistry.get(keyframeName);
      if (registryEntry) {
        registryEntry.count--;
        // Only remove if no other embers are using this keyframe
        if (registryEntry.count <= 0) {
          const styleEl = document.getElementById(styleId);
          if (styleEl) {
            styleEl.remove();
          }
          keyframeRegistry.delete(keyframeName);
        }
      }
    };
  }, [keyframeName, styleId]);

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
