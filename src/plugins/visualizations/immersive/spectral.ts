import { spectralLinesSettings } from '../SpectralLinesPlugin';
import type { SceneDefinition } from './scene';

export const spectralScene: SceneDefinition = {
  id: 'spectral-lines',
  name: 'Spectral Lines',
  settings: spectralLinesSettings,
  fragment: `
vec3 spectralColor(float f) {
  if(uPalette<0.5) {
    vec3 c=mix(vec3(1.0,0.32,0.025),vec3(1.0,0.025,0.12),smoothstep(0.15,0.8,f));
    return mix(c,vec3(0.07,0.65,1.0),smoothstep(0.84,1.0,f));
  }
  if(uPalette<1.5) return mix(vec3(0.015,0.6,1.0),vec3(0.6,0.035,1.0),f);
  return palette(f*0.8+uTime*0.015);
}

vec3 scene(vec2 uv) {
  float t=uTime*0.34;
  float seed=uSeed*0.173;
  vec2 p=uv;
  p*=rot(0.07*sin(t*0.27+seed));
  vec3 color=vec3(0.0015,0.003,0.008);
  color+=vec3(0.005,0.012,0.025)*exp(-length(uv-vec2(0,0.12))*2.0);
  float count=uLineCount;
  for(int i=0;i<32;i++) {
    // Every density covers the whole spectrum; index stays constant on WebGL 1.
    float band=uSpectrum[i];
    for(int strand=0;strand<3;strand++) {
    float layers=floor(count/32.0);
    if(float(strand)>=layers) break;
    float fi=float(i)*layers+float(strand);
    float f=fi/max(layers*32.0-1.0,1.0);
    float phase=f*6.28318+seed;
    float distanceToLine;
    float fade=1.0;
    float lineLight=0.5+0.5*sin(f*37.0-t*2.5);
    if(uForm<0.5) {
      // A sheet of luminous threads, foreshortened as it curls through space.
      float depth=1.0+f*4.0;
      float x=p.x*depth;
      float wave=sin(x*1.2-t+f*5.0)*0.48;
      wave+=sin(x*2.4+t*0.6+f*8.0)*0.13;
      float y=(wave*uTwist+(f-0.5)*1.2*uSpread)/depth;
      y+=sin(x*3.0-t*1.5+phase)*band*0.08;
      float slope=(cos(x*1.2-t+f*5.0)*0.576+cos(x*2.4+t*0.6+f*8.0)*0.312)*uTwist;
      distanceToLine=abs(p.y-y)/sqrt(1.0+slope*slope);
      fade=exp(-abs(x)*0.11)*(1.0-f*0.38);
      lineLight+=pow(0.5+0.5*sin(x*2.5-t*3.0+phase),14.0)*0.8;
    } else if(uForm<1.5) {
      // Rings travel toward the camera, with a smooth fade at each end of the loop.
      float z=fract(f-t*0.045);
      float radius=(0.04+z*z*1.2)*uSpread;
      vec2 center=vec2(sin(t*0.37+z*3.0),cos(t*0.29+z*4.0))*0.055*z*uTwist;
      vec2 q=p-center;
      q*=rot(z*uTwist*1.7+t*0.13);
      q.y*=1.3;
      float angle=atan(q.y,q.x);
      float ripple=1.0+sin(angle*3.0+z*8.0-t)*uTwist*0.10;
      ripple+=sin(angle*8.0-t*2.0+phase)*band*0.06;
      distanceToLine=abs(length(q)-radius*ripple)/1.3;
      fade=smoothstep(0.0,0.12,z)*(1.0-smoothstep(0.83,1.0,z));
      lineLight+=pow(0.5+0.5*sin(angle*5.0+t*2.0+phase),12.0)*0.7;
    } else {
      // Vertical wave fronts fan into an aurora with individual frequency peaks.
      float x=(f-0.5)*1.5*uSpread;
      x+=sin(p.y*2.5+f*7.0-t)*0.16*uTwist;
      x+=sin(p.y*5.0-f*5.0+t*0.6)*0.055*uTwist;
      float slope=cos(p.y*2.5+f*7.0-t)*0.4*uTwist;
      distanceToLine=abs(p.x-x)/sqrt(1.0+slope*slope);
      float height=0.13+0.2*sin(f*3.0+seed)+band*0.24;
      fade=exp(-abs(p.y)*3.0)*(1.0-smoothstep(height,height+0.12,p.y));
      lineLight+=pow(0.5+0.5*sin(p.y*14.0-t*4.0+phase),8.0);
    }
    float width=max(0.00065,0.65/uResolution.y)*uThickness;
    float core=exp(-distanceToLine*distanceToLine/(width*width));
    float halo=exp(-distanceToLine*90.0/uGlow)*0.06*uGlow;
    float haze=exp(-distanceToLine*18.0)*0.005*uGlow;
    vec3 pigment=spectralColor(f);
    float energy=(0.4+lineLight*0.6+band*1.8+uPulse*0.2)*fade;
    color+=(pigment*(core*0.8+halo+haze)+vec3(1.0,0.7,0.36)*core*0.15)*energy;
  }
  }
  // Tiny drifting motes add depth without flattening the near-black negative space.
  vec2 stars=uv*vec2(95.0,70.0)+vec2(t*0.3,-t*0.5);
  vec2 cell=floor(stars);
  float star=hash21(cell+uSeed);
  float mote=exp(-length(fract(stars)-0.5)*55.0)*step(0.985,star);
  color+=vec3(0.2,0.5,0.9)*mote*(0.4+uTreble);
  return color*(1.0-0.35*smoothstep(0.25,1.2,length(uv)));
}
`,
};
