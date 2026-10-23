import { lazy } from 'react';
import type { SettingDefinition, VisualizationPlugin } from '../types';
import { sceneSettings } from './immersive/scene';

export const dreamFractalSettings: SettingDefinition[] = [
  ...sceneSettings,
  { type: 'select', id: 'dream', label: 'Dream form', options: [
    { value: 'botanical', label: 'Botanical dream' },
    { value: 'liquid', label: 'Liquid recursion' },
    { value: 'cathedral', label: 'Prismatic cathedral' },
  ], default: 'botanical' },
  { type: 'range', id: 'complexity', label: 'Recursive detail', min: 3, max: 8, step: 1, default: 6 },
  { type: 'range', id: 'symmetry', label: 'Petal symmetry', min: 3, max: 12, step: 1, default: 7 },
  { type: 'range', id: 'evolution', label: 'Shape evolution', min: 0, max: 2, step: 0.05, default: 0.65 },
  { type: 'range', id: 'warp', label: 'Liquid distortion', min: 0, max: 1.5, step: 0.05, default: 0.65 },
  { type: 'range', id: 'zoom', label: 'Magnification', min: 0.5, max: 2.5, step: 0.05, default: 1 },
  { type: 'select', id: 'palette', label: 'Color world', options: [
    { value: 'prism', label: 'Electric prism' },
    { value: 'orchid', label: 'Orchid / turquoise' },
    { value: 'solar', label: 'Solar / ultraviolet' },
  ], default: 'prism' },
];

export const DreamFractalPlugin: VisualizationPlugin = {
  id: 'dream-fractal',
  name: 'Dream Fractal',
  description: 'Living recursive flowers, liquid eyes and prismatic dream architecture',
  icon: 'Eye',
  settingsSchema: dreamFractalSettings,
  component: lazy(() => import('./DreamFractalVisualization')),
};
