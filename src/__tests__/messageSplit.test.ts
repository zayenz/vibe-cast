import { describe, it, expect } from 'vitest';
import { computeSplitSequence } from '../utils/messageParts';
import type { MessageConfig } from '../plugins/types';

describe('computeSplitSequence', () => {
  const baseMessage: MessageConfig = {
    id: 'm1',
    text: '3|2|1',
    textStyle: 'scrolling-capitals',
  };

  it('splits a message into parts when enabled', () => {
    const { splitActive, sequence } = computeSplitSequence({
      ...baseMessage,
      splitEnabled: true,
      splitSeparator: '|',
    });

    expect(splitActive).toBe(true);
    expect(sequence).toEqual(['3', '2', '1']);
  });

  it('loops the split parts according to repeatCount', () => {
    const { sequence } = computeSplitSequence({
      ...baseMessage,
      splitEnabled: true,
      splitSeparator: '|',
      repeatCount: 2,
    });

    expect(sequence).toEqual(['3', '2', '1', '3', '2', '1']);
  });

  it('trims whitespace around parts', () => {
    const { sequence } = computeSplitSequence({
      ...baseMessage,
      text: ' first | second | third ',
      splitEnabled: true,
      splitSeparator: '|',
    });

    expect(sequence).toEqual(['first', 'second', 'third']);
  });

  it('ignores split when disabled or missing separator', () => {
    expect(computeSplitSequence({ ...baseMessage, splitEnabled: false, splitSeparator: '|' }).splitActive).toBe(false);
    expect(computeSplitSequence({ ...baseMessage, splitEnabled: true, splitSeparator: '' }).splitActive).toBe(false);
  });

  it('filters out empty parts after trimming', () => {
    const { sequence } = computeSplitSequence({
      ...baseMessage,
      text: 'A||B|  |C',
      splitEnabled: true,
      splitSeparator: '|',
    });

    expect(sequence).toEqual(['A', 'B', 'C']);
  });
});

