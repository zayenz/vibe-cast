/**
 * Legacy Marquee Component
 * 
 * This component is kept for backward compatibility.
 * New code should use the TextStyleRenderer in VisualizerWindow instead.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';

export const Marquee: React.FC = () => {
  const activeMessage = useStore((state) => state.activeMessage);
  const messageTimestamp = useStore((state) => state.messageTimestamp);
  const [displayMessage, setDisplayMessage] = useState<string | null>(null);

  useEffect(() => {
    if (activeMessage) {
      // Force a reset if the same message is triggered again
      const resetTimer = setTimeout(() => setDisplayMessage(null), 0);
      
      // Small delay to allow AnimatePresence to see the null state
      const nextTick = setTimeout(() => {
        // Handle both new MessageConfig format and legacy string format
        const text = typeof activeMessage === 'string' ? activeMessage : activeMessage.text;
        setDisplayMessage(text);
      }, 50);

      const timer = setTimeout(() => {
        setDisplayMessage(null);
      }, 10050); // Show for 10 seconds + delay
      
      return () => {
        clearTimeout(resetTimer);
        clearTimeout(nextTick);
        clearTimeout(timer);
      };
    }
  }, [activeMessage, messageTimestamp]);

  return (
    <div className="fixed top-20 left-0 w-full overflow-hidden pointer-events-none z-50">
      <AnimatePresence>
        {displayMessage && (
          <motion.div
            key={messageTimestamp}
            initial={{ x: '100%' }}
            animate={{ x: '-100%' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 10, ease: "linear" }}
            className="whitespace-nowrap"
          >
            <span className="text-8xl font-black text-white uppercase tracking-tighter drop-shadow-[0_5px_15px_rgba(255,255,255,0.5)]">
              {displayMessage}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
