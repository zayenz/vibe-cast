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
import { PhotoSlideshowPlugin } from './PhotoSlideshowPlugin';
import { TransitionDemoPlugin } from './TransitionDemoPlugin';
import { ForestFlightPlugin } from './ForestFlightPlugin';
import { DreamFractalPlugin } from './DreamFractalPlugin';
import { SpectralLinesPlugin } from './SpectralLinesPlugin';
import { CircuitFlightPlugin } from './CircuitFlightPlugin';
import { OceanDriftPlugin } from './OceanDriftPlugin';
import { CloudFlightPlugin } from './CloudFlightPlugin';
import { AuroraVoyagePlugin } from './AuroraVoyagePlugin';

/**
 * All registered visualization plugins
 */
export const visualizationRegistry: VisualizationPlugin[] = [
  FireplacePlugin,
  TechnoPlugin,
  WavesPlugin,
  ParticlesPlugin,
  MushroomsPlugin,
  ForestFlightPlugin,
  DreamFractalPlugin,
  SpectralLinesPlugin,
  CircuitFlightPlugin,
  OceanDriftPlugin,
  CloudFlightPlugin,
  AuroraVoyagePlugin,
  YouTubePlugin,
  PhotoSlideshowPlugin,
  TransitionDemoPlugin,
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
