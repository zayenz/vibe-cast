// Temporal AA / history accumulation shader (WebGL1-friendly).
// Blends current frame with history with simple neighborhood clamp to reduce ghosting.

export const taaVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const taaFragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uCurrent;
  uniform sampler2D uHistory;
  uniform vec2 uResolution;

  uniform float uAlpha;   // history weight (higher = more stable, more ghosting)
  uniform float uClampK;  // clamp strength (higher = less ghosting, can reduce stability)

  vec3 sampleTex(sampler2D t, vec2 uv) {
    return texture2D(t, uv).rgb;
  }

  void main() {
    vec2 texel = 1.0 / max(uResolution, vec2(1.0));
    vec3 cur = sampleTex(uCurrent, vUv);
    vec3 hist = sampleTex(uHistory, vUv);

    // Neighborhood clamp from current frame to prevent history from dragging bright trails.
    vec3 mn = cur;
    vec3 mx = cur;
    vec3 c1 = sampleTex(uCurrent, vUv + vec2(texel.x, 0.0));
    vec3 c2 = sampleTex(uCurrent, vUv + vec2(-texel.x, 0.0));
    vec3 c3 = sampleTex(uCurrent, vUv + vec2(0.0, texel.y));
    vec3 c4 = sampleTex(uCurrent, vUv + vec2(0.0, -texel.y));
    mn = min(mn, min(min(c1, c2), min(c3, c4)));
    mx = max(mx, max(max(c1, c2), max(c3, c4)));

    // Expand clamp window slightly so we don't over-clamp fine gradients.
    vec3 center = 0.5 * (mn + mx);
    vec3 halfRange = 0.5 * (mx - mn);
    halfRange *= (1.0 + uClampK);
    vec3 mn2 = center - halfRange;
    vec3 mx2 = center + halfRange;

    vec3 histClamped = clamp(hist, mn2, mx2);

    float a = clamp(uAlpha, 0.0, 0.98);
    vec3 outCol = mix(cur, histClamped, a);
    gl_FragColor = vec4(outCol, 1.0);
  }
`;


