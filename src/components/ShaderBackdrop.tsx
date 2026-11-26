import { useEffect, useRef } from 'react';

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;

float wave(vec2 p, float freq, float speed, float phase) {
  return sin(p.x * freq + u_time * speed + phase) * cos(p.y * (freq * 0.85) - u_time * (speed * 0.7) + phase * 0.6);
}

void main() {
  vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);

  float f1 = wave(p, 2.0, 0.25, 0.4);
  float f2 = wave(p * 1.35 + vec2(0.7, -0.45), 2.8, -0.20, 1.5);
  float f3 = wave(p * 0.85 - vec2(0.35, 0.55), 1.6, 0.16, 2.7);

  float blendA = smoothstep(-0.65, 0.80, f1 * 0.58 + f2 * 0.42);
  float blendB = smoothstep(-0.55, 0.85, f2 * 0.48 + f3 * 0.52);
  float ribbon = pow(max(0.0, 1.0 - abs(f1 + f2 * 0.5) * 1.15), 2.2);
  float caustic = pow(max(0.0, 0.5 + 0.5 * (f1 * f3)), 2.0);

  vec3 abyss = vec3(0.018, 0.048, 0.085);
  vec3 deepOcean = vec3(0.035, 0.195, 0.305);
  vec3 geminiBlue = vec3(0.055, 0.520, 0.820);
  vec3 teal = vec3(0.045, 0.660, 0.590);
  vec3 emerald = vec3(0.095, 0.760, 0.540);

  vec3 col = mix(abyss, deepOcean, 0.52 + 0.48 * blendA);
  col = mix(col, geminiBlue, 0.34 * blendA * (1.0 - uv.y * 0.25));
  col = mix(col, teal, 0.38 * blendB);
  col += geminiBlue * (0.20 * ribbon);
  col += emerald * (0.22 * caustic + 0.12 * ribbon);

  float vignette = 1.0 - dot(uv - 0.5, uv - 0.5) * 0.48;
  col *= clamp(vignette, 0.72, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function ShaderBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    });
    if (!gl) return;

    const compileShader = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, 'a_position');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const timeLoc = gl.getUniformLocation(program, 'u_time');

    gl.useProgram(program);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const scale = 0.5 * dpr;
      const w = Math.max(2, Math.floor(window.innerWidth * scale));
      const h = Math.max(2, Math.floor(window.innerHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    const startTime = performance.now();
    let lastDraw = -100;

    const drawFrame = (now: number) => {
      if (document.hidden) {
        rafId = window.requestAnimationFrame(drawFrame);
        return;
      }
      if (now - lastDraw >= 40) {
        lastDraw = now;
        const elapsedSec = (now - startTime) * 0.001 + 2.4;
        gl.uniform2f(resLoc, canvas.width, canvas.height);
        gl.uniform1f(timeLoc, elapsedSec);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      if (!prefersReducedMotion) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    drawFrame(startTime);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafId) window.cancelAnimationFrame(rafId);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[radial-gradient(ellipse_at_20%_15%,_rgba(14,165,233,0.34),_transparent_52%),radial-gradient(ellipse_at_80%_78%,_rgba(20,184,166,0.30),_transparent_55%),radial-gradient(ellipse_at_55%_45%,_rgba(16,185,129,0.20),_transparent_60%),#050c14]"
    >
      <canvas ref={canvasRef} className="w-full h-full block opacity-95" />
    </div>
  );
}
