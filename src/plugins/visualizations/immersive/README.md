# Immersive scenes

One WebGL fullscreen triangle, one shader per scene, no asset downloads or extra rendering dependencies.
The existing plugin schemas drive the Control Plane and Mobile Remote controls and saved presets.

Each scene exports a `SceneDefinition` and renders it with `SceneCanvas`. Keep plugin metadata in a
separate file and lazy-load its component so the remote does not download shader code.

`fragment` implements `vec3 scene(vec2 uv)`; `uv` is centered and divided by screen height.
Return nonnegative RGB light values. The renderer applies tone mapping, gamma, and common dimming.
Shared GLSL helpers include `noise`, `fbm`, hashes, `rot`, `palette`, SDF primitives, and `cameraRay`.

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
controls, a silent mode, simulated music, and brightness. It is removed from production builds.
The preview's simulated music is only a development signal; the app uses its native audio input.
With the dev server running, `node scripts/check-immersive-scenes.mjs` verifies real GPU rendering,
all select variations, audio input, pause, dimming, resize, and context recovery. Pass `webkit` to
exercise WebKit as well (requires the corresponding Playwright browser installation).

New installations include the seven scene presets. Existing configurations keep their saved
presets: add a preset in Settings → Visualizations and choose the new scene. Each scene includes
several habitats, formations, or color worlds, as well as a stable world variation seed.

The natural environments are procedural real-time worlds; they do not load photographic assets.
Use Low quality on slower machines, Balanced for normal use, or High for additional detail.
