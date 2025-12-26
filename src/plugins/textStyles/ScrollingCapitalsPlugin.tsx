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
  const lastMessageTimestampRef = useRef<number>(0); // Track last message timestamp to detect new messages
  const spanRef = useRef<HTMLSpanElement>(null);

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

  // Helper function to calculate animation parameters
  const calculateAnimationParams = (msg: string) => {
    // Estimate text width: each character is roughly fontSize * 0.6rem
    const textWidth = msg.length * (fontSize * 0.6 * 16); // Convert rem to px
    const scrollDistance = viewportWidth + textWidth;
    // The duration setting should be the total scroll duration
    // So we scroll the full distance (viewport + text width) in exactly `duration` seconds
    const animDuration = duration;
    const endPos = `-${scrollDistance}px`;
    return { endPos, animDuration, scrollDistance };
  };


  // Handle completion - supports repeatCount
  const handleComplete = () => {
    if (completedRef.current || !displayMessage) return;
    
    const nextRepeat = currentRepeat + 1;
    
    if (nextRepeat < repeatCount) {
      // More repeats needed - restart immediately (like Dot Matrix)
      setCurrentRepeat(nextRepeat);
      // No delay - the animation will restart immediately when currentRepeat changes
      // because the useEffect depends on it
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
      // Call onComplete after a brief delay to allow exit animation
      setTimeout(() => {
        onComplete?.();
      }, 300);
    }
  };


  // Reset state when new message is triggered
  useEffect(() => {
    if (message && messageTimestamp !== lastMessageTimestampRef.current) {
      // New message - reset everything
      lastMessageTimestampRef.current = messageTimestamp;
      completedRef.current = false;
      setCurrentRepeat(0);
      // Clear any pending timeouts
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      // Immediately show the message
      setDisplayMessage(message);
      
      // Safety timeout: ensure message is cleared even if animation doesn't complete
      const { animDuration } = calculateAnimationParams(message);
      const totalDuration = animDuration * repeatCount;
      safetyTimeoutRef.current = setTimeout(() => {
        if (!completedRef.current) {
          completedRef.current = true;
          setDisplayMessage(null);
          setCurrentRepeat(0);
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

  return (
    <div 
      className={`fixed ${positionClass} left-0 w-full overflow-hidden pointer-events-none`}
      style={{ transform: `translateY(${verticalOffset}px)` }}
    >
      {displayMessage && (() => {
        // Calculate end position directly in render to ensure it's always current
        const { endPos, animDuration } = calculateAnimationParams(displayMessage);
        
        return (
          <motion.div
            key={`${messageTimestamp}-${currentRepeat}`}
            initial={{ x: `${viewportWidth}px` }}
            animate={{ x: endPos }}
            transition={{ 
              duration: animDuration, 
              ease: "linear"
            }}
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
        );
      })()}
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
