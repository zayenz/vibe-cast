/**
 * Credits Text Style Plugin
 * 
 * Large text that scrolls vertically from bottom to top, similar to movie credits.
 * Visual style similar to ScrollingCapitals but not uppercase by default.
 * Uses GPU-accelerated CSS animations for smooth 60fps performance.
 */

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { TextStylePlugin, TextStyleProps, SettingDefinition } from '../types';
import { getNumberSetting, getStringSetting } from '../utils/settings';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'scrollSpeed',
    label: 'Scroll Speed (px/s)',
    min: 50,
    max: 500,
    step: 10,
    default: 100,
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
    type: 'range',
    id: 'lineSpacing',
    label: 'Line Spacing',
    min: 1.0,
    max: 3.0,
    step: 0.1,
    default: 1.5,
  },
  {
    type: 'select',
    id: 'align',
    label: 'Alignment',
    options: [
      { value: 'center', label: 'Center' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ],
    default: 'center',
  },
];

// ============================================================================
// Component
// ============================================================================

const CreditsStyle: React.FC<TextStyleProps> = ({
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
  const [viewportHeight, setViewportHeight] = useState<number>(() => 
    typeof window !== 'undefined' ? window.innerHeight : 1080
  );
  const [animationKey, setAnimationKey] = useState(0);
  const completedRef = useRef(false);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageTimestampRef = useRef<number>(0);
  const lastMessageRef = useRef<string>('');
  const onCompleteRef = useRef(onComplete);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const scrollSpeed = getNumberSetting(settings.scrollSpeed, 100, 50, 500);
  const fontSize = getNumberSetting(settings.fontSize, 8, 4, 16);
  const color = getStringSetting(settings.color, '#ffffff');
  const glowIntensity = getNumberSetting(settings.glowIntensity, 0.5, 0, 1);
  const lineSpacing = getNumberSetting(settings.lineSpacing, 1.5, 1.0, 3.0);
  const align = getStringSetting(settings.align, 'center');

  // Text shadow based on glow intensity
  const glowSize = 15 * glowIntensity;
  const textShadow = glowIntensity > 0 
    ? `0 5px ${glowSize}px rgba(255, 255, 255, ${glowIntensity})`
    : 'none';

  // Track viewport height for responsive calculations
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const fontSizePx = fontSize * 16; // Convert rem to px
  const lineHeightPx = fontSizePx;
  const spacingPx = fontSizePx * lineSpacing;

  const alignment = (align === 'left' || align === 'right' || align === 'center') ? align : 'center';
  const textAlign: 'left' | 'center' | 'right' = alignment;

  const ensureCanvas = (): CanvasRenderingContext2D | null => {
    if (typeof document === 'undefined') return null;
    if (!measureCanvasRef.current) {
      measureCanvasRef.current = document.createElement('canvas');
    }
    return measureCanvasRef.current.getContext('2d');
  };

  const wrapLine = (ctx: CanvasRenderingContext2D, line: string, maxWidthPx: number): string[] => {
    // Preserve blank lines as actual vertical spacing
    if (line.length === 0) return [''];

    // Fast path: fits as-is
    if (ctx.measureText(line).width <= maxWidthPx) return [line];

    // Word-wrap with fallback to char-wrap for long tokens
    const out: string[] = [];
    const tokens = line.split(/(\s+)/); // keep whitespace tokens
    let current = '';

    const pushCurrent = () => {
      out.push(current);
      current = '';
    };

    for (const token of tokens) {
      const next = current + token;
      if (current.length === 0) {
        current = token;
        continue;
      }
      if (ctx.measureText(next).width <= maxWidthPx) {
        current = next;
        continue;
      }

      // token would overflow; push current and try to place token
      pushCurrent();

      // If token itself is too wide, break it by chars
      if (ctx.measureText(token).width > maxWidthPx) {
        let chunk = '';
        for (const ch of token) {
          const cand = chunk + ch;
          if (chunk.length > 0 && ctx.measureText(cand).width > maxWidthPx) {
            out.push(chunk);
            chunk = ch;
          } else {
            chunk = cand;
          }
        }
        current = chunk;
      } else {
        current = token;
      }
    }

    if (current.length > 0) out.push(current);
    return out;
  };

  const wrappedLines = useMemo(() => {
    const rawLines = displayMessage ? displayMessage.split('\n') : [];
    if (rawLines.length === 0) return [] as string[];

    const ctx = ensureCanvas();
    if (!ctx) return rawLines;

    // Approximate font used by the credits lines (font-black)
    ctx.font = `900 ${fontSizePx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`;

    const maxWidthPx = Math.max(200, viewportWidth * 0.9);
    const out: string[] = [];
    rawLines.forEach((line) => {
      out.push(...wrapLine(ctx, line, maxWidthPx));
    });
    return out;
  }, [displayMessage, fontSizePx, viewportWidth]);

  // Calculate total text height in pixels
  const calculateTextHeight = (lineCount: number): number => {
    if (lineCount === 0) return 0;
    const lineHeight = lineHeightPx;
    const spacing = spacingPx;
    // Total height = (lineCount * lineHeight) + (spacing * (lineCount - 1))
    return (lineCount * lineHeight) + (spacing * (lineCount - 1));
  };

  // Calculate animation parameters
  const calculateAnimationParams = (lineCount: number) => {
    const totalTextHeight = calculateTextHeight(lineCount);
    const travelDistance = viewportHeight + totalTextHeight; // Start below, exit above
    const animDuration = travelDistance / scrollSpeed; // Duration based on scroll speed
    
    const startPos = viewportHeight + totalTextHeight; // Start below viewport
    const endPos = -totalTextHeight; // End above viewport
    
    return { startPos, endPos, animDuration, totalTextHeight };
  };

  // Handle animation completion
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
      // Call onComplete after a brief delay
      setTimeout(() => {
        onCompleteRef.current?.();
      }, 300);
    }
  };

  // Restart animation when repeat changes
  useEffect(() => {
    if (displayMessage && currentRepeat > 0) {
      setAnimationKey(prev => prev + 1);
    }
  }, [currentRepeat, displayMessage]);

  // Reset state when new message is triggered
  useEffect(() => {
    // IMPORTANT: file-backed messages can update `message` content without changing `messageTimestamp`.
    // Treat a content change as a "new message" so credits refreshes from the loaded file text.
    if (message && (messageTimestamp !== lastMessageTimestampRef.current || message !== lastMessageRef.current)) {
      // New message - reset everything
      lastMessageTimestampRef.current = messageTimestamp;
      lastMessageRef.current = message;
      completedRef.current = false;
      setCurrentRepeat(0);
      // Clear any pending timeouts
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      // Set the message
      setDisplayMessage(message);
      
      // Safety timeout: ensure message is cleared even if animation doesn't complete
      const rawLineCount = message.split('\n').length;
      const lineCount = Math.max(1, rawLineCount);
      const { animDuration } = calculateAnimationParams(lineCount);
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
  }, [message, messageTimestamp, repeatCount, viewportHeight, viewportWidth, fontSize, lineSpacing, scrollSpeed]);

  // Calculate animation parameters for current state
  const { startPos, endPos, animDuration } = wrappedLines.length > 0 
    ? calculateAnimationParams(wrappedLines.length) 
    : { startPos: 0, endPos: 0, animDuration: 0 };

  const animationName = `creditsScroll-${animationKey}`;

  return (
    <div 
      className="fixed left-0 w-full overflow-hidden pointer-events-none"
      style={{ 
        top: 0,
        height: '100vh',
        transform: `translateY(${verticalOffset}px)` 
      }}
    >
      {displayMessage && wrappedLines.length > 0 && (
        <>
          <style>{`
            @keyframes ${animationName} {
              from {
                transform: translate3d(0, ${startPos}px, 0);
              }
              to {
                transform: translate3d(0, ${endPos}px, 0);
              }
            }
          `}</style>
          <div
            key={animationKey}
            className="flex flex-col justify-center"
            style={{
              animation: `${animationName} ${animDuration}s linear forwards`,
              willChange: 'transform',
              backfaceVisibility: 'hidden',
              width: '100%',
              maxWidth: '90vw',
              margin: '0 auto',
              textAlign,
            }}
            onAnimationEnd={handleAnimationEnd}
          >
            {wrappedLines.map((line, index) => (
              <div
                key={index}
                className="font-black"
                style={{
                  fontSize: `${fontSize}rem`,
                  color,
                  textShadow,
                  lineHeight: `${lineHeightPx}px`,
                  marginBottom: index < wrappedLines.length - 1 ? `${spacingPx}px` : 0,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                }}
              >
                {line.length === 0 ? '\u00A0' : line}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const CreditsPlugin: TextStylePlugin = {
  id: 'credits',
  name: 'Credits',
  description: 'Text scrolling vertically from bottom to top, like movie credits',
  settingsSchema,
  component: CreditsStyle,
};

