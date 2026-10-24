/** Small shared shader vocabulary; all scenes are self-contained and need no fetched assets. */
export const sceneGLSL = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uClock;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uPulse;
uniform float uSpectrum[32];
uniform float uDim;
const float PI = 3.14159265359;
float filterWidth(float value) {
#ifdef HAS_DERIVATIVES
  return max(fwidth(value),0.0001);
#else
  return 2.0/uResolution.y;
#endif
}
// Distance along a ray to the next repeated-cell boundary. This is a traversal
// limit, never a surface distance: keep it out of normals and occlusion queries.
float cellExit(vec2 p, vec2 direction, float size) {
  vec2 local=mod(p+size*0.5,size);
  vec2 edge=mix(local,size-local,step(vec2(0.0),direction));
  vec2 crossing=edge/max(abs(direction),vec2(0.00001));
  return min(crossing.x,crossing.y)+0.002;
}
mat2 rot(float a) { float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float hash11(float n) { return fract(sin(n*127.1)*43758.5453123); }
float hash21(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float hash31(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123); }
float noise(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),
                 mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),
                 mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
  float v=0.0, a=0.5;
  for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec3(13.1,7.7,19.3);a*=0.5;}
  return v;
}
vec3 palette(float t) { return 0.5+0.5*cos(6.2831853*(t+vec3(0.0,0.33,0.67))); }
float sdBox(vec3 p, vec3 b) {vec3 q=abs(p)-b;return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa=p-a, ba=b-a;return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0))-r;
}
vec3 cameraRay(vec2 uv, vec3 origin, vec3 target, float lens) {
  vec3 f=normalize(target-origin), r=normalize(cross(f,vec3(0,1,0)));
  return normalize(f*lens+r*uv.x+cross(r,f)*uv.y);
}
`;
