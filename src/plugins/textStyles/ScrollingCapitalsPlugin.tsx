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
  const [animationEnd, setAnimationEnd] = useState<string>('');
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

  // Helper function to calculate animation parameters
  const calculateAnimationParams = (msg: string) => {
    const textWidth = msg.length * (fontSize * 0.6 * 16);
    const scrollDistance = viewportWidth + textWidth;
    const scrollSpeed = viewportWidth / duration;
    const animDuration = scrollDistance / scrollSpeed;
    const endPos = `-${scrollDistance}px`;
    return { endPos, animDuration, scrollDistance };
  };

  // Get animation duration for current message
  const getAnimationDuration = () => {
    if (!displayMessage) return duration;
    const { animDuration } = calculateAnimationParams(displayMessage);
    return animDuration;
  };

  // Handle completion - supports repeatCount
  const handleComplete = () => {
    if (completedRef.current || !displayMessage) return;
    
    // Use ref to avoid stale closure issues
    const currentRepeatValue = currentRepeatRef.current;
    const nextRepeat = currentRepeatValue + 1;
    
    if (nextRepeat < repeatCount) {
      // More repeats needed - increment repeat counter
      // The useEffect below will detect the change and restart the animation
      currentRepeatRef.current = nextRepeat;
      setCurrentRepeat(nextRepeat);
      // Don't change the key - let the useEffect handle restarting the animation
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

  // Restart animation when currentRepeat changes (for repeat functionality)
  // Only run when currentRepeat > 0 (i.e., for repeats, not initial render)
  useEffect(() => {
    if (!displayMessage || completedRef.current || currentRepeat === 0) return;
    
    // This is a repeat - restart the animation
    const { endPos } = calculateAnimationParams(displayMessage);
    
    // Reset to start position first, then animate to end
    // Use double requestAnimationFrame to ensure the reset happens before the animation starts
    requestAnimationFrame(() => {
      setAnimationEnd(`${viewportWidth}px`);
      requestAnimationFrame(() => {
        setAnimationEnd(endPos);
      });
    });
  }, [currentRepeat, displayMessage, viewportWidth, fontSize, duration]);

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
      
      // Calculate and set initial animation end position
      const { endPos, animDuration } = calculateAnimationParams(message);
      setAnimationEnd(endPos);
      
      // For the first render, use animate prop. For repeats, we'll use controls.
      // The initial render will use the animate prop with endPos
      
      // Safety timeout: ensure message is cleared even if animation doesn't complete
      const totalDuration = animDuration * repeatCount;
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

  return (
    <div 
      className={`fixed ${positionClass} left-0 w-full overflow-hidden pointer-events-none`}
      style={{ transform: `translateY(${verticalOffset}px)` }}
    >
      {displayMessage && (
        <motion.div
          key={`${messageTimestamp}`}
          initial={{ x: `${viewportWidth}px` }}
          animate={{ x: animationEnd }}
          exit={{ opacity: 0 }}
          transition={{ duration: getAnimationDuration(), ease: "linear" }}
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
