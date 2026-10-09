/**
 * Techno Visualization Plugin
 * 
 * Audio-reactive 3D stage with a morphing sphere and frequency bars.
 * Built with React Three Fiber.
 */

import { lazy } from 'react';
import type { VisualizationPlugin, SettingDefinition } from '../types';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    type: 'range',
    id: 'barCount',
    label: 'Bar Count',
    min: 16,
    max: 96,
    step: 8,
    default: 48,
  },
  {
    type: 'range',
    id: 'sphereScale',
    label: 'Sphere Scale',
    min: 0.5,
    max: 2.0,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'range',
    id: 'sphereDistort',
    label: 'Sphere Distortion',
    min: 0.1,
    max: 1.0,
    step: 0.1,
    default: 0.5,
  },
  {
    type: 'select',
    id: 'colorScheme',
    label: 'Color Scheme',
    options: [
      { value: 'rainbow', label: 'Rainbow' },
      { value: 'fire', label: 'Fire' },
      { value: 'ice', label: 'Ice' },
      { value: 'neon', label: 'Neon' },
    ],
    default: 'rainbow',
  },
  {
    type: 'boolean',
    id: 'showSphere',
    label: 'Show Sphere',
    default: true,
  },
  {
    type: 'boolean',
    id: 'showBars',
    label: 'Show Frequency Bars',
    default: true,
  },
  {
    type: 'range',
    id: 'sphereOpacity',
    label: 'Sphere Opacity',
    min: 0,
    max: 1,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'color',
    id: 'sphereColor',
    label: 'Sphere Color',
    default: '#ffffff',
  },
];

const TechnoVisualization = lazy(() => import('./TechnoVisualization'));

// ============================================================================
// Plugin Export
// ============================================================================

export const TechnoPlugin: VisualizationPlugin = {
  id: 'techno',
  name: 'Techno',
  description: 'Audio-reactive 3D stage with morphing sphere',
  icon: 'Music',
  settingsSchema,
  component: TechnoVisualization,
};
