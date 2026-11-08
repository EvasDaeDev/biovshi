import { CONFIG } from '../config.js';

export const POST_EFFECTS_STORAGE='biovshi.post-effects.v1';
export function readPostEffectsPreference() {
  try {
    const saved=globalThis.localStorage?.getItem(POST_EFFECTS_STORAGE);
    if(saved==='on'||saved==='off')return saved==='on';
  } catch { /* Storage is optional in embedded/file browsers. */ }
  return CONFIG.postEffects.enabled;
}
export function savePostEffectsPreference(enabled) {
  try {globalThis.localStorage?.setItem(POST_EFFECTS_STORAGE,enabled?'on':'off');}catch{/* Optional. */}
}

// Photoshop's lens controls have proprietary scales. These calibrated mappings
// approximate the supplied 960 px sketch, then scale with the arena viewport.
export function postEffectUniforms(settings=CONFIG.postEffects) {
  return {
    uOptics:new Float32Array([-settings.distortion/400,settings.redCyan*.075/settings.referenceSize,
      settings.blueYellow*.075/settings.referenceSize,settings.referenceSize]),
    uLook:new Float32Array([settings.unsharpAmount,settings.unsharpRadiusPx,settings.unsharpThreshold/255,settings.filmGrain*.018]),
    uVignette:new Float32Array([Math.max(0,-settings.vignetteAmount/100),settings.vignetteMidpoint/100]),
    uGrainTime:0,
  };
}

// Shared uniforms explicitly match precision in both stages. Pixi defaults to
// highp vertices and mediump fragments; shared uniforms must not inherit conflicting defaults.
export const POST_VERTEX=`
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vScreenCoord;
uniform mediump vec4 uInputSize;
uniform mediump vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
    vScreenCoord = aPosition;
}`;

// Eleven texture reads in ONE full-screen pass, not a chain of five filters.
// Coordinates are screen-relative: neither camera zoom nor DPR changes the look.
export const POST_FRAGMENT=`
in vec2 vTextureCoord;
in vec2 vScreenCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform mediump vec4 uInputSize;
uniform vec4 uInputClamp;
uniform mediump vec4 uOutputFrame;
uniform vec4 uOptics;
uniform vec4 uLook;
uniform vec2 uVignette;
uniform float uGrainTime;

vec3 sampleArena(vec2 screenUV) {
    vec2 uv = screenUV * (uOutputFrame.zw * uInputSize.zw);
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)).rgb;
}
float grainHash(vec2 pixel) {
    vec3 p = fract(vec3(pixel.xyx) * .1031 + uGrainTime * vec3(.11369, .13787, .09987));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}
void main() {
    vec2 p = vScreenCoord * 2.0 - 1.0;
    float radius2 = dot(p, p);
    vec2 warped = .5 + .5 * p * (1.0 + uOptics.x * radius2);
    // Curved frame boundaries are opaque black, not stretched edge pixels.
    if(any(lessThan(warped, vec2(0.0))) || any(greaterThan(warped, vec2(1.0)))) {
        finalColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    vec3 center = sampleArena(warped);
    vec2 px = vec2(uLook.y / uOptics.w);
    // Gaussian approximation at a 1 px reference radius (weights 1:2:1).
    vec3 soft = center * 4.0;
    soft += (sampleArena(warped + vec2(px.x, 0.0)) + sampleArena(warped - vec2(px.x, 0.0))
          + sampleArena(warped + vec2(0.0, px.y)) + sampleArena(warped - vec2(0.0, px.y))) * 2.0;
    soft += sampleArena(warped + px) + sampleArena(warped - px)
          + sampleArena(warped + vec2(px.x, -px.y)) + sampleArena(warped + vec2(-px.x, px.y));
    soft *= 1.0 / 16.0;
    // Signed radial offsets: red/cyan -35 and blue/yellow +29.
    vec3 colour = vec3(sampleArena(warped + p * uOptics.y).r, center.g,
                       sampleArena(warped + p * uOptics.z).b);
    vec3 detail = center - soft;
    colour += uLook.x * detail * step(vec3(uLook.z), abs(detail));
    float radius = length(p) * .70710678;
    float vignette = 1.0 - uVignette.x * smoothstep(uVignette.y, 1.0, radius);
    colour *= vignette;
    // Fine monochrome grain; no exposure or colour grading is added.
    float noise = grainHash(floor(vScreenCoord * uOptics.w)) - .5;
    float luma = dot(max(colour, vec3(0.0)), vec3(.2126, .7152, .0722));
    colour += noise * uLook.w * mix(1.0, .35, clamp(luma, 0.0, 1.0));
    finalColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
}`;

// Validate once on the actual device before enabling the pass. Pixi logs some
// shader/link failures without throwing; never leave the arena with a blank pass.
export function validatePostShader(gl,source) {
  if(!gl)return;
  const shaders=[];let program;
  try {
    for(const [type,code] of [[gl.VERTEX_SHADER,source.vertex],[gl.FRAGMENT_SHADER,source.fragment]]) {
      const shader=gl.createShader(type);shaders.push(shader);
      gl.shaderSource(shader,code);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Post shader compilation failed');
    }
    program=gl.createProgram();for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Post shader linking failed');
  } finally {
    for(const shader of shaders)if(shader)gl.deleteShader(shader);
    if(program)gl.deleteProgram(program);
  }
}

export class ArenaPostEffects {
  constructor(pixi,app,root) {
    this.app=app;this.root=root;this.available=true;this.enabled=false;this.disposed=false;
    this.rectangle=new pixi.Rectangle(0,0,1,1);
    this.reduced=Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const initial=postEffectUniforms();
    this.uniforms=new pixi.UniformGroup({
      uOptics:{value:initial.uOptics,type:'vec4<f32>'},
      uLook:{value:initial.uLook,type:'vec4<f32>'},
      uVignette:{value:initial.uVignette,type:'vec2<f32>'},
      uGrainTime:{value:0,type:'f32'},
    });
    this.filter=pixi.Filter.from({
      gl:{vertex:POST_VERTEX,fragment:POST_FRAGMENT,name:'arena-film-lens',preferredFragmentPrecision:'highp'},
      resources:{postUniforms:this.uniforms},
      resolution:app.renderer.resolution,padding:0,antialias:false,
    });
    try {validatePostShader(app.renderer.gl,this.filter.glProgram);}catch(error){this.filter.destroy();throw error;}
    this.resize(app.screen.width,app.screen.height);
    this.setEnabled(readPostEffectsPreference());
  }
  setEnabled(enabled) {
    this.enabled=Boolean(enabled)&&this.available;
    // Null removes the filter pass entirely, rather than running a neutral shader.
    this.app.stage.filters=this.enabled?[this.filter]:null;
    this.app.stage.filterArea=this.enabled?this.rectangle:null;
    this.root.dataset.postEffects=this.enabled?'on':'off';
  }
  resize(width,height) {this.rectangle.width=width;this.rectangle.height=height;}
  update(time) {
    if(this.enabled)this.uniforms.uniforms.uGrainTime=this.reduced?0:Math.floor(time*12)%4096;
  }
  fail(error) {
    this.available=false;this.error=error.message;this.setEnabled(false);
    console.warn('Arena post effects disabled:',error);
  }
  destroy() {
    if(this.disposed)return;this.disposed=true;this.setEnabled(false);this.filter.destroy();
    delete this.root.dataset.postEffects;
  }
}
