/**
 * DnD helper: after removing a node at `removedPath`, sibling indices shift.
 * This adjusts `targetPath` to still point at the same logical node.
 */
export function adjustPathForRemoval(targetPath: string, removedPath: string): string {
  if (!targetPath) return targetPath;
  if (!removedPath) return targetPath;

  const toIdx = (p: string) => p.split('.').filter(Boolean).map((s) => parseInt(s, 10));
  const t = toIdx(targetPath);
  const r = toIdx(removedPath);
  if (r.length === 0) return targetPath;

  const removedDepth = r.length - 1;
  if (t.length <= removedDepth) return targetPath;

  // Same parent at the depth where the removal happened?
  for (let i = 0; i < removedDepth; i++) {
    if (t[i] !== r[i]) return targetPath;
  }

  const removedIdx = r[removedDepth];
  if (t[removedDepth] > removedIdx) {
    t[removedDepth] -= 1;
  }

  return t.join('.');
}



