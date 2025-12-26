import * as THREE from 'three';

type RampStops = Array<{ t: number; color: string }>;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleStops(stops: RampStops, t: number): THREE.Color {
  const tt = Math.max(0, Math.min(1, t));
  const sorted = stops.slice().sort((a, b) => a.t - b.t);
  let a = sorted[0];
  let b = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (tt >= sorted[i].t && tt <= sorted[i + 1].t) {
      a = sorted[i];
      b = sorted[i + 1];
      break;
    }
  }
  const u = (tt - a.t) / Math.max(1e-6, b.t - a.t);
  const ca = new THREE.Color(a.color);
  const cb = new THREE.Color(b.color);
  return new THREE.Color(lerp(ca.r, cb.r, u), lerp(ca.g, cb.g, u), lerp(ca.b, cb.b, u));
}

function makeRampTexture(stops: RampStops, width = 256): THREE.DataTexture {
  const data = new Uint8Array(width * 4);
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    const c = sampleStops(stops, t);
    data[x * 4 + 0] = Math.round(c.r * 255);
    data[x * 4 + 1] = Math.round(c.g * 255);
    data[x * 4 + 2] = Math.round(c.b * 255);
    data[x * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export type WhimsicalRampSet = {
  cap: THREE.DataTexture;
  stem: THREE.DataTexture;
  ground: THREE.DataTexture;
  sky: THREE.DataTexture;
};

export function createWhimsicalRamps(): WhimsicalRampSet {
  // Rich, saturated fantasy colors inspired by the reference collage
  // Key: deep shadows, vivid saturated midtones, bright highlights
  
  // Cap: vivid oranges/reds/magentas with spots implied by variation
  const capStops: RampStops = [
    { t: 0.0, color: '#1a0520' },   // Deep purple-black shadow
    { t: 0.15, color: '#4a1848' },  // Dark magenta
    { t: 0.30, color: '#8b2252' },  // Rich crimson-magenta
    { t: 0.45, color: '#ff3366' },  // Vibrant pink-red
    { t: 0.60, color: '#ff6b35' },  // Vivid orange
    { t: 0.75, color: '#ffa726' },  // Golden orange
    { t: 0.88, color: '#ffeb3b' },  // Bright yellow
    { t: 1.0, color: '#fff8e1' },   // Warm cream highlight
  ];

  // Stem: cream/lavender, softer than cap
  const stemStops: RampStops = [
    { t: 0.0, color: '#0d0812' },   // Near black
    { t: 0.25, color: '#2d1f3d' },  // Dark purple
    { t: 0.45, color: '#5c4a6e' },  // Muted purple
    { t: 0.65, color: '#a89cc4' },  // Lavender
    { t: 0.82, color: '#e8dff0' },  // Pale lavender
    { t: 1.0, color: '#fff5fa' },   // Cream-white
  ];

  // Ground: dark forest floor, mossy greens, not bright
  const groundStops: RampStops = [
    { t: 0.0, color: '#050808' },   // Almost black
    { t: 0.20, color: '#0a1a15' },  // Very dark green
    { t: 0.40, color: '#1a3d2e' },  // Dark forest green
    { t: 0.55, color: '#2d5a40' },  // Mossy green
    { t: 0.70, color: '#3d7a52' },  // Richer green
    { t: 0.85, color: '#5aa469' },  // Leaf green
    { t: 1.0, color: '#8fbc8f' },   // Soft sage (never pure white)
  ];

  // Sky: deep purple-blue with magical glow at horizon
  const skyStops: RampStops = [
    { t: 0.0, color: '#030208' },   // Near black at top
    { t: 0.20, color: '#0a0520' },  // Very dark purple
    { t: 0.40, color: '#1a0a40' },  // Deep purple
    { t: 0.55, color: '#2d1875' },  // Rich purple-blue
    { t: 0.70, color: '#4a3090' },  // Vibrant purple
    { t: 0.82, color: '#00b4d8' },  // Cyan glow
    { t: 0.92, color: '#48cae4' },  // Bright cyan
    { t: 1.0, color: '#90e0ef' },   // Light cyan at horizon
  ];

  return {
    cap: makeRampTexture(capStops),
    stem: makeRampTexture(stemStops),
    ground: makeRampTexture(groundStops),
    sky: makeRampTexture(skyStops),
  };
}


