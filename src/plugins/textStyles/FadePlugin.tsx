/**
 * Fade Text Style Plugin
 * 
 * Simple centered text that fades in and out.
 * A calm, minimal approach to message display.
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { TextStylePlugin, TextStyleProps, SettingDefinition } from '../types';
import { getNumberSetting, getStringSetting, getBooleanSetting } from '../utils/settings';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'displayDuration',
    label: 'Display Duration (seconds)',
    min: 0,
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
  verticalOffset = 0,
  repeatCount = 1,
  onComplete,
}) => {
  const [displayMessage, setDisplayMessage] = useState<string | null>(null);
  const [currentRepeat, setCurrentRepeat] = useState(0);
  const completedRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const controls = useAnimationControls();

  const displayDuration = getNumberSetting(settings.displayDuration, 5, 0, 15);
  const fadeInDuration = getNumberSetting(settings.fadeInDuration, 0.5, 0.2, 3);
  const fadeOutDuration = getNumberSetting(settings.fadeOutDuration, 0.5, 0.2, 3);
  const fontSize = getNumberSetting(settings.fontSize, 5, 2, 12);
  const color = getStringSetting(settings.color, '#ffffff');
  const uppercase = getBooleanSetting(settings.uppercase, false);
  const fontWeight = getStringSetting(settings.fontWeight, 'bold');
  const blurAmount = getNumberSetting(settings.blurAmount, 0, 0, 20);

  // Map font weight to CSS
  const fontWeightMap: Record<string, number> = {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 900,
  };

  const effectiveRepeats = Math.max(1, Math.floor(Number(repeatCount) || 1));

  useEffect(() => {
    if (!message) return;

    completedRef.current = false;
    setDisplayMessage(message);
    setCurrentRepeat(0);

    let localRepeat = 0;

    const runCycle = () => {
      if (completedRef.current) return;

      // Animate in
      controls.set({ opacity: 0, scale: 0.95 });
      controls.start({
        opacity: 1,
        scale: 1,
        transition: {
          opacity: { duration: fadeInDuration, ease: "easeOut" },
          scale: { duration: fadeInDuration, ease: "easeOut" },
        },
      });

      // Start fade-out after fade-in + display duration
      timeoutRef.current = setTimeout(() => {
        if (completedRef.current) return;
        controls.start({
          opacity: 0,
          scale: 1.05,
          transition: {
            opacity: { duration: fadeOutDuration, ease: "easeOut" },
            scale: { duration: fadeOutDuration, ease: "easeOut" },
          },
        });

        // Complete cycle after fade-out
        timeoutRef.current = setTimeout(() => {
          if (completedRef.current) return;
          localRepeat++;
          if (localRepeat < effectiveRepeats) {
            setCurrentRepeat(localRepeat);
            runCycle(); // Start next cycle
          } else {
            completedRef.current = true;
            setDisplayMessage(null);
            onComplete?.();
          }
        }, fadeOutDuration * 1000);
      }, (fadeInDuration + displayDuration) * 1000);
    };

    runCycle();

    return () => {
      completedRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [message, messageTimestamp]);

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center pointer-events-none"
      style={{ 
        transform: `translateY(${verticalOffset}px)`,
      }}
    >
      <AnimatePresence>
        {displayMessage && (
          <motion.div
            key={`${messageTimestamp}-${currentRepeat}`}
            initial={false}
            animate={controls}
            className="text-center px-8 py-4 rounded-lg max-w-[80vw]"
            style={{
              backdropFilter: blurAmount > 0 ? `blur(${blurAmount}px)` : undefined,
              backgroundColor: blurAmount > 0 ? 'rgba(0,0,0,0.3)' : undefined,
            }}
          >
            <span 
              className="block"
              style={{ 
                fontSize: `${fontSize}rem`,
                color,
                fontWeight: fontWeightMap[fontWeight] || 700,
                textTransform: uppercase ? 'uppercase' : 'none',
                letterSpacing: uppercase ? '-0.02em' : 'normal',
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

export const FadePlugin: TextStylePlugin = {
  id: 'fade',
  name: 'Fade',
  description: 'Centered text that fades in and out',
  settingsSchema,
  component: FadeStyle,
};
