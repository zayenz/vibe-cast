/**
 * Waves Visualization Plugin
 * 
 * Audio-reactive wave patterns that flow across the screen.
 * Creates a calming, ocean-like visualization.
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
    id: 'waveCount',
    label: 'Wave Count',
    min: 2,
    max: 8,
    step: 1,
    default: 4,
  },
  {
    type: 'range',
    id: 'waveSpeed',
    label: 'Wave Speed',
    min: 0.5,
    max: 3.0,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'range',
    id: 'waveHeight',
    label: 'Wave Height',
    min: 0.3,
    max: 2.0,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'color',
    id: 'waveColor',
    label: 'Wave Color',
    default: '#3b82f6', // blue-500
  },
  {
    type: 'range',
    id: 'opacity',
    label: 'Opacity',
    min: 0.2,
    max: 1.0,
    step: 0.1,
    default: 0.8,
  },
];

// ============================================================================
// Component
// ============================================================================

const WavesVisualization: React.FC<VisualizationProps> = ({
  audioData,
  commonSettings,
  customSettings,
}) => {
  const { intensity, dim } = commonSettings;
  const waveCount = Math.round(Number(customSettings.waveCount) || 4);
  const waveSpeed = Number(customSettings.waveSpeed) || 1.0;
  const waveHeight = Number(customSettings.waveHeight) || 1.0;
  const waveColor = String(customSettings.waveColor || '#3b82f6');
  const opacity = Number(customSettings.opacity) || 0.8;

  // Calculate audio reactivity - use mid frequencies for wave amplitude
  const audioAmplitude = useMemo(() => {
    const midFreq = audioData.slice(10, 40).reduce((a, b) => a + b, 0) / 30;
    return midFreq * intensity;
  }, [audioData, intensity]);

  // Apply dim
  const finalOpacity = opacity * dim;

  // Generate wave offsets for each wave
  const waveOffsets = useMemo(() => {
    return Array.from({ length: waveCount }, (_, i) => ({
      phase: (i / waveCount) * Math.PI * 2,
      speed: waveSpeed * (0.8 + (i % 3) * 0.2), // Vary speed slightly
    }));
  }, [waveCount, waveSpeed]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden" style={{ opacity: dim }}>
      {/* Background gradient */}
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, ${waveColor}15, black)`,
        }}
      />

      {/* Waves */}
      <div className="absolute inset-0">
        {waveOffsets.map((wave, index) => {
          const baseY = ((index + 1) / (waveCount + 1)) * 100;
          const amplitude = (30 + audioAmplitude * 20) * waveHeight;
          
          return (
            <WaveLayer
              key={`wave-${index}`}
              baseY={baseY}
              amplitude={amplitude}
              color={waveColor}
              opacity={finalOpacity}
              phase={wave.phase}
              speed={wave.speed}
            />
          );
        })}
      </div>
    </div>
  );
};

interface WaveLayerProps {
  baseY: number;
  amplitude: number;
  color: string;
  opacity: number;
  phase: number;
  speed: number;
}

const WaveLayer: React.FC<WaveLayerProps> = ({ baseY, amplitude, color, opacity, phase, speed }) => {
  return (
    <motion.div
      className="absolute w-full"
      style={{
        top: `${baseY}%`,
        height: `${amplitude * 2}px`,
        opacity,
      }}
      animate={{
        x: [0, -100, 0],
      }}
      transition={{
        duration: 10 / speed,
        repeat: Infinity,
        ease: 'linear',
        delay: phase / (Math.PI * 2) * (10 / speed), // Use phase to offset animation start
      }}
    >
      <svg
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        className="w-full h-full"
        style={{ transform: 'translateY(-50%)' }}
      >
        <path
          d={`M 0,100 Q 300,${100 - amplitude * Math.sin(phase)} 600,100 T 1200,100 L 1200,200 L 0,200 Z`}
          fill={color}
        />
      </svg>
    </motion.div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const WavesPlugin: VisualizationPlugin = {
  id: 'waves',
  name: 'Waves',
  description: 'Flowing audio-reactive wave patterns',
  icon: 'Music',
  settingsSchema,
  component: WavesVisualization,
};

