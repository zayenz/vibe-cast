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
  // Tuned to the reference collage: candy highlights + deep cool shadows.
  const capStops: RampStops = [
    { t: 0.0, color: '#160a2a' },
    { t: 0.22, color: '#2a2d7a' },
    { t: 0.48, color: '#00c2ff' },
    { t: 0.70, color: '#ff3db8' },
    { t: 0.86, color: '#ffd25a' },
    { t: 1.0, color: '#ffffff' },
  ];

  const stemStops: RampStops = [
    { t: 0.0, color: '#0b0a13' },
    { t: 0.30, color: '#2b2350' },
    { t: 0.58, color: '#7b66d6' },
    { t: 0.82, color: '#ffe7ff' },
    { t: 1.0, color: '#ffffff' },
  ];

  const groundStops: RampStops = [
    { t: 0.0, color: '#05040a' },
    { t: 0.35, color: '#102a3a' },
    { t: 0.60, color: '#0f6f6f' },
    { t: 0.82, color: '#7cffc2' },
    { t: 1.0, color: '#ffffff' },
  ];

  const skyStops: RampStops = [
    { t: 0.0, color: '#06030a' },
    { t: 0.35, color: '#1b0c3a' },
    { t: 0.60, color: '#162a7a' },
    { t: 0.78, color: '#00c2ff' },
    { t: 1.0, color: '#ffd25a' },
  ];

  return {
    cap: makeRampTexture(capStops),
    stem: makeRampTexture(stemStops),
    ground: makeRampTexture(groundStops),
    sky: makeRampTexture(skyStops),
  };
}


