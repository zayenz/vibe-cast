import type { SceneDefinition } from './scene';
import { cloudSettings } from '../CloudFlightPlugin';

export const cloudScene: SceneDefinition = {
  id: 'cloud-flight', name: 'Cloud Flight', settings: cloudSettings,
  fragment: `
float cloudDensity(vec3 p,float footprint) {
  float envelope=smoothstep(1.6,2.8,p.y)*(1.0-smoothstep(5.0+uBillow*2.0,8.3+uBillow*2.0,p.y));
  if(envelope<0.001) return 0.0;
  vec3 q=p*vec3(0.19,0.32/uBillow,0.19)+vec3(uSeed*3.3,0.0,uTime*0.018);
  float broad=noise(q);
  // Filter octaves smaller than the integration step. Shadows need only the broad shape.
  float mediumDetail=1.0-smoothstep(0.20,0.75,footprint*0.8);
  float fineDetail=1.0-smoothstep(0.20,0.75,footprint*1.65);
  float mediumNoise=0.5;
  if(mediumDetail>0.01) mediumNoise=mix(0.5,noise(q*4.11+13.7),mediumDetail);
  float shape=broad*0.62+noise(q*2.07+7.3)*0.25+mediumNoise*0.13;
  float height=(p.y-4.3)/(2.5+uBillow);
  float d=shape-(0.64-uCoverage*0.27)-height*height*0.18;
  if(d<0.0) return 0.0;
  float erosion=0.5;
  if(fineDetail>0.01) erosion=mix(0.5,noise(q*8.4+uTime*0.025),fineDetail);
  d-=0.055*erosion;
  return smoothstep(0.005,0.21,d)*envelope*1.8;
}

vec3 scene(vec2 uv) {
  float night=step(2.5,uSky), day=step(0.5,uSky)*(1.0-step(1.5,uSky));
  float rose=step(1.5,uSky)*(1.0-night);
  vec3 zenith=mix(vec3(0.035,0.12,0.29),vec3(0.12,0.38,0.70),day);
  zenith=mix(zenith,vec3(0.20,0.12,0.33),rose);
  zenith=mix(zenith,vec3(0.006,0.015,0.045),night);
  vec3 horizon=mix(vec3(0.55,0.34,0.21),vec3(0.65,0.81,0.98),day);
  horizon=mix(horizon,vec3(0.95,0.35,0.40),rose);
  horizon=mix(horizon,vec3(0.10,0.15,0.26),night);
  vec3 sunColor=mix(vec3(1.50,0.96,0.53),vec3(1.35,1.36,1.30),day);
  sunColor=mix(sunColor,vec3(1.5,0.72,0.83),rose);
  sunColor=mix(sunColor,vec3(0.52,0.70,1.02),night);
  vec3 ro=vec3(sin(uTime*0.035)*2.0,10.5+uAltitude*4.0+sin(uTime*0.055)*0.25,uTime*1.6);
  vec3 rd=cameraRay(uv,ro,ro+vec3(sin(uTime*0.026)*0.35,-0.10-uAltitude*0.08,1.0),1.15);
  vec3 sunDir=normalize(vec3(-0.4,0.17+day*0.20,1.1));
  float sunDot=max(dot(rd,sunDir),0.0);
  vec3 sky=mix(horizon,zenith,smoothstep(-0.04,0.30,rd.y));
  sky+=sunColor*(pow(sunDot,12.0)*0.12+pow(sunDot,150.0)*0.35+pow(sunDot,1400.0)*2.0);
  if(night>0.5 && rd.y>0.03){
    vec2 starCell=floor(rd.xz/max(rd.y+0.2,0.2)*210.0);
    float star=pow(hash21(starCell),180.0)*smoothstep(0.03,0.3,rd.y);
    sky+=star*0.45;
  }
  vec3 sum=vec3(0.0);
  float trans=1.0;
  float top=8.3+uBillow*2.0;
  float t=0.1;
  if(ro.y>top){
    if(rd.y>=-0.001) return sky*(1.0-0.12*dot(uv,uv));
    t=max(0.1,(top-ro.y)/rd.y);
  }
  // Front-to-back volume integration. Larger steps in the distance keep the horizon affordable.
  float jitter=hash21(gl_FragCoord.xy)*(0.20+t*0.015)*(1.25-uQuality*0.15);
  t+=jitter;
  for(int i=0;i<96;i++){
    if(float(i)>64.0+uQuality*15.0 || trans<0.018 || t>110.0) break;
    vec3 p=ro+rd*t;
    if(p.y<1.6 || p.y>top+0.1) break;
    float dt=(0.20+t*0.015)*(1.25-uQuality*0.15);
    float density=cloudDensity(p,max(dt*0.6,t/uResolution.y))*(1.0-smoothstep(65.0,110.0,t));
    if(density>0.005){
      float lightDensity=cloudDensity(p+sunDir*1.0,1.2)+cloudDensity(p+sunDir*2.7,1.2)*0.6;
      float light=exp(-lightDensity*2.5);
      float rim=pow(1.0-clamp(density,0.0,1.0),3.0)*pow(sunDot,8.0)*uSilver;
      vec3 ambient=mix(vec3(0.045,0.065,0.13),vec3(0.13,0.18,0.29),smoothstep(2.0,9.0,p.y));
      ambient=mix(ambient,ambient*0.25,night);
      vec3 lit=ambient+sunColor*(light*0.95+rim*0.6)*(1.0+uBass*0.10+uTreble*0.04);
      lit=mix(lit,sky,1.0-exp(-max(t-15.0,0.0)*0.012));
      float alpha=1.0-exp(-density*dt*1.65);
      sum+=trans*alpha*lit;
      trans*=1.0-alpha;
    }
    t+=dt;
  }
  vec3 color=sum+sky*trans;
  return color*(1.0-0.12*dot(uv,uv));
}
`,
};
