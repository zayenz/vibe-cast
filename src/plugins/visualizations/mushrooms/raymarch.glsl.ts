// Raymarch shader code for Mushrooms visualization.
// Stored as TS strings so we can keep everything in the plugin bundle.

export const fullscreenVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const raymarchFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uAudio;

  // Settings
  uniform int uQuality;          // 0 low, 1 medium, 2 high
  uniform float uSectionLength;  // seconds
  uniform float uSeed;
  uniform float uUserDensity;    // 0..1
  uniform float uTreeDensity;    // 0..1
  uniform float uScale;          // 0.5..2.0
  uniform int uStyleOffset;      // 0..4 (shifts palette cycle)
  uniform float uColorIntensity;
  uniform float uFogAmount;      // 0..1
  uniform float uGlow;           // 0..2
  uniform float uWarp;           // 0..1 (psychedelic space warp)
  uniform float uFocus;          // 0..1 (fake DOF/softness)
  uniform float uShowGround;     // 0..1
  uniform float uDebug;          // 0..1
  uniform vec2 uJitter;          // subpixel jitter in pixels
  uniform float uDitherStrength; // 0..1
  uniform sampler2D uRampCap;
  uniform sampler2D uRampStem;
  uniform sampler2D uRampGround;
  uniform sampler2D uRampSky;

  // ----------------------------------------------------------------------------
  // Hash / noise
  // ----------------------------------------------------------------------------
  float hash11(float p) { return fract(sin(p) * 43758.5453123); }
  float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  vec2 hash22(vec2 p) {
    float n = sin(dot(p, vec2(41.0, 289.0))) * 43758.5453123;
    return fract(vec2(262144.0, 32768.0) * n);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  float fbm3(vec3 p) {
    // Cheap 3D-ish noise via rotated 2D slices
    float v = 0.0;
    float a = 0.5;
    vec3 q = p;
    for (int i = 0; i < 3; i++) {
      v += a * noise(q.xz) + a * 0.5 * noise(q.xy);
      q = q * 2.01 + vec3(1.7, 9.2, 3.4);
      a *= 0.5;
    }
    return v;
  }

  mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
  }

  // ----------------------------------------------------------------------------
  // Palette (realistic-but-trippy: vivid yet cohesive)
  // style index is derived from section system in-shader.
  // ----------------------------------------------------------------------------
  vec3 paletteIQ(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.2831853 * (c * t + d));
  }

  vec3 palette(int style, float t) {
    if (style == 0) { // deep dream purple/teal
      return paletteIQ(t, vec3(0.34, 0.25, 0.52), vec3(0.45, 0.38, 0.55), vec3(1.0), vec3(0.05, 0.25, 0.55));
    }
    if (style == 1) { // aurora
      return paletteIQ(t, vec3(0.20, 0.32, 0.48), vec3(0.28, 0.35, 0.45), vec3(1.0), vec3(0.60, 0.20, 0.10));
    }
    if (style == 2) { // neon candy
      return paletteIQ(t, vec3(0.32, 0.12, 0.52), vec3(0.62, 0.52, 0.72), vec3(1.0), vec3(0.85, 0.10, 0.55));
    }
    if (style == 3) { // forest biolume
      return paletteIQ(t, vec3(0.10, 0.20, 0.14), vec3(0.12, 0.20, 0.12), vec3(1.0), vec3(0.25, 0.20, 0.15));
    }
    // psychedelic rainbow
    return paletteIQ(t, vec3(0.52, 0.45, 0.55), vec3(0.45, 0.45, 0.45), vec3(1.0), vec3(0.00, 0.15, 0.25));
  }

  // ----------------------------------------------------------------------------
  // SDF primitives
  // ----------------------------------------------------------------------------
  float sdSphere(vec3 p, float r) { return length(p) - r; }

  float sdEllipsoid(vec3 p, vec3 r) {
    // Approx: distance to ellipsoid
    float k0 = length(p / r);
    float k1 = length(p / (r * r));
    return k0 * (k0 - 1.0) / k1;
  }

  float sdCappedCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
  }

  float sdRoundCone(vec3 p, float r1, float r2, float h) {
    vec2 q = vec2(length(p.xz), p.y);
    vec2 k1 = vec2(r2, h);
    vec2 k2 = vec2(r2 - r1, 2.0 * h);
    vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
    vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
    float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
    return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
  }

  // ----------------------------------------------------------------------------
  // Mushroom SDF (stem + cap + gills + spots microdetail)
  // Returns: vec2(dist, materialId) where materialId:
  // 0 ground, 1 stem, 2 cap, 3 tree
  // WebGL1-safe: avoid struct constructors/ternary-on-struct.
  // ----------------------------------------------------------------------------
  vec2 hit(float d, float m) { return vec2(d, m); }
  vec2 opU(vec2 a, vec2 b) { return (a.x < b.x) ? a : b; }

  float softMin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // Cell helpers (WebGL1-safe). Cells are centered at integer multiples of cellSize.
  vec2 cellID2(vec2 p, float cellSize) {
    return floor((p + 0.5 * cellSize) / cellSize);
  }

  vec2 cellCenter2(vec2 p, float cellSize) {
    // With the above ID definition, the center is cid * cellSize.
    vec2 cid = cellID2(p, cellSize);
    return cid * cellSize;
  }

  // “Realistic but trippy” mushroom: subtle asymmetry + cap lip + gill cavity
  vec2 sdMushroom(vec3 p, float id, float t, float audio, float warp) {
    // Random per-cell
    float h = hash11(id * 13.37 + 1.0);
    float h2 = hash11(id * 19.93 + 7.0);
    float h3 = hash11(id * 7.11 + 3.0);

    // Vary size
    float sc = clamp(uScale, 0.5, 2.0);
    float stemH = mix(0.9, 2.6, h) * sc;
    float stemR = mix(0.10, 0.22, h2) * sc;
    float capR  = mix(0.35, 0.95, h3) * sc;

    // Evolution: gentle morph + “demo” wobble
    float evo = t * (0.35 + 0.25 * h2) + h * 6.2831;
    float breathe = 1.0 + 0.08 * sin(evo) + 0.06 * sin(evo * 0.7 + 1.7) + 0.08 * audio;
    float tilt = (h2 - 0.5) * 0.35 + 0.15 * sin(evo * 0.33);

    // Psychedelic warp in local space (small, to keep “real”)
    float w = 0.12 * warp * (0.35 + 0.65 * h);
    p.xz *= rot(w * sin(t * 0.7 + id));
    p.xy *= rot(w * 0.7 * sin(t * 0.45 + id * 2.0));

    // Tilt
    p.xz *= rot(tilt);

    // Stem: slightly tapered + noisy bulge
    vec3 ps = p;
    float bulge = 0.10 * (fbm(ps.xz * 2.5 + id) - 0.5);
    float stem = sdRoundCone(ps, stemR * 1.12, stemR * 0.82, stemH);
    stem += bulge;

    // Cap: ellipsoid with lip; sits on top
    vec3 pc = p - vec3(0.0, stemH * 0.92 * breathe, 0.0);
    pc.y *= 0.7;
    float cap = sdEllipsoid(pc, vec3(capR * 1.08, capR * 0.55, capR * 1.08));
    // Lip / skirt
    float lip = sdEllipsoid(pc - vec3(0.0, 0.12, 0.0), vec3(capR * 1.05, capR * 0.28, capR * 1.05));
    cap = softMin(cap, lip, 0.18);

    // Gill cavity underside
    vec3 pg = pc + vec3(0.0, 0.20, 0.0);
    float cavity = sdEllipsoid(pg, vec3(capR * 0.78, capR * 0.22, capR * 0.78));
    cap = max(cap, -cavity);

    // Spots: only on cap, as micro bumps (domain in cap space)
    float spots = fbm((pc.xz * 3.8 + id) * rot(h * 6.2831));
    float spotMask = smoothstep(0.55, 0.78, spots);
    cap += (spotMask - 0.5) * 0.04;

    float d = min(stem, cap);
    float m = (cap < stem) ? 2.0 : 1.0;
    return hit(d, m);
  }

  float sdTree(vec3 p, float id, float t) {
    float h = hash11(id * 9.13 + 1.2);
    float h2 = hash11(id * 4.77 + 8.4);
    // Whimsical silhouettes: fewer, thicker, shorter, smoother (avoid "glitch pillars")
    float height = mix(4.0, 9.0, h);
    float r1 = mix(0.30, 0.55, h2);
    float r2 = r1 * mix(0.55, 0.85, hash11(id * 2.17 + 0.4));
    // Gentle bend
    p.x += 0.18 * sin(p.y * 0.22 + t * 0.18 + id);
    p.z += 0.14 * cos(p.y * 0.18 + t * 0.16 + id * 2.0);
    // Tapered trunk
    float trunk = sdRoundCone(p - vec3(0.0, height * 0.5, 0.0), r1, r2, height * 0.5);
    // Very mild bark (stable)
    trunk += 0.02 * (noise(p.xz * 1.6 + id) - 0.5);
    return trunk;
  }

  float groundHeight(vec2 xz, float t) {
    float n = fbm(xz * 0.12 + vec2(t * 0.03, -t * 0.02));
    float n2 = fbm(xz * 0.25 + vec2(-t * 0.02, t * 0.04));
    return (n - 0.5) * 0.6 + (n2 - 0.5) * 0.25;
  }

  vec2 mapScene(vec3 p, float t, float audio, float seed, float warp, float density) {
    vec2 res = hit(1e9, 0.0);

    // Ground
    if (uShowGround > 0.5) {
      float gh = groundHeight(p.xz, t);
      float dGround = p.y - gh;
      res = opU(res, hit(dGround, 0.0));
    }

    // Trees: far ring
    {
      float cell = 6.0;
      // Ring mask: only place trees beyond radius
      float r = length(p.xz);
      if (r > 10.0) {
        vec2 off = vec2(seed * 10.0, seed * -8.0);
        vec2 pOff = p.xz + off;
        vec2 cid = cellID2(pOff, cell);
        vec2 center = cellCenter2(pOff, cell) - off;
        vec3 q = p - vec3(center.x, 0.0, center.y);
        float id = cid.x * 19.0 + cid.y * 7.0 + seed * 131.0;
        float pick = hash11(id * 1.31 + 11.0);
        if (pick < clamp(uTreeDensity, 0.0, 1.0)) {
          float dTree = sdTree(q, id, t);
          res = opU(res, hit(dTree, 3.0));
        }
      }
    }

    // Mushrooms: repeated cells near camera
    {
      float cell = mix(1.6, 2.6, 1.0 - density); // higher density => smaller cells
      vec2 off = vec2(seed * 3.0, seed * -2.0);
      vec2 pOff = p.xz + off;
      vec2 cid = cellID2(pOff, cell);
      vec2 center = cellCenter2(pOff, cell) - off;
      float id = cid.x * 37.0 + cid.y * 17.0 + seed * 101.0;
      // Probabilistic placement
      float pick = hash11(id * 1.7 + 3.0);
      if (pick < mix(0.30, 0.72, density) * clamp(uUserDensity, 0.0, 1.0)) {
        // Place each mushroom at the ground height of its cell center to avoid world/local mixing artifacts.
        float baseY = 0.0;
        if (uShowGround > 0.5) {
          baseY = groundHeight(center, t);
        }
        vec3 q = p - vec3(center.x, baseY, center.y);
        vec2 m = sdMushroom(q, id, t, audio, warp);
        res = opU(res, m);
      }
    }

    return res;
  }

  // ----------------------------------------------------------------------------
  // Raymarch + shading
  // ----------------------------------------------------------------------------
  vec3 calcNormal(vec3 p, float t, float audio, float seed, float warp, float density) {
    float e = 0.0025;
    vec2 h = vec2(e, 0.0);
    float dx = mapScene(p + vec3(h.x, h.y, h.y), t, audio, seed, warp, density).x - mapScene(p - vec3(h.x, h.y, h.y), t, audio, seed, warp, density).x;
    float dy = mapScene(p + vec3(h.y, h.x, h.y), t, audio, seed, warp, density).x - mapScene(p - vec3(h.y, h.x, h.y), t, audio, seed, warp, density).x;
    float dz = mapScene(p + vec3(h.y, h.y, h.x), t, audio, seed, warp, density).x - mapScene(p - vec3(h.y, h.y, h.x), t, audio, seed, warp, density).x;
    return normalize(vec3(dx, dy, dz));
  }

  float softShadow(vec3 ro, vec3 rd, float t, float audio, float seed, float warp, float density) {
    float res = 1.0;
    float ph = 1e20;
    float s = 0.02;
    for (int i = 0; i < 16; i++) {
      float h = mapScene(ro + rd * s, t, audio, seed, warp, density).x;
      float y = h * h / (2.0 * ph);
      float d = sqrt(max(0.0, h * h - y * y));
      res = min(res, 10.0 * d / max(0.0001, s - y));
      ph = h;
      s += clamp(h, 0.02, 0.25);
      if (res < 0.02 || s > 22.0) break;
    }
    return clamp(res, 0.0, 1.0);
  }

  float aoApprox(vec3 p, vec3 n, float t, float audio, float seed, float warp, float density) {
    float ao = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 3; i++) {
      float h = 0.03 + 0.06 * float(i);
      float d = mapScene(p + n * h, t, audio, seed, warp, density).x;
      ao += (h - d) * sca;
      sca *= 0.7;
    }
    return clamp(1.0 - ao, 0.0, 1.0);
  }

  vec3 sampleRamp(sampler2D ramp, float x) {
    float u = clamp(x, 0.0, 1.0);
    return texture2D(ramp, vec2(u, 0.5)).rgb;
  }

  vec3 shade(vec3 p, vec3 n, vec3 rd, float mat, float t, float audio, float styleMix, int styleA, int styleB) {
    vec3 V = -rd;
    vec3 L1 = normalize(vec3(0.6, 0.9, 0.3));
    vec3 L2 = normalize(vec3(-0.8, 0.45, -0.25));
    float diff = 0.7 * max(0.0, dot(n, L1)) + 0.3 * max(0.0, dot(n, L2));
    float rim = pow(1.0 - max(0.0, dot(n, V)), 2.1);

    // Illustrative ramp shading: compute a stylized light coordinate and sample ramps.
    float lit = clamp(0.08 + 0.92 * diff, 0.0, 1.0);
    lit += 0.35 * rim;
    lit = clamp(lit, 0.0, 1.0);

    vec3 base;
    if (mat < 0.5) {
      // Ground: add mild pattern but keep stable
      float pat = 0.15 * fbm(p.xz * 0.18 + vec2(t * 0.01));
      base = sampleRamp(uRampGround, clamp(lit + pat, 0.0, 1.0));
    } else if (mat < 1.5) {
      float grain = 0.10 * fbm(p.xz * 0.35 + p.y * 0.10);
      base = sampleRamp(uRampStem, clamp(lit + grain, 0.0, 1.0));
    } else if (mat < 2.5) {
      float speck = 0.12 * fbm(p.xz * 0.45 + vec2(t * 0.02, -t * 0.01));
      base = sampleRamp(uRampCap, clamp(lit + speck, 0.0, 1.0));
    } else {
      // Trees: darker, more silhouette
      base = mix(vec3(0.02, 0.02, 0.03), vec3(0.12, 0.08, 0.18), 0.15 + 0.35 * rim);
    }

    // Specular sparkle (subtle)
    vec3 H = normalize(L1 + V);
    float spec = pow(max(0.0, dot(n, H)), 24.0);

    // Bioluminescent emissive: more on caps, a little on ground (storybook glow)
    float emiss = 0.0;
    if (mat < 0.5) emiss = 0.10 + 0.25 * fbm(p.xz * 0.18 + t * 0.02);
    else if (mat < 1.5) emiss = 0.20;
    else if (mat < 2.5) emiss = 0.75;
    emiss *= (0.55 + 0.45 * audio);
    emiss *= uGlow;

    vec3 col = base * (0.20 + 0.90 * diff) + spec * vec3(0.65);
    col += base * (0.35 * rim + emiss);
    return col;
  }

  // ----------------------------------------------------------------------------
  // Camera / demo sections
  // ----------------------------------------------------------------------------
  void sectionParams(float t, out float styleMix, out int styleA, out int styleB, out float density, out float camRad, out float camY) {
    float secLen = max(6.0, uSectionLength);
    float idx = floor(t / secLen);
    float f = fract(t / secLen);
    float s = smoothstep(0.10, 0.90, f);

    // Rotate through style indices
    float off = float(uStyleOffset);
    int a = int(mod(idx + off, 5.0));
    int b = int(mod(idx + off + 1.0, 5.0));
    // Map to palette indices (0..4 are our base palettes, but we treat 0 as deep dream)
    // We shift so it cycles: deepDream -> aurora -> neon -> forest -> rainbow -> ...
    int styleMapA = a;
    int styleMapB = b;

    styleA = styleMapA;
    styleB = styleMapB;
    styleMix = s;

    // Density breathes per section (demo evolution)
    float dA = 0.35 + 0.45 * hash11(idx * 3.1 + 1.0);
    float dB = 0.35 + 0.45 * hash11((idx + 1.0) * 3.1 + 1.0);
    density = mix(dA, dB, s);

    // Camera path shifts per section
    float rA = mix(9.0, 14.0, hash11(idx * 2.3 + 4.0));
    float rB = mix(9.0, 14.0, hash11((idx + 1.0) * 2.3 + 4.0));
    camRad = mix(rA, rB, s);

    float yA = mix(2.2, 6.2, hash11(idx * 4.7 + 2.0));
    float yB = mix(2.2, 6.2, hash11((idx + 1.0) * 4.7 + 2.0));
    camY = mix(yA, yB, s);
  }

  // Ray direction from camera
  vec3 getRayDir(vec2 uv, vec3 ro, vec3 ta, float zoom) {
    vec3 f = normalize(ta - ro);
    vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
    vec3 u = cross(f, r);
    vec3 c = f * zoom;
    vec3 i = c + uv.x * r + uv.y * u;
    return normalize(i);
  }

  // ----------------------------------------------------------------------------
  // Main
  // ----------------------------------------------------------------------------
  void main() {
    vec2 uv = vUv;
    vec2 p = (uv * 2.0 - 1.0);
    p.x *= uResolution.x / max(1.0, uResolution.y);

    // Debug path: verify shader is drawing at all.
    if (uDebug > 0.5) {
      gl_FragColor = vec4(uv.x, uv.y, 0.2 + 0.8 * sin(uTime * 0.5) * 0.5 + 0.5, 1.0);
      return;
    }

    // Subtle time warp from audio (demoscene “breath”)
    float t = uTime * (0.95 + 0.12 * uAudio);

    float styleMix; int styleA; int styleB; float density; float camRad; float camY;
    sectionParams(t, styleMix, styleA, styleB, density, camRad, camY);
    density = clamp(density * clamp(uUserDensity, 0.0, 1.0), 0.0, 1.0);

    // Apply subpixel jitter (for TAA). uJitter is in pixels.
    vec2 jitterNdc = (uJitter / max(uResolution, vec2(1.0))) * 2.0;
    p += jitterNdc;

    // Camera orbit + gentle bob + “dream warp”
    float camT = t * 0.12;
    vec3 ro = vec3(cos(camT) * camRad, camY + 0.25 * sin(t * 0.35), sin(camT) * camRad);
    vec3 ta = vec3(0.0, 2.2 + 0.35 * sin(t * 0.18), 0.0);

    // Space warp (small) for trippy realism
    float warp = clamp(uWarp, 0.0, 1.0);
    vec2 wp = p;
    wp *= rot(0.06 * warp * sin(t * 0.6));
    wp += 0.02 * warp * vec2(sin(t * 0.9 + p.y * 2.0), cos(t * 0.7 + p.x * 2.0));

    float zoom = mix(1.25, 1.55, 0.5 + 0.5 * sin(t * 0.08));
    vec3 rd = getRayDir(wp, ro, ta, zoom);

    // Quality settings
    int steps = (uQuality == 0) ? 56 : (uQuality == 1 ? 78 : 104);
    float maxDist = (uQuality == 0) ? 32.0 : (uQuality == 1 ? 40.0 : 48.0);
    float surfEps = (uQuality == 0) ? 0.006 : (uQuality == 1 ? 0.0045 : 0.0035);

    // March
    float d = 0.0;
    float mat = -1.0;
    float fogAcc = 0.0;
    vec3 col = vec3(0.0);

    float seed = uSeed;
    for (int i = 0; i < 160; i++) {
      if (i >= steps) break;
      vec3 pos = ro + rd * d;
      vec2 h = mapScene(pos, t, uAudio, seed, warp, density);
      float dist = h.x;

      // Volumetric fog: accumulate density along ray (cheap)
      float fogD = clamp(uFogAmount, 0.0, 1.0);
      // Cheaper fog noise: 2D noise only (avoids heavy fbm3 per step)
      float fn = noise(pos.xz * 0.06 + vec2(t * 0.03, -t * 0.02));
      float fDensity = fogD * (0.010 + 0.010 * fn);
      fogAcc += fDensity * clamp(1.0 - dist * 0.8, 0.0, 1.0);

      if (dist < surfEps || d > maxDist) {
        mat = h.y;
        break;
      }
      d += dist * 0.85;
    }

    // Background: dreamy gradient + stars/sparks (brighter baseline so it's never "invisible")
    // Sky + portal/glade glow (storybook focal point)
    float skyU = clamp(0.55 + 0.35 * (1.0 - length(p)), 0.0, 1.0);
    vec3 bg = sampleRamp(uRampSky, skyU);
    // Portal centered near horizon
    vec2 portalCenter = vec2(0.0, -0.10);
    float pr = length(p - portalCenter);
    float portal = exp(-pr * pr * 3.5);
    // Soft ring bands to feel "magical"
    float bands = 0.5 + 0.5 * sin(12.0 * pr - t * 0.9);
    portal *= mix(0.55, 1.15, bands);
    vec3 portalCol = mix(vec3(0.10, 0.85, 1.0), vec3(1.0, 0.25, 0.85), 0.5 + 0.5 * sin(t * 0.25));
    bg += portalCol * (0.22 * portal);
    float v = smoothstep(1.2, 0.1, length(p));
    bg *= v;
    float stars = smoothstep(0.995, 1.0, noise(uv * uResolution * 0.35 + t * 0.02));
    bg += stars * vec3(0.08, 0.10, 0.14);

    if (mat >= 0.0 && d <= maxDist) {
      vec3 pos = ro + rd * d;
      vec3 n = calcNormal(pos, t, uAudio, seed, warp, density);

      // AO + soft shadow for more “realistic”
      float ao = aoApprox(pos, n, t, uAudio, seed, warp, density);
      float sh = softShadow(pos + n * 0.02, normalize(vec3(0.6, 0.9, 0.3)), t, uAudio, seed, warp, density);

      col = shade(pos, n, rd, mat, t, uAudio, styleMix, styleA, styleB);
      col *= ao * mix(0.65, 1.0, sh);

      // Subsurface-ish for stems/caps
      float sss = (mat < 1.5) ? 0.35 : (mat < 2.5 ? 0.55 : 0.0);
      col += sss * vec3(0.22, 0.18, 0.30) * (0.25 + 0.75 * uAudio);
    } else {
      col = bg;
    }

    // Fog composite
    float fogAmt = clamp(uFogAmount, 0.0, 1.0);
    float fog = 1.0 - exp(-fogAcc * (0.75 + 1.25 * fogAmt));
    vec3 fogCol = mix(palette(styleA, 0.2), palette(styleB, 0.8), styleMix) * 0.14;
    col = mix(col, bg + fogCol, fog);

    // Cinematic grading: mild contrast + saturation, subtle CA, grain
    // Chromatic aberration (cheap): shift channels using radial offset
    float ca = 0.0025 * (0.3 + 0.7 * uWarp) * smoothstep(0.2, 1.2, length(p));
    vec2 dir = normalize(p + 1e-6);
    vec2 uvR = uv + dir * ca;
    vec2 uvB = uv - dir * ca;
  // Approximate CA via slight channel-dependent modulation (single-sample friendly)
  vec3 colR = col * (1.0 + 0.03 * uWarp);
  vec3 colB = col * (1.0 - 0.03 * uWarp);
    // Grain
    float g = noise(uv * uResolution * 0.20 + t * 1.5);
    col += (g - 0.5) * 0.015;

    // Softness (fake DOF): blend with bg by focus; strong in distance
    float focus = clamp(uFocus, 0.0, 1.0);
    float blur = smoothstep(10.0, 35.0, d) * focus;
    col = mix(col, bg, blur * 0.45);

    // Vignette (gentle)
    float vig = smoothstep(1.25, 0.12, length(p));
    col *= mix(0.85, 1.08, vig);

    // Color intensity + tone map
    col *= uColorIntensity;
    col = col / (1.0 + col); // simple Reinhard
    col = pow(col, vec3(0.90)); // slight lift

    // Add channel separation (very subtle)
    col = vec3(colR.r, col.g, colB.b);

    // Deterministic dither (reduce banding without animated grain)
    // Interleaved gradient noise based on pixel coords.
    float ds = clamp(uDitherStrength, 0.0, 1.0);
    if (ds > 0.001) {
      vec2 px = floor(uv * uResolution);
      float ign = fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
      col += (ign - 0.5) * (0.006 * ds);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;


