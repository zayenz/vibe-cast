import type { VisualizationProps } from '../types';
import SceneCanvas from './immersive/SceneCanvas';
import { dreamScene } from './immersive/dream';

export default function DreamFractalVisualization(props: VisualizationProps) {
  return <SceneCanvas {...props} scene={dreamScene} />;
}
