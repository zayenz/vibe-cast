import type { VisualizationProps } from '../types';
import SceneCanvas from './immersive/SceneCanvas';
import { auroraScene } from './immersive/aurora';

export default function AuroraVoyageVisualization(props: VisualizationProps) {
  return <SceneCanvas {...props} scene={auroraScene} />;
}
