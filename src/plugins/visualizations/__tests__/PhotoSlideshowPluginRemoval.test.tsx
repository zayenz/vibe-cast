import { describe, it, expect } from 'vitest';
import { PhotoSlideshowPlugin } from '../PhotoSlideshowPlugin';

describe('PhotoSlideshowPlugin Feature Removal', () => {
  it('should not have Apple Photos as a source option', () => {
    const sourceTypeSetting = PhotoSlideshowPlugin.settingsSchema.find(s => s.id === 'sourceType');
    expect(sourceTypeSetting).toBeDefined();
    
    if (sourceTypeSetting?.type === 'select') {
      const options = sourceTypeSetting.options.map(o => o.value);
      expect(options).not.toContain('photos');
    }
  });
});
