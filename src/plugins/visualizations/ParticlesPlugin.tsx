/**
 * Particles Visualization Plugin
 * 
 * Audio-reactive particle system with flowing, colorful particles.
 * Creates a dynamic, energetic visualization.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';
import { getNumberSetting, getStringSetting, getBooleanSetting } from '../utils/settings';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'particleCount',
    label: 'Particle Count',
    min: 20,
    max: 200,
    step: 10,
    default: 80,
  },
  {
    type: 'range',
    id: 'particleSize',
    label: 'Particle Size',
    min: 1,
    max: 10,
    step: 0.5,
    default: 3,
  },
  {
    type: 'range',
    id: 'speed',
    label: 'Speed',
    min: 0.5,
    max: 3.0,
    step: 0.1,
    default: 1.5,
  },
  {
    type: 'color',
    id: 'particleColor',
    label: 'Particle Color',
    default: '#f59e0b', // amber-500
  },
  {
    type: 'boolean',
    id: 'colorful',
    label: 'Colorful Mode',
    default: true,
  },
  {
    type: 'range',
    id: 'spread',
    label: 'Spread',
    min: 0.5,
    max: 3.0,
    step: 0.1,
    default: 1.5,
  },
];

// ============================================================================
// Component
// ============================================================================

const ParticlesVisualization: React.FC<VisualizationProps> = ({
  audioData,
  commonSettings,
  customSettings,
}) => {
  const { intensity, dim } = commonSettings;
  const particleCount = Math.round(getNumberSetting(customSettings.particleCount, 80, 20, 200));
  const particleSize = getNumberSetting(customSettings.particleSize, 3, 1, 10);
  const speed = getNumberSetting(customSettings.speed, 1.5, 0.5, 3.0);
  const particleColor = getStringSetting(customSettings.particleColor, '#f59e0b');
  const colorful = getBooleanSetting(customSettings.colorful, true);
  const spread = getNumberSetting(customSettings.spread, 1.5, 0.5, 3.0);

  // Calculate audio reactivity
  const audioIntensity = useMemo(() => {
    const avg = audioData.reduce((a, b) => a + b, 0) / audioData.length;
    return avg * intensity;
  }, [audioData, intensity]);

  // Generate stable particle configurations
  // Use viewport-relative positioning to ensure particles are visible
  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => {
      // Distribute particles across the viewport
      const angle = (i / particleCount) * Math.PI * 2;
      const distance = (Math.random() * 0.3 + 0.2) * spread; // 20-50% of viewport
      const centerX = 0.5; // Center of viewport (50%)
      const centerY = 0.5;
      const initialX = centerX + Math.cos(angle) * distance;
      const initialY = centerY + Math.sin(angle) * distance;
      
      return {
        id: i,
        initialX: Math.max(0.1, Math.min(0.9, initialX)), // Clamp to 10-90% of viewport
        initialY: Math.max(0.1, Math.min(0.9, initialY)),
        duration: 3 + Math.random() * 2,
        delay: Math.random() * 2,
        color: colorful 
          ? `hsl(${(i * 360 / particleCount) % 360}, 70%, 60%)`
          : particleColor,
      };
    });
  }, [particleCount, spread, colorful, particleColor]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden" style={{ opacity: dim }}>
      {/* Particles */}
      {particles.map((particle) => (
        <Particle
          key={particle.id}
          initialX={particle.initialX}
          initialY={particle.initialY}
          duration={particle.duration / speed}
          delay={particle.delay}
          color={particle.color}
          size={particleSize * (1 + audioIntensity * 2)}
          audioIntensity={audioIntensity}
        />
      ))}
    </div>
  );
};

interface ParticleProps {
  initialX: number;
  initialY: number;
  duration: number;
  delay: number;
  color: string;
  size: number;
  audioIntensity: number;
}

const Particle: React.FC<ParticleProps> = ({
  initialX,
  initialY,
  duration,
  delay,
  color,
  size,
  audioIntensity,
}) => {
  // Random target position within viewport bounds (as percentage)
  const targetX = useMemo(() => {
    const offset = (Math.random() - 0.5) * 0.3; // Max 15% movement
    return Math.max(0.05, Math.min(0.95, initialX + offset));
  }, [initialX]);
  
  const targetY = useMemo(() => {
    const offset = (Math.random() - 0.5) * 0.3;
    return Math.max(0.05, Math.min(0.95, initialY + offset));
  }, [initialY]);

  // Ensure minimum visible size
  const finalSize = Math.max(2, size);

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        left: `${initialX * 100}%`,
        top: `${initialY * 100}%`,
        width: `${finalSize}px`,
        height: `${finalSize}px`,
        backgroundColor: color,
        boxShadow: `0 0 ${finalSize * 2}px ${color}`,
        transform: 'translate(-50%, -50%)', // Center the particle on its position
      }}
      animate={{
        x: [(targetX - initialX) * 100 + '%', (initialX - targetX) * 100 + '%', (targetX - initialX) * 100 + '%'],
        y: [(targetY - initialY) * 100 + '%', (initialY - targetY) * 100 + '%', (targetY - initialY) * 100 + '%'],
        opacity: [0.3, 1, 0.8, 0.3],
        scale: [0.8, 1 + audioIntensity * 0.5, 0.8],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const ParticlesPlugin: VisualizationPlugin = {
  id: 'particles',
  name: 'Particles',
  description: 'Audio-reactive particle system',
  icon: 'Music',
  settingsSchema,
  component: ParticlesVisualization,
};

