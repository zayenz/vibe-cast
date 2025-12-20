/**
 * Fade Text Style Plugin
 * 
 * Simple centered text that fades in and out.
 * A calm, minimal approach to message display.
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
    max: 15,
    step: 0.5,
    default: 5,
  },
  {
    type: 'range',
    id: 'fadeInDuration',
    label: 'Fade In Duration (seconds)',
    min: 0.2,
    max: 3,
    step: 0.1,
    default: 0.5,
  },
  {
    type: 'range',
    id: 'fadeOutDuration',
    label: 'Fade Out Duration (seconds)',
    min: 0.2,
    max: 3,
    step: 0.1,
    default: 0.5,
  },
  {
    type: 'range',
    id: 'fontSize',
    label: 'Font Size (rem)',
    min: 2,
    max: 12,
    step: 0.5,
    default: 5,
  },
  {
    type: 'color',
    id: 'color',
    label: 'Text Color',
    default: '#ffffff',
  },
  {
    type: 'boolean',
    id: 'uppercase',
    label: 'Uppercase',
    default: false,
  },
  {
    type: 'select',
    id: 'fontWeight',
    label: 'Font Weight',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'medium', label: 'Medium' },
      { value: 'semibold', label: 'Semi Bold' },
      { value: 'bold', label: 'Bold' },
      { value: 'black', label: 'Black' },
    ],
    default: 'bold',
  },
  {
    type: 'range',
    id: 'blurAmount',
    label: 'Background Blur',
    min: 0,
    max: 20,
    step: 1,
    default: 0,
  },
];

// ============================================================================
// Component
// ============================================================================

const FadeStyle: React.FC<TextStyleProps> = ({
  message,
  messageTimestamp,
  settings,
  onComplete,
}) => {
  const [displayMessage, setDisplayMessage] = useState<string | null>(null);

  const displayDuration = (settings.displayDuration as number) ?? 5;
  const fadeInDuration = (settings.fadeInDuration as number) ?? 0.5;
  const fadeOutDuration = (settings.fadeOutDuration as number) ?? 0.5;
  const fontSize = (settings.fontSize as number) ?? 5;
  const color = (settings.color as string) ?? '#ffffff';
  const uppercase = (settings.uppercase as boolean) ?? false;
  const fontWeight = (settings.fontWeight as string) ?? 'bold';
  const blurAmount = (settings.blurAmount as number) ?? 0;

  // Map font weight to CSS
  const fontWeightMap: Record<string, number> = {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 900,
  };

  useEffect(() => {
    if (message) {
      // Force a reset if the same message is triggered again
      setDisplayMessage(null);
      
      // Small delay to allow AnimatePresence to see the null state
      const nextTick = setTimeout(() => {
        setDisplayMessage(message);
      }, 50);

      const totalDuration = (fadeInDuration + displayDuration + fadeOutDuration) * 1000;
      const timer = setTimeout(() => {
        setDisplayMessage(null);
        onComplete?.();
      }, totalDuration + 50);
      
      return () => {
        clearTimeout(nextTick);
        clearTimeout(timer);
      };
    }
  }, [message, messageTimestamp, displayDuration, fadeInDuration, fadeOutDuration, onComplete]);

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
      <AnimatePresence>
        {displayMessage && (
          <motion.div
            key={messageTimestamp}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{
              opacity: { 
                duration: fadeInDuration,
                ease: "easeOut",
              },
              scale: {
                duration: fadeInDuration,
                ease: "easeOut",
              },
            }}
            className="text-center px-8 py-4 rounded-lg max-w-[80vw]"
            style={{
              backdropFilter: blurAmount > 0 ? `blur(${blurAmount}px)` : undefined,
              backgroundColor: blurAmount > 0 ? 'rgba(0,0,0,0.3)' : undefined,
            }}
          >
            <motion.span 
              className="block"
              style={{ 
                fontSize: `${fontSize}rem`,
                color,
                fontWeight: fontWeightMap[fontWeight] || 700,
                textTransform: uppercase ? 'uppercase' : 'none',
                letterSpacing: uppercase ? '-0.02em' : 'normal',
              }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: fadeOutDuration,
                delay: displayDuration,
              }}
            >
              {displayMessage}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const FadePlugin: TextStylePlugin = {
  id: 'fade',
  name: 'Fade',
  description: 'Centered text that fades in and out',
  settingsSchema,
  component: FadeStyle,
};
