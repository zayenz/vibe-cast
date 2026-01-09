/**
 * Core plugin type definitions for the visualization system.
 * 
 * The plugin architecture allows adding new visualizations and text styles
 * without modifying core application code.
 */

import { ComponentType } from 'react';

// ============================================================================
// Settings Schema Types
// ============================================================================

/**
 * Definition for a range slider setting (e.g., intensity, speed)
 */
export interface RangeSetting {
  type: 'range';
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

/**
 * Definition for a color picker setting
 */
export interface ColorSetting {
  type: 'color';
  id: string;
  label: string;
  default: string;
}

/**
 * Definition for a select/dropdown setting
 */
export interface SelectSetting {
  type: 'select';
  id: string;
  label: string;
  options: { value: string; label: string }[];
  default: string;
}

/**
 * Definition for a boolean toggle setting
 */
export interface BooleanSetting {
  type: 'boolean';
  id: string;
  label: string;
  default: boolean;
}

/**
 * Definition for a text input setting
 */
export interface TextSetting {
  type: 'text';
  id: string;
  label: string;
  default: string;
  placeholder?: string;
  /** Optional action button type for special pickers */
  actionButton?: 'folder' | 'album';
}

/**
 * Union of all setting types
 */
export type SettingDefinition = RangeSetting | ColorSetting | SelectSetting | BooleanSetting | TextSetting;

/**
 * Extract default values from a settings schema
 */
export function getDefaultsFromSchema(schema: SettingDefinition[]): Record<string, unknown> {
  return schema.reduce((acc, setting) => {
    acc[setting.id] = setting.default;
    return acc;
  }, {} as Record<string, unknown>);
}

// ============================================================================
// Common Visualization Settings
// ============================================================================

/**
 * Settings common to all visualizations.
 * - intensity: Smooths music data when lowered, making visualization reactive to larger trends
 * - dim: Dims the visualization towards black when lowered
 */
export interface CommonVisualizationSettings {
  intensity: number;  // 0-1, 1 = raw audio, lower = more smoothing
  dim: number;        // 0-1, 1 = full brightness, 0 = black
}

export const DEFAULT_COMMON_SETTINGS: CommonVisualizationSettings = {
  intensity: 1.0,
  dim: 1.0,
};

// ============================================================================
// Visualization Plugin Types
// ============================================================================

/**
 * Props passed to visualization components
 */
export interface VisualizationProps {
  audioData: number[];
  commonSettings: CommonVisualizationSettings;
  customSettings: Record<string, unknown>;
}

/**
 * Definition of a visualization plugin
 */
export interface VisualizationPlugin {
  /** Unique identifier for this visualization */
  id: string;
  
  /** Display name shown in UI */
  name: string;
  
  /** Short description of the visualization */
  description: string;
  
  /** Lucide icon name (e.g., 'Flame', 'Music') */
  icon: string;
  
  /** Schema defining custom settings for this visualization */
  settingsSchema: SettingDefinition[];
  
  /** The React component that renders the visualization */
  component: ComponentType<VisualizationProps>;
}

// ============================================================================
// Text Style Plugin Types
// ============================================================================

/**
 * Props passed to text style components
 */
export interface TextStyleProps {
  /** The message text to display */
  message: string;
  
  /** Timestamp to force re-render on same message */
  messageTimestamp: number;
  
  /** Settings for this text style */
  settings: Record<string, unknown>;
  
  /** Vertical offset for stacking multiple messages */
  verticalOffset?: number;
  
  /** Number of times to repeat the animation before completing (default: 1) */
  repeatCount?: number;
  
  /** Callback when the message display is complete */
  onComplete?: () => void;
}

/**
 * Definition of a text style plugin
 */
export interface TextStylePlugin {
  /** Unique identifier for this text style */
  id: string;
  
  /** Display name shown in UI */
  name: string;
  
  /** Short description of the text style */
  description: string;
  
  /** Schema defining settings for this text style */
  settingsSchema: SettingDefinition[];
  
  /** The React component that renders the styled text */
  component: ComponentType<TextStyleProps>;
}

// ============================================================================
// Preset Types
// ============================================================================

/**
 * A named visualization preset with specific settings
 */
export interface VisualizationPreset {
  /** Unique identifier for this preset */
  id: string;
  
  /** Display name for this preset */
  name: string;
  
  /** Base visualization plugin ID */
  visualizationId: string;
  
  /** Settings for this preset */
  settings: Record<string, unknown>;
  
  /** Whether this preset should be shown in the UI (default: true) */
  enabled?: boolean;
  
  /** Display order for sorting presets (lower numbers appear first) */
  order?: number;
  
  /** Icon name from the icon set (e.g., 'Flame', 'Music', 'Flower') */
  icon?: string;
}

/**
 * A named text style preset with specific settings
 */
export interface TextStylePreset {
  /** Unique identifier for this preset */
  id: string;
  
  /** Display name for this preset */
  name: string;
  
  /** Base text style plugin ID */
  textStyleId: string;
  
  /** Settings for this preset */
  settings: Record<string, unknown>;
}

/**
 * Statistics for message usage
 */
export interface MessageStats {
  /** Message ID this stats object belongs to */
  messageId: string;
  
  /** Number of times this message has been triggered */
  triggerCount: number;
  
  /** Timestamp of last trigger */
  lastTriggered: number;
  
  /** History of trigger timestamps */
  history: Array<{ timestamp: number }>;
}

export interface RemoteCommand {
  command: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}

// ============================================================================
// Message Configuration
// ============================================================================

/**
 * Configuration for a preset message
 */
export interface MessageConfig {
  /** Unique identifier for this message */
  id: string;
  
  /** The message text */
  text: string;

  /**
   * Optional: Load text from file instead of using 'text' field.
   * Path can be relative (to config directory) or absolute.
   * When set, automatically enables splitting by newlines.
   */
  textFile?: string;

  /**
   * Whether to split the message into multiple parts using a separator.
   * When enabled, the message text is split into parts and cycled instead of repeating the full text.
   */
  splitEnabled?: boolean;

  /**
   * Separator string used when splitEnabled is true.
   * Parts are trimmed; empty separators disable splitting.
   */
  splitSeparator?: string;
  
  /** Text style plugin ID to use (legacy - kept for backward compatibility) */
  textStyle: string;
  
  /** Optional reference to a text style preset */
  textStylePreset?: string;
  
  /** Optional per-message style setting overrides */
  styleOverrides?: Record<string, unknown>;
  
  /** How many times to show this message (default: 1) */
  repeatCount?: number;
  
  /** Animation speed multiplier (default: 1.0) */
  speed?: number;
}

// ============================================================================
// Message Tree (Folders)
// ============================================================================

export interface MessageFolderNode {
  type: 'folder';
  /** Unique identifier for this folder node */
  id: string;
  /** Display name */
  name: string;
  /** Whether folder is collapsed in the UI */
  collapsed?: boolean;
  /** Child nodes */
  children: MessageTreeNode[];
}

export interface MessageLeafNode {
  type: 'message';
  /** Leaf node id (usually equals message.id) */
  id: string;
  message: MessageConfig;
}

export type MessageTreeNode = MessageFolderNode | MessageLeafNode;

// ============================================================================
// Full Configuration Type
// ============================================================================

/**
 * Complete application configuration that can be saved/loaded
 */
export interface AppConfiguration {
  /** Configuration version for migration support */
  version: number;
  
  /** Currently active visualization plugin ID (legacy - kept for backward compatibility) */
  activeVisualization?: string;
  
  /** Currently active visualization preset ID */
  activeVisualizationPreset?: string;
  
  /** List of visualization IDs shown as quick-access buttons (legacy) */
  enabledVisualizations?: string[];
  
  /** Named visualization presets */
  visualizationPresets?: VisualizationPreset[];
  
  /** Common settings shared by all visualizations */
  commonSettings: CommonVisualizationSettings;
  
  /** Per-visualization custom settings (legacy - kept for backward compatibility) */
  visualizationSettings?: Record<string, Record<string, unknown>>;
  
  /** Preset messages */
  messages: MessageConfig[];

  /**
   * Message tree (folders + messages).
   * If present, this is the canonical ordering/structure. `messages` is treated as a flattened view.
   */
  messageTree?: MessageTreeNode[];
  
  /** Default text style for new messages */
  defaultTextStyle: string;
  
  /** Per-text-style settings (legacy - kept for backward compatibility) */
  textStyleSettings?: Record<string, Record<string, unknown>>;
  
  /** Named text style presets */
  textStylePresets?: TextStylePreset[];
  
  /** Message statistics and tracking */
  messageStats?: Record<string, MessageStats>;
}
