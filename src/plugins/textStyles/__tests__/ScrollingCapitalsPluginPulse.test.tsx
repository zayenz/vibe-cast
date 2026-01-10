import { describe, it, expect } from 'vitest';
import { ScrollingCapitalsPlugin } from '../ScrollingCapitalsPlugin';

describe('ScrollingCapitalsPlugin Pulse Glow', () => {
  it('should have a pulseGlow setting', () => {
    const setting = ScrollingCapitalsPlugin.settingsSchema.find(s => s.id === 'pulseGlow');
    expect(setting).toBeDefined();
    expect(setting?.type).toBe('boolean');
  });
});
