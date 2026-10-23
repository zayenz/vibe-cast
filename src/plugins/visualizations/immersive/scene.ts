import type { SettingDefinition } from '../../types';

export interface SceneDefinition {
  id: string;
  name: string;
  settings: SettingDefinition[];
  /** GLSL ES 1.00 body implementing vec3 scene(vec2 uv). uv is centered, in screen-height units. */
  fragment: string;
}

export const sceneSettings: SettingDefinition[] = [
  { type: 'range', id: 'speed', label: 'Travel / animation speed', min: 0, max: 3, step: 0.05, default: 1 },
  { type: 'range', id: 'audioResponse', label: 'Music response', min: 0, max: 2, step: 0.05, default: 0.8 },
  { type: 'range', id: 'seed', label: 'World variation', min: 0, max: 100, step: 1, default: 7 },
  { type: 'select', id: 'quality', label: 'Render quality', options: [
    { value: 'low', label: 'Low · lighter GPU load' },
    { value: 'medium', label: 'Balanced' },
    { value: 'high', label: 'High · more detail' },
  ], default: 'medium' },
];

export function uniformName(id: string): string {
  return `u${id[0].toUpperCase()}${id.slice(1)}`;
}
