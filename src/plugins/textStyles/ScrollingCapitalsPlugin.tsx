/**
 * Scrolling Capitals Text Style Plugin
 * 
 * Large uppercase text that scrolls across the screen from right to left.
 * The classic marquee style.
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TextStylePlugin, TextStyleProps, SettingDefinition } from '../types';
import { getNumberSetting, getStringSetting } from '../utils/settings';

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
  verticalOffset = 0,
  repeatCount = 1,
  onComplete,
}) => {
  const [displayMessage, setDisplayMessage] = useState<string | null>(null);
  const [currentRepeat, setCurrentRepeat] = useState(0);
  const completedRef = useRef(false);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const duration = getNumberSetting(settings.duration, 10, 5, 20);
  const fontSize = getNumberSetting(settings.fontSize, 8, 4, 16);
  const color = getStringSetting(settings.color, '#ffffff');
  const glowIntensity = getNumberSetting(settings.glowIntensity, 0.5, 0, 1);
  const position = getStringSetting(settings.position, 'top');

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

  // Handle completion - supports repeatCount
  const handleComplete = () => {
    if (completedRef.current) return;
    
    const nextRepeat = currentRepeat + 1;
    if (nextRepeat < repeatCount) {
      // Reset for next repeat - briefly clear display then show again
      setDisplayMessage(null);
      setCurrentRepeat(nextRepeat);
      // Use a small timeout to reset the animation
      setTimeout(() => {
        if (!completedRef.current) {
          setDisplayMessage(message);
        }
      }, 50);
    } else {
      // All repeats done
      completedRef.current = true;
      setDisplayMessage(null);
      setCurrentRepeat(0);
      // Clear safety timeout if it exists
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      onComplete?.();
    }
  };

  useEffect(() => {
    if (message) {
      // Reset completion flag and repeat counter
      completedRef.current = false;
      setCurrentRepeat(0);
      // Immediately show the message
      setDisplayMessage(message);
      
      // Safety timeout: ensure message is cleared even if animation doesn't complete
      // The animation goes from 100% to -100% (200% of viewport), but if text is longer
      // than viewport, it needs additional time. Add buffer based on text length.
      // Estimate: each character is roughly fontSize * 0.6rem wide
      // For very long text, we need extra time beyond the base duration
      const estimatedTextWidthRem = message.length * (fontSize * 0.6);
      // Assume viewport is roughly 100rem wide (typical), so if text is longer, add buffer
      const textWidthRatio = Math.max(1, estimatedTextWidthRem / 100);
      const bufferTime = Math.max(3, textWidthRatio * 2); // At least 3 seconds, more for long text
      // Safety timeout must account for all repeats
      const totalDuration = (duration + bufferTime) * repeatCount;
      safetyTimeoutRef.current = setTimeout(() => {
        if (!completedRef.current) {
          completedRef.current = true;
          setDisplayMessage(null);
          setCurrentRepeat(0);
          onComplete?.();
        }
      }, totalDuration * 1000);
      
      return () => {
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
      };
    }
  }, [message, messageTimestamp, duration, fontSize, repeatCount, onComplete]);

  return (
    <div 
      className={`fixed ${positionClass} left-0 w-full overflow-hidden pointer-events-none`}
      style={{ transform: `translateY(${verticalOffset}px)` }}
    >
      <AnimatePresence>
        {displayMessage && (
          <motion.div
            key={`${messageTimestamp}-${currentRepeat}`}
            initial={{ x: '100%' }}
            animate={{ x: '-100%' }}
            exit={{ opacity: 0 }}
            transition={{ duration, ease: "linear" }}
            onAnimationComplete={handleComplete}
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
