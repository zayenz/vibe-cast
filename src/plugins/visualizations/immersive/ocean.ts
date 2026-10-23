import type { SceneDefinition } from './scene';
import { oceanSettings } from '../OceanDriftPlugin';

export const oceanScene: SceneDefinition = {
  id: 'ocean-drift', name: 'Ocean Drift', settings: oceanSettings,
  fragment: `
float seabed(vec2 p) {
  return 0.23*sin(p.x*0.48)+0.18*sin(p.y*0.61)+0.12*sin(p.x*1.4+p.y*0.9)
    +0.65*smoothstep(1.8,5.0,abs(p.x-sin(p.y*0.12)*1.2));
}
float ellipsoid(vec3 p,vec3 r) {return (length(p/r)-1.0)*min(r.x,min(r.y,r.z));}
vec2 reefMap(vec3 p) {
  float ground=(p.y-seabed(p.xz))*0.7;
  vec2 result=vec2(ground,1.0);
  vec2 cell=floor((p.xz+1.8)/3.6);
  vec2 center=cell*3.6;
  float h=hash21(cell+uSeed*1.7);
  vec3 q=p-vec3(center.x,seabed(center),center.y);
  float path=abs(center.x-sin(center.y*0.12)*1.2);
  float growth=uDensity*(0.7+h*0.5)*smoothstep(0.8,2.4,path);
  if(growth>0.12){
    q.xz-=vec2(sin(h*44.0),cos(h*31.0))*0.34;
    float scale=0.85+growth*0.55;
    q/=scale;
    float d=20.0, mat=2.0+h;
    if((uBiome>0.5 && uBiome<1.5) || (uBiome<0.5 && h>0.92)){
      // A flexible central stipe and folded ribbon leaves, swaying from their roots.
      float height=2.6+h*3.0;
      q.x-=sin(q.y*0.9+uTime*0.6+h*6.0)*q.y*0.12;
      q.z-=cos(q.y*0.7+uTime*0.4)*q.y*0.07;
      d=sdCapsule(q,vec3(0),vec3(0,height,0),0.045);
      for(int j=0;j<5;j++){
        float fj=float(j);
        float side=mod(fj,2.0)*2.0-1.0;
        vec3 l=q-vec3(side*0.30,0.6+fj*height*0.16,0.0);
        l.xy=rot(side*0.65)*l.xy;
        float leaf=ellipsoid(l,vec3(0.43,0.12,0.025+0.012*sin(l.x*20.0)));
        d=min(d,leaf);
      }
      mat=5.0;
    } else if(h<0.36){
      // Staghorn clusters, with forks tapering toward the light.
      d=sdCapsule(q,vec3(0),vec3(0,1.05,0),0.11);
      for(int j=0;j<3;j++){
        float a=float(j)*2.094+h*8.0;
        vec3 tip=vec3(cos(a)*0.65,1.4+sin(a)*0.25,sin(a)*0.65);
        d=min(d,sdCapsule(q,vec3(0,0.35,0),tip,0.075));
        d=min(d,sdCapsule(q,tip*0.65,tip*vec3(1.35,1.2,1.35),0.045));
      }
    } else if(h<0.70){
      // Ridged brain coral with smaller boulders at its base.
      float ridges=sin(q.x*23.0+sin(q.z*17.0))*sin(q.y*21.0+sin(q.x*15.0));
      d=ellipsoid(q-vec3(0,0.47,0),vec3(0.84,0.65,0.77))+ridges*0.025;
      d=min(d,ellipsoid(q-vec3(0.60,0.19,0.32),vec3(0.34,0.3,0.38)));
      mat=3.0;
    } else {
      // Open tubular sponges, several sizes growing from one colony.
      for(int j=0;j<3;j++){
        float a=float(j)*2.094;
        vec3 r=q-vec3(cos(a)*0.35,0,sin(a)*0.35);
        float height=0.8+0.4*sin(a+h*12.0);
        float outer=sdCapsule(r,vec3(0,0.13,0),vec3(0,height,0),0.20);
        float hollow=sdCapsule(r,vec3(0,height*0.5,0),vec3(0,height+0.5,0),0.115);
        d=min(d,max(outer,-hollow));
      }
      mat=4.0;
    }
    float rock=ellipsoid(q-vec3(0,0.025,0),vec3(0.94,0.16,0.88))+noise(q*9.0)*0.06;
    if(rock<d){d=rock;mat=6.0;}
    if(d*scale<result.x) result=vec2(d*scale,mat);
  }
  return result;
}
float caustic(vec2 p) {
  p+=vec2(sin(p.y*0.7+uTime*0.6),cos(p.x*0.8-uTime*0.5))*0.35;
  float c=abs(sin(p.x*2.7+p.y*1.9)+sin(p.x*1.8-p.y*2.3));
  return pow(1.0-smoothstep(0.0,0.20,c),3.0);
}
vec3 scene(vec2 uv) {
  float deep=step(1.5,uBiome);
  float kelp=step(0.5,uBiome)*(1.0-deep);
  vec3 ro=vec3(sin(uTime*0.09)*1.1,2.45+sin(uTime*0.11)*0.24,uTime*1.05);
  vec3 target=ro+vec3(sin(uTime*0.07)*0.14,-0.16,1.0);
  vec3 rd=cameraRay(uv,ro,target,1.0);
  vec3 water=mix(vec3(0.004,0.065,0.115),vec3(0.006,0.065,0.035),kelp);
  water=mix(water,vec3(0.004,0.018,0.055),deep);
  water*=1.2-uDepth*0.65;
  vec3 lightColor=mix(vec3(0.36,0.80,0.74),vec3(0.15,0.37,0.50),deep);
  vec3 color=water*(0.65+0.8*smoothstep(-0.5,0.5,rd.y));
  float t=0.1, mat=0.0;
  bool hit=false;
  for(int i=0;i<144;i++){
    if(float(i)>100.0+uQuality*21.0 || t>44.0) break;
    vec3 p=ro+rd*t;
    // Empty upper water needs no colony evaluation.
    if(p.y>7.0){t+=1.0;continue;}
    vec2 d=reefMap(p);
    if(d.x<0.006+0.0005*t){mat=d.y;hit=true;break;}
    // Cell boundary limit applies to marching only, never normals or ambient occlusion.
    vec2 edge=1.8-abs(p.xz-floor((p.xz+1.8)/3.6)*3.6);
    float boundary=max(0.04,min(edge.x,edge.y)+0.02);
    t+=max(min(d.x,boundary)*0.9,0.012);
  }
  // At shallow angles the colony march can exhaust its budget. Solve the continuous
  // seabed directly for those rays so distant sand never turns into holes in the water.
  bool sandFallback=false;
  if(!hit && rd.y<-0.015){
    float nearT=max(0.0,(ro.y-1.3)/(-rd.y));
    float farT=(ro.y+0.7)/(-rd.y);
    for(int k=0;k<14;k++){
      float middle=(nearT+farT)*0.5;
      vec3 sampleP=ro+rd*middle;
      if(sampleP.y>seabed(sampleP.xz)) nearT=middle;else farT=middle;
    }
    t=(nearT+farT)*0.5;mat=1.0;hit=true;sandFallback=true;
  }
  if(hit){
    vec3 p=ro+rd*t;
    vec2 e=vec2(0.012,0);
    vec3 n=normalize(vec3(reefMap(p+e.xyy).x-reefMap(p-e.xyy).x,
      reefMap(p+e.yxy).x-reefMap(p-e.yxy).x,reefMap(p+e.yyx).x-reefMap(p-e.yyx).x));
    if(sandFallback) n=normalize(vec3(seabed(p.xz-vec2(0.012,0))-seabed(p.xz+vec2(0.012,0)),0.024,
      seabed(p.xz-vec2(0,0.012))-seabed(p.xz+vec2(0,0.012))));
    vec3 albedo=vec3(0.23,0.30,0.23);
    float micro=noise(p*18.0);
    if(mat>1.5) albedo=mix(vec3(0.85,0.045,0.12),vec3(0.85,0.30,0.045),fract(mat*1.7+uSeed*0.1));
    if(mat>2.9 && mat<3.1) albedo=vec3(0.16,0.52,0.12);
    if(mat>3.9 && mat<4.1) albedo=vec3(0.56,0.045,0.68);
    if(mat>4.5 && mat<5.5) albedo=mix(vec3(0.055,0.18,0.035),vec3(0.24,0.39,0.075),p.y*0.15);
    if(mat>5.5) albedo=vec3(0.11,0.17,0.14);
    albedo*=0.60+micro*0.55;
    float lambert=max(dot(n,normalize(vec3(-0.35,0.85,-0.25))),0.0);
    float ao=sandFallback?1.0:clamp(reefMap(p+n*0.28).x/0.28,0.3,1.0);
    float dance=caustic(p.xz+p.y*0.4)*uCaustics*(1.0-deep)*0.65;
    color=albedo*(0.08+lambert*0.92+lightColor*dance)*ao;
    if(mat<1.5) color*=0.78+0.22*sin(p.x*20.0+sin(p.z*3.0));
    color*=1.0-deep*0.78;
    if(mat>1.5 && mat<5.5){
      float tips=pow(max(n.y,0.0),3.0);
      vec3 bio=palette(mat*0.19+uSeed*0.023+0.05*sin(uTime*0.1));
      color+=bio*tips*(deep*0.9+0.04)*(0.7+uBass*0.65+uTreble*0.2);
    }
    float fog=1.0-exp(-t*(0.045+uDepth*0.04));
    color=mix(color,water,fog);
  }
  // Soft light curtains in the water column; bass adds a restrained shimmer.
  float shafts=pow(max(0.0,sin(rd.x*18.0+rd.z*7.0+uTime*0.08)),7.0);
  shafts+=0.4*pow(max(0.0,sin(rd.x*31.0-rd.y*6.0-uTime*0.06)),9.0);
  color+=lightColor*shafts*(0.025+0.035*smoothstep(-0.4,0.6,rd.y))*uCaustics*(1.0-deep)*(1.0+uBass*0.15);
  // Tiny shoals occupy world space and are occluded by the reef depth.
  vec3 forward=normalize(target-ro), right=normalize(cross(forward,vec3(0,1,0)));
  vec3 up=cross(right,forward);
  for(int j=0;j<18;j++){
    if(float(j)>uLife*18.0) break;
    float fj=float(j), h=hash11(fj+uSeed*7.0);
    float group=floor(fj/6.0);
    vec3 fish=vec3(sin(uTime*0.19+group*2.0)*2.2+(h-0.5)*3.0,
      2.5+sin(group*4.0)*0.6+hash11(fj*9.0)*0.7,
      ro.z+mod(15.0+group*12.0+hash11(fj*3.1)*4.0-ro.z*0.7,38.0));
    vec3 rel=fish-ro;
    float z=dot(rel,forward);
    if(z>0.5 && z<t){
      vec2 screen=vec2(dot(rel,right),dot(rel,up))/z;
      vec2 f=(uv-screen)*z;
      f.x*=1.0+0.12*sin(uTime*5.0+fj);
      float body=length(f/vec2(0.15,0.045));
      float tail=max(abs(f.y)-0.045*(1.0-clamp((f.x+0.23)/0.1,0.0,1.0)),abs(f.x+0.18)-0.05);
      float silhouette=max(1.0-smoothstep(0.8,1.05,body),1.0-smoothstep(-0.003,0.008,tail));
      vec3 fishColor=mix(vec3(0.065,0.17,0.18),vec3(0.36,0.64,0.59),smoothstep(-0.03,0.05,f.y));
      fishColor=mix(fishColor,water,1.0-exp(-z*0.09));
      color=mix(color,fishColor,silhouette*0.85);
    }
  }
  // Sparse drifting motes, with separate layers to keep apparent depth.
  for(int layer=0;layer<3;layer++){
    float fl=float(layer), scale=35.0+fl*27.0;
    vec2 q=uv*scale+vec2(uTime*0.13,uTime*(0.14+fl*0.06));
    vec2 cell=floor(q), f=fract(q)-0.5;
    float dust=(1.0-smoothstep(0.01,0.075,length(f)))*step(0.95,hash21(cell+fl*31.0));
    color+=dust*uLife*vec3(0.25,0.55,0.57)*(0.25+deep*0.7+uTreble*0.25);
  }
  return color*(1.0-0.15*dot(uv,uv));
}
`,
};
