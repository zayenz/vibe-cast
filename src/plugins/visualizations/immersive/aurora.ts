import { auroraVoyageSettings } from '../AuroraVoyagePlugin';
import type { SceneDefinition } from './scene';

export const auroraScene: SceneDefinition = {
  id: 'aurora-voyage',
  name: 'Aurora Voyage',
  settings: auroraVoyageSettings,
  fragment: `
float terrain(vec2 p) {
  vec2 v=p*0.08+uSeed;
  float n=noise(vec3(v,0.7));
  float fine=noise(vec3(v*3.4,1.1));
  float h=pow(1.0-abs(n*2.0-1.0),3.0)*5.4+fine*0.9;
  if(uLandscape>0.5 && uLandscape<1.5)h=0.8+sin(p.x*0.23+sin(p.y*0.10))*0.65+fine*0.45;
  float valley=1.0-exp(-pow((p.x-sin(p.y*0.035)*4.0)*0.13,2.0));
  return (h*valley+0.2)*uTerrainHeight;
}
vec3 terrainNormal(vec3 p) {
  float e=0.05;
  return normalize(vec3(terrain(p.xz-vec2(e,0))-terrain(p.xz+vec2(e,0)),2.0*e,
    terrain(p.xz-vec2(0,e))-terrain(p.xz+vec2(0,e))));
}
vec3 auroraSky(vec3 rd, vec3 ro) {
  vec3 green=vec3(0.008,1.0,0.22), purple=vec3(0.46,0.008,0.98);
  if(uLandscape>0.5){green=vec3(0.05,0.65,1.0);purple=vec3(0.95,0.15,0.55);}
  if(uLandscape>1.5){green=vec3(0.38,0.26,1.0);purple=vec3(0.1,0.8,1.0);}
  vec3 sky=mix(vec3(0.002,0.004,0.014),vec3(0.0003,0.0006,0.003),clamp(rd.y,0.0,1.0));
  // Stars use a spherical grid, so their apparent size does not vary with camera translation.
  vec2 starUV=vec2(atan(rd.x,rd.z),asin(clamp(rd.y,-1.0,1.0)))*210.0;
  vec2 starCell=floor(starUV);
  float starHash=hash21(starCell+uSeed);
  vec2 starP=fract(starUV)-0.5;
  float star=exp(-dot(starP,starP)*160.0)*step(1.0-uStarDensity*0.075,starHash);
  sky+=star*vec3(0.7,0.82,1.0)*(0.4+hash21(starCell+17.0))*smoothstep(0.0,0.04,rd.y);
  vec3 moonDir=normalize(vec3(-0.52,0.3,1.0));
  float moonDistance=length(rd-moonDir);
  sky+=vec3(0.45,0.58,0.8)*(1.0-smoothstep(0.026,0.029,moonDistance));
  sky+=vec3(0.05,0.07,0.14)*exp(-moonDistance*13.0);
  float count=40.0+uQuality*20.0;
  vec3 glow=vec3(0.0);
  float flow=uTime*uCurtainFlow*0.12;
  // Integrate several thin, folded luminous sheets through a high atmospheric layer.
  for(int i=0;i<80;i++) {
    if(float(i)>=count)break;
    float f=(float(i)+0.5)/count;
    float height=7.0+f*6.0;
    float t=(height-ro.y)/max(rd.y,0.06);
    vec3 p=ro+rd*t;
    vec2 q=p.xz*0.055+vec2(uSeed*0.2,flow);
    float fold=q.x+sin(q.y*1.5+flow)*1.1+sin(q.y*3.1-flow*0.7)*0.3;
    fold+=noise(vec3(q*1.2,flow))*0.35;
    // Feather the sheet at grazing angles to prevent undersampled horizon stripes.
    float curtain=pow(max(0.0,1.0-abs(sin(fold*2.4))),mix(2.5,8.0,smoothstep(0.12,0.45,rd.y)));
    float filaments=0.7+0.3*pow(0.5+0.5*sin(q.y*28.0+sin(q.y*8.0)*3.0),2.0);
    float envelope=exp(-f*3.2)*smoothstep(0.0,0.08,f)*(1.0-smoothstep(0.7,1.0,f));
    vec3 col=mix(green,purple,smoothstep(0.1,0.8,f));
    glow+=col*curtain*filaments*envelope*0.30*(48.0/count);
  }
  sky+=glow*uCurtainIntensity*(0.7+uMid*0.45+uBass*0.15)*smoothstep(0.04,0.24,rd.y);
  return sky;
}
vec3 scene(vec2 uv) {
  float travel=uTime*0.85;
  vec3 ro=vec3(sin(travel*0.035)*4.0,3.6+uTerrainHeight*0.8,travel);
  vec3 rd=cameraRay(uv,ro,ro+vec3(0,0.55,8),0.85);
  vec3 sky=auroraSky(rd,ro);
  vec3 color=sky;
  float t=0.1;
  bool found=false;
  float limit=64.0+uQuality*16.0;
  if(rd.y<0.22) {
    // A height field is not a distance field. Ordered samples bracket its first
    // crossing, including upward rays grazing mountain peaks at the horizon.
    float previousT=0.0;
    for(int i=0;i<96;i++) {
      if(float(i)>=limit)break;
      float fraction=float(i)/(limit-1.0);
      t=0.1+72.0*fraction*fraction;
      vec3 p=ro+rd*t;
      if(p.y<=terrain(p.xz)) {
        float lo=previousT;
        float hi=t;
        for(int j=0;j<8;j++) {
          float middle=(lo+hi)*0.5;
          vec3 point=ro+rd*middle;
          if(point.y>terrain(point.xz))lo=middle;else hi=middle;
        }
        t=(lo+hi)*0.5;
        found=true;
        break;
      }
      previousT=t;
    }
    if(found) {
      vec3 p=ro+rd*t;
      vec3 n=terrainNormal(p);
      float moon=max(0.0,dot(n,normalize(vec3(-0.5,0.6,0.7))));
      float rock=noise(p*4.0)*0.3+0.7;
      vec3 base=vec3(0.004,0.007,0.016)*rock;
      float snow=smoothstep(1.6,3.8,p.y)*smoothstep(0.45,0.85,n.y);
      base=mix(base,vec3(0.09,0.13,0.21)*rock,snow);
      if(uLandscape>0.5 && uLandscape<1.5) {
        float ripples=0.85+0.15*sin(p.x*11.0+sin(p.z*0.6)*2.0);
        base=vec3(0.12,0.045,0.13)*ripples;
      }
      if(uLandscape>1.5)base=mix(vec3(0.035,0.04,0.12),vec3(0.28,0.34,0.5),snow)*rock;
      color=base*(0.4+moon*1.9);
      // A broad sky reflection lights the terrain without marching the atmosphere twice.
      vec3 reflected=mix(vec3(0.025,0.14,0.10),vec3(0.10,0.035,0.18),step(0.5,uLandscape));
      color+=reflected*uCurtainIntensity*0.18*pow(1.0-max(dot(n,-rd),0.0),2.0);
      vec3 haze=vec3(0.005,0.009,0.022);
      color=mix(color,haze,1.0-exp(-t*0.025));
      color=mix(color,sky,smoothstep(48.0,68.0,t));
    }
  }
  return color;
}
`,
};
