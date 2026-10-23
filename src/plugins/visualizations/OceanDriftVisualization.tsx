import type { VisualizationProps } from '../types';
import SceneCanvas from './immersive/SceneCanvas';
import { oceanScene } from './immersive/ocean';

export default function OceanDriftVisualization(props: VisualizationProps) {
  return <SceneCanvas {...props} scene={oceanScene} />;
}
