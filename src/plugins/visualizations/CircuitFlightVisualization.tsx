import type { VisualizationProps } from '../types';
import SceneCanvas from './immersive/SceneCanvas';
import { circuitScene } from './immersive/circuit';

export default function CircuitFlightVisualization(props: VisualizationProps) {
  return <SceneCanvas {...props} scene={circuitScene} />;
}
