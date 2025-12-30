import { MessageConfig } from '../plugins/types';

/**
 * Compute the sequence of message parts to display for a message, including
 * split handling and repeat looping when splitting is enabled.
 */
export function computeSplitSequence(message: MessageConfig): { splitActive: boolean; sequence: string[] } {
  const separator = message.splitSeparator ?? '';
  const splitActive = !!message.splitEnabled && separator.length > 0;

  if (!splitActive) {
    return { splitActive: false, sequence: [message.text] };
  }

  // Credits uses split primarily as "load text file lines", where leading spaces and empty lines matter.
  // Do not trim, do not drop empties, and do not expand repeats here (Credits plugin handles repeatCount).
  if (message.textStyle === 'credits') {
    const raw = message.text.split(separator);
    return { splitActive: true, sequence: raw.length > 0 ? raw : [message.text] };
  }

  const rawParts = message.text.split(separator).map((p) => p.trim());
  const parts = rawParts.filter((p) => p.length > 0);
  const normalizedParts = parts.length > 0 ? parts : [message.text.trim()];
  const loops = Math.max(1, message.repeatCount ?? 1);
  const sequence: string[] = [];

  for (let i = 0; i < loops; i += 1) {
    sequence.push(...normalizedParts);
  }

  return { splitActive: true, sequence };
}

