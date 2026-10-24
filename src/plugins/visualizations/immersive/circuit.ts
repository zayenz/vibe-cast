import { circuitFlightSettings } from '../CircuitFlightPlugin';
import type { SceneDefinition } from './scene';

export const circuitScene: SceneDefinition = {
  id: 'circuit-flight',
  name: 'Circuit Flight',
  settings: circuitFlightSettings,
  fragment: `
float cylinder(vec3 p, vec2 h) {
  vec2 d=vec2(length(p.xz),abs(p.y))-h;
  return min(max(d.x,d.y),0.0)+length(max(d,0.0));
}
vec2 circuitMap(vec3 p) {
  vec2 cell=floor((p.xz+1.6)/3.2);
  vec3 q=p; q.xz=mod(p.xz+1.6,3.2)-1.6;
  float rnd=hash21(cell+uSeed*0.73);
  q.xz=rot(floor(rnd*4.0)*PI*0.5)*q.xz;
  float h=(0.25+0.70*hash21(cell+2.7))*uComponentHeight;
  vec2 result=vec2(p.y,0.0);
  float object;
  float metal=100.0;
  if(rnd<0.57) {
    object=sdBox(q-vec3(0,h,0),vec3(0.82,h,0.94))-0.055;
    vec3 pin=q;
    pin.z=mod(q.z+0.10,0.20)-0.10;
    pin.x=abs(q.x)-0.97;
    metal=max(sdBox(pin-vec3(0,0.12,0),vec3(0.20,0.08,0.045)),abs(q.z)-0.88);
  } else if(rnd<0.82) {
    vec3 cap=q; cap.x=abs(cap.x)-0.49;
    object=cylinder(cap-vec3(0,h+0.12,0),vec2(0.36,h));
    metal=cylinder(cap-vec3(0,0.12,0),vec2(0.41,0.09));
  } else {
    object=sdBox(q-vec3(0,0.25,0),vec3(0.85,0.25,0.85))-0.06;
    vec3 ring=q-vec3(0,0.62,0);
    float coil=length(vec2(length(ring.xz)-0.53,ring.y))-0.18;
    metal=min(coil,metal);
  }
  if(object<result.x)result=vec2(object,1.0+rnd);
  if(metal<result.x)result=vec2(metal,3.0);
  return result;
}
vec3 circuitNormal(vec3 p) {
  vec2 e=vec2(0.004,0);
  return normalize(vec3(circuitMap(p+e.xyy).x-circuitMap(p-e.xyy).x,
    circuitMap(p+e.yxy).x-circuitMap(p-e.yxy).x,circuitMap(p+e.yyx).x-circuitMap(p-e.yyx).x));
}
float circuitShadow(vec3 p, vec3 direction) {
  float shade=1.0, t=0.08;
  for(int i=0;i<14;i++) {
    float d=circuitMap(p+direction*t).x;
    if(d<0.006)return 0.18;
    shade=min(shade,8.0*d/t);
    t+=clamp(d,0.08,0.45);
  }
  return clamp(shade,0.18,1.0);
}
vec3 scene(vec2 uv) {
  float travel=uTime*1.5;
  vec3 ro=vec3(sin(travel*0.055)*2.5,max(uAltitude,uComponentHeight*1.9+0.8),travel);
  vec3 target=ro+vec3(sin(travel*0.025)*0.9,-2.8,5.6);
  vec3 rd=cameraRay(uv,ro,target,0.88);
  vec3 tint=vec3(0.1,1.0,0.67);
  vec3 copper=vec3(0.9,0.43,0.12);
  if(uBoardStyle>0.5){tint=vec3(1.0,0.39,0.055);copper=vec3(0.85,0.61,0.25);}
  if(uBoardStyle>1.5){tint=vec3(0.75,0.15,1.0);copper=vec3(0.25,0.54,0.8);}
  vec3 fog=vec3(0.0006,0.0015,0.003)+tint*0.001;
  vec3 color=fog;
  float t=0.0;
  vec2 hit=vec2(1.0);
  bool found=false;
  float steps=76.0+uQuality*30.0;
  for(int i=0;i<136;i++) {
    if(float(i)>steps || t>42.0)break;
    vec3 samplePoint=ro+rd*t;
    hit=circuitMap(samplePoint);
    if(hit.x<0.003+0.00012*t){found=true;break;}
    // Clip travel at cell edges without treating those edges as surfaces in lighting.
    t+=min(max(0.008,hit.x*0.85),cellExit(samplePoint.xz,rd.xz,3.2));
  }
  if(!found && rd.y<-0.01){t=-ro.y/rd.y;found=t<42.0;hit=vec2(0.0);}
  vec3 p=ro+rd*t;
  if(found && t<42.0) {
    vec3 n=hit.y<0.5?vec3(0,1,0):circuitNormal(p);
    float footprint=t/(uResolution.y*0.88*max(abs(dot(n,rd)),0.12));
    vec2 cell=floor((p.xz+1.6)/3.2);
    vec2 q=mod(p.xz+1.6,3.2)-1.6;
    float rnd=hash21(cell+uSeed*0.73);
    vec3 lightDirection=normalize(vec3(-0.5,0.7,-0.6));
    float light=max(0.0,dot(n,lightDirection));
    float shadow=circuitShadow(p+n*0.025,lightDirection);
    float ao=clamp(circuitMap(p+n*0.12).x/0.12,0.2,1.0);
    ao*=clamp(circuitMap(p+n*0.45).x/0.45,0.3,1.0);
    vec3 base=vec3(0.018,0.028,0.031);
    vec3 emission=vec3(0.0);
    float metallic=0.15;
    float signal=uTime*uSignalSpeed*1.4;
    float pulse=pow(0.5+0.5*sin(p.z*1.8+p.x*0.6-signal*3.0),12.0);
    pulse*=0.25+uBass*1.7+uPulse*1.4;
    if(hit.y<0.5) {
      // Offset lanes make right-angle routing around the packages, with copper pads and vias.
      vec2 lane=abs(q);
      float horizontal=abs(fract((lane.y+step(0.8,lane.x)*0.12)*6.0)-0.5)/6.0;
      float vertical=abs(fract((lane.x+step(0.8,lane.y)*0.12)*6.0)-0.5)/6.0;
      float d=min(max(horizontal,0.94-lane.x),max(vertical,1.06-lane.y));
      float aa=max(0.007,footprint*0.7);
      float trace=1.0-smoothstep(0.016-aa,0.016+aa,d);
      vec2 viaQ=mod(p.xz+0.08,0.4)-0.2;
      float via=abs(length(viaQ)-0.035);
      float vias=(1.0-smoothstep(0.011-aa,0.011+aa,via))*smoothstep(1.10,1.14,max(lane.x,lane.y));
      float grain=mix(hash21(floor(p.xz*180.0)),0.5,smoothstep(0.002,0.008,footprint));
      base=mix(vec3(0.003,0.008,0.009)*(0.8+grain*0.4),copper*0.07,max(trace,vias));
      emission=tint*(trace*0.3+exp(-max(0.0,d)*55.0)*0.10)*(0.06+pulse)*uTraceGlow;
      emission+=tint*vias*0.16*(0.3+uTreble);
      metallic=0.35;
    } else if(hit.y<2.0) {
      q=rot(floor(rnd*4.0)*PI*0.5)*q;
      base=vec3(0.006,0.010,0.018);
      float top=pow(max(n.y,0.0),12.0);
      if(rnd<0.57) {
        float edge=1.0-smoothstep(0.015,0.045,abs(max(abs(q.x)/0.73,abs(q.y)/0.84)-1.0));
        vec2 tile=abs(fract(q*8.0)-0.5);
        float etch=(1.0-smoothstep(0.02,0.06,min(tile.x,tile.y)))*step(max(abs(q.x),abs(q.y)),0.52);
        etch=mix(etch,0.12*step(max(abs(q.x),abs(q.y)),0.52),smoothstep(0.008,0.035,footprint));
        base+=vec3(0.008)*etch*top;
        float chipPulse=0.22+uMid*0.65+uBass*0.25+uPulse*0.7;
        emission=tint*(edge*0.5+etch*0.035)*top*chipPulse*uTraceGlow;
        float label=step(0.05,q.x)*step(q.x,0.5)*step(-0.35,q.y)*step(q.y,-0.22);
        base+=vec3(0.045)*label*top;
      } else if(rnd<0.82) {
        base=mix(vec3(0.005,0.018,0.028),vec3(0.10,0.15,0.18),top);
        float crossGroove=1.0-smoothstep(0.012,0.028,min(abs(q.y),abs(abs(q.x)-0.49)));
        base*=1.0-crossGroove*top*0.7;
        emission=tint*0.04*(uMid+0.15)*(1.0-top);
      }
      metallic=0.65;
    } else {
      base=copper*0.2;
      if(rnd>=0.82)base*=0.6+0.4*smoothstep(-0.5,0.5,sin(atan(q.y,q.x)*42.0));
      metallic=1.0;
    }
    vec3 halfVector=normalize(lightDirection-rd);
    float spec=pow(max(dot(n,halfVector),0.0),48.0)*metallic;
    float fresnel=pow(1.0-max(0.0,dot(n,-rd)),4.0);
    color=base*(0.16+light*1.8*shadow)*ao+spec*vec3(0.6,0.8,1.2)*1.5*shadow;
    color+=vec3(0.10,0.35,0.65)*fresnel*0.045+emission*2.8;
    // Distant traces form a luminous, hazy horizon.
    color=mix(color,fog,1.0-exp(-t*t*0.0015));
  }
  color+=tint*0.008*exp(-abs(uv.y-0.14)*8.0);
  return color;
}
`,
};
