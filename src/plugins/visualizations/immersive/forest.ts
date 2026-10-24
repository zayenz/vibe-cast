import { forestFlightSettings } from '../ForestFlightPlugin';
import type { SceneDefinition } from './scene';

export const forestScene: SceneDefinition = {
  id: 'forest-flight',
  name: 'Forest Flight',
  settings: forestFlightSettings,
  fragment: `
float trail(float z) { return 1.35*sin(z*0.075+uSeed*0.13)+0.48*sin(z*0.19); }
vec3 eye;
// Keep this cache local and initialized: mutable global cache fields miscompile
// on ANGLE/Metal. Surface probes deliberately do not use traversal state.
struct RayCache {
  vec2 patchCell, grassCell;
  vec3 patchOrigin, grassOrigin, mushroomScale;
  float seed, grassSeed;
  bool mushrooms, ferns;
  mat2 fernRotation;
};
float soil(vec2 p) { return 0.10*sin(p.x*1.7)*sin(p.y*0.8)+0.055*sin(p.y*3.3+p.x); }
vec3 soilNormal(vec2 p) {
  float ridge=cos(p.y*3.3+p.x);
  return normalize(vec3(-0.17*cos(p.x*1.7)*sin(p.y*0.8)-0.055*ridge,
    1.0,-0.08*sin(p.x*1.7)*cos(p.y*0.8)-0.1815*ridge));
}
vec2 patchCenter(vec2 cell) {
  return cell*2.7+vec2(hash21(cell+17.0)-0.5,hash21(cell+81.0)-0.5)*0.20;
}
float growth(float seed) { return 1.0+0.13*uGrowth*sin(uTime*0.8+seed*30.0)+0.025*uBass; }
float ellipsoid(vec3 p, vec3 r) {
  float k0=length(p/r), k1=length(p/(r*r));
  return k0*(k0-1.0)/max(k1,0.0001);
}
vec4 nearest(vec4 a, vec4 b) { return a.x<b.x ? a : b; }

// Every patch has its own stable species, scale and phase. Growth is continuous;
// nothing is regenerated as the camera crosses a tile boundary.
vec4 mushroomShape(vec3 p, float seed, float scale) {
  float species=floor(seed*4.0);
  p/=scale;
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
  shape.x*=scale;
  return shape;
}
vec4 mushroom(vec3 p,float seed,float scale) { return mushroomShape(p,seed,scale*growth(seed)); }

float fern(vec3 p, mat2 orientation, float scale) {
  p.xz=orientation*p.xz;
  p/=scale;
  p.y-=0.9*p.x-0.7*p.x*p.x;
  float branch=sdCapsule(p,vec3(0,0,0),vec3(0.94,0,0),0.013);
  float leafAxis=p.x-abs(p.z)*0.32;
  float segment=clamp(floor(leafAxis/0.135),0.0,6.0);
  float center=segment*0.135+0.06;
  float width=0.24*sqrt(max(0.0,1.0-center));
  vec3 leaf=vec3(leafAxis-center,p.y,p.z);
  float leaflets=ellipsoid(leaf,vec3(0.046,0.012,width));
  return min(branch,leaflets)*scale;
}

float frondsOriented(vec3 q,mat2 orientation) {
  vec3 leaf=q-vec3(0.18,0,-0.25);
  return min(fern(leaf,orientation,0.92),min(
    fern(leaf,orientation*rot(2.1),0.82),fern(leaf,orientation*rot(4.0),0.86)));
}
float fronds(vec3 q,float seed) { return frondsOriented(q,rot(seed*14.0)); }
float grassDetail(vec3 p) { return 1.0-smoothstep(5.0,11.0,length(p.xz-eye.xz)); }
float grassBlade(vec3 p,float height,float radius) {
  float y=clamp(p.y,0.0,height);
  p.x-=0.45*y*y;
  return length(vec3(p.x,p.y-y,p.z))-radius*(1.0-0.82*y/max(height,0.001));
}
float grassAt(vec3 blade,float seed,float detail) {
  float height=(0.14+seed*0.11)*detail;
  float d=grassBlade(blade,height,0.014*sqrt(detail));
  blade.x+=0.055;
  blade.z+=0.045;
  return min(d,grassBlade(blade,height*0.73,0.011*sqrt(detail)));
}
float grasses(vec3 p,vec2 cell,float seed,float detail) {
  vec2 center=cell*0.55+vec2(sin(seed*20.0),cos(seed*16.0))*0.08;
  return grassAt(p-vec3(center.x,soil(center),center.y),seed,detail);
}
float trunk(vec3 p,vec2 center,float seed,bool detailed) {
  vec2 root=p.xz-center;
  root.x+=0.12*sin(p.y*0.7+seed*8.0);
  float angle=atan(root.y,root.x);
  float grooves=detailed ? 0.014*sin(angle*24.0+sin(p.y*0.7)*0.5) : 0.0;
  float roots=(0.22+0.17*sin(angle*5.0))*exp(-max(p.y,0.0)*1.5);
  return length(root)-(0.24+seed*0.26+roots+grooves);
}

vec4 world(vec3 p,inout RayCache cache) {
  float ground=p.y-soil(p.xz);
  vec4 hit=vec4(ground,1,0,0);
  vec2 cell=floor((p.xz+1.35)/2.7);
  if(any(notEqual(cell,cache.patchCell))){
    cache.patchCell=cell;
    cache.seed=hash21(cell+uSeed*13.7);
    vec2 center=patchCenter(cell);
    cache.patchOrigin=vec3(center.x,soil(center),center.y);
    float corridor=abs(center.x-trail(center.y));
    float occupancy=hash21(cell+uSeed*13.7+vec2(71.3,19.7));
    cache.mushrooms=corridor>1.55 && occupancy<uDensity;
    cache.ferns=corridor>0.85 && occupancy<0.95*uDensity;
    cache.mushroomScale=vec3((0.72+cache.seed*0.45)*growth(cache.seed),
      (0.31+cache.seed*0.14)*growth(fract(cache.seed+0.43)),
      (0.27+cache.seed*0.14)*growth(fract(cache.seed+0.71)));
    cache.fernRotation=rot(cache.seed*14.0);
  }
  float seed=cache.seed;
  vec3 q=p-cache.patchOrigin;
  if(cache.mushrooms){
    // All species remain inside the patch even at maximum growth. A cheap box
    // gets rays close before evaluating the individual caps and stems.
    float bound=sdBox(q-vec3(0,1.25,0),vec3(1.18,1.30,1.15));
    if(bound>0.05){hit.x=min(hit.x,bound);}else{
      hit=nearest(hit,mushroomShape(q,seed,cache.mushroomScale.x));
      vec3 cluster=q-vec3(0.50,0,0.36);
      hit=nearest(hit,mushroomShape(cluster,fract(seed+0.43),cache.mushroomScale.y));
      cluster=q-vec3(-0.42,0,0.35);
      hit=nearest(hit,mushroomShape(cluster,fract(seed+0.71),cache.mushroomScale.z));
    }
  }
  // Individual pinnate fronds, with fine paired leaflets along each curved stem.
  if(cache.ferns){
    float bound=sdBox(q-vec3(0.18,0.24,-0.25),vec3(0.90,0.27,0.90));
    if(bound>0.04)hit.x=min(hit.x,bound);
    else hit=nearest(hit,vec4(frondsOriented(q,cache.fernRotation),5,seed,0));
  }
  // Short grass and moss tips occupy the space between larger plants.
  float detail=grassDetail(p);
  if(detail>0.001 && abs(p.x-trail(p.z))>0.55){
    float bound=ground-0.25*detail-0.065;
    if(bound>0.04)hit.x=min(hit.x,bound);
    else{
      vec2 gc=floor((p.xz+0.275)/0.55);
      if(any(notEqual(gc,cache.grassCell))){
        cache.grassCell=gc;
        cache.grassSeed=hash21(gc+uSeed);
        vec2 center=gc*0.55+vec2(sin(cache.grassSeed*20.0),cos(cache.grassSeed*16.0))*0.08;
        cache.grassOrigin=vec3(center.x,soil(center),center.y);
      }
      hit=nearest(hit,vec4(grassAt(p-cache.grassOrigin,cache.grassSeed,detail),6,cache.grassSeed,0));
    }
  }
  return hit;
}

float tileExit(vec3 p, vec3 rd, float size) {
  return cellExit(p.xz,rd.xz,size);
}

vec2 traceTrunks(vec3 ro,vec3 rd) {
  // Traverse tree cells once. Analytic cylinder bounds reject empty cells;
  // only intersected columns need a short refinement of the actual bark SDF.
  float t=0.06;
  float a=max(dot(rd.xz,rd.xz),0.0001);
  for(int i=0;i<12;i++){
    vec3 p=ro+rd*t;
    float end=min(42.0,t+cellExit(p.xz,rd.xz,7.2));
    vec2 cell=floor((p.xz+3.6)/7.2);
    vec2 center=cell*7.2+vec2(hash21(cell+12.0),hash21(cell+43.0))*2.4-1.2;
    if(abs(center.x-trail(center.y))>2.7){
      float seed=hash21(cell+uSeed);
      float minY=max(min(p.y,(ro+rd*end).y),0.0);
      float radius=0.24+seed*0.26+0.39*exp(-minY*1.5)+0.134;
      vec2 offset=ro.xz-center;
      float b=dot(offset,rd.xz);
      float discriminant=b*b-a*(dot(offset,offset)-radius*radius);
      if(discriminant>0.0){
        float root=sqrt(discriminant);
        float entry=max(t,(-b-root)/a);
        float exit=min(end,(-b+root)/a);
        for(int j=0;j<20;j++){
          if(entry>exit)break;
          float d=trunk(ro+rd*entry,center,seed,true);
          if(d<0.0015+entry*0.5/uResolution.y)return vec2(entry,seed);
          entry+=max(d*0.70,0.003);
        }
      }
    }
    t=end;
    if(t>=42.0)break;
  }
  return vec2(-1,0);
}

// Shadows need the main silhouettes, not every leaflet, blade and bark groove.
float shadowWorld(vec3 p) {
  float d=p.y-soil(p.xz);
  vec2 cell=floor((p.xz+1.35)/2.7);
  vec2 center=patchCenter(cell);
  float seed=hash21(cell+uSeed*13.7);
  float occupancy=hash21(cell+uSeed*13.7+vec2(71.3,19.7));
  if(abs(center.x-trail(center.y))>1.55 && occupancy<uDensity){
    vec3 q=p-vec3(center.x,soil(center),center.y);
    d=min(d,mushroom(q,seed,0.72+seed*0.45).x);
  }
  vec2 tc=floor((p.xz+3.6)/7.2);
  vec2 tp=tc*7.2+vec2(hash21(tc+12.0),hash21(tc+43.0))*2.4-1.2;
  if(abs(tp.x-trail(tp.y))>2.7)
    d=min(d,trunk(p,tp,hash21(tc+uSeed),false));
  return d;
}
float shade(vec3 p,vec3 light) {
  float shadow=1.0, t=0.045;
  for(int i=0;i<8;i++){
    vec3 q=p+light*t;
    float d=shadowWorld(q);
    shadow=min(shadow,10.0*d/t);
    if(d<0.003)break;
    t+=min(clamp(d,0.055,0.8),tileExit(q,light,2.7));
    if(t>4.0)break;
  }
  return clamp(shadow,0.12,1.0);
}

// Reconstruct only the surface actually hit. Terrain normals are analytical;
// object normals never trace the entire forest four additional times.
vec4 mushroomFrame(vec3 p,float objectSeed) {
  vec2 cell=floor((p.xz+1.35)/2.7);
  vec2 center=patchCenter(cell);
  float seed=hash21(cell+uSeed*13.7);
  vec3 origin=vec3(center.x,soil(center),center.y);
  float scale=0.72+seed*0.45;
  if(abs(fract(seed+0.43)-objectSeed)<0.001){origin+=vec3(0.50,0,0.36);scale=0.31+0.14*seed;}
  else if(abs(fract(seed+0.71)-objectSeed)<0.001){origin+=vec3(-0.42,0,0.35);scale=0.27+0.14*seed;}
  return vec4(p-origin,scale);
}
float localSurface(vec3 p,float material,float seed,float scale,vec2 cell,float detail) {
  if(material<3.5)return mushroom(p,seed,scale).x;
  if(material<4.5)return trunk(p,cell,seed,true);
  if(material<5.5)return fronds(p,seed);
  return grasses(p,cell,seed,detail);
}
vec3 normalAt(vec3 p,float t,vec4 hit) {
  if(hit.y<1.5)return soilNormal(p.xz);
  float e=0.002+0.00022*t;
  vec3 q=p;
  float scale=1.0;
  float detail=1.0;
  vec2 cell=vec2(0);
  if(hit.y<3.5){vec4 frame=mushroomFrame(p,hit.z);q=frame.xyz;scale=frame.w;}
  else if(hit.y<4.5){
    vec2 tc=floor((p.xz+3.6)/7.2);
    cell=tc*7.2+vec2(hash21(tc+12.0),hash21(tc+43.0))*2.4-1.2;
  }else if(hit.y<5.5){
    vec2 center=patchCenter(floor((p.xz+1.35)/2.7));
    q=p-vec3(center.x,soil(center),center.y);
  }else{cell=floor((p.xz+0.275)/0.55);detail=grassDetail(p);}
  vec2 k=vec2(1,-1);
  return normalize(k.xyy*localSurface(q+k.xyy*e,hit.y,hit.z,scale,cell,detail)+
    k.yyx*localSurface(q+k.yyx*e,hit.y,hit.z,scale,cell,detail)+
    k.yxy*localSurface(q+k.yxy*e,hit.y,hit.z,scale,cell,detail)+
    k.xxx*localSurface(q+k.xxx*e,hit.y,hit.z,scale,cell,detail));
}

float terrainHit(vec3 ro,vec3 rd) {
  // The complete height field lies in [-.155,.155]. Find the first sign-change
  // bracket within that slab, then bisect; grazing rays cannot diverge.
  float a=max(0.0,(0.16-ro.y)/rd.y);
  float end=min(60.0,(-0.16-ro.y)/rd.y);
  if(a>=end)return -1.0;
  float stride=(end-a)/12.0;
  for(int i=0;i<12;i++){
    float b=a+stride;
    vec3 q=ro+rd*b;
    if(q.y-soil(q.xz)<=0.0){
      for(int j=0;j<7;j++){
        float mid=(a+b)*0.5;
        vec3 p=ro+rd*mid;
        if(p.y>soil(p.xz))a=mid;else b=mid;
      }
      return (a+b)*0.5;
    }
    a=b;
  }
  return -1.0;
}

vec3 scene(vec2 uv) {
  float z=uTime*1.35+uSeed*11.0;
  vec3 ro=vec3(trail(z),0.96+0.09*sin(uTime*0.44),z);
  ro.y+=soil(ro.xz);
  eye=ro;
  RayCache cache;
  cache.patchCell=vec2(1.0e8);
  cache.grassCell=vec2(1.0e8);
  cache.patchOrigin=vec3(0);
  cache.grassOrigin=vec3(0);
  cache.mushroomScale=vec3(1);
  cache.seed=0.0;
  cache.grassSeed=0.0;
  cache.mushrooms=false;
  cache.ferns=false;
  cache.fernRotation=mat2(1);
  vec3 target=vec3(trail(z+5.0),0.78,z+5.0);
  vec3 rd=cameraRay(uv,ro,target,0.95);
  vec2 tree=traceTrunks(ro,rd);
  float limit=tree.x>0.0 ? tree.x : 42.0;
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
    h=world(p,cache);
    // Stop at half a render pixel instead of tracing invisible subpixel detail.
    if(h.x<0.0015+distance*0.5/uResolution.y){found=true;break;}
    float stride=max(h.x*0.65,0.005);
    stride=min(stride,tileExit(p,rd,2.7));
    if(p.y<0.6 && distance<11.0)stride=min(stride,tileExit(p,rd,0.55));
    distance+=stride;
    if(distance>=limit)break;
  }
  // Fine distant vegetation can exhaust the step budget. Resolve the terrain
  // analytically there so the floor never breaks into sky-colored holes.
  if(!found){
    float groundDistance=rd.y<-0.008 ? terrainHit(ro,rd) : -1.0;
    if(groundDistance>0.0 && (tree.x<0.0 || groundDistance<tree.x)){
      distance=groundDistance;h=vec4(0,1,0,0);found=true;
    }else if(tree.x>0.0){
      distance=tree.x;h=vec4(0,4,tree.y,0);found=true;
    }
  }
  vec3 color=sky;
  if(found){
    vec3 p=ro+rd*distance;
    vec3 n=normalAt(p,distance,h);
    float rough=noise(p*17.0);
    float fineWeight=1.0-smoothstep(3.0,14.0,distance);
    float fine=fineWeight>0.0 ? mix(0.5,noise(p*75.0),fineWeight) : 0.5;
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
      emit=vec3(0.14,0.58,0.30)*filaments*pow(moss,4.0)*uGlow*(0.3+night)*
        (1.0-smoothstep(6.0,22.0,distance));
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
      vec4 frame=mushroomFrame(p,h.z);
      vec2 capRadial=frame.xz;
      float phasePerPixel=78.0*distance/(max(length(capRadial),0.02)*uResolution.y);
      float gillDetail=1.0-smoothstep(0.9,2.8,phasePerPixel);
      float gills=0.80+0.20*gillDetail*sin(atan(capRadial.y,capRadial.x)*78.0+h.z*10.0);
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
      if(h.y>5.5)albedo=mix(vec3(0.04,0.12,0.012),vec3(0.18,0.26,0.035),h.z)*
        (0.5+0.5*smoothstep(0.0,0.12,p.y-soil(p.xz)));
      specular=0.18;
    }
    float diffuse=max(dot(n,sun),0.0);
    float occlusion=clamp(shadowWorld(p+n*0.17)/0.17,0.35,1.0);
    float canopyShadow=0.24+0.76*smoothstep(0.3,0.67,fbm(vec3(p.xz*0.43+p.y*0.3,8.0)));
    vec3 ambient=mix(vec3(0.10,0.17,0.11),vec3(0.08,0.17,0.28),night);
    float shadow=distance<20.0 ? mix(shade(p+n*0.014,sun),0.65,smoothstep(12.0,20.0,distance)) : 0.65;
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
    float fade=smoothstep(1.0,3.0,depth)*(1.0-smoothstep(16.0,19.0,depth));
    color+=vec3(0.55,0.65,0.17)*exp(-d*d*depth*depth*650.0)*uGlow*(0.3+uTreble*0.5)*fade;
  }
  float shafts=pow(max(0.0,sin((rd.x+rd.y*0.3)*37.0+0.8*sin(rd.z*11.0))),12.0);
  color+=light*shafts*pow(sundot,4.0)*uMist*0.09;
  return color*(1.0-0.18*dot(uv,uv));
}
`,
};
