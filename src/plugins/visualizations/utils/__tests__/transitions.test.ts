import { describe, it, expect } from 'vitest';
import { getTransitionStyles } from '../transitions';

describe('transitions', () => {
  it('flip transition should have 3D perspective', () => {
    const active = getTransitionStyles('flip', 'active');
    const exit = getTransitionStyles('flip', 'exit');

    expect(active.transform).toContain('perspective');
    expect(exit.transform).toContain('perspective');
  });
});