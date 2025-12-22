/**
 * Techno Visualization Plugin
 * 
 * Audio-reactive 3D stage with a morphing sphere and frequency bars.
 * Built with React Three Fiber.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';
import { getNumberSetting, getStringSetting, getBooleanSetting } from '../utils/settings';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'barCount',
    label: 'Bar Count',
    min: 16,
    max: 96,
    step: 8,
    default: 48,
  },
  {
    type: 'range',
    id: 'sphereScale',
    label: 'Sphere Scale',
    min: 0.5,
    max: 2.0,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'range',
    id: 'sphereDistort',
    label: 'Sphere Distortion',
    min: 0.1,
    max: 1.0,
    step: 0.1,
    default: 0.5,
  },
  {
    type: 'select',
    id: 'colorScheme',
    label: 'Color Scheme',
    options: [
      { value: 'rainbow', label: 'Rainbow' },
      { value: 'fire', label: 'Fire' },
      { value: 'ice', label: 'Ice' },
      { value: 'neon', label: 'Neon' },
    ],
    default: 'rainbow',
  },
  {
    type: 'boolean',
    id: 'showSphere',
    label: 'Show Sphere',
    default: true,
  },
  {
    type: 'boolean',
    id: 'showBars',
    label: 'Show Frequency Bars',
    default: true,
  },
  {
    type: 'range',
    id: 'sphereOpacity',
    label: 'Sphere Opacity',
    min: 0,
    max: 1,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'color',
    id: 'sphereColor',
    label: 'Sphere Color',
    default: '#ffffff',
  },
];

// ============================================================================
// 3D Components
// ============================================================================

interface AudioReactiveSphereProps {
  audioData: number[];
  intensity: number;
  sphereScale: number;
  sphereDistort: number;
  sphereOpacity: number;
  sphereColor: string;
}

const AudioReactiveSphere: React.FC<AudioReactiveSphereProps> = ({
  audioData,
  intensity,
  sphereScale,
  sphereDistort,
  sphereOpacity,
  sphereColor,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    // Use low frequency for scaling, apply intensity
    const lowFreq = (audioData.slice(0, 10).reduce((a, b) => a + b, 0) / 10) * intensity;
    const scale = (1.2 + lowFreq * 8) * sphereScale;
    meshRef.current.scale.set(
      THREE.MathUtils.lerp(meshRef.current.scale.x, scale, 0.1),
      THREE.MathUtils.lerp(meshRef.current.scale.y, scale, 0.1),
      THREE.MathUtils.lerp(meshRef.current.scale.z, scale, 0.1)
    );
    
    // Rotate based on time and audio
    meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.4 + lowFreq * 2;
    meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.2 + lowFreq * 1;
  });

  // Convert hex color to RGB for Three.js
  const colorValue = new THREE.Color(sphereColor);
  
  return (
    <Sphere ref={meshRef} args={[1, 128, 128]}>
      <MeshDistortMaterial
        color={colorValue}
        speed={1.5}
        distort={sphereDistort}
        radius={1}
        emissive={colorValue}
        emissiveIntensity={0.5 * sphereOpacity}
        roughness={0}
        metalness={1}
        transparent={sphereOpacity < 1}
        opacity={sphereOpacity}
      />
    </Sphere>
  );
};

interface FrequencyBarsProps {
  audioData: number[];
  intensity: number;
  barCount: number;
  colorScheme: string;
}

const FrequencyBars: React.FC<FrequencyBarsProps> = ({
  audioData,
  intensity,
  barCount,
  colorScheme,
}) => {
  const barsRef = useRef<THREE.Group>(null);

  // Color scheme hue offsets
  const getHue = (index: number, time: number, scheme: string): number => {
    const baseHue = (index / barCount + time * 0.0001) % 1;
    switch (scheme) {
      case 'fire':
        return 0 + baseHue * 0.1; // Red to orange
      case 'ice':
        return 0.5 + baseHue * 0.15; // Cyan to blue
      case 'neon':
        return 0.8 + baseHue * 0.4; // Purple to pink to blue
      case 'rainbow':
      default:
        return baseHue;
    }
  };

  useFrame(() => {
    if (!barsRef.current) return;
    barsRef.current.children.forEach((child, i) => {
      const val = (audioData[i * 2 % audioData.length] || 0) * intensity;
      const targetScale = 0.2 + val * 40;
      child.scale.y = THREE.MathUtils.lerp(child.scale.y, targetScale, 0.15);
      
      // Dynamic coloring
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const hue = getHue(i, Date.now(), colorScheme);
      mat.color.setHSL(hue, 0.8, 0.5 + val * 2);
      mat.emissive.setHSL(hue, 0.8, 0.2 + val);
    });
  });

  // Calculate bar positioning based on count
  const barWidth = 0.2;
  const barSpacing = 0.35;
  const totalWidth = barCount * barSpacing;
  const startX = -totalWidth / 2;

  return (
    <group ref={barsRef} position={[startX, -3, 0]}>
      {Array.from({ length: barCount }, (_, i) => (
        <mesh key={`bar-${i}-${barCount}`} position={[i * barSpacing, 0, 0]}>
          <boxGeometry args={[barWidth, 1, barWidth]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
        </mesh>
      ))}
    </group>
  );
};

// ============================================================================
// Main Component
// ============================================================================

const TechnoVisualization: React.FC<VisualizationProps> = ({
  audioData,
  commonSettings,
  customSettings,
}) => {
  const { intensity, dim } = commonSettings;
  // Use utility functions to properly handle 0, false, and empty string as valid values
  const barCount = Math.round(getNumberSetting(customSettings.barCount, 48, 16, 96));
  const sphereScale = getNumberSetting(customSettings.sphereScale, 1.0, 0.5, 2.0);
  const sphereDistort = getNumberSetting(customSettings.sphereDistort, 0.5, 0.1, 1.0);
  const colorScheme = getStringSetting(customSettings.colorScheme, 'rainbow');
  const showSphere = getBooleanSetting(customSettings.showSphere, true);
  const showBars = getBooleanSetting(customSettings.showBars, true);
  const sphereOpacity = getNumberSetting(customSettings.sphereOpacity, 1.0, 0, 1);
  const sphereColor = getStringSetting(customSettings.sphereColor, '#ffffff');
  
  console.log('TechnoVisualization settings:', { barCount, sphereScale, sphereDistort, colorScheme, showSphere, showBars, sphereOpacity, sphereColor });

  // Apply dim as a CSS filter
  const dimStyle = {
    opacity: dim,
  };

  const [webglLost, setWebglLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);

  // Reduce GPU pressure a bit on high-DPI screens (helps long-run stability).
  const dpr = useMemo(() => {
    if (typeof window === 'undefined') return 1;
    return Math.min(window.devicePixelRatio || 1, 1.5);
  }, []);

  // If the WebGL context is lost, remount the Canvas after a short delay.
  useEffect(() => {
    if (!webglLost) return;
    const t = window.setTimeout(() => setCanvasKey((k) => k + 1), 750);
    return () => window.clearTimeout(t);
  }, [webglLost]);

  return (
    <div className="w-full h-full bg-black relative" style={dimStyle}>
      {webglLost && (
        <div className="absolute inset-0 flex items-center justify-center z-50">
          <div className="px-4 py-2 rounded-lg bg-black/70 border border-zinc-800 text-zinc-200 text-sm">
            WebGL context lost — recovering…
          </div>
        </div>
      )}
      <Canvas
        key={canvasKey}
        dpr={dpr}
        camera={{ position: [0, 0, 8] }}
        gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          const onLost = (e: Event) => {
            // Prevent the browser's default behavior so we can attempt a recovery.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (e as any).preventDefault?.();
            setWebglLost(true);
          };
          const onRestored = () => setWebglLost(false);
          canvas.addEventListener('webglcontextlost', onLost as EventListener, false);
          canvas.addEventListener('webglcontextrestored', onRestored as EventListener, false);
        }}
      >
        <color attach="background" args={['#000000']} />
        <fog attach="fog" args={['#000000', 5, 15]} />
        <ambientLight intensity={0.2} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} />
        <pointLight position={[-10, -10, -10]} color="blue" intensity={1} />
        {showSphere && (
          <AudioReactiveSphere 
            audioData={audioData} 
            intensity={intensity}
            sphereScale={sphereScale}
            sphereDistort={sphereDistort}
            sphereOpacity={sphereOpacity}
            sphereColor={sphereColor}
          />
        )}
        {showBars && (
          <FrequencyBars 
            audioData={audioData} 
            intensity={intensity}
            barCount={barCount}
            colorScheme={colorScheme}
          />
        )}
        <OrbitControls enableZoom={true} makeDefault />
      </Canvas>
    </div>
  );
};

// ============================================================================
// Plugin Export
// ============================================================================

export const TechnoPlugin: VisualizationPlugin = {
  id: 'techno',
  name: 'Techno',
  description: 'Audio-reactive 3D stage with morphing sphere',
  icon: 'Music',
  settingsSchema,
  component: TechnoVisualization,
};
