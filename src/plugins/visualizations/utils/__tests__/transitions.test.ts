import { describe, it, expect } from 'vitest';
import { getTransitionStyles } from '../transitions';

describe('transitions', () => {
  it('flip transitions should have 3D perspective', () => {
    const activeY = getTransitionStyles('flipY', 'active');
    const exitY = getTransitionStyles('flipY', 'exit');
    expect(activeY.transform).toContain('perspective');
    expect(exitY.transform).toContain('perspective');

    const activeX = getTransitionStyles('flipX', 'active');
    const exitX = getTransitionStyles('flipX', 'exit');
    expect(activeX.transform).toContain('perspective');
    expect(exitX.transform).toContain('perspective');
  });
});