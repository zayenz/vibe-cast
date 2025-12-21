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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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

      // Trails: fade to black with dim and speed. Higher speed => slightly shorter trails.
      const trail = clamp(0.10 + (1 - s.dim) * 0.25 + (s.speed - 1) * 0.02, 0.08, 0.35);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(0, 0, 0, ${trail})`;
      ctx.fillRect(0, 0, w, h);

      // Use additive blending for glow
      ctx.globalCompositeOperation = 'lighter';

      const audio = clamp(audioIntensityRef.current, 0, 1);
      const baseSize = Math.max(1.5, s.particleSize) * dpr;
      const size = baseSize * (1 + audio * 2.25);
      const speedMul = s.speed * (0.75 + audio * 0.9);

      // Flow-field params: "spread" controls turbulence/field strength.
      const fieldScale = (0.0012 / dpr) * (1.15 / Math.max(0.5, s.spread)); // smaller scale => broader flows
      const fieldStrength = (75 + s.spread * 90) * (0.65 + audio * 1.35);
      const drag = 0.985 - clamp((s.spread - 1.5) * 0.01, -0.02, 0.02);

      const fixedRgb = hexToRgb(s.particleColor) ?? { r: 245, g: 158, b: 11 };

      for (const p of particlesRef.current) {
        // Curl-ish flow: rotate based on sin/cos field for swirling motion
        const nx = p.x * fieldScale;
        const ny = p.y * fieldScale;
        const t = now * 0.00025;
        const a =
          Math.sin(nx * 6.0 + t * 2.1 + p.seed * 10) +
          Math.cos(ny * 5.0 - t * 1.7 + p.seed * 7) +
          Math.sin((nx + ny) * 3.0 + t * 1.3);
        const angle = a * Math.PI; // ~[-pi, pi]
        const ax = Math.cos(angle) * fieldStrength;
        const ay = Math.sin(angle) * fieldStrength;

        // Integrate
        p.vx = (p.vx + ax * dt) * drag;
        p.vy = (p.vy + ay * dt) * drag;
        p.x = wrap(p.x + p.vx * dt * speedMul, w);
        p.y = wrap(p.y + p.vy * dt * speedMul, h);

        // Color
        let r = fixedRgb.r;
        let g = fixedRgb.g;
        let b = fixedRgb.b;
        if (s.colorful) {
          // hue cycling based on time + per-particle hue
          const hue = (p.hue + now * 0.02) % 360;
          // Cheap HSL->RGB approximation via canvas: set fillStyle to hsl and read back is expensive,
          // so we keep it as an hsl string for fillStyle directly.
          const alpha = clamp(0.15 + audio * 0.55, 0.15, 0.75) * s.dim;
          const glow = size * (2.2 + audio * 1.8);
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
          grad.addColorStop(0, `hsla(${hue}, 85%, 65%, ${alpha})`);
          grad.addColorStop(1, `hsla(${hue}, 85%, 65%, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const alpha = clamp(0.12 + audio * 0.55, 0.12, 0.70) * s.dim;
          const glow = size * (2.0 + audio * 1.7);
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
          grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
          ctx.fill();
        }
      }
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

