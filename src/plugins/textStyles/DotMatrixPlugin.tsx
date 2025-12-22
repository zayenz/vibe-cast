/**
 * Dot Matrix Text Style Plugin
 * 
 * Text appears on a dot matrix display, similar to a bus sign.
 * The matrix fades in, then text scrolls by lighting up dots to form letters.
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
    id: 'dotSize',
    label: 'Dot Size (px)',
    min: 4,
    max: 16,
    step: 1,
    default: 8,
  },
  {
    type: 'range',
    id: 'spacing',
    label: 'Dot Spacing (px)',
    min: 2,
    max: 8,
    step: 1,
    default: 4,
  },
  {
    type: 'range',
    id: 'dotDensity',
    label: 'Dot Density (for LED texture)',
    min: 0.6,
    max: 1.0,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'range',
    id: 'unlitOpacity',
    label: 'Unlit Dot Opacity',
    min: 0.0,
    max: 0.3,
    step: 0.01,
    default: 0.08,
  },
  {
    type: 'range',
    id: 'glow',
    label: 'Glow Strength',
    min: 0,
    max: 30,
    step: 1,
    default: 14,
  },
  {
    type: 'range',
    id: 'edgeFade',
    label: 'Edge Fade (px)',
    min: 0,
    max: 200,
    step: 10,
    default: 80,
  },
  {
    type: 'color',
    id: 'dotColor',
    label: 'Dot Color',
    default: '#00ff00',
  },
  {
    type: 'color',
    id: 'bgColor',
    label: 'Background Color',
    default: '#000000',
  },
  {
    type: 'range',
    id: 'fadeInDuration',
    label: 'Fade In Duration (seconds)',
    min: 0.5,
    max: 3.0,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'range',
    id: 'scrollSpeed',
    label: 'Scroll Speed (characters per second)',
    min: 1,
    max: 10,
    step: 0.5,
    default: 3,
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
// Helper: Simple 5x7 font for dot matrix
// ============================================================================

const DOT_MATRIX_FONT: Record<string, number[][]> = {
  ' ': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
  'A': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'B': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0]],
  'C': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,1],[0,1,1,1,0]],
  'D': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0]],
  'E': [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  'F': [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
  'G': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[1,0,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'H': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'I': [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[1,1,1,1,1]],
  'J': [[0,0,0,0,1],[0,0,0,0,1],[0,0,0,0,1],[0,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'K': [[1,0,0,0,1],[1,0,0,1,0],[1,0,1,0,0],[1,1,0,0,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1]],
  'L': [[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  'M': [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'N': [[1,0,0,0,1],[1,1,0,0,1],[1,0,1,0,1],[1,0,0,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'O': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'P': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
  'Q': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,0,1,1],[0,1,1,1,1]],
  'R': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1]],
  'S': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[0,1,1,1,0],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'T': [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  'U': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'V': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,1,0,1,0],[0,0,1,0,0]],
  'W': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,1,0,1,1],[1,0,0,0,1]],
  'X': [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1]],
  'Y': [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  'Z': [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  '0': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,1,1],[1,0,1,0,1],[1,1,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '1': [[0,0,1,0,0],[0,1,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,1,1,0]],
  '2': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,1,1,0],[0,1,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  '3': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,1,1,1,0],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '4': [[0,0,0,1,0],[0,0,1,1,0],[0,1,0,1,0],[1,0,0,1,0],[1,1,1,1,1],[0,0,0,1,0],[0,0,0,1,0]],
  '5': [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '6': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '7': [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
  '8': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '9': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,1],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '!': [[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,1,0,0]],
  '?': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,1,1,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,1,0,0]],
  '.': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,1,0,0]],
  ',': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,1,0,0],[0,1,0,0,0]],
  ':': [[0,0,0,0,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,1,0,0],[0,0,0,0,0]],
  '-': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
};

function getCharMatrix(char: string): number[][] {
  return DOT_MATRIX_FONT[char.toUpperCase()] || DOT_MATRIX_FONT[' '];
}

// ============================================================================
// Component
// ============================================================================

const DotMatrixStyle: React.FC<TextStyleProps> = ({
  message,
  messageTimestamp,
  settings,
  verticalOffset = 0,
  onComplete,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [displayedChars, setDisplayedChars] = useState<number>(0);
  const [scrollPosition, setScrollPosition] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const dotSize = getNumberSetting(settings.dotSize, 8, 4, 16);
  const spacing = getNumberSetting(settings.spacing, 4, 2, 8);
  const dotDensity = getNumberSetting(settings.dotDensity, 0.7, 0.3, 1.0);
  const unlitOpacity = getNumberSetting(settings.unlitOpacity, 0.08, 0.0, 0.3);
  const glow = getNumberSetting(settings.glow, 14, 0, 30);
  const edgeFade = getNumberSetting(settings.edgeFade, 80, 0, 200);
  const dotColor = getStringSetting(settings.dotColor, '#00ff00');
  const bgColor = getStringSetting(settings.bgColor, '#000000');
  const fadeInDuration = getNumberSetting(settings.fadeInDuration, 1.0, 0.5, 3.0);
  const scrollSpeed = getNumberSetting(settings.scrollSpeed, 3, 1, 10);
  const position = getStringSetting(settings.position, 'top');

  const positionClass = {
    top: 'top-20',
    center: 'top-1/2 -translate-y-1/2',
    bottom: 'bottom-20',
  }[position] || 'top-1/2 -translate-y-1/2';

  const charWidth = 5 * (dotSize + spacing) + spacing;
  const charHeight = 7 * (dotSize + spacing) + spacing;
  const totalHeight = charHeight;
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 0
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleComplete = () => {
    if (!completedRef.current) {
      completedRef.current = true;
      setIsVisible(false);
      setDisplayedChars(0);
      setScrollPosition(0);
      onComplete?.();
    }
  };

  // Fade in animation
  useEffect(() => {
    if (message) {
      completedRef.current = false;
      setIsVisible(true);
      setDisplayedChars(0);
      setScrollPosition(0);
    }
  }, [message, messageTimestamp]);

  // Scroll animation
  useEffect(() => {
    if (!isVisible || !message) return;

    const startTime = Date.now();
    const charsPerSecond = scrollSpeed;
    const pixelsPerChar = charWidth;
    // Scroll from off-screen right to off-screen left
    const totalScrollDistance = viewportWidth + message.length * charWidth;

    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const charsToShow = Math.min(Math.floor(elapsed * charsPerSecond) + 1, message.length);
      const scrollPx = Math.min(elapsed * charsPerSecond * pixelsPerChar, totalScrollDistance);

      setDisplayedChars(charsToShow);
      setScrollPosition(scrollPx);

      if (scrollPx >= totalScrollDistance) {
        handleComplete();
        return;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isVisible, message, scrollSpeed, charWidth, viewportWidth]);

  // Render dots on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isVisible) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw only the visible viewport to avoid huge canvases + centering issues.
    canvas.width = Math.max(1, viewportWidth);
    canvas.height = totalHeight;

    // Clear with background color
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gridStep = dotSize + spacing;
    const cols = Math.ceil(canvas.width / gridStep);

    // Deterministic "density" mask (stable across frames; avoids flicker).
    const shouldDrawDot = (i: number, row: number, col: number) => {
      // simple hash → [0,1)
      const h = ((i + 1) * 73856093) ^ ((row + 1) * 19349663) ^ ((col + 1) * 83492791);
      const v = Math.abs(h % 1000) / 1000;
      return v <= dotDensity;
    };

    // Draw faint unlit dot grid (looks like an LED panel even before text hits)
    if (unlitOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = unlitOpacity;
      ctx.fillStyle = dotColor;
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * gridStep + spacing;
          const y = row * gridStep + spacing;
          // tiny texture variation
          if (!shouldDrawDot(-999, row, col)) continue;
          ctx.beginPath();
          ctx.arc(x + dotSize / 2, y + dotSize / 2, dotSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Deterministic "density" mask (stable across frames; avoids flicker).
    // Draw characters: start off-screen right and move left
    const startX = viewportWidth - scrollPosition;

    for (let i = 0; i < message.length; i++) {
      const char = message[i];
      const matrix = getCharMatrix(char);
      const charX = startX + i * charWidth;

      // Only draw if character is visible on screen
      if (charX + charWidth > 0 && charX < viewportWidth) {
        // Draw dots for this character
        for (let row = 0; row < 7; row++) {
          for (let col = 0; col < 5; col++) {
            if (matrix[row] && matrix[row][col] === 1) {
              // Apply density - deterministically skip some dots
              if (!shouldDrawDot(i, row, col)) continue;

              const x = charX + col * (dotSize + spacing) + spacing;
              const y = row * (dotSize + spacing) + spacing;

              // Only draw if character should be displayed
              if (i < displayedChars) {
                // Glow + bright core to mimic LEDs
                ctx.save();
                ctx.shadowColor = dotColor;
                ctx.shadowBlur = glow;

                const r = dotSize / 2;
                const cx = x + r;
                const cy = y + r;
                const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                g.addColorStop(0, '#ffffff');
                g.addColorStop(0.25, dotColor);
                g.addColorStop(1, dotColor);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
              }
            }
          }
        }
      }
    }

    // Soft edge fade (makes the banner feel nicer, avoids hard cutoffs)
    if (edgeFade > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      const fade = Math.min(edgeFade, canvas.width / 2);
      const mask = ctx.createLinearGradient(0, 0, canvas.width, 0);
      mask.addColorStop(0, 'rgba(0,0,0,0)');
      mask.addColorStop(fade / canvas.width, 'rgba(0,0,0,1)');
      mask.addColorStop(1 - fade / canvas.width, 'rgba(0,0,0,1)');
      mask.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  }, [isVisible, message, scrollPosition, displayedChars, dotSize, spacing, dotColor, bgColor, dotDensity, unlitOpacity, glow, edgeFade, charWidth, totalHeight, viewportWidth]);

  if (!message || !isVisible) return null;

  return (
    <div 
      className={`fixed ${positionClass} left-0 w-full flex items-center justify-center pointer-events-none overflow-hidden`}
      style={{ transform: `translateY(${verticalOffset}px)` }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: fadeInDuration }}
        className="relative"
      >
        <canvas
          ref={canvasRef}
          className="block"
          style={{ height: `${totalHeight}px` }}
        />
      </motion.div>
    </div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const DotMatrixPlugin: TextStylePlugin = {
  id: 'dot-matrix',
  name: 'Dot Matrix',
  description: 'Bus sign style dot matrix display',
  settingsSchema,
  component: DotMatrixStyle,
};

