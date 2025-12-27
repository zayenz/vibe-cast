type JsonLike = null | boolean | number | string | JsonLike[] | { [k: string]: JsonLike };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isObject(a) && isObject(b)) {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length) return false;
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return false;
      if (!deepEqual(a[ak[i]], b[bk[i]])) return false;
    }
    return true;
  }
  return false;
}

/**
 * Applies a single per-message override edit and prunes overrides that match baseSettings.
 * Returns `undefined` when no overrides remain (so "(modified)" only appears when truly different).
 */
export function applyStyleOverrideChange(
  baseSettings: Record<string, unknown>,
  currentOverrides: Record<string, unknown> | undefined,
  key: string,
  value: unknown
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = { ...(currentOverrides ?? {}) };
  const baseVal = baseSettings[key];

  if (deepEqual(value, baseVal)) {
    delete next[key];
  } else {
    next[key] = value as JsonLike;
  }

  return Object.keys(next).length === 0 ? undefined : next;
}



