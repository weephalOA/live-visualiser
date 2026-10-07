// Psychedelic: an infinitely zooming spiral of shapes (B6), drawn in a WebGL fragment shader.
//
// Shapes live on a grid in log-polar space (log r, angle). Log-polar is conformal, so square
// cells there become self-similar shapes on a logarithmic spiral, and zooming is a translation
// along log r. Shape indices are attached to cells, so content moves outward continuously and
// never visibly resets.
import { MIRROR_MOTIF_THRESHOLD, COOL_CLAMP_VALENCE } from '../analysis/constants';
import { rankShapesForArousal, SHAPE_KINDS } from '../mapping/colour';
import { easeFactor } from '../engine/smoothing';
import type { RenderFrame, Theme } from './types';

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define TAU 6.28318530718

uniform vec2 uRes;
uniform float uTime;
uniform float uZoom;
uniform float uRot;
uniform float uPerTurn;
uniform float uSym;
uniform vec3 uPal;
uniform float uPalLen;
uniform vec4 uRankA;
uniform float uRank4;
uniform float uHue;
uniform float uSat;
uniform float uBright;
uniform float uVarNorm;
uniform float uCadence;
uniform float uPulse;
uniform float uVignette;
uniform float uSize;
uniform float uAlpha;
uniform float uShapeHueDelta;
uniform float uSpin;
uniform float uCool;
uniform float uFade;
uniform vec2 uOffset;

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

// Cool clamp: sad music stays in the blue range everywhere, shapes included (A12 lesson 3).
float coolHue(float h) {
  h = fract(h);
  return mix(h, clamp(h, 0.45, 0.75), uCool);
}

float palHue(float k) {
  if (k < 0.5) return uPal.x;
  if (k < 1.5) return uPal.y;
  return uPal.z;
}

float rankKind(float r) {
  if (r < 0.5) return uRankA.x;
  if (r < 1.5) return uRankA.y;
  if (r < 2.5) return uRankA.z;
  if (r < 3.5) return uRankA.w;
  return uRank4;
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdTriangle(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

float sdPentagon(vec2 p, float r) {
  const vec3 k = vec3(0.809016994, 0.587785252, 0.726542528);
  p.x = abs(p.x);
  p -= 2.0 * min(dot(vec2(-k.x, k.y), p), 0.0) * vec2(-k.x, k.y);
  p -= 2.0 * min(dot(vec2(k.x, k.y), p), 0.0) * vec2(k.x, k.y);
  p -= vec2(clamp(p.x, -r * k.z, r * k.z), r);
  return length(p) * sign(p.y);
}

// Kinds follow SHAPE_KINDS: circle, ellipse, square, triangle, pentagon.
float sdShape(float kind, vec2 p, float s) {
  if (kind < 0.5) return length(p) - s;
  if (kind < 1.5) { float e = 0.6; return (length(p / vec2(s, s * e)) - 1.0) * s * e; }
  if (kind < 2.5) return sdBox(p, vec2(s * 0.82));
  if (kind < 3.5) return sdTriangle(p, s * 0.9);
  return sdPentagon(p, s * 0.82);
}

// One spiral layer with n shapes per turn. Returns premultiplied colour.
vec4 spiral(vec2 p, float n, float minSide) {
  float r = length(p);
  float th = atan(p.y, p.x) + uRot;
  float u = log(max(r, 1e-4));
  float a = th / TAU * n;
  float b = u * n / TAU - uZoom + th / TAU;
  vec2 cell = floor(vec2(a, b));
  vec2 f = fract(vec2(a, b)) - 0.5;
  // Same physical cell has the same index on either side of the angle wrap.
  float i = mod(cell.x - n * cell.y, 60.0);
  float h1 = hash(i + 0.37);
  float h2 = hash(i + 17.3);

  // Shape kind ranked by sharpness vs arousal, biased toward the best match.
  float kind = rankKind(floor(pow(h1, 1.6) * 5.0));
  f = rot(h2 * TAU + uTime * uSpin * (h1 - 0.5) * 2.0) * f;
  float size = 0.3 * uSize * (0.75 + 0.5 * h2) * (1.0 + 0.25 * uPulse);
  float d = sdShape(kind, f, min(size, 0.46));

  float cellPx = (TAU / n) * r * minSide;
  float aa = 1.5 / max(cellPx, 1e-3);
  float cov = 1.0 - smoothstep(-aa, aa, d);
  float glow = exp(-max(d, 0.0) * 10.0) * 0.35 * uPulse;

  float t = clamp(r / 0.75, 0.0, 1.0);
  float hue = coolHue(palHue(mod(i, uPalLen)) + 0.15 * uVarNorm * (fract(i * 0.618033988) - 0.5) + uShapeHueDelta);
  float v = min(1.0, uBright * (0.8 + 0.4 * (1.0 - t)));
  vec3 col = hsv2rgb(vec3(hue, uSat, v));
  float alpha = clamp(cov * uAlpha + glow, 0.0, 1.0) * smoothstep(0.0, 0.05, r);
  return vec4(col * alpha, alpha);
}

vec4 layers(vec2 p, float minSide) {
  float n0 = floor(uPerTurn);
  vec4 c0 = spiral(p, n0, minSide);
  vec4 c1 = spiral(p, n0 + 1.0, minSide);
  return mix(c0, c1, fract(uPerTurn));
}

vec2 kaleido(vec2 p) {
  float sector = TAU / 6.0;
  float th = atan(p.y, p.x);
  th = mod(th, sector);
  th = abs(th - sector * 0.5);
  return length(p) * vec2(cos(th), sin(th));
}

void main() {
  float minSide = min(uRes.x, uRes.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / minSide;
  float rScreen = length(p);
  p -= uOffset;

  vec4 shapes;
  if (uSym < 0.01) shapes = layers(p, minSide);
  else if (uSym > 0.99) shapes = layers(kaleido(p), minSide);
  else shapes = mix(layers(p, minSide), layers(kaleido(p), minSide), uSym);

  // Radial gradient background with outward hue drift (A8 layer 1), plus slow tunnel rings.
  float corner = 0.5 * length(uRes) / minSide;
  float t = clamp(rScreen / corner, 0.0, 1.0);
  float rings = 0.88 + 0.12 * sin(TAU * (log(max(length(p), 1e-3)) * 1.2 - uZoom * 0.25));
  float bgV = uBright * (1.0 - 0.5 * t) * (0.7 + 0.3 * uCadence) * 0.45 * rings;
  vec3 bg = hsv2rgb(vec3(coolHue(uHue + (0.1 + 0.4 * uVarNorm) * t), uSat * 0.85, bgV));

  vec3 col = bg * (1.0 - shapes.a) + shapes.rgb;
  col *= 1.0 + 0.15 * uPulse;
  // Dynamics vignette (A8 layer 6).
  col *= 1.0 - uVignette * pow(t, 1.8);
  gl_FragColor = vec4(col * uFade, 1.0);
}
`;

const UNIFORMS = [
  'uRes', 'uTime', 'uZoom', 'uRot', 'uPerTurn', 'uSym', 'uPal', 'uPalLen', 'uRankA', 'uRank4',
  'uHue', 'uSat', 'uBright', 'uVarNorm', 'uCadence', 'uPulse', 'uVignette', 'uSize', 'uAlpha',
  'uShapeHueDelta', 'uSpin', 'uCool', 'uFade', 'uOffset',
] as const;

type UniformName = (typeof UNIFORMS)[number];

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

export class PsychedelicTheme implements Theme {
  readonly id = 'psychedelic';
  readonly name = 'Psychedelic';
  readonly context = 'webgl' as const;
  readonly maxPixelRatio = 1.5;
  readonly preset = { tau: 0.8, drift: 1, driftSpeed: 0.06 };

  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private loc = {} as Record<UniformName, WebGLUniformLocation | null>;
  private width = 1;
  private height = 1;

  // Animation state.
  private zoom = 0;
  private rotation = 0;
  private pulse = 0;
  private sym = 0;
  private fade = 0;
  private spinTime = 0;

  init(canvas: HTMLCanvasElement): void {
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Shader link failed: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    gl.useProgram(program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    for (const name of UNIFORMS) this.loc[name] = gl.getUniformLocation(program, name);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.gl?.viewport(0, 0, width, height);
  }

  render({ params: p, notes, dt, drift, silent }: RenderFrame): void {
    const gl = this.gl;
    if (!gl) return;

    // Arousal sets zoom and rotation speed; onsets add a short kick.
    let hit = 0;
    for (const n of notes) hit += n.velocity;
    this.pulse = Math.min(1.5, this.pulse * Math.exp(-dt / 0.18) + 0.6 * hit);
    this.zoom = (this.zoom + (0.15 + 1.3 * p.arousal + 0.6 * this.pulse) * dt) % 60; // 60 keeps cell indices periodic
    this.rotation = (this.rotation + (0.03 + 0.4 * p.arousal) * dt) % (Math.PI * 2);
    this.spinTime += dt;
    this.sym += ((p.motifScore > MIRROR_MOTIF_THRESHOLD ? 1 : 0) - this.sym) * easeFactor(dt, 1.5);
    this.fade += ((silent ? 0.35 : 1) - this.fade) * easeFactor(dt, 1.2);

    const ranked = rankShapesForArousal(p.arousal).map((k) => SHAPE_KINDS.indexOf(k));
    const pal = [p.palette[0], p.palette[1] ?? p.palette[0], p.palette[2] ?? p.palette[0]];
    const vignette = Math.min(0.7, Math.max(0.05, 0.4 * (2 - p.dynamicsRatio * drift.vignetteScale)));

    const u = this.loc;
    gl.uniform2f(u.uRes, this.width, this.height);
    gl.uniform1f(u.uTime, this.spinTime);
    gl.uniform1f(u.uZoom, this.zoom);
    gl.uniform1f(u.uRot, this.rotation);
    gl.uniform1f(u.uPerTurn, 4 + p.shapeCount); // complexity sets shapes per turn (7-16)
    gl.uniform1f(u.uSym, this.sym);
    gl.uniform3f(u.uPal, pal[0], pal[1], pal[2]);
    gl.uniform1f(u.uPalLen, p.palette.length);
    gl.uniform4f(u.uRankA, ranked[0], ranked[1], ranked[2], ranked[3]);
    gl.uniform1f(u.uRank4, ranked[4]);
    gl.uniform1f(u.uHue, p.hue);
    gl.uniform1f(u.uSat, p.saturation);
    gl.uniform1f(u.uBright, p.brightness);
    gl.uniform1f(u.uVarNorm, p.varNorm);
    gl.uniform1f(u.uCadence, p.cadence);
    gl.uniform1f(u.uPulse, this.pulse);
    gl.uniform1f(u.uVignette, vignette);
    gl.uniform1f(u.uSize, drift.shapeSizeScale);
    gl.uniform1f(u.uAlpha, Math.min(1, (200 / 255) * drift.shapeAlphaScale));
    gl.uniform1f(u.uShapeHueDelta, drift.shapeHueDelta);
    gl.uniform1f(u.uSpin, 0.2 + 1.5 * p.arousal);
    gl.uniform1f(u.uCool, p.valence < COOL_CLAMP_VALENCE ? 1 : 0);
    gl.uniform1f(u.uFade, this.fade);
    gl.uniform2f(u.uOffset, drift.figureOffsetX * 0.5, drift.figureOffsetY * 0.5);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }
}
