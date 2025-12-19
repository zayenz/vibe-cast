import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store';

export const Fireplace: React.FC = () => {
  const audioData = useStore((state) => state.audioData);
  
  // Calculate overall intensity from audio (using lower frequencies for fire)
  const intensity = useMemo(() => {
    return audioData.slice(0, 15).reduce((a, b) => a + b, 0) / 15;
  }, [audioData]);

  const flickerScale = 1 + intensity * 1.5;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center">
      {/* Background depth */}
      <div className="absolute inset-0 bg-linear-to-t from-orange-950/40 via-black to-black" />
      
      {/* Dynamic Floor Shadow */}
      <motion.div 
        animate={{
          opacity: 0.2 + intensity * 0.5
        }}
        className="absolute bottom-0 w-full h-1/3 bg-linear-to-t from-orange-900/30 to-transparent blur-3xl" 
      />
      
      <div className="relative w-160 h-160">
        {/* Core fire glow */}
        <motion.div 
          animate={{ 
            scale: flickerScale,
            opacity: 0.3 + intensity * 0.4,
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30
          }}
          className="absolute inset-0 bg-orange-600 rounded-full blur-[120px] mix-blend-screen" 
        />
        
        {/* Flames container */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-96 h-128 flex items-end justify-center gap-1 overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <FlamePart key={i} intensity={intensity} />
          ))}
        </div>

        {/* Embers */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-80 h-80 pointer-events-none">
          {[...Array(15)].map((_, i) => (
            <Ember key={i} />
          ))}
        </div>

        {/* Logs */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-120 h-24 flex items-center justify-center gap-0">
          <div className="w-64 h-12 bg-zinc-900 rounded-lg -rotate-6 translate-y-3 shadow-2xl border-t border-zinc-800" />
          <div className="w-64 h-14 bg-zinc-950 rounded-lg rotate-3 shadow-2xl border-t border-zinc-800" />
        </div>
      </div>
    </div>
  );
};

const FlamePart = ({ intensity }: { intensity: number }) => {
  return (
    <motion.div
      animate={{
        height: `${60 + intensity * 40 + Math.random() * 10}%`,
        x: (Math.random() - 0.5) * 15,
        opacity: 0.6 + Math.random() * 0.4,
      }}
      transition={{
        duration: 0.15,
        ease: "easeInOut"
      }}
      className="w-8 bg-linear-to-t from-red-600 via-orange-500 to-yellow-200 rounded-t-full blur-sm mix-blend-screen"
    />
  );
};

const Ember = () => {
  return (
    <motion.div
      initial={{ bottom: 0, opacity: 0, x: (Math.random() - 0.5) * 200 }}
      animate={{ 
        bottom: 400, 
        opacity: [0, 1, 0.8, 0],
        x: (Math.random() - 0.5) * 300
      }}
      transition={{
        duration: 2 + Math.random() * 2,
        repeat: Infinity,
        ease: "linear",
        delay: Math.random() * 5,
      }}
      className="absolute w-1 h-1 bg-orange-200 rounded-full blur-[1px]"
    />
  );
};
