import { lazy } from 'react';
import type { SettingDefinition, VisualizationPlugin } from '../types';
import { sceneSettings } from './immersive/scene';

export const oceanSettings: SettingDefinition[] = [
  ...sceneSettings,
  { type: 'select', id: 'biome', label: 'Seascape', options: [
    { value: 'reef', label: 'Coral gardens' },
    { value: 'kelp', label: 'Kelp cathedral' },
    { value: 'abyss', label: 'Bioluminescent deep' },
  ], default: 'reef' },
  { type: 'range', id: 'density', label: 'Reef growth', min: 0.2, max: 1.6, step: 0.05, default: 1 },
  { type: 'range', id: 'depth', label: 'Water depth', min: 0, max: 1, step: 0.05, default: 0.35 },
  { type: 'range', id: 'caustics', label: 'Dancing sunlight', min: 0, max: 2, step: 0.05, default: 1 },
  { type: 'range', id: 'life', label: 'Shoals and plankton', min: 0, max: 1, step: 0.05, default: 0.7 },
];

export const OceanDriftPlugin: VisualizationPlugin = {
  id: 'ocean-drift', name: 'Ocean Drift', icon: 'Waves',
  description: 'Drift through coral gardens, swaying kelp and a luminous deep ocean.',
  settingsSchema: oceanSettings,
  component: lazy(() => import('./OceanDriftVisualization')),
};
