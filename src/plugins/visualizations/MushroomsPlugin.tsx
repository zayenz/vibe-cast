/**
 * Mushrooms Visualization Plugin (Raymarch)
 *
 * Realistic-but-trippy, demoscene-evolving mushroom forest rendered via a GPU raymarcher.
 * - Fullscreen SDF raymarch in fragment shader (mushrooms/ground/trees/fog)
 * - Timeline-driven section evolution (camera + palette + density)
 * - Optional temporal feedback pass for demoscene-style trails
 */

import { lazy } from 'react';
import type { VisualizationPlugin, SettingDefinition } from '../types';

// ============================================================================
// Settings Schema
// ============================================================================

const settingsSchema: SettingDefinition[] = [
  {
    // Back-compat: keep id mushroomCount but repurpose as "World Density"
    type: 'range',
    id: 'mushroomCount',
    label: 'World Density',
    min: 5,
    max: 80,
    step: 1,
    default: 28,
  },
  {
    type: 'range',
    id: 'evolutionSpeed',
    label: 'Evolution Speed',
    min: 0.1,
    max: 3.0,
    step: 0.1,
    default: 1.0,
  },
  {
    type: 'range',
    id: 'mushroomScale',
    label: 'Scale',
    min: 0.5,
    max: 2.0,
    step: 0.1,
    default: 1.1,
  },
  {
    type: 'select',
    id: 'colorStyle',
    label: 'Style',
    options: [
      { value: 'deep-dream', label: 'Deep Dream' },
      { value: 'aurora', label: 'Aurora' },
      { value: 'neon', label: 'Neon' },
      { value: 'forest', label: 'Forest' },
      { value: 'psychedelic', label: 'Psychedelic' },
      { value: 'rainbow', label: 'Rainbow' },
    ],
    default: 'deep-dream',
  },
  {
    type: 'range',
    id: 'colorIntensity',
    label: 'Color Intensity',
    min: 0.5,
    max: 2.0,
    step: 0.1,
    default: 1.25,
  },
  {
    type: 'range',
    id: 'seed',
    label: 'Seed',
    min: 0,
    max: 100,
    step: 1,
    default: 13,
  },
  {
    type: 'boolean',
    id: 'showGround',
    label: 'Show Ground',
    default: true,
  },
  {
    type: 'boolean',
    id: 'showFog',
    label: 'Show Fog',
    default: true,
  },
  {
    type: 'range',
    id: 'fogDensity',
    label: 'Fog Amount',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.65,
  },
  {
    type: 'select',
    id: 'quality',
    label: 'Quality',
    options: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ],
    default: 'medium',
  },
  {
    type: 'range',
    id: 'taaStrength',
    label: 'TAA Strength',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.85,
  },
  {
    type: 'range',
    id: 'taaClamp',
    label: 'TAA Clamp',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.35,
  },
  {
    type: 'range',
    id: 'dither',
    label: 'Dither',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.55,
  },
  {
    type: 'range',
    id: 'sectionLength',
    label: 'Section Length',
    min: 8,
    max: 60,
    step: 1,
    default: 28,
  },
  {
    type: 'range',
    id: 'warp',
    label: 'Space Warp',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.55,
  },
  {
    type: 'range',
    id: 'glow',
    label: 'Biolume Glow',
    min: 0,
    max: 2,
    step: 0.05,
    default: 1.15,
  },
  {
    type: 'range',
    id: 'focus',
    label: 'Soft Focus',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.25,
  },
  {
    type: 'range',
    id: 'treeDensity',
    label: 'Tree Density',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.25,
  },
  {
    type: 'range',
    id: 'feedbackAmount',
    label: 'Feedback Trails',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.0,
  },
  {
    type: 'range',
    id: 'feedbackWarp',
    label: 'Feedback Warp',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.15,
  },
];

const MushroomsVisualization = lazy(() => import('./MushroomsVisualization'));

// ============================================================================
// Plugin Export
// ============================================================================

export const MushroomsPlugin: VisualizationPlugin = {
  id: 'mushrooms',
  name: 'Mushrooms',
  description: 'Psychedelic forest with transforming mushrooms',
  icon: 'Flower',
  settingsSchema,
  component: MushroomsVisualization,
};

