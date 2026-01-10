import { describe, it, expect } from 'vitest';
import { TransitionDemoPlugin } from '../TransitionDemoPlugin';
import { PhotoSlideshowPlugin } from '../PhotoSlideshowPlugin';

describe('TransitionDemoPlugin', () => {
  it('should have the same settings schema as PhotoSlideshowPlugin', () => {
    // We want exact parity in settings
    expect(TransitionDemoPlugin.settingsSchema).toEqual(PhotoSlideshowPlugin.settingsSchema);
  });
});
