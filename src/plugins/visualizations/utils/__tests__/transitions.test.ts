import { describe, it, expect } from 'vitest';
import { getTransitionStyles } from '../transitions';

describe('transitions', () => {
  it('cube transition should have 3D properties', () => {
    const enter = getTransitionStyles('cube', 'enter');
    const exit = getTransitionStyles('cube', 'exit');

    // Currently it just uses rotateX/rotateY without translateZ or special origin
    // Once I improve it, these should fail if I don't update the test.
    // Actually, I'll write the test to expect what I WANT.
    
    expect(enter.transform).toContain('translateZ');
    expect(exit.transform).toContain('translateZ');
  });
});
