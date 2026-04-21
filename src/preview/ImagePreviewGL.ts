/**
 * WebGL-based image preview with real-time LUT application.
 *
 * Uses a 3D texture (or a tiled 2D texture fallback) to represent the LUT,
 * and a full-screen quad fragment shader to apply it per-pixel.
 *
 * Supports side-by-side, wipe, and difference preview modes.
 * Interpolation is performed in the GPU shader using hardware trilinear
 * filtering on the 3D texture.
 */

import type { Lut3D } from '../core/lut/types';

type PreviewMode = 'sideBySide' | 'wipe' | 'difference';

export class ImagePreviewGL {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private imageTexture: WebGLTexture | null = null;
  private lutTexture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private canvas: HTMLCanvasElement;
  private lutSize = 0;
  private imageAspect = 1; // imageWidth / imageHeight

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 is not supported in this browser');
    this.gl = gl;
    this.init();
  }

  private init(): void {
    const { gl } = this;

    const vsSource = `#version 300 es
      in vec2 a_position;
      out vec2 v_uv;
      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `#version 300 es
      precision highp float;
      precision highp sampler3D;

      in vec2 v_uv;
      out vec4 fragColor;

      uniform sampler2D u_image;
      uniform sampler3D u_lut;
      uniform int u_mode;           // 0=sideBySide 1=wipe 2=difference
      uniform float u_wipePos;      // 0..1
      uniform float u_lutStrength;
      uniform bool u_falseColor;
      uniform int u_lutSize;
      uniform float u_imageAspect;  // imageW / imageH
      uniform float u_canvasAspect; // canvasW / canvasH

      // Compute letterboxed/pillarboxed UV so the image fills the canvas
      // while preserving its original aspect ratio (contain fit).
      vec2 aspectUV(vec2 screenUV) {
        vec2 uv = screenUV;
        if (u_imageAspect > u_canvasAspect) {
          // Image is wider than canvas — bars on top/bottom
          float scale = u_imageAspect / u_canvasAspect;
          uv.y = (uv.y - 0.5) * scale + 0.5;
        } else {
          // Image is taller than canvas — bars on left/right
          float scale = u_canvasAspect / u_imageAspect;
          uv.x = (uv.x - 0.5) * scale + 0.5;
        }
        return uv;
      }

      vec3 applyLut(vec3 color) {
        float scale = float(u_lutSize - 1) / float(u_lutSize);
        float offset = 0.5 / float(u_lutSize);
        vec3 lutCoord = color * scale + offset;
        return texture(u_lut, lutCoord).rgb;
      }

      vec3 applyWithStrength(vec3 color) {
        return mix(color, applyLut(color), u_lutStrength);
      }

      vec3 falseColorDiff(vec3 a, vec3 b) {
        float diff = length(a - b) * 5.0;
        vec3 col;
        if (diff < 0.25) col = mix(vec3(0.0,0.0,1.0), vec3(0.0,1.0,1.0), diff/0.25);
        else if (diff < 0.5) col = mix(vec3(0.0,1.0,1.0), vec3(0.0,1.0,0.0), (diff-0.25)/0.25);
        else if (diff < 0.75) col = mix(vec3(0.0,1.0,0.0), vec3(1.0,1.0,0.0), (diff-0.5)/0.25);
        else col = mix(vec3(1.0,1.0,0.0), vec3(1.0,0.0,0.0), (diff-0.75)/0.25);
        return col;
      }

      void main() {
        // Aspect-corrected image UV (flipped Y for WebGL convention)
        vec2 imgUV = aspectUV(vec2(v_uv.x, 1.0 - v_uv.y));

        // Black bars outside the image area
        if (imgUV.x < 0.0 || imgUV.x > 1.0 || imgUV.y < 0.0 || imgUV.y > 1.0) {
          fragColor = vec4(0.05, 0.05, 0.06, 1.0);
          return;
        }

        vec3 original = texture(u_image, imgUV).rgb;
        vec3 graded = applyWithStrength(original);

        // Mode logic uses screen-space UV for the split/wipe position
        if (u_mode == 0) {
          fragColor = vec4(v_uv.x < 0.5 ? original : graded, 1.0);
        } else if (u_mode == 1) {
          vec3 col = v_uv.x < u_wipePos ? original : graded;
          float dist = abs(v_uv.x - u_wipePos);
          if (dist < 0.002) col = vec3(1.0, 1.0, 0.2);
          fragColor = vec4(col, 1.0);
        } else {
          if (u_falseColor) {
            fragColor = vec4(falseColorDiff(original, graded), 1.0);
          } else {
            fragColor = vec4(abs(original - graded) * 5.0, 1.0);
          }
        }
      }
    `;

    this.program = this.createProgram(vsSource, fsSource);

    // Full-screen quad
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program!, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.vao = vao;
  }

  /** Upload a source image and record its natural dimensions for aspect correction. */
  setImage(img: HTMLImageElement | ImageBitmap): void {
    const { gl } = this;
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.imageTexture = tex;
    // Record natural aspect ratio for use in the shader
    const w = img instanceof HTMLImageElement ? img.naturalWidth  : img.width;
    const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    this.imageAspect = h > 0 ? w / h : 1;
  }

  /** Upload a 3D LUT as a WebGL 3D texture */
  setLut(lut: Lut3D): void {
    const { gl } = this;
    if (this.lutTexture) gl.deleteTexture(this.lutTexture);

    const size = lut.size;
    this.lutSize = size;

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    // Use float texture if the extension is available for hardware linear filtering.
    // RGB32F with OES_texture_float_linear eliminates the 8-bit quantization banding.
    const floatLinear = gl.getExtension('OES_texture_float_linear');
    if (floatLinear) {
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage3D(
        gl.TEXTURE_3D, 0, gl.RGB32F,
        size, size, size, 0,
        gl.RGB, gl.FLOAT, lut.data
      );
    } else {
      // Fallback: quantize to 8-bit and rely on hardware trilinear
      const total = size ** 3;
      const pixels = new Uint8Array(total * 4);
      for (let i = 0; i < total; i++) {
        pixels[i * 4 + 0] = Math.round(Math.max(0, Math.min(1, lut.data[i * 3 + 0])) * 255);
        pixels[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, lut.data[i * 3 + 1])) * 255);
        pixels[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, lut.data[i * 3 + 2])) * 255);
        pixels[i * 4 + 3] = 255;
      }
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage3D(
        gl.TEXTURE_3D, 0, gl.RGBA,
        size, size, size, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, pixels
      );
    }

    this.lutTexture = tex;
  }

  /** Render the preview */
  render(mode: PreviewMode, wipePos: number, lutStrength: number, falseColor: boolean): void {
    const { gl, program } = this;
    if (!program || !this.imageTexture || !this.lutTexture) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_lut'), 1);

    const modeMap: Record<PreviewMode, number> = { sideBySide: 0, wipe: 1, difference: 2 };
    gl.uniform1i(gl.getUniformLocation(program, 'u_mode'), modeMap[mode]);
    gl.uniform1f(gl.getUniformLocation(program, 'u_wipePos'), wipePos);
    gl.uniform1f(gl.getUniformLocation(program, 'u_lutStrength'), lutStrength);
    gl.uniform1i(gl.getUniformLocation(program, 'u_falseColor'), falseColor ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_lutSize'), this.lutSize);
    gl.uniform1f(gl.getUniformLocation(program, 'u_imageAspect'), this.imageAspect);
    gl.uniform1f(gl.getUniformLocation(program, 'u_canvasAspect'),
      this.canvas.height > 0 ? this.canvas.width / this.canvas.height : 1);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  dispose(): void {
    const { gl } = this;
    if (this.imageTexture) gl.deleteTexture(this.imageTexture);
    if (this.lutTexture) gl.deleteTexture(this.lutTexture);
    if (this.program) gl.deleteProgram(this.program);
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const { gl } = this;
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Shader link error: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const { gl } = this;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }
}
