# Immersive visualizer performance pass — 2026-10-24

The largest measured bottlenecks were Forest Flight and Ocean Drift. Both now render faster
without lowering the existing pixel budgets or default vegetation density. The pass also fixes
missing tree sections, seabed shading seams, mountain silhouette gaps, and several sources of
fine-detail shimmer.

## Measurements

Apple M1 Max, Chromium 145 with ANGLE/Metal, 1920×1080 viewport, Balanced quality,
1193×671 internal rendering (the existing 800k-pixel budget), simulated music enabled.
The blank-page control ran at 120 fps. These are warmed browser frame-cadence measurements,
not GPU timer queries or native Tauri end-to-end latency.

| Scene | Before, fps | After, fps | Before p95, ms | After p95, ms |
| --- | ---: | ---: | ---: | ---: |
| Forest Flight | 41.9 | 65.7 | 33.0 | 18.0 |
| Dream Fractal | 120.0 | 120.0 | 9.7 | 9.6–9.8 |
| Spectral Lines | 120.0 | 120.0 | 9.8 | 9.6–9.8 |
| Circuit Flight | 120.0 | 120.0 | 9.6 | 9.6–9.7 |
| Ocean Drift | 62.8 | 92.0–92.2 | 25.4 | 17.1–17.3 |
| Cloud Flight | 111.3 | 111.7–112.2 | 16.7 | 16.4 |
| Aurora Voyage | 100.8 | 78.9–79.1 | 17.0 | 17.8–18.0 |

The baseline used one three-second sample per scene. The comparison used two six-second
samples in alternating scene order, each after three seconds of warmup. Forest's final
pixel-sized ray tolerance was measured separately: 65.7 fps near the start, then 64.9 and
65.1 fps at three minutes into the flight. Frames longer than 25 ms fell from 41.3% in the
forest baseline to 0.3–0.8% in those final samples. This is a substantial improvement, though
it is not a guarantee of a locked frame rate on every machine or parameter combination.

Aurora's corrected terrain intersection costs more than its previous incomplete terrain.
It remains above 60 fps in this run. Clouds showed no material sustained speed change;
their improvements are cleaner volume sampling and cheaper light probes. Measurements at
120 fps are display-limited. Small differences between runs should not be read as speedups.

WebKit 26's headless blank page measured 29.9 fps and the ocean measured 30.0 fps. That cap
prevents a useful 60-fps throughput comparison in this runner. WebKit rendering compatibility
is checked separately. Native audio capture and the native window compositor are outside
these measurements. High quality intentionally spends more GPU time on detail; Low remains
available on slower hardware.

Summary samples are in [immersive-2026-10-24.json](immersive-2026-10-24.json).
With the dev server running, reproduce or extend the measurements with:

```sh
node scripts/profile-immersive-scenes.mjs /tmp/scenes.json chromium medium
SCENES=forest-flight START_TIME=180 ROUNDS=2 SECONDS=6 node scripts/profile-immersive-scenes.mjs /tmp/forest-later.json chromium medium
```

## Rendering changes

- Shared spatial antialiasing smooths silhouettes without temporal history or ghost trails.
  Static uniforms upload only when settings change; inactive audio uniforms are skipped.
- Forest caches procedural patch constants, intersects tree columns separately, uses local
  surface normals and cheaper shadow probes, and stops tracing below half-pixel precision.
  Geometry remains contained within repeated cells at maximum growth. Explicitly initialized
  local cache state avoids an ANGLE/Metal compiler failure seen with mutable shader globals.
- Ocean skips empty space and small distant detail, uses analytical seabed normals, filters
  caustics and sand texture, and shades fallback sand consistently with traced sand.
- Circuit traversal advances to the next cell boundary. Fine tracks, vias, and surface grain
  are filtered at their projected pixel size. Dream patterns and thin spectral cores receive
  similar filtering. Cloud light probes omit noise finer than their sampling footprint.
- Aurora brackets terrain intersections in travel order, including upward grazing rays,
  so distant mountains no longer split into disconnected silhouettes.

The scene lab can jump to later travel positions. The GPU check script exercises positions
at 60, 180, and 600 seconds, all select variations, audio response, freeze, dimming, resizing,
and real WebGL context loss/restoration. Screenshot inspection complements these checks:
a nonblank canvas alone cannot prove that all vegetation is present.
