import { describe, expect, it } from 'vitest';
import { SceneAudio } from './audio';

describe('scene audio envelopes', () => {
  it('keeps low-frequency and high-frequency energy distinct', () => {
    const low = new SceneAudio(), high = new SceneAudio();
    const bass = new Array<number>(512).fill(0), treble = [...bass];
    bass.fill(0.5, 1, 8);
    treble.fill(0.5, 160, 512);
    for (let i = 0; i < 60; i++) { low.update(bass, 1 / 60, 1); high.update(treble, 1 / 60, 1); }
    expect(low.bass).toBeGreaterThan(0.7);
    expect(low.treble).toBe(0);
    expect(high.treble).toBeGreaterThan(0.7);
    expect(high.bass).toBe(0);
  });

  it('decays to silence after capture disappears and rejects invalid samples', () => {
    const audio = new SceneAudio();
    const signal = new Array<number>(512).fill(0.6);
    audio.update(signal, 0.1, 1);
    expect(audio.energy).toBeGreaterThan(0.5);
    for (let i = 0; i < 120; i++) audio.update([NaN, Infinity, -1], 1 / 60, 1);
    expect(audio.energy).toBeLessThan(0.001);
    expect(audio.pulse).toBeLessThan(0.001);
    expect([...audio.spectrum].every(Number.isFinite)).toBe(true);
  });

  it('makes smoothing independent of frame rate', () => {
    const slow = new SceneAudio(), fast = new SceneAudio();
    const signal = new Array<number>(512).fill(0.1);
    for (let i = 0; i < 30; i++) slow.update(signal, 1 / 30, 0.4);
    for (let i = 0; i < 120; i++) fast.update(signal, 1 / 120, 0.4);
    expect(slow.energy).toBeCloseTo(fast.energy, 5);
  });
});
