/**
 * Mushrooms Visualization Plugin (Raymarch)
 *
 * Realistic-but-trippy, demoscene-evolving mushroom forest rendered via a GPU raymarcher.
 * - Fullscreen SDF raymarch in fragment shader (mushrooms/ground/trees/fog)
 * - Timeline-driven section evolution (camera + palette + density)
 * - Optional temporal feedback pass for demoscene-style trails
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';
import { getBooleanSetting, getNumberSetting, getStringSetting } from '../utils/settings';
import { fullscreenVertexShader, raymarchFragmentShader } from './mushrooms/raymarch.glsl';
import { feedbackFragmentShader, feedbackVertexShader } from './mushrooms/feedback.glsl';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    // Back-compat: keep id mushroomCount but repurpose as "World Density"
    type: 'range',
    id: 'mushroomCount',
    label: 'World Density',
    min: 5,
    max: 80,
    step: 1,
    default: 28,
  },
  {
    type: 'range',
    id: 'evolutionSpeed',
    label: 'Evolution Speed',
    min: 0.1,
    max: 3.0,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'range',
    id: 'mushroomScale',
    label: 'Scale',
    min: 0.5,
    max: 2.0,
    step: 0.1,
    default: 1.1,
  },
  {
    type: 'select',
    id: 'colorStyle',
    label: 'Style',
    options: [
      { value: 'deep-dream', label: 'Deep Dream' },
      { value: 'aurora', label: 'Aurora' },
      { value: 'neon', label: 'Neon' },
      { value: 'forest', label: 'Forest' },
      { value: 'psychedelic', label: 'Psychedelic' },
      { value: 'rainbow', label: 'Rainbow' },
    ],
    default: 'deep-dream',
  },
  {
    type: 'range',
    id: 'colorIntensity',
    label: 'Color Intensity',
    min: 0.5,
    max: 2.0,
    step: 0.1,
    default: 1.25,
  },
  {
    type: 'range',
    id: 'seed',
    label: 'Seed',
    min: 0,
    max: 100,
    step: 1,
    default: 13,
  },
  {
    type: 'boolean',
    id: 'showGround',
    label: 'Show Ground',
    default: true,
  },
  {
    type: 'boolean',
    id: 'showFog',
    label: 'Show Fog',
    default: true,
  },
  {
    type: 'range',
    id: 'fogDensity',
    label: 'Fog Amount',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.65,
  },
  {
    type: 'select',
    id: 'quality',
    label: 'Quality',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ],
    default: 'medium',
  },
  {
    type: 'range',
    id: 'sectionLength',
    label: 'Section Length',
    min: 8,
    max: 60,
    step: 1,
    default: 28,
  },
  {
    type: 'range',
    id: 'warp',
    label: 'Space Warp',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.55,
  },
  {
    type: 'range',
    id: 'glow',
    label: 'Biolume Glow',
    min: 0,
    max: 2,
    step: 0.05,
    default: 1.15,
  },
  {
    type: 'range',
    id: 'focus',
    label: 'Soft Focus',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.25,
  },
  {
    type: 'range',
    id: 'treeDensity',
    label: 'Tree Density',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.75,
  },
  {
    type: 'range',
    id: 'feedbackAmount',
    label: 'Feedback Trails',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.25,
  },
  {
    type: 'range',
    id: 'feedbackWarp',
    label: 'Feedback Warp',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.15,
  },
];

// ============================================================================
// Raymarch + feedback pipeline
// ============================================================================

function qualityToInt(q: string): number {
  if (q === 'low') return 0;
  if (q === 'medium') return 1;
  return 2;
}

function qualityToRenderScale(q: string): number {
  // Offscreen render scale to control GPU load.
  // Low/Medium render smaller RTs and upscale in blit.
  if (q === 'low') return 0.65;
  if (q === 'medium') return 0.78;
  return 0.9;
}

function styleToOffset(style: string): number {
  // Matches the order in settings: deep-dream, aurora, neon, forest, psychedelic, rainbow
  // Shader cycle is 5 palettes; we map “rainbow” into 4 (last) to keep it in the loop.
  switch (style) {
    case 'aurora':
      return 1;
    case 'neon':
      return 2;
    case 'forest':
      return 3;
    case 'psychedelic':
      return 4;
    case 'rainbow':
      return 4;
    case 'deep-dream':
    default:
      return 0;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function computeAudioScalar(audioData: number[], intensity: number): number {
  // Stable-ish mid-band average (avoid allocations, no heavy smoothing here — intensity already exists).
  if (!audioData || audioData.length === 0) return 0;
  const len = audioData.length;
  const start = Math.min(6, len - 1);
  const end = Math.min(48, len);
  const n = Math.max(1, end - start);
  let acc = 0;
  for (let i = start; i < end; i++) acc += audioData[i] || 0;
  return clamp01((acc / n) * intensity);
}

function createRT(w: number, h: number): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
  });
  rt.texture.generateMipmaps = false;
  return rt;
}

const RaymarchPipeline: React.FC<{
  audioData: number[];
  intensity: number;
  dim: number;
  evolutionSpeed: number;
  scale: number;
  style: string;
  colorIntensity: number;
  seed: number;
  quality: string;
  sectionLength: number;
  fogAmount: number;
  glow: number;
  warp: number;
  focus: number;
  userDensity: number;
  treeDensity: number;
  showGround: boolean;
  feedbackAmount: number;
  feedbackWarp: number;
}> = ({
  audioData,
  intensity,
  dim,
  evolutionSpeed,
  scale,
  style,
  colorIntensity,
  seed,
  quality,
  sectionLength,
  fogAmount,
  glow,
  warp,
  focus,
  userDensity,
  treeDensity,
  showGround,
  feedbackAmount,
  feedbackWarp,
}) => {
  const { gl, size } = useThree();

  // Take over rendering (priority 1 disables R3F default render).
  const cam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const quadGeo = useMemo(() => new THREE.PlaneGeometry(2, 2), []);

  const rayScene = useMemo(() => new THREE.Scene(), []);
  const fbScene = useMemo(() => new THREE.Scene(), []);
  const blitScene = useMemo(() => new THREE.Scene(), []);

  const rayMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: fullscreenVertexShader,
      fragmentShader: raymarchFragmentShader,
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uAudio: { value: 0 },
        uQuality: { value: 2 },
        uSectionLength: { value: 28 },
        uSeed: { value: 13 },
        uUserDensity: { value: 0.65 },
        uTreeDensity: { value: 0.75 },
        uScale: { value: 1.1 },
        uStyleOffset: { value: 0 },
        uColorIntensity: { value: 1.25 },
        uFogAmount: { value: 0.65 },
        uGlow: { value: 1.15 },
        uWarp: { value: 0.55 },
        uFocus: { value: 0.25 },
        uShowGround: { value: 1.0 },
        uDebug: { value: 0.0 },
      },
      depthWrite: false,
      depthTest: false,
    });
  }, []);

  const fbMat = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: feedbackVertexShader,
      fragmentShader: feedbackFragmentShader,
      uniforms: {
        uCurrent: { value: null },
        uPrev: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uAudio: { value: 0 },
        uAmount: { value: 0.55 },
        uWarp: { value: 0.35 },
      },
      depthWrite: false,
      depthTest: false,
    });
  }, []);

  const blitMat = useMemo(() => new THREE.MeshBasicMaterial({ map: null }), []);

  const rayMesh = useMemo(() => new THREE.Mesh(quadGeo, rayMat), [quadGeo, rayMat]);
  const fbMesh = useMemo(() => new THREE.Mesh(quadGeo, fbMat), [quadGeo, fbMat]);
  const blitMesh = useMemo(() => new THREE.Mesh(quadGeo, blitMat), [quadGeo, blitMat]);

  const rtCurrentRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const rtPrevRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const rtNextRef = useRef<THREE.WebGLRenderTarget | null>(null);

  useEffect(() => {
    rayScene.add(rayMesh);
    fbScene.add(fbMesh);
    blitScene.add(blitMesh);
    return () => {
      rayScene.remove(rayMesh);
      fbScene.remove(fbMesh);
      blitScene.remove(blitMesh);
    };
  }, [rayScene, fbScene, blitScene, rayMesh, fbMesh, blitMesh]);

  useEffect(() => {
    return () => {
      quadGeo.dispose();
      rayMat.dispose();
      fbMat.dispose();
      blitMat.dispose();
      rtCurrentRef.current?.dispose();
      rtPrevRef.current?.dispose();
      rtNextRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render target sizing (cap DPR for long-run stability).
  const dpr = useMemo(() => (typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 1.0)), []);
  const renderScale = useMemo(() => qualityToRenderScale(quality), [quality]);
  const rtW = Math.max(1, Math.floor(size.width * dpr * renderScale));
  const rtH = Math.max(1, Math.floor(size.height * dpr * renderScale));

  useEffect(() => {
    // Recreate RTs on resize
    rtCurrentRef.current?.dispose();
    rtPrevRef.current?.dispose();
    rtNextRef.current?.dispose();
    rtCurrentRef.current = createRT(rtW, rtH);
    rtPrevRef.current = createRT(rtW, rtH);
    rtNextRef.current = createRT(rtW, rtH);
    (rayMat.uniforms.uResolution as THREE.IUniform<THREE.Vector2>).value.set(rtW, rtH);
    (fbMat.uniforms.uResolution as THREE.IUniform<THREE.Vector2>).value.set(rtW, rtH);
    // Clear prev so feedback starts clean
    gl.setRenderTarget(rtPrevRef.current);
    gl.setClearColor(0x000000, 1);
    gl.clear(true, true, true);
    gl.setRenderTarget(null);
  }, [rtW, rtH, gl, rayMat, fbMat]);

  const [webglLost, setWebglLost] = useState(false);
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (e: Event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e as any).preventDefault?.();
      setWebglLost(true);
    };
    const onRestored = () => setWebglLost(false);
    canvas.addEventListener('webglcontextlost', onLost as EventListener, false);
    canvas.addEventListener('webglcontextrestored', onRestored as EventListener, false);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', onRestored as EventListener);
    };
  }, [gl]);

  useFrame((state) => {
    if (webglLost) return;
    const rtCurrent = rtCurrentRef.current;
    const rtPrev = rtPrevRef.current;
    const rtNext = rtNextRef.current;
    if (!rtCurrent || !rtPrev || !rtNext) return;

    const t = state.clock.getElapsedTime() * Math.max(0.1, evolutionSpeed);
    const audio = computeAudioScalar(audioData, intensity);

    // Update raymarch uniforms
    (rayMat.uniforms.uTime as THREE.IUniform<number>).value = t;
    (rayMat.uniforms.uAudio as THREE.IUniform<number>).value = audio;
    (rayMat.uniforms.uQuality as THREE.IUniform<number>).value = qualityToInt(quality);
    (rayMat.uniforms.uSectionLength as THREE.IUniform<number>).value = Math.max(6, sectionLength);
    (rayMat.uniforms.uSeed as THREE.IUniform<number>).value = seed;
    (rayMat.uniforms.uScale as THREE.IUniform<number>).value = Math.max(0.5, scale);
    (rayMat.uniforms.uStyleOffset as THREE.IUniform<number>).value = styleToOffset(style);
    (rayMat.uniforms.uColorIntensity as THREE.IUniform<number>).value = colorIntensity;
    (rayMat.uniforms.uFogAmount as THREE.IUniform<number>).value = clamp01(fogAmount);
    (rayMat.uniforms.uGlow as THREE.IUniform<number>).value = Math.max(0, glow);
    (rayMat.uniforms.uWarp as THREE.IUniform<number>).value = clamp01(warp);
    (rayMat.uniforms.uFocus as THREE.IUniform<number>).value = clamp01(focus);
    (rayMat.uniforms.uUserDensity as THREE.IUniform<number>).value = clamp01(userDensity);
    (rayMat.uniforms.uTreeDensity as THREE.IUniform<number>).value = clamp01(treeDensity);
    (rayMat.uniforms.uShowGround as THREE.IUniform<number>).value = showGround ? 1.0 : 0.0;

    // Render raymarch to rtCurrent
    gl.setRenderTarget(rtCurrent);
    gl.clear(true, true, true);
    gl.render(rayScene, cam);

    const fbAmt = clamp01(feedbackAmount);
    if (fbAmt > 0.001) {
      // Feedback to rtNext
      (fbMat.uniforms.uCurrent as THREE.IUniform<THREE.Texture | null>).value = rtCurrent.texture;
      (fbMat.uniforms.uPrev as THREE.IUniform<THREE.Texture | null>).value = rtPrev.texture;
      (fbMat.uniforms.uTime as THREE.IUniform<number>).value = t;
      (fbMat.uniforms.uAudio as THREE.IUniform<number>).value = audio;
      (fbMat.uniforms.uAmount as THREE.IUniform<number>).value = fbAmt;
      (fbMat.uniforms.uWarp as THREE.IUniform<number>).value = clamp01(feedbackWarp);

      gl.setRenderTarget(rtNext);
      gl.clear(true, true, true);
      gl.render(fbScene, cam);

      // Blit to screen
      blitMat.map = rtNext.texture;
      blitMat.opacity = dim;
      blitMat.transparent = dim < 1;
      gl.setRenderTarget(null);
      gl.render(blitScene, cam);

      // Swap prev/next
      rtPrevRef.current = rtNext;
      rtNextRef.current = rtPrev;
    } else {
      // No feedback: blit current
      blitMat.map = rtCurrent.texture;
      blitMat.opacity = dim;
      blitMat.transparent = dim < 1;
      gl.setRenderTarget(null);
      gl.render(blitScene, cam);
    }
  }, 1000);

  return null;
};

// ============================================================================
// Main Component
// ============================================================================

const MushroomsVisualization: React.FC<VisualizationProps> = ({
  audioData,
  commonSettings,
  customSettings,
}) => {
  const { intensity, dim } = commonSettings;
  const worldDensitySetting = Math.round(getNumberSetting(customSettings.mushroomCount, 28, 5, 80));
  const evolutionSpeed = getNumberSetting(customSettings.evolutionSpeed, 1.0, 0.1, 3.0);
  const scale = getNumberSetting(customSettings.mushroomScale, 1.1, 0.5, 2.0);
  const style = getStringSetting(customSettings.colorStyle, 'deep-dream');
  const colorIntensity = getNumberSetting(customSettings.colorIntensity, 1.25, 0.5, 2.0);
  const seed = getNumberSetting(customSettings.seed, 13, 0, 100);

  const showGround = getBooleanSetting(customSettings.showGround, true);
  const showFog = getBooleanSetting(customSettings.showFog, true);
  // Back-compat: fogDensity used to be 0..0.1; now treat as fog amount 0..1.
  const fogAmount = showFog
    ? getNumberSetting(customSettings.fogAmount ?? customSettings.fogDensity, 0.65, 0, 1)
    : 0;

  const quality = getStringSetting(customSettings.quality, 'high');
  const sectionLength = getNumberSetting(customSettings.sectionLength, 28, 6, 120);
  const warp = getNumberSetting(customSettings.warp, 0.55, 0, 1);
  const glow = getNumberSetting(customSettings.glow, 1.15, 0, 2);
  const focus = getNumberSetting(customSettings.focus, 0.25, 0, 1);
  const treeDensity = getNumberSetting(customSettings.treeDensity, 0.75, 0, 1);
  const feedbackAmount = getNumberSetting(customSettings.feedbackAmount, 0.55, 0, 1);
  const feedbackWarp = getNumberSetting(customSettings.feedbackWarp, 0.35, 0, 1);

  // Map legacy-ish worldDensitySetting [5..80] into 0..1
  const userDensity = (worldDensitySetting - 5) / (80 - 5);

  return (
    <div className="w-full h-full bg-black overflow-hidden">
      <Canvas
        dpr={1}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          // Prevent R3F's default render pass (empty scene) from clearing our custom blit.
          gl.autoClear = false;
          gl.setClearColor(0x000000, 1);
        }}
      >
        <RaymarchPipeline
          audioData={audioData}
          intensity={intensity}
          dim={dim}
          evolutionSpeed={evolutionSpeed}
          scale={scale}
          style={style}
          colorIntensity={colorIntensity}
          seed={seed}
          quality={quality}
          sectionLength={sectionLength}
          fogAmount={fogAmount}
          glow={glow}
          warp={warp}
          focus={focus}
          userDensity={clamp01(userDensity)}
          treeDensity={clamp01(treeDensity)}
          showGround={showGround}
          feedbackAmount={feedbackAmount}
          feedbackWarp={feedbackWarp}
        />
      </Canvas>
    </div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const MushroomsPlugin: VisualizationPlugin = {
  id: 'mushrooms',
  name: 'Mushrooms',
  description: 'Psychedelic forest with transforming mushrooms',
  icon: 'Flower',
  settingsSchema,
  component: MushroomsVisualization,
};

