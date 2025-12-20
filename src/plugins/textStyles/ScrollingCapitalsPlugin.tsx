/**
 * Scrolling Capitals Text Style Plugin
 * 
 * Large uppercase text that scrolls across the screen from right to left.
 * The classic marquee style.
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
    id: 'duration',
    label: 'Scroll Duration (seconds)',
    min: 5,
    max: 20,
    step: 1,
    default: 10,
  },
  {
    type: 'range',
    id: 'fontSize',
    label: 'Font Size (rem)',
    min: 4,
    max: 16,
    step: 0.5,
    default: 8,
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
    default: 0.5,
  },
  {
    type: 'select',
    id: 'position',
    label: 'Vertical Position',
    options: [
      { value: 'top', label: 'Top' },
      { value: 'center', label: 'Center' },
      { value: 'bottom', label: 'Bottom' },
    ],
    default: 'top',
  },
];

// ============================================================================
// Component
// ============================================================================

const ScrollingCapitalsStyle: React.FC<TextStyleProps> = ({
  message,
  messageTimestamp,
  settings,
  onComplete,
}) => {
  const [displayMessage, setDisplayMessage] = useState<string | null>(null);

  const duration = (settings.duration as number) ?? 10;
  const fontSize = (settings.fontSize as number) ?? 8;
  const color = (settings.color as string) ?? '#ffffff';
  const glowIntensity = (settings.glowIntensity as number) ?? 0.5;
  const position = (settings.position as string) ?? 'top';

  // Calculate position classes
  const positionClass = {
    top: 'top-20',
    center: 'top-1/2 -translate-y-1/2',
    bottom: 'bottom-20',
  }[position] || 'top-20';

  // Text shadow based on glow intensity
  const glowSize = 15 * glowIntensity;
  const textShadow = glowIntensity > 0 
    ? `0 5px ${glowSize}px rgba(255, 255, 255, ${glowIntensity})`
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
      }, (duration * 1000) + 50); // Show for duration + delay
      
      return () => {
        clearTimeout(nextTick);
        clearTimeout(timer);
      };
    }
  }, [message, messageTimestamp, duration, onComplete]);

  return (
    <div className={`fixed ${positionClass} left-0 w-full overflow-hidden pointer-events-none z-50`}>
      <AnimatePresence>
        {displayMessage && (
          <motion.div
            key={messageTimestamp}
            initial={{ x: '100%' }}
            animate={{ x: '-100%' }}
            exit={{ opacity: 0 }}
            transition={{ duration, ease: "linear" }}
            className="whitespace-nowrap"
          >
            <span 
              className="font-black uppercase tracking-tighter"
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

export const ScrollingCapitalsPlugin: TextStylePlugin = {
  id: 'scrolling-capitals',
  name: 'Scrolling Capitals',
  description: 'Large uppercase text scrolling across the screen',
  settingsSchema,
  component: ScrollingCapitalsStyle,
};
