/**
 * Scrolling Capitals Text Style Plugin
 * 
 * Large uppercase text that scrolls across the screen from right to left.
 * The classic marquee style.
 * Uses GPU-accelerated CSS animations for smooth 60fps performance.
 */

import React, { useEffect, useState, useRef } from 'react';
import { TextStylePlugin, TextStyleProps, SettingDefinition } from '../types';
import { getNumberSetting, getStringSetting, getBooleanSetting } from '../utils/settings';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'charDuration',
    label: 'Time per Character (seconds)',
    min: 0.1,
    max: 2,
    step: 0.1,
    default: 0.3,
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
    type: 'boolean',
    id: 'pulseGlow',
    label: 'Pulse Glow',
    default: false,
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
  const [animationKey, setAnimationKey] = useState(0);
  const completedRef = useRef(false);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageTimestampRef = useRef<number>(0); // Track last message timestamp to detect new messages
  const spanRef = useRef<HTMLSpanElement>(null);
  const onCompleteRef = useRef(onComplete);

  // Use charDuration if available, otherwise default (old 'duration' setting is ignored)
  const charDuration = getNumberSetting(settings.charDuration, 0.3, 0.1, 2);
  const fontSize = getNumberSetting(settings.fontSize, 8, 4, 16);
  const color = getStringSetting(settings.color, '#ffffff');
  const glowIntensity = getNumberSetting(settings.glowIntensity, 0.5, 0, 1);
  const pulseGlow = getBooleanSetting(settings.pulseGlow, false);
  const position = getStringSetting(settings.position, 'top');

  // Calculate position classes
  const positionClass = {
    top: 'top-20',
    center: 'top-1/2 -translate-y-1/2',
    bottom: 'bottom-20',
  }[position] || 'top-20';

  // Text shadow based on glow intensity
  const glowSize = 15 * glowIntensity;
  const maxAlpha = glowIntensity;
  const minAlpha = glowIntensity * 0.25;
  
  const textShadow = glowIntensity > 0 
    ? `0 5px ${glowSize}px rgba(255, 255, 255, ${glowIntensity})`
    : 'none';
    
  const pulseKeyframes = `
    @keyframes pulseGlow-${animationKey} {
      0%, 100% { text-shadow: 0 5px ${glowSize}px rgba(255, 255, 255, ${maxAlpha}); }
      50% { text-shadow: 0 5px ${glowSize * 0.8}px rgba(255, 255, 255, ${minAlpha}); }
    }
  `;

  // Track viewport width for responsive calculations
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Helper function to calculate animation parameters
  const calculateAnimationParams = (msg: string) => {
    // Estimate text width: each character is roughly fontSize * 0.6rem
    const charWidth = fontSize * 0.6 * 16; // Convert rem to px per character
    const textWidth = msg.length * charWidth;
    const travelDistance = viewportWidth + textWidth; // Start at right edge, exit when text width is fully off-screen
    
    // Calculate total duration based on time per character
    // Number of characters that need to cross: viewport width in chars + message length
    const viewportChars = viewportWidth / charWidth;
    const totalChars = viewportChars + msg.length;
    const animDuration = totalChars * charDuration; // Duration based on time per character
    
    const endPos = `-${textWidth}px`; // move left until the tail is off-screen
    return { endPos, animDuration, scrollDistance: travelDistance };
  };


  // Handle animation completion - supports repeatCount
  const handleAnimationEnd = () => {
    if (completedRef.current || !displayMessage) return;
    
    const nextRepeat = currentRepeat + 1;
    
    if (nextRepeat < repeatCount) {
      // More repeats needed - restart immediately
      setCurrentRepeat(nextRepeat);
      setAnimationKey(prev => prev + 1);
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
        onCompleteRef.current?.();
      }, 300);
    }
  };

  // Restart animation when repeat changes
  useEffect(() => {
    if (displayMessage && currentRepeat > 0) {
      setTimeout(() => setAnimationKey(prev => prev + 1), 0);
    }
  }, [currentRepeat, displayMessage]);

  // Reset state when new message is triggered
  useEffect(() => {
    if (message && messageTimestamp !== lastMessageTimestampRef.current) {
      // New message - reset everything
      lastMessageTimestampRef.current = messageTimestamp;
      completedRef.current = false;
      setTimeout(() => setCurrentRepeat(0), 0);
      // Clear any pending timeouts
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      // Immediately show the message
      setTimeout(() => setDisplayMessage(message), 0);
      
      // Safety timeout: ensure message is cleared even if animation doesn't complete
      const { animDuration } = calculateAnimationParams(message);
      const totalDuration = animDuration * repeatCount;
      safetyTimeoutRef.current = setTimeout(() => {
        if (!completedRef.current) {
          completedRef.current = true;
          setDisplayMessage(null);
          setCurrentRepeat(0);
          onCompleteRef.current?.();
        }
      }, (totalDuration * 1000) + 500); // Add 500ms buffer
      
      return () => {
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
      };
    }
  }, [message, messageTimestamp, charDuration, fontSize, repeatCount, viewportWidth]);

  // Calculate animation parameters for current state
  const { endPos, animDuration } = displayMessage 
    ? calculateAnimationParams(displayMessage) 
    : { endPos: '0px', animDuration: 0 };

  const animationName = `scrollHorizontal-${animationKey}`;

  return (
    <div 
      className={`fixed ${positionClass} left-0 w-full overflow-hidden pointer-events-none`}
      style={{ transform: `translateY(${verticalOffset}px)` }}
    >
      {displayMessage && (
        <>
          <style>{`
            @keyframes ${animationName} {
              from {
                transform: translate3d(${viewportWidth}px, 0, 0);
              }
              to {
                transform: translate3d(${endPos}, 0, 0);
              }
            }
            ${pulseGlow && glowIntensity > 0 ? pulseKeyframes : ''}
          `}</style>
          <div
            key={animationKey}
            className="whitespace-nowrap"
            style={{
              animation: `${animationName} ${animDuration}s linear forwards`,
              willChange: 'transform',
              backfaceVisibility: 'hidden',
            }}
            onAnimationEnd={handleAnimationEnd}
          >
            <span 
              ref={spanRef}
              className="font-black uppercase tracking-tighter"
              style={{ 
                fontSize: `${fontSize}rem`,
                color,
                textShadow: pulseGlow && glowIntensity > 0 ? undefined : textShadow,
                animation: pulseGlow && glowIntensity > 0 ? `pulseGlow-${animationKey} 2s ease-in-out infinite` : 'none',
              }}
            >
              {displayMessage}
            </span>
          </div>
        </>
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
