/**
 * Scrolling Capitals Text Style Plugin
 * 
 * Large uppercase text that scrolls across the screen from right to left.
 * The classic marquee style.
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
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
  const [viewportWidth, setViewportWidth] = useState<number>(() => 
    typeof window !== 'undefined' ? window.innerWidth : 1920
  );
  const completedRef = useRef(false);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationKeyRef = useRef(0);
  const currentRepeatRef = useRef(0); // Use ref to track current repeat to avoid stale closures
  const spanRef = useRef<HTMLSpanElement>(null);
  const lastMessageTimestampRef = useRef<number>(0); // Track last message timestamp to detect new messages

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

  // Track viewport width for responsive calculations
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle completion - supports repeatCount
  const handleComplete = () => {
    if (completedRef.current) return;
    
    // Use ref to avoid stale closure issues
    const currentRepeatValue = currentRepeatRef.current;
    const nextRepeat = currentRepeatValue + 1;
    
    if (nextRepeat < repeatCount) {
      // More repeats needed - increment repeat counter and animation key to restart animation
      currentRepeatRef.current = nextRepeat;
      setCurrentRepeat(nextRepeat);
      animationKeyRef.current += 1;
      // The key change will cause the motion.div to remount and restart the animation
    } else {
      // All repeats done
      completedRef.current = true;
      setDisplayMessage(null);
      // Clear safety timeout if it exists
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      // Call onComplete after a brief delay to allow exit animation
      setTimeout(() => {
        onComplete?.();
      }, 300);
    }
  };

  // Reset state only when message or messageTimestamp changes (new message triggered)
  useEffect(() => {
    if (message && messageTimestamp !== lastMessageTimestampRef.current) {
      // New message - reset everything
      lastMessageTimestampRef.current = messageTimestamp;
      completedRef.current = false;
      currentRepeatRef.current = 0;
      setCurrentRepeat(0);
      animationKeyRef.current = 0;
      // Clear any pending timeouts
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      // Immediately show the message
      setDisplayMessage(message);
      
      // Safety timeout: ensure message is cleared even if animation doesn't complete
      // Estimate text width: each character is roughly fontSize * 0.6rem
      const estimatedTextWidth = message.length * (fontSize * 0.6 * 16); // Convert rem to px
      const totalScrollDistance = viewportWidth + estimatedTextWidth;
      // Calculate actual duration needed based on scroll distance and speed
      // Speed = viewportWidth / duration (in pixels per second)
      const speed = viewportWidth / duration; // pixels per second
      const actualDuration = totalScrollDistance / speed; // seconds needed
      const totalDuration = actualDuration * repeatCount;
      safetyTimeoutRef.current = setTimeout(() => {
        if (!completedRef.current) {
          completedRef.current = true;
          setDisplayMessage(null);
          onComplete?.();
        }
      }, (totalDuration * 1000) + 500); // Add 500ms buffer
      
      return () => {
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
      };
    }
  }, [message, messageTimestamp, duration, fontSize, repeatCount, viewportWidth, onComplete]);

  // Calculate the end position based on viewport width and text width
  // Estimate text width: each character is roughly fontSize * 0.6rem
  const estimatedTextWidth = displayMessage ? displayMessage.length * (fontSize * 0.6 * 16) : 0; // Convert rem to px
  const totalScrollDistance = viewportWidth + estimatedTextWidth;
  // Calculate actual duration needed to scroll the full distance
  // Speed = viewportWidth / duration (pixels per second)
  const speed = viewportWidth / duration;
  const actualDuration = totalScrollDistance / speed;
  // Calculate end position: start at 100vw (right edge of viewport), scroll by totalScrollDistance
  // End position = -(viewportWidth + textWidth) to ensure text fully scrolls off
  const endPosition = `-${totalScrollDistance}px`;

  return (
    <div 
      className={`fixed ${positionClass} left-0 w-full overflow-hidden pointer-events-none`}
      style={{ transform: `translateY(${verticalOffset}px)` }}
    >
      {displayMessage && (
        <motion.div
          key={`${messageTimestamp}-${currentRepeat}-${animationKeyRef.current}`}
          initial={{ x: `${viewportWidth}px` }}
          animate={{ x: endPosition }}
          exit={{ opacity: 0 }}
          transition={{ duration: actualDuration, ease: "linear" }}
          onAnimationComplete={handleComplete}
          className="whitespace-nowrap"
          style={{ willChange: 'transform' }}
        >
          <span 
            ref={spanRef}
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
