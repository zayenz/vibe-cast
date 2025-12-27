import { describe, it, expect } from 'vitest';
import { applyStyleOverrideChange } from '../messageStyleOverrides';

describe('applyStyleOverrideChange', () => {
  it('creates an override when value differs from base', () => {
    const base = { size: 5, color: 'red' };
    const next = applyStyleOverrideChange(base, undefined, 'size', 6);
    expect(next).toEqual({ size: 6 });
  });

  it('prunes an override when value matches base', () => {
    const base = { size: 5, color: 'red' };
    const next = applyStyleOverrideChange(base, { size: 6 }, 'size', 5);
    expect(next).toBeUndefined();
  });

  it('keeps other override keys when pruning one key', () => {
    const base = { a: 1, b: 2 };
    const next = applyStyleOverrideChange(base, { a: 9, b: 8 }, 'b', 2);
    expect(next).toEqual({ a: 9 });
  });
});



