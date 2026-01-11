import { describe, it, expect } from 'vitest';
import { PhotoSlideshowPlugin } from '../PhotoSlideshowPlugin';

describe('PhotoSlideshowPlugin Feature Removal', () => {
  it('should not have sourceType setting (it has been removed)', () => {
    const sourceTypeSetting = PhotoSlideshowPlugin.settingsSchema.find(s => s.id === 'sourceType');
    expect(sourceTypeSetting).toBeUndefined();
  });
});
