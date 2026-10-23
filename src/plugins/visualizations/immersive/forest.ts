import { forestFlightSettings } from '../ForestFlightPlugin';
import type { SceneDefinition } from './scene';

export const forestScene: SceneDefinition = {
  id: 'forest-flight',
  name: 'Forest Flight',
  settings: forestFlightSettings,
  fragment: `
float trail(float z) { return 1.35*sin(z*0.075+uSeed*0.13)+0.48*sin(z*0.19); }
vec3 eye;
float soil(vec2 p) { return 0.10*sin(p.x*1.7)*sin(p.y*0.8)+0.055*sin(p.y*3.3+p.x); }
float ellipsoid(vec3 p, vec3 r) {
  float k0=length(p/r), k1=length(p/(r*r));
  return k0*(k0-1.0)/max(k1,0.0001);
}
vec4 nearest(vec4 a, vec4 b) { return a.x<b.x ? a : b; }

// Every patch has its own stable species, scale and phase. Growth is continuous;
// nothing is regenerated as the camera crosses a tile boundary.
vec4 mushroom(vec3 p, float seed, float scale) {
  float species=floor(seed*4.0);
  float grow=1.0+0.13*uGrowth*sin(uTime*0.8+seed*30.0)+0.025*uBass;
  p/=scale*grow;
  float height=0.74+seed*0.52;
  float radius=0.61;
  float dome=0.30;
  if(species>0.5 && species<1.5){height=1.45;radius=0.40;dome=0.53;}
  if(species>1.5 && species<2.5){height=0.55;radius=0.72;dome=0.18;}
  if(species>2.5){height=1.05;radius=0.52;dome=0.36;}
  p.x+=0.08*sin(p.y*1.9+seed*9.0)*p.y;
  float stem=sdCapsule(p,vec3(0,0.03,0),vec3(0,height,0),0.065+0.045*(1.0-seed));
  vec3 c=p-vec3(0,height,0);
  float cap=max(ellipsoid(c,vec3(radius,dome,radius)),-c.y-0.05);
  vec4 shape=stem<cap ? vec4(stem,2.0,seed,species) : vec4(cap,3.0,seed,species);
  shape.x*=scale*grow;
  return shape;
}

float fern(vec3 p, float angle, float scale) {
  p.xz=rot(angle)*p.xz;
  p/=scale;
  p.y-=0.12+0.9*p.x-0.7*p.x*p.x;
  float branch=sdCapsule(p,vec3(0,0,0),vec3(0.94,0,0),0.013);
  float segment=clamp(floor(p.x/0.135),0.0,6.0);
  float center=segment*0.135+0.06;
  float width=0.24*sqrt(max(0.0,1.0-center));
  vec3 leaf=vec3(p.x-center,p.y,p.z);
  leaf.x-=abs(leaf.z)*0.32;
  float leaflets=ellipsoid(leaf,vec3(0.046,0.012,width));
  return min(branch,leaflets)*scale;
}

vec4 world(vec3 p) {
  float ground=p.y-soil(p.xz);
  float detail=1.0-smoothstep(9.0,17.0,length(p.xz-eye.xz));
  if(ground<0.3 && detail>0.0)ground-=0.026*noise(p*18.0)*detail;
  vec4 hit=vec4(ground,1,0,0);
  vec2 cell=floor((p.xz+1.35)/2.7);
  float seed=hash21(cell+uSeed*13.7);
  vec2 center=cell*2.7+vec2(hash21(cell+17.0)-0.5,hash21(cell+81.0)-0.5)*0.65;
  vec3 q=p-vec3(center.x,soil(center),center.y);
  float corridor=abs(center.x-trail(center.y));
  if(corridor>1.0 && seed<uDensity){
    hit=nearest(hit,mushroom(q,seed,0.72+seed*0.70));
    vec3 cluster=q-vec3(0.52,0,0.39);
    hit=nearest(hit,mushroom(cluster,fract(seed+0.43),0.34+0.18*seed));
    cluster=q-vec3(-0.44,0,0.37);
    hit=nearest(hit,mushroom(cluster,fract(seed+0.71),0.27+0.18*seed));
  }
  // Individual pinnate fronds, with fine paired leaflets along each curved stem.
  if(corridor>0.85 && seed<0.9*uDensity && q.y<1.4){
    vec3 leaf=q-vec3(0.4,0,-0.5);
    float foliage=fern(leaf,seed*14.0,0.82);
    foliage=min(foliage,fern(leaf,seed*14.0+2.1,0.65));
    foliage=min(foliage,fern(leaf,seed*14.0+4.0,0.90));
    hit=nearest(hit,vec4(foliage,5,seed,0));
  }
  // Short grass and moss tips occupy the space between larger plants.
  if(ground<0.45 && detail>0.0 && abs(p.x-trail(p.z))>0.55){
    vec2 gc=floor((p.xz+0.275)/0.55);
    float gs=hash21(gc+uSeed);
    vec3 blade=vec3(p.xz-gc*0.55,ground).xzy;
    blade.x+=0.15*sin(gs*20.0);
    blade.z+=0.15*cos(gs*16.0);
    blade.y/=max(detail,0.02);
    blade.x-=blade.y*blade.y*1.1;
    blade.y-=0.10+gs*0.06;
    float grass=ellipsoid(blade,vec3(0.018,0.11+gs*0.06,0.018));
    blade.x+=0.09+blade.y*0.3;
    blade.z+=0.045;
    grass=min(grass,ellipsoid(blade,vec3(0.012,0.08+gs*0.06,0.015)));
    hit=nearest(hit,vec4(grass*max(detail,0.02),6,gs,0));
  }
  // Wide, irregular trunks frame the vista; keep the traversable path clear.
  vec2 tc=floor((p.xz+3.6)/7.2);
  float ts=hash21(tc+uSeed);
  vec2 tp=tc*7.2+vec2(hash21(tc+12.0),hash21(tc+43.0))*2.4-1.2;
  if(abs(tp.x-trail(tp.y))>2.7){
    vec2 root=p.xz-tp;
    root.x+=0.12*sin(p.y*0.7+ts*8.0);
    float angle=atan(root.y,root.x);
    float grooves=0.014*sin(angle*24.0+sin(p.y*0.7)*0.5);
    float roots=(0.22+0.17*sin(angle*5.0))*exp(-max(p.y,0.0)*1.5);
    float bark=length(root)-(0.24+ts*0.26+roots+grooves);
    hit=nearest(hit,vec4(bark,4,ts,0));
  }
  return hit;
}

float tileExit(vec3 p, vec3 rd, float size) {
  vec2 local=fract((p.xz+size*0.5)/size);
  vec2 direction=vec2(rd.x<0.0?-1.0:1.0,rd.z<0.0?-1.0:1.0);
  vec2 boundary=mix(local,1.0-local,step(vec2(0),direction))*size;
  vec2 exits=boundary/max(abs(rd.xz),vec2(0.0001));
  return min(exits.x,exits.y)+0.008;
}

float shade(vec3 p,vec3 light) {
  float shadow=1.0, t=0.045;
  for(int i=0;i<14;i++){
    vec3 q=p+light*t;
    float d=world(q).x;
    shadow=min(shadow,10.0*d/t);
    if(d<0.003)break;
    t+=min(clamp(d,0.035,0.7),tileExit(q,light,2.7));
    if(t>5.0)break;
  }
  return clamp(shadow,0.12,1.0);
}

vec3 normalAt(vec3 p, float t) {
  float e=0.002+0.00022*t;
  vec2 k=vec2(1,-1);
  return normalize(k.xyy*world(p+k.xyy*e).x+k.yyx*world(p+k.yyx*e).x+
                   k.yxy*world(p+k.yxy*e).x+k.xxx*world(p+k.xxx*e).x);
}

vec3 scene(vec2 uv) {
  float z=uTime*1.35+uSeed*11.0;
  vec3 ro=vec3(trail(z),0.96+0.09*sin(uTime*0.44),z);
  ro.y+=soil(ro.xz);
  eye=ro;
  vec3 target=vec3(trail(z+5.0),0.78,z+5.0);
  vec3 rd=cameraRay(uv,ro,target,0.95);
  vec3 sun=normalize(vec3(-0.32,0.45,0.82));
  float night=1.0-step(0.1,abs(uHabitat-1.0));
  float emerald=step(1.5,uHabitat);
  vec3 haze=mix(vec3(0.055,0.10,0.075),vec3(0.012,0.035,0.075),night);
  haze=mix(haze,vec3(0.025,0.12,0.085),emerald);
  vec3 light=mix(vec3(2.5,1.62,0.74),vec3(0.35,0.66,1.1),night);
  float sundot=max(dot(rd,sun),0.0);
  vec3 sky=haze*(0.80+0.65*max(rd.y,0.0))+light*pow(sundot,18.0)*0.45;
  // Broken canopy high above, with scattered warm openings.
  float canopy=fbm(vec3(rd.x*7.0,rd.z*7.0+z*0.012,3.0));
  sky*=mix(1.0,0.45+0.8*canopy,smoothstep(0.08,0.6,rd.y));
  float distance=0.06;
  vec4 h=vec4(0);
  bool found=false;
  for(int i=0;i<144;i++){
    if(float(i)>88.0+uQuality*27.0)break;
    vec3 p=ro+rd*distance;
    h=world(p);
    if(h.x<0.002+distance*0.00045){found=true;break;}
    float stride=max(h.x*0.65,0.005);
    stride=min(stride,tileExit(p,rd,2.7));
    stride=min(stride,tileExit(p,rd,7.2));
    if(p.y<0.6 && distance<17.0)stride=min(stride,tileExit(p,rd,0.55));
    distance+=stride;
    if(distance>42.0)break;
  }
  bool groundFallback=false;
  // Fine distant vegetation can exhaust the step budget. Resolve the terrain
  // analytically there so the floor never breaks into sky-colored holes.
  if(!found && rd.y<-0.008){
    float t=-ro.y/rd.y;
    for(int i=0;i<3;i++)t=(soil((ro+rd*t).xz)-ro.y)/rd.y;
    if(t>0.0 && t<60.0){distance=t;h=vec4(0,1,0,0);found=true;groundFallback=true;}
  }
  vec3 color=sky;
  if(found){
    vec3 p=ro+rd*distance;
    vec3 n=groundFallback ? vec3(0,1,0) : normalAt(p,distance);
    float rough=noise(p*17.0);
    float fine=noise(p*75.0);
    vec3 albedo=vec3(0.10,0.19,0.025);
    vec3 emit=vec3(0);
    float specular=0.04;
    if(h.y<1.5){
      float moss=fbm(p*2.9+uSeed);
      albedo=mix(vec3(0.018,0.027,0.006),vec3(0.12,0.25,0.024),moss);
      albedo*=0.65+0.7*rough+0.32*fine;
      float path=1.0-smoothstep(0.0,0.85,abs(p.x-trail(p.z)));
      albedo=mix(albedo,vec3(0.11,0.075,0.031)*(0.65+rough),path*0.65);
      // Fine living filaments in the moss, most visible in moonlight.
      float filaments=pow(1.0-abs(sin(p.x*23.0+sin(p.z*11.0)*2.0)),14.0);
      emit=vec3(0.14,0.58,0.30)*filaments*pow(moss,4.0)*uGlow*(0.3+night);
    }else if(h.y<2.5){
      albedo=vec3(0.68,0.55,0.37)*(0.87+0.13*noise(p*vec3(70,2,70)));
    }else if(h.y<3.5){
      vec3 capColor=vec3(0.75,0.15,0.035);
      if(h.w>0.5 && h.w<1.5)capColor=vec3(0.56,0.34,0.13);
      if(h.w>1.5 && h.w<2.5)capColor=vec3(1.0,0.48,0.07);
      if(h.w>2.5)capColor=vec3(0.27,0.32,0.62);
      capColor=mix(capColor,palette(h.z+uTime*0.025+0.11*sin(p.y*6.0)),uPsychedelia*0.6);
      float spots=smoothstep(0.72,0.83,noise(p*21.0+h.z*20.0));
      albedo=mix(capColor,vec3(0.92,0.84,0.64),spots*step(h.w,0.5));
      albedo*=0.65+0.42*rough+0.18*fine;
      vec2 capCenter=floor((p.xz+1.35)/2.7)*2.7;
      vec2 capRadial=p.xz-capCenter;
      float gills=0.80+0.20*sin(atan(capRadial.y,capRadial.x)*78.0+h.z*10.0);
      albedo=mix(albedo,vec3(0.72,0.57,0.36)*gills,smoothstep(0.1,0.5,-n.y));
      float rim=pow(1.0-abs(n.y),4.0);
      emit=mix(vec3(0.12,0.68,0.46),palette(h.z+0.2),uPsychedelia)*rim*uGlow*(0.2+night*0.5+uMid*0.28);
      specular=0.15;
    }else if(h.y<4.5){
      float bark=0.55+0.3*sin(p.y*0.7+sin(p.x*32.0+p.z*24.0)*2.0);
      albedo=vec3(0.12,0.075,0.032)*bark;
      albedo=mix(albedo,vec3(0.12,0.22,0.025),exp(-p.y*0.8)*rough);
    }else{
      albedo=vec3(0.035,0.19,0.018)*(0.75+0.25*sin(p.x*47.0+p.z*35.0));
      if(h.y>5.5)albedo=mix(vec3(0.04,0.12,0.012),vec3(0.18,0.26,0.035),h.z);
      specular=0.18;
    }
    float diffuse=max(dot(n,sun),0.0);
    float occlusion=clamp(world(p+n*0.17).x/0.17,0.25,1.0);
    float canopyShadow=0.24+0.76*smoothstep(0.3,0.67,fbm(vec3(p.xz*0.43+p.y*0.3,8.0)));
    vec3 ambient=mix(vec3(0.10,0.17,0.11),vec3(0.08,0.17,0.28),night);
    float shadow=groundFallback ? 0.65 : shade(p+n*0.014,sun);
    color=albedo*(ambient*occlusion+light*diffuse*canopyShadow*shadow);
    vec3 halfVector=normalize(sun-rd);
    color+=light*pow(max(dot(n,halfVector),0.0),36.0)*specular*canopyShadow*shadow;
    // Translucent cap and leaf rims catch the low woodland light.
    color+=albedo*light*pow(max(dot(rd,sun),0.0),4.0)*0.13;
    color+=emit;
    float fog=1.0-exp(-distance*distance*(0.00065+uMist*0.0011));
    color=mix(color,sky,fog);
  }
  // Airborne golden pollen, distributed along the view rather than painted on surfaces.
  for(int i=0;i<12;i++){
    float fi=float(i);
    float depth=fract(fi*0.618+uTime*0.018)*18.0+1.0;
    vec3 spore=vec3(sin(fi*9.3+uSeed)*3.8,0.4+hash11(fi+uSeed)*3.0,depth);
    vec2 pos=spore.xy/depth-vec2(0,0.14);
    pos.x+=0.05*sin(uTime*0.3+fi);
    float d=length(uv-pos);
    color+=vec3(0.55,0.65,0.17)*exp(-d*d*depth*depth*650.0)*uGlow*(0.3+uTreble*0.5);
  }
  float shafts=pow(max(0.0,sin((rd.x+rd.y*0.3)*37.0+0.8*sin(rd.z*11.0))),12.0);
  color+=light*shafts*pow(sundot,4.0)*uMist*0.09;
  return color*(1.0-0.18*dot(uv,uv));
}
`,
};
