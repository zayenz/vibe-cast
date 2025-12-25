// Feedback (temporal) blend shader: combines current frame with previous frame with
// slight warp and decay to create demoscene-like trails/recursion.

export const feedbackVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const feedbackFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uCurrent;
  uniform sampler2D uPrev;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uAudio;

  uniform float uAmount; // 0..1 feedback amount
  uniform float uWarp;   // 0..1 warp strength

  float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

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

  void main() {
    vec2 uv = vUv;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= uResolution.x / max(1.0, uResolution.y);

    float amt = clamp(uAmount, 0.0, 1.0);
    float warp = clamp(uWarp, 0.0, 1.0);

    // Warp prev sample: subtle swirl + noise drift
    float t = uTime;
    float n = noise(uv * 2.5 + vec2(t * 0.03, -t * 0.02));
    vec2 dir = normalize(p + 1e-6);
    vec2 swirl = vec2(-dir.y, dir.x);

    float w = (0.002 + 0.006 * warp) * (0.6 + 0.4 * uAudio);
    vec2 uvPrev = uv;
    uvPrev += swirl * w * sin(t * 0.35 + n * 6.2831);
    uvPrev += dir * w * 0.5 * cos(t * 0.22 + n * 6.2831);

    vec3 cur = texture2D(uCurrent, uv).rgb;
    vec3 prev = texture2D(uPrev, uvPrev).rgb;

    // Decay: keep some trails but avoid runaway brightening
    float decay = mix(0.86, 0.95, 1.0 - amt);
    prev *= decay;

    // Blend: additive-ish but controlled (less streaky than max())
    vec3 col = cur + prev * (amt * 0.9);
    col = col / (1.0 + col); // quick tone-map to keep stable

    // Very small sparkle to avoid banding in feedback
    float g = noise(uv * uResolution * 0.10 + t * 1.2);
    col += (g - 0.5) * 0.004 * amt;

    gl_FragColor = vec4(col, 1.0);
  }
`;


