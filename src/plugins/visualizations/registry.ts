/**
 * Visualization Plugin Registry
 * 
 * Central registry of all available visualization plugins.
 * To add a new visualization, import it and add to the registry array.
 */

import { VisualizationPlugin, getDefaultsFromSchema } from '../types';
import { FireplacePlugin } from './FireplacePlugin';
import { TechnoPlugin } from './TechnoPlugin';
import { WavesPlugin } from './WavesPlugin';
import { ParticlesPlugin } from './ParticlesPlugin';
import { MushroomsPlugin } from './MushroomsPlugin';
import { YouTubePlugin } from './YouTubePlugin';

/**
 * All registered visualization plugins
 */
export const visualizationRegistry: VisualizationPlugin[] = [
  FireplacePlugin,
  TechnoPlugin,
  WavesPlugin,
  ParticlesPlugin,
  MushroomsPlugin,
  YouTubePlugin,
];

/**
 * Get a visualization plugin by ID
 */
export function getVisualization(id: string): VisualizationPlugin | undefined {
  return visualizationRegistry.find(v => v.id === id);
}

/**
 * Get all visualization IDs
 */
export function getVisualizationIds(): string[] {
  return visualizationRegistry.map(v => v.id);
}

/**
 * Get default settings for all visualizations
 */
export function getDefaultVisualizationSettings(): Record<string, Record<string, unknown>> {
  return visualizationRegistry.reduce((acc, plugin) => {
    acc[plugin.id] = getDefaultsFromSchema(plugin.settingsSchema);
    return acc;
  }, {} as Record<string, Record<string, unknown>>);
}
