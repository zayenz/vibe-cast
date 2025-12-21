/**
 * Waves Visualization Plugin
 * 
 * Audio-reactive wave patterns that flow across the screen.
 * Creates a calming, ocean-like visualization.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';
import { getNumberSetting, getStringSetting } from '../utils/settings';

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
  const waveCount = Math.round(getNumberSetting(customSettings.waveCount, 4, 2, 8));
  const waveSpeed = getNumberSetting(customSettings.waveSpeed, 1.0, 0.5, 3.0);
  const waveHeight = getNumberSetting(customSettings.waveHeight, 1.0, 0.3, 2.0);
  const waveColor = getStringSetting(customSettings.waveColor, '#3b82f6');
  const opacity = getNumberSetting(customSettings.opacity, 0.8, 0.2, 1.0);

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
  const [time, setTime] = useState(0);
  const waveLength = 300; // Wavelength in pixels
  const points = 120; // Number of points for smooth wave

  // Animate time for wave movement
  useEffect(() => {
    let animationFrame: number;
    let startTime = Date.now();
    
    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      setTime(elapsed * speed * 0.5); // Slower movement for smoother waves
      animationFrame = requestAnimationFrame(animate);
    };
    
    animate();
    return () => cancelAnimationFrame(animationFrame);
  }, [speed]);

  // Generate wave path with animated sine wave
  const wavePath = useMemo(() => {
    const pathPoints: string[] = [];
    const viewWidth = 1200;
    const viewHeight = 200;
    const centerY = viewHeight / 2;
    
    // Start from left edge, bottom
    pathPoints.push(`M 0 ${viewHeight}`);
    
    // Generate wave points along the top
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * viewWidth;
      // Sine wave with phase offset and time-based animation
      const waveX = (x / waveLength) * Math.PI * 2 + phase + time;
      const y = centerY - Math.sin(waveX) * amplitude;
      pathPoints.push(`L ${x} ${y}`);
    }
    
    // Close the path to create fill
    pathPoints.push(`L ${viewWidth} ${viewHeight}`);
    pathPoints.push('Z');
    
    return pathPoints.join(' ');
  }, [amplitude, phase, time, waveLength]);

  return (
    <div
      className="absolute w-full"
      style={{
        top: `${baseY}%`,
        height: `${amplitude * 2 + 100}px`,
        opacity,
        transform: 'translateY(-50%)',
      }}
    >
      <svg
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        <path
          d={wavePath}
          fill={color}
        />
      </svg>
    </div>
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

