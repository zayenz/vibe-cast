# Immersive scenes

One WebGL fullscreen triangle, a scene shader and a shared spatial antialias pass,
with no asset downloads or extra rendering dependencies. Antialiasing uses no frame history,
so moving geometry and music pulses cannot leave trails.
The existing plugin schemas drive the Control Plane and Mobile Remote controls and saved presets.

Each scene exports a `SceneDefinition` and renders it with `SceneCanvas`. Keep plugin metadata in a
separate file and lazy-load its component so the remote does not download shader code.

`fragment` implements `vec3 scene(vec2 uv)`; `uv` is centered and divided by screen height.
Return nonnegative RGB light values. The renderer applies tone mapping, gamma, and common dimming.
Shared GLSL helpers include `noise`, `fbm`, hashes, `rot`, `palette`, SDF primitives, and `cameraRay`.
`filterWidth` estimates a pixel footprint for filtering fine patterns. `cellExit` limits a ray
step to its next procedural cell boundary. Use traversal bounds only while tracing rays;
they are not surfaces and must not enter normals or ambient occlusion.

Uniforms:
- `uResolution`: render size in pixels.
- `uTime`: integrated animation time, controlled by Speed (zero freezes travel).
- `uClock`: active wall-clock seconds, independent of Speed.
- `uBass`, `uMid`, `uTreble`, `uEnergy`: smoothed normalized FFT bands, scaled by Music response.
- `uPulse`: positive energy transient with a short decay, not a BPM detector.
- `uSpectrum[32]`: smoothed spectrum for frequency-specific details.
- Every schema setting becomes `u` + capitalized ID. Numeric ranges are floats, booleans 0/1,
  selects their zero-based option index, colors vec3. Shared settings give `uSeed`, `uQuality`
  (0/1/2), `uSpeed`, `uAudioResponse`.

Use bounded loops and scene scale appropriate to the render budget. Quality caps resolution and can
also select shader iteration counts. Avoid reversed smoothstep edges (undefined in GLSL), per-frame
React state, and multiplying elapsed time by a live speed setting (which teleports the camera).

## Preview and verification

Run `npm run dev`, then open `/scene-lab`. This development-only route provides the real plugin
controls, a silent mode, simulated music, brightness, and a time jump for inspecting later parts
of the journey (`?scene=forest-flight&time=180`). It is removed from production builds.
The preview's simulated music is only a development signal; the app uses its native audio input.
With the dev server running, `node scripts/check-immersive-scenes.mjs` verifies real GPU rendering,
all select variations, audio input, pause, dimming, resize, and context recovery. Pass `webkit` to
exercise WebKit as well (requires the corresponding Playwright browser installation).

For a repeatable performance sample, close other visualizers and run:

```sh
node scripts/profile-immersive-scenes.mjs /tmp/scenes.json chromium medium
```

This measures warmed frame cadence at a 1920×1080 viewport, records the actual rendering size,
and runs a blank-page control to identify browser frame-rate limits. It saves raw intervals and
one screenshot per scene. `SCENES`, `ROUNDS`, and `SECONDS` can narrow or lengthen the run.
Use `webkit` to check the macOS engine too; its headless frame cadence can differ from Tauri.

New installations include the seven scene presets. Existing configurations keep their saved
presets: add a preset in Settings → Visualizations and choose the new scene. Each scene includes
several habitats, formations, or color worlds, as well as a stable world variation seed.

The natural environments are procedural real-time worlds; they do not load photographic assets.
Use Low quality on slower machines, Balanced for normal use, or High for additional detail.
