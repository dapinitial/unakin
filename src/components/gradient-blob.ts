/**
 * <gradient-blob> — fixed full-viewport animated gradient background.
 *
 * All blobs render in a single WebGL fragment shader pass (like the heart):
 * five drifting glows on the original CSS animation paths plus one that
 * lazily follows the cursor. Dither is added in-shader to avoid banding.
 * Renders at half resolution — the blobs are soft gradients, so upscaling
 * is invisible and the fill cost drops 4x.
 */
const RES_SCALE = 0.5;

const VERT = /* glsl */ `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision mediump float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

// Original palette (src/index.css :root)
const vec3 BG1 = vec3(8.0, 10.0, 15.0) / 255.0;
const vec3 BG2 = vec3(0.0, 17.0, 32.0) / 255.0;
const vec3 C1 = vec3(18.0, 113.0, 255.0) / 255.0;
const vec3 C2 = vec3(107.0, 74.0, 255.0) / 255.0;
const vec3 C3 = vec3(100.0, 100.0, 255.0) / 255.0;
const vec3 C4 = vec3(50.0, 160.0, 220.0) / 255.0;
const vec3 C5 = vec3(80.0, 47.0, 122.0) / 255.0;
const vec3 CI = vec3(140.0, 100.0, 255.0) / 255.0;

const float TAU = 6.28318530718;

// Linear falloff to zero at radius r — matches the CSS radial-gradients
// (rgba(c, 0.8) at center fading to 0 at 50% of the circle box).
float glow(vec2 p, vec2 center, float r) {
  return 0.8 * max(0.0, 1.0 - distance(p, center) / r);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 p = gl_FragCoord.xy / u_res;
  vec2 px = gl_FragCoord.xy;
  vec2 center = u_res * 0.5;
  float R = 0.55 * min(u_res.x, u_res.y);

  // Base: ~40deg gradient between the two background colors
  vec3 col = mix(BG1, BG2, clamp(p.x * 0.77 + p.y * 0.64, 0.0, 1.0));

  vec3 glows = vec3(0.0);

  // g1 — vertical bob, 30s
  glows += C1 * glow(px, center + vec2(0.0, sin(u_time * TAU / 30.0) * u_res.y * 0.5), R);

  // g2 — orbit (reverse), 20s
  float a2 = -u_time * TAU / 20.0;
  glows += C2 * glow(px, center + vec2(cos(a2), sin(a2)) * u_res.x * 0.25, R);

  // g3 — wide orbit, 40s, offset start
  float a3 = u_time * TAU / 40.0 + 3.14;
  glows += C3 * glow(px, center + vec2(cos(a3), sin(a3)) * u_res.x * 0.3, R);

  // g4 — horizontal drift, 40s, dimmer
  glows += C4 * 0.7 * glow(px, center + vec2(sin(u_time * TAU / 40.0) * u_res.x * 0.5,
                                             cos(u_time * TAU / 40.0) * u_res.y * 0.1), R);

  // g5 — big slow orbit, 20s, double size
  float a5 = u_time * TAU / 20.0;
  glows += C5 * glow(px, center + vec2(cos(a5), sin(a5)) * u_res.x * 0.35, R * 2.0);

  // interactive — follows the (pre-smoothed) cursor, dimmer
  glows += CI * 0.7 * glow(px, u_mouse, R);

  // Soft additive blend: bright where glows overlap, never clips harshly
  col += glows - col * glows * 0.5;

  // Dither to kill banding on the long, dark falloffs
  col += (hash(px + fract(u_time)) - 0.5) / 255.0 * 2.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class GradientBlob extends HTMLElement {
  #frameId = 0;
  #abort = new AbortController();

  connectedCallback() {
    const canvas = document.createElement('canvas');
    this.appendChild(canvas);

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    // No WebGL → the host's CSS linear-gradient background still shows.
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader error:', gl.getShaderInfoLog(shader));
      }
      return shader;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    gl.useProgram(program);

    // Fullscreen triangle
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'u_res');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uMouse = gl.getUniformLocation(program, 'u_mouse');

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio, 2) * RES_SCALE;
      canvas.width = Math.round(window.innerWidth * scale);
      canvas.height = Math.round(window.innerHeight * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize, { signal: this.#abort.signal });

    // Cursor follow with the same lazy easing as before
    let curX = window.innerWidth / 2;
    let curY = window.innerHeight * 1.2;
    let tgX = curX;
    let tgY = curY;
    window.addEventListener(
      'mousemove',
      (event) => {
        tgX = event.clientX;
        tgY = event.clientY;
      },
      { signal: this.#abort.signal }
    );

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    const start = performance.now();

    const render = () => {
      curX += (tgX - curX) / 20;
      curY += (tgY - curY) / 20;
      const scale = canvas.width / window.innerWidth;
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      // CSS y-down → GL y-up
      gl.uniform2f(uMouse, curX * scale, canvas.height - curY * scale);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    if (reducedMotion) {
      render(); // single static frame
      return;
    }

    const loop = () => {
      render();
      this.#frameId = requestAnimationFrame(loop);
    };
    this.#frameId = requestAnimationFrame(loop);
  }

  disconnectedCallback() {
    this.#abort.abort();
    cancelAnimationFrame(this.#frameId);
  }
}

customElements.define('gradient-blob', GradientBlob);
