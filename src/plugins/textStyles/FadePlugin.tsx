/**
 * Fade Text Style Plugin
 * 
 * Simple centered text that fades in and out.
 * A calm, minimal approach to message display.
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  verticalOffset = 0,
  repeatCount = 1,
  onComplete,
}) => {
  const [displayMessage, setDisplayMessage] = useState<string | null>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [currentRepeat, setCurrentRepeat] = useState(0);
  const completedRef = useRef(false);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const displayDuration = getNumberSetting(settings.displayDuration, 5, 2, 15);
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

  const handleComplete = () => {
    if (completedRef.current) return;
    
    const nextRepeat = currentRepeat + 1;
    if (nextRepeat < repeatCount) {
      // Reset for next repeat
      setDisplayMessage(null);
      setIsFadingOut(false);
      setCurrentRepeat(nextRepeat);
      // Brief pause then show again
      setTimeout(() => {
        if (!completedRef.current) {
          setDisplayMessage(message);
        }
      }, 100);
    } else {
      completedRef.current = true;
      setDisplayMessage(null);
      setIsFadingOut(false);
      setCurrentRepeat(0);
      onComplete?.();
    }
  };

  useEffect(() => {
    if (message) {
      // Reset completion flag and repeat counter
      completedRef.current = false;
      setCurrentRepeat(0);
      
      // Immediately show the message (no artificial delay)
      setDisplayMessage(message);
      setIsFadingOut(false);

      // Start fade out after fade in + display duration
      const fadeOutTimer = setTimeout(() => {
        setIsFadingOut(true);
      }, (fadeInDuration + displayDuration) * 1000);

      // Safety timeout: ensure message is removed even if animation doesn't complete
      // Account for all repeats
      const singleCycleDuration = (fadeInDuration + displayDuration + fadeOutDuration + 0.1) * 1000;
      const totalDuration = singleCycleDuration * repeatCount;
      const safetyBuffer = 1000; // 1 second buffer
      safetyTimeoutRef.current = setTimeout(() => {
        if (!completedRef.current) {
          completedRef.current = true;
          setDisplayMessage(null);
          setIsFadingOut(false);
          setCurrentRepeat(0);
          onComplete?.();
        }
      }, totalDuration + safetyBuffer);
      
      return () => {
        clearTimeout(fadeOutTimer);
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current);
        }
      };
    }
  }, [message, messageTimestamp, displayDuration, fadeInDuration, fadeOutDuration, repeatCount, onComplete]);

  // Handle fade-out completion
  useEffect(() => {
    if (isFadingOut && displayMessage) {
      // Set a timer to remove the message after fade-out duration
      const fadeOutCompleteTimer = setTimeout(() => {
        handleComplete();
      }, fadeOutDuration * 1000);

      return () => {
        clearTimeout(fadeOutCompleteTimer);
      };
    }
  }, [isFadingOut, displayMessage, fadeOutDuration]);

  const variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: {
        opacity: { duration: fadeInDuration, ease: "easeOut" as const },
        scale: { duration: fadeInDuration, ease: "easeOut" as const },
      },
    },
    fadingOut: { 
      opacity: 0, 
      scale: 1.05,
      transition: {
        opacity: { duration: fadeOutDuration, ease: "easeOut" as const },
        scale: { duration: fadeOutDuration, ease: "easeOut" as const },
      },
    },
  };

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
            initial="hidden"
            animate={isFadingOut ? "fadingOut" : "visible"}
            exit="fadingOut"
            variants={variants}
            onAnimationComplete={() => {
              // Call handleComplete when fade-out animation completes
              if (isFadingOut) {
                handleComplete();
              }
            }}
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
