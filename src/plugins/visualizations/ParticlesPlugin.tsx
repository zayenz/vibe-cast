/**
 * Particles Visualization Plugin
 * 
 * Audio-reactive particle system with flowing, colorful particles.
 * Creates a dynamic, energetic visualization.
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
  const particleCount = Math.round(Number(customSettings.particleCount) || 80);
  const particleSize = Number(customSettings.particleSize) || 3;
  const speed = Number(customSettings.speed) || 1.5;
  const particleColor = String(customSettings.particleColor || '#f59e0b');
  const colorful = Boolean(customSettings.colorful !== false && customSettings.colorful !== 'false');
  const spread = Number(customSettings.spread) || 1.5;

  // Calculate audio reactivity
  const audioIntensity = useMemo(() => {
    const avg = audioData.reduce((a, b) => a + b, 0) / audioData.length;
    return avg * intensity;
  }, [audioData, intensity]);

  // Generate stable particle configurations
  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => {
      const angle = (i / particleCount) * Math.PI * 2;
      const distance = (Math.random() * 0.5 + 0.5) * spread * 100;
      const initialX = 50 + Math.cos(angle) * distance;
      const initialY = 50 + Math.sin(angle) * distance;
      
      return {
        id: i,
        initialX,
        initialY,
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
  // Random target position
  const targetX = useMemo(() => initialX + (Math.random() - 0.5) * 100, [initialX]);
  const targetY = useMemo(() => initialY + (Math.random() - 0.5) * 100, [initialY]);

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        left: `${initialX}%`,
        top: `${initialY}%`,
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        boxShadow: `0 0 ${size * 2}px ${color}`,
      }}
      animate={{
        x: [0, targetX - initialX, 0],
        y: [0, targetY - initialY, 0],
        opacity: [0, 1, 0.8, 0],
        scale: [0.5, 1 + audioIntensity, 0.5],
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

