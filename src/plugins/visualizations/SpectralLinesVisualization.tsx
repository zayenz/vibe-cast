import type { VisualizationProps } from '../types';
import SceneCanvas from './immersive/SceneCanvas';
import { spectralScene } from './immersive/spectral';

export default function SpectralLinesVisualization(props: VisualizationProps) {
  return <SceneCanvas {...props} scene={spectralScene} />;
}
