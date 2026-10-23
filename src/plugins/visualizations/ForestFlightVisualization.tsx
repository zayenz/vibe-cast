import type { VisualizationProps } from '../types';
import SceneCanvas from './immersive/SceneCanvas';
import { forestScene } from './immersive/forest';

export default function ForestFlightVisualization(props: VisualizationProps) {
  return <SceneCanvas {...props} scene={forestScene} />;
}
