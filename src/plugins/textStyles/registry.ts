/**
 * Text Style Plugin Registry
 * 
 * Central registry of all available text style plugins.
 * To add a new text style, import it and add to the registry array.
 */

import { TextStylePlugin, getDefaultsFromSchema } from '../types';
import { ScrollingCapitalsPlugin } from './ScrollingCapitalsPlugin';
import { FadePlugin } from './FadePlugin';
import { TypewriterPlugin } from './TypewriterPlugin';
import { BouncePlugin } from './BouncePlugin';
import { DotMatrixPlugin } from './DotMatrixPlugin';
import { CreditsPlugin } from './CreditsPlugin';

/**
 * All registered text style plugins
 */
export const textStyleRegistry: TextStylePlugin[] = [
  ScrollingCapitalsPlugin,
  FadePlugin,
  TypewriterPlugin,
  BouncePlugin,
  DotMatrixPlugin,
  CreditsPlugin,
];

/**
 * Get a text style plugin by ID
 */
export function getTextStyle(id: string): TextStylePlugin | undefined {
  return textStyleRegistry.find(s => s.id === id);
}

/**
 * Get all text style IDs
 */
export function getTextStyleIds(): string[] {
  return textStyleRegistry.map(s => s.id);
}

/**
 * Get default settings for all text styles
 */
export function getDefaultTextStyleSettings(): Record<string, Record<string, unknown>> {
  return textStyleRegistry.reduce((acc, plugin) => {
    acc[plugin.id] = getDefaultsFromSchema(plugin.settingsSchema);
    return acc;
  }, {} as Record<string, Record<string, unknown>>);
}
