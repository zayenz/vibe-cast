/**
 * Settings utility functions for plugins
 * 
 * Provides type-safe helpers for extracting settings from the settings object,
 * properly handling 0, false, and empty string as valid values.
 */

/**
 * Get a number setting, handling 0 as a valid value
 * @param value The setting value (may be undefined, null, or a number)
 * @param defaultValue The default value if setting is missing
 * @param min Optional minimum value to clamp to
 * @param max Optional maximum value to clamp to
 * @returns The number setting value
 */
export function getNumberSetting(
  value: unknown,
  defaultValue: number,
  min?: number,
  max?: number
): number {
  if (value === undefined || value === null) return defaultValue;
  const num = Number(value);
  if (isNaN(num)) return defaultValue;
  let result = num;
  if (min !== undefined && result < min) result = min;
  if (max !== undefined && result > max) result = max;
  return result;
}

/**
 * Get a string setting
 * @param value The setting value
 * @param defaultValue The default value if setting is missing
 * @returns The string setting value
 */
export function getStringSetting(value: unknown, defaultValue: string): string {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'string') return value;
  return String(value) || defaultValue;
}

/**
 * Get a boolean setting, handling false as a valid value
 * @param value The setting value
 * @param defaultValue The default value if setting is missing
 * @returns The boolean setting value
 */
export function getBooleanSetting(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    // Handle string booleans
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
  }
  return Boolean(value);
}

/**
 * Get a color setting (hex color string)
 * @param value The setting value
 * @param defaultValue The default color value
 * @returns The color string
 */
export function getColorSetting(value: unknown, defaultValue: string): string {
  if (value === undefined || value === null) return defaultValue;
  const str = String(value);
  // Basic validation for hex color
  if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(str)) return str;
  return defaultValue;
}

