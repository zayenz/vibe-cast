import { lazy } from 'react';
import type { SettingDefinition, VisualizationPlugin } from '../types';
import { sceneSettings } from './immersive/scene';

export const spectralLinesSettings: SettingDefinition[] = [
  ...sceneSettings,
  { type: 'select', id: 'form', label: 'Light formation', options: [
    { value: 'ribbons', label: 'Spectral ribbons' },
    { value: 'tunnel', label: 'Resonance tunnel' },
    { value: 'curtain', label: 'Aurora curtain' },
  ], default: 'ribbons' },
  { type: 'range', id: 'lineCount', label: 'Light filaments', min: 32, max: 96, step: 32, default: 64 },
  { type: 'range', id: 'spread', label: 'Spatial spread', min: 0.4, max: 1.8, step: 0.05, default: 1 },
  { type: 'range', id: 'twist', label: 'Wave / twist', min: 0, max: 2, step: 0.05, default: 0.8 },
  { type: 'range', id: 'glow', label: 'Light bloom', min: 0.2, max: 2, step: 0.05, default: 1 },
  { type: 'range', id: 'thickness', label: 'Filament width', min: 0.5, max: 2.5, step: 0.05, default: 1 },
  { type: 'select', id: 'palette', label: 'Spectral palette', options: [
    { value: 'ember', label: 'Icon · amber / coral' },
    { value: 'ion', label: 'Ion · cyan / violet' },
    { value: 'spectrum', label: 'Full spectrum' },
  ], default: 'ember' },
];

export const SpectralLinesPlugin: VisualizationPlugin = {
  id: 'spectral-lines',
  name: 'Spectral Lines',
  description: 'Glowing frequency filaments, flowing ribbons and tunnels of spectral light',
  icon: 'Radio',
  settingsSchema: spectralLinesSettings,
  component: lazy(() => import('./SpectralLinesVisualization')),
};
