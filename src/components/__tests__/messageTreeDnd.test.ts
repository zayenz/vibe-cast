import { describe, it, expect } from 'vitest';
import { adjustPathForRemoval } from '../messageTreeDnd';

describe('messageTreeDnd.adjustPathForRemoval', () => {
  it('adjusts target sibling index when a prior sibling is removed', () => {
    // Removing root[0] shifts root[1] -> root[0]
    expect(adjustPathForRemoval('1', '0')).toBe('0');
  });

  it('does not adjust when removal is after target', () => {
    expect(adjustPathForRemoval('0', '1')).toBe('0');
  });

  it('adjusts nested path at the correct depth', () => {
    // Remove root[0].children[0], so root[0].children[1] becomes [0]
    expect(adjustPathForRemoval('0.1', '0.0')).toBe('0.0');
    // Different parent: no change
    expect(adjustPathForRemoval('1.0', '0.0')).toBe('1.0');
  });
});


