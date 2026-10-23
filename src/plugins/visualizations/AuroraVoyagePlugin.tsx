import { lazy } from 'react';
import type { SettingDefinition, VisualizationPlugin } from '../types';
import { sceneSettings } from './immersive/scene';

export const auroraVoyageSettings: SettingDefinition[] = [
  ...sceneSettings,
  { type: 'select', id: 'landscape', label: 'Landscape', options: [
    { value: 'alpine', label: 'Midnight alpine' },
    { value: 'dunes', label: 'Alien dunes' },
    { value: 'ice', label: 'Frozen violet' },
  ], default: 'alpine' },
  { type: 'range', id: 'curtainIntensity', label: 'Aurora brightness', min: 0.1, max: 2, step: 0.05, default: 1 },
  { type: 'range', id: 'curtainFlow', label: 'Curtain evolution', min: 0, max: 2, step: 0.05, default: 0.6 },
  { type: 'range', id: 'terrainHeight', label: 'Mountain height', min: 0.3, max: 1.7, step: 0.05, default: 1 },
  { type: 'range', id: 'starDensity', label: 'Stars', min: 0, max: 1, step: 0.05, default: 0.7 },
];

export const AuroraVoyagePlugin: VisualizationPlugin = {
  id: 'aurora-voyage',
  name: 'Aurora Voyage',
  description: 'Luminous aurora curtains unfurl above an endless moonlit wilderness',
  icon: 'Moon',
  settingsSchema: auroraVoyageSettings,
  component: lazy(() => import('./AuroraVoyageVisualization')),
};
