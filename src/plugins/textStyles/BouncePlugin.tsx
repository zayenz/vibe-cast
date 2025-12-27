/**
 * Bounce Text Style Plugin
 * 
 * Text bounces into view with a playful animation.
 * Great for energetic, fun messages.
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { TextStylePlugin, TextStyleProps, SettingDefinition } from '../types';
import { getNumberSetting, getStringSetting } from '../utils/settings';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'displayDuration',
    label: 'Display Duration (seconds)',
    min: 0,
    max: 10,
    step: 0.5,
    default: 4,
  },
  {
    type: 'range',
    id: 'fadeOutDuration',
    label: 'Fade Out Duration (seconds)',
    min: 0.3,
    max: 2.0,
    step: 0.1,
    default: 0.8,
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
  verticalOffset = 0,
  repeatCount = 1,
  onComplete,
}) => {
  const [displayMessage, setDisplayMessage] = useState<string | null>(null);
  const [currentRepeat, setCurrentRepeat] = useState(0);
  const completedRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const controls = useAnimationControls();

  const displayDuration = getNumberSetting(settings.displayDuration, 4, 0, 10);
  const fadeOutDuration = getNumberSetting(settings.fadeOutDuration, 0.8, 0.3, 2.0);
  const bounceIntensity = getNumberSetting(settings.bounceIntensity, 1.0, 0.5, 2.0);
  const fontSize = getNumberSetting(settings.fontSize, 6, 3, 16);
  const color = getStringSetting(settings.color, '#ffffff');
  const glowIntensity = getNumberSetting(settings.glowIntensity, 0.6, 0, 1);
  const position = getStringSetting(settings.position, 'center');

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

  const effectiveRepeats = Math.max(1, Math.floor(Number(repeatCount) || 1));

  useEffect(() => {
    if (!message) return;

    completedRef.current = false;
    setDisplayMessage(message);
    setCurrentRepeat(0);

    let localRepeat = 0;

    const runCycle = () => {
      if (completedRef.current) return;

      // Animate in (bounce)
      controls.set({ opacity: 0, scale: 0.3, y: -100 * bounceIntensity });
      controls.start({
        opacity: 1,
        scale: 1,
        y: 0,
        transition: springTransition,
      });

      // Start fade-out after display duration (spring settles in ~1s)
      timeoutRef.current = setTimeout(() => {
        if (completedRef.current) return;
        controls.start({
          opacity: 0,
          scale: 0.5,
          y: 50 * bounceIntensity,
          transition: {
            opacity: { duration: fadeOutDuration, ease: "easeOut" },
            scale: { duration: fadeOutDuration, ease: "easeOut" },
            y: { duration: fadeOutDuration, ease: "easeOut" },
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
      }, (1.0 + displayDuration) * 1000); // 1.0s for spring settle + displayDuration
    };

    runCycle();

    return () => {
      completedRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [message, messageTimestamp]);


  const springTransition = {
    type: "spring" as const,
    stiffness: 300,
    damping: 20,
    mass: 0.8,
  };

  return (
    <div 
      className={`fixed ${positionClass} left-0 w-full flex items-center justify-center pointer-events-none px-8`}
      style={{ transform: `translateY(${verticalOffset}px)` }}
    >
      <AnimatePresence>
        {displayMessage && (
          <motion.div
            key={`${messageTimestamp}-${currentRepeat}`}
            initial={false}
            animate={controls}
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

