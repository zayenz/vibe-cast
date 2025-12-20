/**
 * Techno Visualization Plugin
 * 
 * Audio-reactive 3D stage with a morphing sphere and frequency bars.
 * Built with React Three Fiber.
 */

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { VisualizationPlugin, VisualizationProps, SettingDefinition } from '../types';

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
];

// ============================================================================
// 3D Components
// ============================================================================

interface AudioReactiveSphereProps {
  audioData: number[];
  intensity: number;
  sphereScale: number;
  sphereDistort: number;
}

const AudioReactiveSphere: React.FC<AudioReactiveSphereProps> = ({
  audioData,
  intensity,
  sphereScale,
  sphereDistort,
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

  return (
    <Sphere ref={meshRef} args={[1, 128, 128]}>
      <MeshDistortMaterial
        color="#ffffff"
        speed={1.5}
        distort={sphereDistort}
        radius={1}
        emissive="#ffffff"
        emissiveIntensity={0.5}
        roughness={0}
        metalness={1}
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
  // Ensure proper type conversion and provide defaults
  const barCount = Math.round(Number(customSettings.barCount) || 48);
  const sphereScale = Number(customSettings.sphereScale) || 1.0;
  const sphereDistort = Number(customSettings.sphereDistort) || 0.5;
  const colorScheme = String(customSettings.colorScheme || 'rainbow');
  const showSphere = Boolean(customSettings.showSphere !== false && customSettings.showSphere !== 'false');
  const showBars = Boolean(customSettings.showBars !== false && customSettings.showBars !== 'false');
  
  console.log('TechnoVisualization settings:', { barCount, sphereScale, sphereDistort, colorScheme, showSphere, showBars });

  // Apply dim as a CSS filter
  const dimStyle = {
    opacity: dim,
  };

  return (
    <div className="w-full h-full bg-black" style={dimStyle}>
      <Canvas camera={{ position: [0, 0, 8] }} gl={{ antialias: true }}>
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
