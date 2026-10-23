import { lazy } from 'react';
import type { SettingDefinition, VisualizationPlugin } from '../types';
import { sceneSettings } from './immersive/scene';

export const forestFlightSettings: SettingDefinition[] = [
  ...sceneSettings,
  { type: 'range', id: 'density', label: 'Undergrowth density', min: 0.2, max: 1, step: 0.05, default: 0.85 },
  { type: 'range', id: 'growth', label: 'Growth and evolution', min: 0, max: 2, step: 0.05, default: 0.7 },
  { type: 'range', id: 'psychedelia', label: 'Psychedelic color', min: 0, max: 1, step: 0.05, default: 0.18 },
  { type: 'range', id: 'glow', label: 'Bioluminescence', min: 0, max: 2, step: 0.05, default: 0.65 },
  { type: 'range', id: 'mist', label: 'Forest mist', min: 0, max: 1, step: 0.05, default: 0.35 },
  { type: 'select', id: 'habitat', label: 'Habitat', options: [
    { value: 'golden', label: 'Golden woodland' },
    { value: 'moonlit', label: 'Moonlit mycelium' },
    { value: 'emerald', label: 'Emerald rainforest' },
  ], default: 'golden' },
];

export const ForestFlightPlugin: VisualizationPlugin = {
  id: 'forest-flight',
  name: 'Forest Flight',
  description: 'Glide through a living moss garden of gilled mushrooms, ferns and luminous spores.',
  icon: 'TreePine',
  settingsSchema: forestFlightSettings,
  component: lazy(() => import('./ForestFlightVisualization')),
};
