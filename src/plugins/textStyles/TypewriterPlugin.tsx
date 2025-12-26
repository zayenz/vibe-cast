/**
 * Typewriter Text Style Plugin
 * 
 * Text appears character by character, like a typewriter.
 * Creates a retro, nostalgic feel.
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { TextStylePlugin, TextStyleProps, SettingDefinition } from '../types';
import { getNumberSetting, getStringSetting, getBooleanSetting } from '../utils/settings';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'typingSpeed',
    label: 'Typing Speed (ms per character)',
    min: 30,
    max: 200,
    step: 10,
    default: 80,
  },
  {
    type: 'range',
    id: 'holdDuration',
    label: 'Hold Duration (seconds)',
    min: 0,
    max: 5,
    step: 0.1,
    default: 1,
  },
  {
    type: 'range',
    id: 'fontSize',
    label: 'Font Size (rem)',
    min: 2,
    max: 12,
    step: 0.5,
    default: 4,
  },
  {
    type: 'color',
    id: 'color',
    label: 'Text Color',
    default: '#ffffff',
  },
  {
    type: 'color',
    id: 'cursorColor',
    label: 'Cursor Color',
    default: '#00ff00',
  },
  {
    type: 'boolean',
    id: 'showCursor',
    label: 'Show Cursor',
    default: true,
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

const TypewriterStyle: React.FC<TextStyleProps> = ({
  message,
  messageTimestamp,
  settings,
  verticalOffset = 0,
  repeatCount = 1,
  onComplete,
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const completedRef = useRef(false);
  // IMPORTANT: parent often passes a new function each render; don't let that restart typing.
  const onCompleteRef = useRef<TextStyleProps['onComplete']>(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const typingSpeed = getNumberSetting(settings.typingSpeed, 80, 30, 200);
  const holdDuration = getNumberSetting(settings.holdDuration, 1, 0, 5);
  const fontSize = getNumberSetting(settings.fontSize, 4, 2, 12);
  const color = getStringSetting(settings.color, '#ffffff');
  const cursorColor = getStringSetting(settings.cursorColor, '#00ff00');
  const showCursorSetting = getBooleanSetting(settings.showCursor, true);
  const position = getStringSetting(settings.position, 'center');

  // Calculate position classes
  const positionClass = {
    top: 'top-20',
    center: 'top-1/2 -translate-y-1/2',
    bottom: 'bottom-20',
  }[position] || 'top-1/2 -translate-y-1/2';

  useEffect(() => {
    if (!message) {
      setDisplayedText('');
      return;
    }

    completedRef.current = false;
    setDisplayedText('');

    let timeout: ReturnType<typeof setTimeout> | null = null;
    let currentRepeat = 0;

    const startTyping = () => {
      if (completedRef.current) return;
      let index = 0;
      const typeNext = () => {
        if (completedRef.current) return;
        if (index < message.length) {
          setDisplayedText(message.slice(0, index + 1));
          index += 1;
          timeout = setTimeout(typeNext, typingSpeed);
        } else {
          // Finished one pass, hold before next repeat or completion
          timeout = setTimeout(() => {
            if (completedRef.current) return;
            if (currentRepeat + 1 < repeatCount) {
              currentRepeat += 1;
              setDisplayedText('');
              startTyping();
            } else {
              completedRef.current = true;
              onCompleteRef.current?.();
            }
          }, holdDuration * 1000);
        }
      };
      typeNext();
    };

    // kick off typing
    startTyping();

    return () => {
      completedRef.current = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [message, messageTimestamp, typingSpeed, repeatCount, holdDuration]);

  if (!message) return null;

  return (
    <div 
      className={`fixed ${positionClass} left-0 w-full flex items-center justify-center pointer-events-none px-8`}
      style={{ transform: `translateY(${verticalOffset}px)` }}
    >
      <div className="text-center">
        <span
          className="font-mono"
          style={{
            fontSize: `${fontSize}rem`,
            color,
          }}
        >
          {displayedText}
          {showCursorSetting && (
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              style={{ color: cursorColor }}
            >
              |
            </motion.span>
          )}
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const TypewriterPlugin: TextStylePlugin = {
  id: 'typewriter',
  name: 'Typewriter',
  description: 'Text appears character by character',
  settingsSchema,
  component: TypewriterStyle,
};

