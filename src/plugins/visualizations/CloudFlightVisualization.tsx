import type { VisualizationProps } from '../types';
import SceneCanvas from './immersive/SceneCanvas';
import { cloudScene } from './immersive/clouds';

export default function CloudFlightVisualization(props: VisualizationProps) {
  return <SceneCanvas {...props} scene={cloudScene} />;
}
