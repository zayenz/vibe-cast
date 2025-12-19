import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';

const AudioReactiveSphere = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const audioData = useStore((state) => state.audioData);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    // Use low frequency for scaling
    const lowFreq = audioData.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const scale = 1.2 + lowFreq * 8;
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
        distort={0.5}
        radius={1}
        emissive="#ffffff"
        emissiveIntensity={0.5}
        roughness={0}
        metalness={1}
      />
    </Sphere>
  );
};

const FrequencyBars = () => {
  const audioData = useStore((state) => state.audioData);
  const barsRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!barsRef.current) return;
    barsRef.current.children.forEach((child, i) => {
      const val = audioData[i * 2 % audioData.length] || 0;
      const targetScale = 0.2 + val * 40;
      child.scale.y = THREE.MathUtils.lerp(child.scale.y, targetScale, 0.15);
      
      // Dynamic coloring
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const hue = (i / 48 + Date.now() * 0.0001) % 1;
      mat.color.setHSL(hue, 0.8, 0.5 + val * 2);
      mat.emissive.setHSL(hue, 0.8, 0.2 + val);
    });
  });

  return (
    <group ref={barsRef} position={[-8, -3, 0]}>
      {Array.from({ length: 48 }).map((_, i) => (
        <mesh key={i} position={[i * 0.35, 0, 0]}>
          <boxGeometry args={[0.2, 1, 0.2]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} />
        </mesh>
      ))}
    </group>
  );
};

export const TechnoViz: React.FC = () => {
  return (
    <div className="w-full h-full bg-black">
      <Canvas camera={{ position: [0, 0, 8] }} gl={{ antialias: true }}>
        <color attach="background" args={['#000000']} />
        <fog attach="fog" args={['#000000', 5, 15]} />
        <ambientLight intensity={0.2} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} />
        <pointLight position={[-10, -10, -10]} color="blue" intensity={1} />
        <AudioReactiveSphere />
        <FrequencyBars />
        <OrbitControls enableZoom={true} makeDefault />
      </Canvas>
    </div>
  );
};



