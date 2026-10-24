/* global WebGLProgram, WebGLBuffer, WebGLUniformLocation, WebGLShader, WebGLTexture, WebGLFramebuffer */
import { useEffect, useRef, useState } from 'react';
import type { VisualizationProps, SettingDefinition } from '../../types';
import { SceneAudio } from './audio';
import { sceneGLSL } from './glsl';
import { antialiasFragment } from './antialias';
import { uniformName, type SceneDefinition } from './scene';

const vertexSource = 'attribute vec2 position; void main(){gl_Position=vec4(position,0.0,1.0);}';
const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

function settingValue(setting: SettingDefinition, value: unknown): number | Float32Array {
  switch (setting.type) {
    case 'range': return finite(value, setting.default, setting.min, setting.max);
    case 'boolean': return (typeof value === 'boolean' ? value : setting.default) ? 1 : 0;
    case 'select': {
      const index = setting.options.findIndex(option => option.value === value);
      return index < 0 ? Math.max(0, setting.options.findIndex(option => option.value === setting.default)) : index;
    }
    case 'color': {
      const hex = typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : setting.default;
      return new Float32Array([1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255));
    }
    default: return 0;
  }
}

export default function SceneCanvas(props: VisualizationProps & { scene: SceneDefinition }) {
  const { scene } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { live.current = props; }, [props]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' });
    if (!gl) {
      setError('This visualizer needs WebGL. Try reopening the visualizer window.');
      return;
    }
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let postProgram: WebGLProgram | null = null;
    let sceneTexture: WebGLTexture | null = null;
    let target: WebGLFramebuffer | null = null;
    let postSize: WebGLUniformLocation | null = null;
    let frame = 0;
    let lost = false;
    let previous = 0;
    let time = 0;
    let clock = 0;
    let previewTime: unknown;
    let width = 1;
    let height = 1;
    let settings: Record<string, unknown> | null = null;
    let bindings: { location: WebGLUniformLocation | null; value: number | Float32Array }[] = [];
    const locations = new Map<string, WebGLUniformLocation | null>();
    const audio = new SceneAudio();
    const spectrum = new Float32Array(32);
    const location = (name: string) => {
      if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program!, name));
      return locations.get(name)!;
    };
    const uniform = (name: string, value: number) => {
      const target = location(name);
      if (target) gl.uniform1f(target, value);
    };

    const dispose = () => {
      if (program) gl.deleteProgram(program);
      if (buffer) gl.deleteBuffer(buffer);
      if (postProgram) gl.deleteProgram(postProgram);
      if (sceneTexture) gl.deleteTexture(sceneTexture);
      if (target) gl.deleteFramebuffer(target);
      program = null;
      buffer = null;
      postProgram = null;
      sceneTexture = null;
      target = null;
    };
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Unable to allocate a shader');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message || 'Shader compilation failed');
      }
      return shader;
    };
    const initialize = () => {
      let vertex: WebGLShader | null = null;
      let fragment: WebGLShader | null = null;
      let postFragment: WebGLShader | null = null;
      try {
        dispose();
        locations.clear();
        settings = null;
        const declarations = scene.settings.filter(setting => setting.type !== 'text').map(setting =>
          `uniform ${setting.type === 'color' ? 'vec3' : 'float'} ${uniformName(setting.id)};`).join('\n');
        vertex = compile(gl.VERTEX_SHADER, vertexSource);
        const derivatives = gl.getExtension('OES_standard_derivatives');
        fragment = compile(gl.FRAGMENT_SHADER, `${derivatives ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIVATIVES\n' : ''}${sceneGLSL}\n${declarations}\n${scene.fragment}\n
          void main() {
            vec2 uv=(gl_FragCoord.xy-0.5*uResolution)/uResolution.y;
            vec3 color=max(scene(uv),vec3(0.0));
            color=vec3(1.0)-exp(-color);
            color=pow(color,vec3(0.454545));
            gl_FragColor=vec4(color*uDim,1.0);
          }`);
        program = gl.createProgram();
        if (!program) throw new Error('Unable to allocate a shader program');
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.bindAttribLocation(program, 0, 'position');
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed');
        postFragment = compile(gl.FRAGMENT_SHADER, antialiasFragment);
        postProgram = gl.createProgram();
        if (!postProgram) throw new Error('Unable to allocate the antialias program');
        gl.attachShader(postProgram, vertex);
        gl.attachShader(postProgram, postFragment);
        gl.bindAttribLocation(postProgram, 0, 'position');
        gl.linkProgram(postProgram);
        if (!gl.getProgramParameter(postProgram, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(postProgram) || 'Antialias linking failed');
        gl.useProgram(postProgram);
        gl.uniform1i(gl.getUniformLocation(postProgram, 'uImage'), 0);
        postSize = gl.getUniformLocation(postProgram, 'uSize');
        sceneTexture = gl.createTexture();
        target = gl.createFramebuffer();
        if (!sceneTexture || !target) throw new Error('Unable to allocate the scene image');
        gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTexture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Scene image is unavailable');
        // Ensure a restored context allocates its new image even at an unchanged size.
        canvas.width = 1;
        canvas.height = 1;
        gl.useProgram(program);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        setError(null);
        canvas.dataset.sceneReady = scene.id;
        previous = 0;
        frame = requestAnimationFrame(render);
      } catch (cause) {
        console.error(`[${scene.name}]`, cause);
        setError(`${scene.name} could not start. Try another visualizer or reopen this window.`);
        dispose();
      } finally {
        if (vertex) gl.deleteShader(vertex);
        if (fragment) gl.deleteShader(fragment);
        if (postFragment) gl.deleteShader(postFragment);
      }
    };
    const render = (now: number) => {
      if (lost || !program) return;
      const current = live.current;
      const dt = previous ? Math.min((now - previous) / 1000, 0.1) : 1 / 60;
      previous = now;
      if (import.meta.env.DEV && previewTime !== current.customSettings.__previewTime) {
        previewTime = current.customSettings.__previewTime;
        time = finite(previewTime, time, 0, 3600);
      }
      time += dt * finite(current.customSettings.speed, 1, 0, 3);
      clock += dt;
      const quality = current.customSettings.quality;
      const budget = quality === 'low' ? 360000 : quality === 'high' ? 1800000 : 800000;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(budget / (width * height)));
      const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      gl.useProgram(program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.viewport(0, 0, w, h);
      gl.uniform2f(location('uResolution'), w, h);
      if (settings !== current.customSettings) {
        settings = current.customSettings;
        bindings = scene.settings.filter(setting => setting.type !== 'text').map(setting => ({
          location: location(uniformName(setting.id)), value: settingValue(setting, settings![setting.id]),
        }));
        for (const binding of bindings) {
          if (!binding.location) continue;
          if (typeof binding.value === 'number') gl.uniform1f(binding.location, binding.value);
          else gl.uniform3fv(binding.location, binding.value);
        }
      }
      audio.update(current.audioData, dt, current.commonSettings.intensity);
      const response = finite(current.customSettings.audioResponse, 0.8, 0, 2);
      uniform('uTime', time);
      uniform('uClock', clock);
      uniform('uBass', audio.bass * response);
      uniform('uMid', audio.mid * response);
      uniform('uTreble', audio.treble * response);
      uniform('uEnergy', audio.energy * response);
      uniform('uPulse', audio.pulse * response);
      uniform('uDim', finite(current.commonSettings.dim, 1, 0, 1));
      const spectrumLocation = location('uSpectrum[0]');
      if (spectrumLocation) {
        for (let i = 0; i < 32; i++) spectrum[i] = audio.spectrum[i] * response;
        gl.uniform1fv(spectrumLocation, spectrum);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(postProgram);
      gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
      gl.uniform2f(postSize, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Leave the scene program selected for development uniform inspection.
      gl.useProgram(program);
      frame = requestAnimationFrame(render);
    };
    const resize = () => { const rect = canvas.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height); };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(frame);
      // The browser invalidates these objects on loss. Deleting them after
      // restoration is an INVALID_OPERATION in WebKit's new context.
      program = null;
      buffer = null;
      postProgram = null;
      sceneTexture = null;
      target = null;
      locations.clear();
      delete canvas.dataset.sceneReady;
      setError('Graphics paused. Waiting for the GPU to recover…');
    };
    const onRestored = () => { lost = false; initialize(); };
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      if (!document.hidden && !lost && program) frame = requestAnimationFrame(render);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    document.addEventListener('visibilitychange', onVisibility);
    initialize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      document.removeEventListener('visibilitychange', onVisibility);
      dispose();
    };
  }, [scene]);

  return <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
    <canvas ref={canvasRef} aria-label={scene.name} style={{ display: 'block', width: '100%', height: '100%' }} />
    {error && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 32, color: '#ddd', background: '#080c14' }}>{error}</div>}
  </div>;
}
