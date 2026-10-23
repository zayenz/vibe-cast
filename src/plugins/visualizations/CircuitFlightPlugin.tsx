import { lazy } from 'react';
import type { SettingDefinition, VisualizationPlugin } from '../types';
import { sceneSettings } from './immersive/scene';

export const circuitFlightSettings: SettingDefinition[] = [
  ...sceneSettings,
  { type: 'select', id: 'boardStyle', label: 'Circuit palette', options: [
    { value: 'obsidian', label: 'Obsidian / electric jade' },
    { value: 'copper', label: 'Copper / amber' },
    { value: 'violet', label: 'Violet / laser pink' },
  ], default: 'obsidian' },
  { type: 'range', id: 'altitude', label: 'Flight altitude', min: 3, max: 9, step: 0.1, default: 5 },
  { type: 'range', id: 'componentHeight', label: 'Component height', min: 0.4, max: 1.8, step: 0.05, default: 1 },
  { type: 'range', id: 'traceGlow', label: 'Signal glow', min: 0.1, max: 2.5, step: 0.05, default: 1.2 },
  { type: 'range', id: 'signalSpeed', label: 'Signal flow', min: 0, max: 3, step: 0.1, default: 1 },
];

export const CircuitFlightPlugin: VisualizationPlugin = {
  id: 'circuit-flight',
  name: 'Circuit Flight',
  description: 'An endless motherboard of sculpted chips, copper traces, and music-driven signals',
  icon: 'Zap',
  settingsSchema: circuitFlightSettings,
  component: lazy(() => import('./CircuitFlightVisualization')),
};
