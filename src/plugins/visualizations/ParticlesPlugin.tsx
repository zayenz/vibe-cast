/**
 * Particles Visualization Plugin
 * 
 * Audio-reactive particle system with flowing, colorful particles.
 * Creates a dynamic, energetic visualization.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';
import { getNumberSetting, getStringSetting, getBooleanSetting } from '../utils/settings';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'particleCount',
    label: 'Particle Count',
    min: 20,
    max: 200,
    step: 10,
    default: 80,
  },
  {
    type: 'range',
    id: 'particleSize',
    label: 'Particle Size',
    min: 1,
    max: 10,
    step: 0.5,
    default: 3,
  },
  {
    type: 'range',
    id: 'speed',
    label: 'Speed',
    min: 0.5,
    max: 3.0,
    step: 0.1,
    default: 1.5,
  },
  {
    type: 'color',
    id: 'particleColor',
    label: 'Particle Color',
    default: '#f59e0b', // amber-500
  },
  {
    type: 'boolean',
    id: 'colorful',
    label: 'Colorful Mode',
    default: true,
  },
  {
    type: 'range',
    id: 'spread',
    label: 'Spread',
    min: 0.5,
    max: 3.0,
    step: 0.1,
    default: 1.5,
  },
];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  seed: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function wrap(n: number, max: number): number {
  // Handles negative values too
  return ((n % max) + max) % max;
}

function mulberry32(seed: number): () => number {
  // Deterministic-ish PRNG for stable particle configs
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.trim().replace('#', '');
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
  if (full.length !== 6) return null;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// ============================================================================
// Component
// ============================================================================

const ParticlesVisualization: React.FC<VisualizationProps> = ({
  audioData,
  commonSettings,
  customSettings,
}) => {
  const { intensity, dim } = commonSettings;
  const particleCount = Math.round(getNumberSetting(customSettings.particleCount, 80, 20, 200));
  const particleSize = getNumberSetting(customSettings.particleSize, 3, 1, 10);
  const speed = getNumberSetting(customSettings.speed, 1.5, 0.5, 3.0);
  const particleColor = getStringSetting(customSettings.particleColor, '#f59e0b');
  const colorful = getBooleanSetting(customSettings.colorful, true);
  const spread = getNumberSetting(customSettings.spread, 1.5, 0.5, 3.0);

  // Calculate audio reactivity
  const audioIntensity = useMemo(() => {
    const avg = audioData.reduce((a, b) => a + b, 0) / audioData.length;
    return avg * intensity;
  }, [audioData, intensity]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spritesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const audioIntensityRef = useRef<number>(audioIntensity);
  const settingsRef = useRef({
    particleCount,
    particleSize,
    speed,
    particleColor,
    colorful,
    spread,
    dim,
  });

  useEffect(() => {
    audioIntensityRef.current = audioIntensity;
  }, [audioIntensity]);

  useEffect(() => {
    settingsRef.current = {
      particleCount,
      particleSize,
      speed,
      particleColor,
      colorful,
      spread,
      dim,
    };
  }, [particleCount, particleSize, speed, particleColor, colorful, spread, dim]);

  // Pre-render sprites
  useEffect(() => {
    // Create or get offscreen canvas
    if (!spritesCanvasRef.current) {
      spritesCanvasRef.current = document.createElement('canvas');
    }
    const canvas = spritesCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const spriteSize = 64; // Enough for max glow
    const half = spriteSize / 2;
    const radius = 16; // Base radius for the gradient

    if (colorful) {
      // 36 sprites for 360 degrees (10 deg steps)
      const steps = 36;
      canvas.width = spriteSize * steps;
      canvas.height = spriteSize;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < steps; i++) {
        const hue = i * 10;
        const x = i * spriteSize + half;
        const y = half;
        
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        // Using high alpha in sprite, controlled by globalAlpha during draw
        grad.addColorStop(0, `hsla(${hue}, 85%, 65%, 1)`);
        grad.addColorStop(1, `hsla(${hue}, 85%, 65%, 0)`);
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Single sprite
      canvas.width = spriteSize;
      canvas.height = spriteSize;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const rgb = hexToRgb(particleColor) ?? { r: 245, g: 158, b: 11 };
      const x = half;
      const y = half;
      
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
      grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [colorful, particleColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency in backbuffer if we fillRect
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const { width, height } = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(width * dpr));
      const h = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    };

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    const ensureParticles = (count: number) => {
      const current = particlesRef.current;
      if (current.length === count) return;

      // Seed from count to keep things stable-ish across rerenders/preset changes
      const rand = mulberry32(0xC0FFEE ^ count);
      const next: Particle[] = [];
      const w = canvas.width || 1;
      const h = canvas.height || 1;
      for (let i = 0; i < count; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const a = rand() * Math.PI * 2;
        const v = 10 + rand() * 30;
        next.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          hue: (i / Math.max(1, count)) * 360,
          seed: rand(),
        });
      }
      particlesRef.current = next;
    };

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dtRaw = (now - last) / 1000;
      last = now;
      const dt = clamp(dtRaw, 0, 0.033); // cap big jumps to keep sim stable

      const s = settingsRef.current;
      ensureParticles(s.particleCount);

      const w = canvas.width || 1;
      const h = canvas.height || 1;
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

      // Trails: fade to black with dim and speed.
      const trail = clamp(0.10 + (1 - s.dim) * 0.25 + (s.speed - 1) * 0.02, 0.08, 0.35);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(0, 0, 0, ${trail})`;
      ctx.fillRect(0, 0, w, h);

      // Use additive blending for glow
      ctx.globalCompositeOperation = 'lighter';

      const audio = clamp(audioIntensityRef.current, 0, 1);
      const baseSize = Math.max(1.5, s.particleSize) * dpr;
      
      // Calculate visual scale factor. 
      // Sprite is 64x64, drawn radius ~16px (half size).
      // We want drawn radius to be `size * (2.2 + audio * 1.8)`.
      // Target radius = baseSize * (1 + audio*2.25) * (2.2...)
      // Let's match previous visuals: 
      // previous glow radius = size * (2.2 + audio * 1.8) approx.
      // size = baseSize * (1 + audio * 2.25).
      // So target Radius ~= baseSize * 3 * 3 ~= 9 * baseSize.
      // Sprite source radius is 16.
      // Scale factor = Target Radius / 16.
      
      const particleScale = baseSize * (1 + audio * 2.25) / 16 * (s.colorful ? 2.2 : 2.0); // Tuning to match previous look
      
      const speedMul = s.speed * (0.75 + audio * 0.9);

      const fieldScale = (0.0012 / dpr) * (1.15 / Math.max(0.5, s.spread)); 
      const fieldStrength = (75 + s.spread * 90) * (0.65 + audio * 1.35);
      const drag = 0.985 - clamp((s.spread - 1.5) * 0.01, -0.02, 0.02);

      const sprites = spritesCanvasRef.current;
      const spriteSize = 64;
      const halfSprite = spriteSize / 2;
      const steps = 36; // Must match pre-render

      // Batch alpha changes if possible? No, alpha depends on audio (global) + s.dim (global) but per-particle alpha?
      // Previous: alpha = clamp(0.15 + audio * 0.55, ...) * s.dim.
      // This is global! Wait.
      // No, `audio` is global. `s.dim` is global.
      // So alpha IS global for all particles in this frame!
      // This is great. We can set globalAlpha ONCE.
      
      const baseAlpha = s.colorful 
        ? clamp(0.15 + audio * 0.55, 0.15, 0.75) * s.dim
        : clamp(0.12 + audio * 0.55, 0.12, 0.70) * s.dim;
        
      ctx.globalAlpha = baseAlpha;

      for (const p of particlesRef.current) {
        // Curl-ish flow
        const nx = p.x * fieldScale;
        const ny = p.y * fieldScale;
        const t = now * 0.00025;
        const a =
          Math.sin(nx * 6.0 + t * 2.1 + p.seed * 10) +
          Math.cos(ny * 5.0 - t * 1.7 + p.seed * 7) +
          Math.sin((nx + ny) * 3.0 + t * 1.3);
        const angle = a * Math.PI;
        const ax = Math.cos(angle) * fieldStrength;
        const ay = Math.sin(angle) * fieldStrength;

        p.vx = (p.vx + ax * dt) * drag;
        p.vy = (p.vy + ay * dt) * drag;
        p.x = wrap(p.x + p.vx * dt * speedMul, w);
        p.y = wrap(p.y + p.vy * dt * speedMul, h);

        // Draw
        if (sprites) {
          const drawSize = spriteSize * particleScale;
          const offset = drawSize / 2;
          
          let sx = 0;
          if (s.colorful) {
            // Determine sprite index based on hue + time
            const hue = (p.hue + now * 0.02) % 360;
            // Map 0-360 to 0-35
            const idx = Math.floor(hue / 10) % steps;
            sx = idx * spriteSize;
          }
          
          ctx.drawImage(sprites, sx, 0, spriteSize, spriteSize, p.x - offset, p.y - offset, drawSize, drawSize);
        }
      }
      
      ctx.globalAlpha = 1.0; // Reset
    };

    // Clear once
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const ParticlesPlugin: VisualizationPlugin = {
  id: 'particles',
  name: 'Particles',
  description: 'Audio-reactive particle system',
  icon: 'Music',
  settingsSchema,
  component: ParticlesVisualization,
};