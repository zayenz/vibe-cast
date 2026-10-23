import { lazy } from 'react';
import type { SettingDefinition, VisualizationPlugin } from '../types';
import { sceneSettings } from './immersive/scene';

export const cloudSettings: SettingDefinition[] = [
  ...sceneSettings,
  { type: 'select', id: 'sky', label: 'Sky', options: [
    { value: 'golden', label: 'Golden hour' },
    { value: 'day', label: 'Blue afternoon' },
    { value: 'rose', label: 'Rose dusk' },
    { value: 'moon', label: 'Moonlit silver' },
  ], default: 'golden' },
  { type: 'range', id: 'coverage', label: 'Cloud coverage', min: 0.15, max: 1, step: 0.05, default: 0.62 },
  { type: 'range', id: 'billow', label: 'Towering billows', min: 0.3, max: 1.8, step: 0.05, default: 1 },
  { type: 'range', id: 'altitude', label: 'Flight altitude', min: 0, max: 1, step: 0.05, default: 0.55 },
  { type: 'range', id: 'silver', label: 'Silver lining', min: 0, max: 2, step: 0.05, default: 1 },
];

export const CloudFlightPlugin: VisualizationPlugin = {
  id: 'cloud-flight', name: 'Cloud Flight', icon: 'Cloud',
  description: 'An endless flight above sculpted cloud banks, from golden sunlight to moonlit silver.',
  settingsSchema: cloudSettings,
  component: lazy(() => import('./CloudFlightVisualization')),
};
