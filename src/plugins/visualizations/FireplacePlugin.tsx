/**
 * Fireplace Visualization Plugin
 * 
 * A procedural ambient fire effect with embers, flames, and logs.
 * Audio reactivity makes flames dance with the music.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'emberCount',
    label: 'Ember Count',
    min: 5,
    max: 30,
    step: 1,
    default: 15,
  },
  {
    type: 'range',
    id: 'flameCount',
    label: 'Flame Count',
    min: 6,
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
  const emberCount = (customSettings.emberCount as number) ?? 15;
  const flameCount = (customSettings.flameCount as number) ?? 12;
  const flameHeight = (customSettings.flameHeight as number) ?? 1.0;
  const glowColor = (customSettings.glowColor as string) ?? '#ea580c';
  const showLogs = (customSettings.showLogs as boolean) ?? true;

  // Apply intensity smoothing to audio data
  // Lower intensity = more smoothing = reactive to larger trends
  const smoothedIntensity = useMemo(() => {
    const rawIntensity = audioData.slice(0, 15).reduce((a, b) => a + b, 0) / 15;
    // When intensity setting is low, we smooth more (react to larger trends)
    // When intensity setting is high, we use raw values (react to quick changes)
    return rawIntensity * intensity;
  }, [audioData, intensity]);

  const flickerScale = 1 + smoothedIntensity * 1.5 * flameHeight;

  // Apply dim as opacity multiplier
  const dimStyle = {
    opacity: dim,
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center" style={dimStyle}>
      {/* Background depth */}
      <div 
        className="absolute inset-0 bg-gradient-to-t via-black to-black"
        style={{ background: `linear-gradient(to top, ${glowColor}26, black, black)` }}
      />
      
      {/* Dynamic Floor Shadow */}
      <motion.div 
        animate={{
          opacity: (0.2 + smoothedIntensity * 0.5) * dim
        }}
        className="absolute bottom-0 w-full h-1/3 blur-3xl" 
        style={{ background: `linear-gradient(to top, ${glowColor}4d, transparent)` }}
      />
      
      <div className="relative w-160 h-160">
        {/* Core fire glow */}
        <motion.div 
          animate={{ 
            scale: flickerScale,
            opacity: (0.3 + smoothedIntensity * 0.4) * dim,
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30
          }}
          className="absolute inset-0 rounded-full blur-[120px] mix-blend-screen" 
          style={{ backgroundColor: glowColor }}
        />
        
        {/* Flames container */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-96 h-128 flex items-end justify-center gap-1 overflow-hidden">
          {[...Array(flameCount)].map((_, i) => (
            <FlamePart key={i} intensity={smoothedIntensity} flameHeight={flameHeight} />
          ))}
        </div>

        {/* Embers */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-80 h-80 pointer-events-none">
          {[...Array(emberCount)].map((_, i) => (
            <Ember key={i} />
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

interface FlamePartProps {
  intensity: number;
  flameHeight: number;
}

const FlamePart: React.FC<FlamePartProps> = ({ intensity, flameHeight }) => {
  // Stable random values computed once per component instance
  const randomValues = useMemo(() => ({
    heightOffset: Math.random() * 10,
    xOffset: (Math.random() - 0.5) * 15,
    opacityOffset: Math.random() * 0.4,
  }), []);

  return (
    <motion.div
      animate={{
        height: `${(60 + intensity * 40 + randomValues.heightOffset) * flameHeight}%`,
        x: randomValues.xOffset,
        opacity: 0.6 + randomValues.opacityOffset,
      }}
      transition={{
        duration: 0.15,
        ease: "easeInOut"
      }}
      className="w-8 bg-gradient-to-t from-red-600 via-orange-500 to-yellow-200 rounded-t-full blur-sm mix-blend-screen"
    />
  );
};

const Ember: React.FC = () => {
  // Stable random values computed once per component instance
  const randomValues = useMemo(() => ({
    initialX: (Math.random() - 0.5) * 200,
    animateX: (Math.random() - 0.5) * 300,
    duration: 2 + Math.random() * 2,
    delay: Math.random() * 5,
  }), []);

  return (
    <motion.div
      initial={{ bottom: 0, opacity: 0, x: randomValues.initialX }}
      animate={{ 
        bottom: 400, 
        opacity: [0, 1, 0.8, 0],
        x: randomValues.animateX
      }}
      transition={{
        duration: randomValues.duration,
        repeat: Infinity,
        ease: "linear",
        delay: randomValues.delay,
      }}
      className="absolute w-1 h-1 bg-orange-200 rounded-full blur-[1px]"
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
