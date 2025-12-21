/**
 * Bounce Text Style Plugin
 * 
 * Text bounces into view with a playful animation.
 * Great for energetic, fun messages.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TextStylePlugin, TextStyleProps, SettingDefinition } from '../types';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'displayDuration',
    label: 'Display Duration (seconds)',
    min: 2,
    max: 10,
    step: 0.5,
    default: 4,
  },
  {
    type: 'range',
    id: 'bounceIntensity',
    label: 'Bounce Intensity',
    min: 0.5,
    max: 2.0,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'range',
    id: 'fontSize',
    label: 'Font Size (rem)',
    min: 3,
    max: 16,
    step: 0.5,
    default: 6,
  },
  {
    type: 'color',
    id: 'color',
    label: 'Text Color',
    default: '#ffffff',
  },
  {
    type: 'range',
    id: 'glowIntensity',
    label: 'Glow Intensity',
    min: 0,
    max: 1,
    step: 0.1,
    default: 0.6,
  },
  {
    type: 'select',
    id: 'position',
    label: 'Position',
    options: [
      { value: 'top', label: 'Top' },
      { value: 'center', label: 'Center' },
      { value: 'bottom', label: 'Bottom' },
    ],
    default: 'center',
  },
];

// ============================================================================
// Component
// ============================================================================

const BounceStyle: React.FC<TextStyleProps> = ({
  message,
  messageTimestamp,
  settings,
  onComplete,
}) => {
  const [displayMessage, setDisplayMessage] = useState<string | null>(null);

  const displayDuration = (settings.displayDuration as number) ?? 4;
  const bounceIntensity = (settings.bounceIntensity as number) || 1.0;
  const fontSize = (settings.fontSize as number) ?? 6;
  const color = (settings.color as string) ?? '#ffffff';
  const glowIntensity = (settings.glowIntensity as number) || 0.6;
  const position = (settings.position as string) ?? 'center';

  // Calculate position classes
  const positionClass = {
    top: 'top-20',
    center: 'top-1/2 -translate-y-1/2',
    bottom: 'bottom-20',
  }[position] || 'top-1/2 -translate-y-1/2';

  // Text shadow based on glow intensity
  const glowSize = 20 * glowIntensity;
  const textShadow = glowIntensity > 0 
    ? `0 0 ${glowSize}px ${color}, 0 0 ${glowSize * 2}px ${color}40`
    : 'none';

  useEffect(() => {
    if (message) {
      // Force a reset if the same message is triggered again
      setDisplayMessage(null);
      
      // Small delay to allow AnimatePresence to see the null state
      const nextTick = setTimeout(() => {
        setDisplayMessage(message);
      }, 50);

      const timer = setTimeout(() => {
        setDisplayMessage(null);
        onComplete?.();
      }, (displayDuration * 1000) + 50);
      
      return () => {
        clearTimeout(nextTick);
        clearTimeout(timer);
      };
    }
  }, [message, messageTimestamp, displayDuration, onComplete]);

  return (
    <div className={`fixed ${positionClass} left-0 w-full flex items-center justify-center pointer-events-none z-50 px-8`}>
      <AnimatePresence>
        {displayMessage && (
          <motion.div
            key={messageTimestamp}
            initial={{ 
              opacity: 0, 
              scale: 0.3,
              y: -100 * bounceIntensity,
            }}
            animate={{ 
              opacity: 1, 
              scale: 1,
              y: 0,
            }}
            exit={{ 
              opacity: 0, 
              scale: 0.5,
              y: 50 * bounceIntensity,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 20,
              mass: 0.8,
            }}
            className="text-center"
          >
            <span
              className="font-black uppercase tracking-tight"
              style={{
                fontSize: `${fontSize}rem`,
                color,
                textShadow,
              }}
            >
              {displayMessage}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const BouncePlugin: TextStylePlugin = {
  id: 'bounce',
  name: 'Bounce',
  description: 'Text bounces into view with playful animation',
  settingsSchema,
  component: BounceStyle,
};

