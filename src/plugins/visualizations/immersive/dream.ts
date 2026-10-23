import { dreamFractalSettings } from '../DreamFractalPlugin';
import type { SceneDefinition } from './scene';

export const dreamScene: SceneDefinition = {
  id: 'dream-fractal',
  name: 'Dream Fractal',
  settings: dreamFractalSettings,
  fragment: `
vec3 dreamColor(float t) {
  if(uPalette<0.5) return pow(0.5+0.5*cos(6.28318*(t+vec3(0.02,0.35,0.69))),vec3(2.7));
  if(uPalette<1.5) return pow(0.5+0.5*cos(6.28318*(t*0.7+vec3(0.14,0.52,0.73))),vec3(2.4));
  return pow(0.5+0.5*cos(6.28318*(t*0.72+vec3(0.02,0.17,0.53))),vec3(2.5));
}

vec3 scene(vec2 uv) {
  float time=uTime*0.13;
  float morph=time*uEvolution;
  float seed=uSeed*0.719;
  vec2 p=uv*3.1/uZoom;
  p*=rot(time*0.12);
  // Low frequency refraction makes the nested structures breathe together.
  p+=uWarp*0.13*vec2(sin(p.y*2.3+morph),sin(p.x*2.8-morph*1.3));
  float radius=length(p);
  vec2 q=p;
  vec3 color=vec3(0.004,0.002,0.018);
  float weight=1.0;
  float occlusion=1.0;
  float detailLimit=min(uComplexity,5.0+uQuality*1.5);
  for(int i=0;i<8;i++) {
    float fi=float(i);
    if(fi>=detailLimit) break;
    float angle=atan(q.y,q.x);
    float r=length(q);
    float symmetry=uSymmetry+mod(fi,2.0)*2.0;
    float petal=cos(angle*symmetry+morph*(0.6+fi*0.1));
    float phase=morph*0.7+seed+fi*1.63;
    // Continuous angular folding followed by an inversion yields nested, organic chambers.
    float sector=6.2831853/symmetry;
    float folded=abs(mod(angle+sector*0.5,sector)-sector*0.5);
    vec2 cell=vec2(cos(folded),sin(folded))*r;
    if(uDream<0.5) {
      cell.x-=0.72+0.1*sin(phase);
      cell.y*=1.6;
    } else if(uDream<1.5) {
      cell=q+vec2(sin(q.y*1.8+phase),cos(q.x*1.5-phase))*0.32*uWarp;
      cell=sin(cell*1.55)*0.56;
    } else {
      cell=abs(fract(q*0.75+0.5)-0.5)*2.0;
      cell=rot(0.7854+sin(phase)*0.12)*cell;
      cell-=vec2(0.38,0.2);
    }
    float chamber=length(cell*vec2(1.0,1.25));
    float irisAngle=atan(cell.y,cell.x);
    float ribPhase=chamber*(20.0+fi*2.2)+sin(irisAngle*(8.0+fi))*0.65;
    float ribs=pow(0.5+0.5*sin(ribPhase-phase*2.0),7.0);
    float lace=pow(0.5+0.5*sin(irisAngle*(18.0+fi*4.0)+chamber*16.0+phase),10.0);
    float eyeRadius=0.28+0.07*sin(phase+petal*1.5)+0.025*uBass;
    float rim=exp(-abs(chamber-eyeRadius)*26.0);
    float membrane=exp(-abs(chamber-eyeRadius-0.12)*8.0);
    float pupil=1.0-smoothstep(0.055,0.16,chamber);
    float hue=fi*0.17+radius*0.13+chamber*0.26+morph*0.08+seed*0.03;
    vec3 pigment=dreamColor(hue);
    vec3 enamel=dreamColor(hue+0.34);
    float relief=0.38+0.62*(0.5+0.5*cos(irisAngle-0.8));
    vec3 layer=pigment*(0.012+membrane*0.6+rim*1.3)*relief;
    layer+=enamel*(ribs*membrane*0.5+lace*rim*0.8);
    layer+=vec3(0.7,0.9,1.0)*pow(rim,8.0)*0.21;
    layer*=1.0-pupil*0.9;
    color+=layer*weight*occlusion;
    // Fine veins sit on the colored membranes, while dark pupils preserve contrast.
    occlusion*=0.94-pupil*0.27;
    q=cell/max(dot(cell,cell),0.14);
    q*=rot(0.56+0.08*sin(phase));
    q-=vec2(0.8+0.13*sin(phase*0.73),0.32+0.1*cos(phase));
    q+=uWarp*0.04*sin(q.yx*3.0+phase);
    weight*=uDream>1.5?0.5:0.69;
  }
  float tissue=sin(p.x*8.0+sin(p.y*5.0+morph))*sin(p.y*8.0+sin(p.x*6.0-morph));
  color*=0.84+0.16*tissue;
  color*=1.0+uEnergy*0.27+uPulse*0.25;
  color*=1.0-0.27*smoothstep(0.2,1.3,length(uv));
  return pow(max(color-0.018,vec3(0.0)),vec3(1.5))*2.3;
}
`,
};
