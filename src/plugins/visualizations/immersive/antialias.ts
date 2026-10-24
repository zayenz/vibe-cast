/** Edge-directed spatial antialiasing. No history, so travel and music cannot leave ghost trails. */
export const antialiasFragment = `
precision highp float;
uniform sampler2D uImage;
uniform vec2 uSize;
void main() {
  vec2 pixel=1.0/uSize;
  vec2 uv=gl_FragCoord.xy*pixel;
  vec3 center=texture2D(uImage,uv).rgb;
  vec3 nw=texture2D(uImage,uv+vec2(-1.0,1.0)*pixel).rgb;
  vec3 ne=texture2D(uImage,uv+vec2(1.0,1.0)*pixel).rgb;
  vec3 sw=texture2D(uImage,uv+vec2(-1.0,-1.0)*pixel).rgb;
  vec3 se=texture2D(uImage,uv+vec2(1.0,-1.0)*pixel).rgb;
  vec3 luma=vec3(0.299,0.587,0.114);
  float m=dot(center,luma), a=dot(nw,luma), b=dot(ne,luma), c=dot(sw,luma), d=dot(se,luma);
  float lo=min(m,min(min(a,b),min(c,d))), hi=max(m,max(max(a,b),max(c,d)));
  if(hi-lo<max(0.025,hi*0.12)){gl_FragColor=vec4(center,1.0);return;}
  vec2 direction=vec2(-((a+b)-(c+d)),(a+c)-(b+d));
  float reduction=max((a+b+c+d)*0.03125,0.0078125);
  direction=clamp(direction/(min(abs(direction.x),abs(direction.y))+reduction),vec2(-4.0),vec2(4.0))*pixel;
  vec3 narrow=0.5*(texture2D(uImage,uv-direction/6.0).rgb+texture2D(uImage,uv+direction/6.0).rgb);
  vec3 wide=narrow*0.5+0.25*(texture2D(uImage,uv-direction*0.5).rgb+texture2D(uImage,uv+direction*0.5).rgb);
  float light=dot(wide,luma);
  gl_FragColor=vec4(light<lo || light>hi?narrow:wide,1.0);
}
`;
