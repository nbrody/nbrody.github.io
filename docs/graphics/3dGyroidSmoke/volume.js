const VERTEX_SOURCE = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function shader(gl, type, source, label) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(result) || 'Unknown compiler error';
    gl.deleteShader(result);
    throw new Error(`${label} shader failed to compile:\n${message}`);
  }
  return result;
}

function program(gl, fragmentSource) {
  const vertex = shader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE, 'Volume vertex');
  let fragment;
  let result;
  try {
    fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource, '3D smoke advection');
    result = gl.createProgram();
    gl.attachShader(result, vertex);
    gl.attachShader(result, fragment);
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
      throw new Error(`3D smoke program failed to link:\n${gl.getProgramInfoLog(result) || 'Unknown linker error'}`);
    }
    return result;
  } catch (error) {
    if (result) gl.deleteProgram(result);
    throw error;
  } finally {
    gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
}

function halfToFloat(value) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >>> 10) & 31;
  const mantissa = value & 1023;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 31) return mantissa ? NaN : sign * Infinity;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

/**
 * Persistent, normalized [0,1]^3 pigment/density volume. This module owns the
 * WebGL drawing state during its calls; the caller sets state for its own pass.
 * Resizing the display never requires recreating this volume.
 */
export async function createVolume(gl, dimensions = [64, 40, 56]) {
  if (!gl || typeof gl.texImage3D !== 'function') throw new Error('The 3D smoke simulation requires WebGL 2.');
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('This GPU does not support EXT_color_buffer_float, which is required for the persistent 3D smoke volume.');
  }
  const maxDimension = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
  if (!Array.isArray(dimensions) || dimensions.length !== 3 || dimensions.some(value => !Number.isInteger(value) || value < 2 || value > maxDimension)) {
    throw new Error(`Volume dimensions must be three integers between 2 and ${maxDimension}.`);
  }
  dimensions = Object.freeze([...dimensions]);
  const response = await fetch(new URL('./advect.glsl', import.meta.url));
  if (!response.ok) throw new Error(`Could not load 3D smoke advection shader (${response.status}).`);
  const simulation = program(gl, await response.text());
  const names = ['uPrevious', 'uVelocity', 'uPass', 'uDimensions', 'uLayer', 'uDt', 'uTime', 'uSpeed', 'uCurl', 'uPulse', 'uDiffusion', 'uInjection', 'uSourceCount', 'uSourcePositionStrength[0]', 'uSourceColor[0]'];
  const uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(simulation, name)]));
  const framebuffer = gl.createFramebuffer();
  const vao = gl.createVertexArray();
  const textures = [];
  const zero = new Float32Array(4);
  const positions = new Float32Array(8 * 4);
  const colors = new Float32Array(8 * 3);
  let current = 0;
  let disposed = false;

  function drawingState() {
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, dimensions[0], dimensions[1]);
  }

  function assertAlive() {
    if (disposed) throw new Error('This 3D smoke volume has been disposed.');
  }

  function clear() {
    assertAlive();
    drawingState();
    for (const texture of textures) {
      for (let layer = 0; layer < dimensions[2]; layer++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, texture, 0, layer);
        gl.clearBufferfv(gl.COLOR, 0, zero);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    current = 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const texture of textures) gl.deleteTexture(texture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(simulation);
  }

  try {
    gl.activeTexture(gl.TEXTURE0);
    // Two pigment/density textures plus one cached velocity field.
    for (let index = 0; index < 3; index++) {
      const texture = gl.createTexture();
      textures.push(texture);
      gl.bindTexture(gl.TEXTURE_3D, texture);
      gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RGBA16F, ...dimensions);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, texture, 0, 0);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Cannot render into the 3D RGBA16F smoke volume (framebuffer status 0x${status.toString(16)}).`);
    }
    gl.bindTexture(gl.TEXTURE_3D, null);
    clear();
  } catch (error) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_3D, null);
    dispose();
    throw error;
  }

  function step(dt, time, options = {}) {
    assertAlive();
    dt = clamp(finite(dt, 0), 0, 1 / 15);
    if (dt === 0) return;
    // Cache the costly analytic curl once, then transport four shorter steps
    // so strong visible swirls remain inside the conservative solver's CFL.
    const substeps = 4;
    const substepDt = dt / substeps;
    time = finite(time, 0);
    const sources = Array.isArray(options.sources) ? options.sources.slice(0, 8) : [];
    positions.fill(0);
    colors.fill(0);
    sources.forEach((source, index) => {
      for (let axis = 0; axis < 3; axis++) {
        positions[index * 4 + axis] = clamp(finite(source?.position?.[axis], 0.5), 0, 1);
        colors[index * 3 + axis] = clamp(finite(source?.color?.[axis], 1), 0, 1);
      }
      positions[index * 4 + 3] = clamp(finite(source?.strength, 0), 0, 8);
    });
    drawingState();
    gl.bindVertexArray(vao);
    gl.useProgram(simulation);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, textures[current]);
    gl.uniform1i(uniforms.uPrevious, 0);
    gl.activeTexture(gl.TEXTURE1);
    // Bind a complete, non-target texture for the unused velocity sampler in
    // the first pass, avoiding WebGL's sampler/framebuffer alias checks.
    gl.bindTexture(gl.TEXTURE_3D, textures[current]);
    gl.uniform1i(uniforms.uVelocity, 1);
    gl.uniform3f(uniforms.uDimensions, ...dimensions);
    gl.uniform1f(uniforms.uDt, substepDt);
    gl.uniform1f(uniforms.uTime, time);
    gl.uniform1f(uniforms.uSpeed, clamp(finite(options.speed, 1), 0, 2));
    gl.uniform1f(uniforms.uCurl, clamp(finite(options.curl, 0.7), 0, 4));
    gl.uniform1f(uniforms.uPulse, clamp(finite(options.pulse, 0.35), 0, 4));
    gl.uniform1f(uniforms.uDiffusion, clamp(finite(options.diffusion, 0.7), 0, 4));
    gl.uniform1f(uniforms.uInjection, clamp(finite(options.injection, 1), 0, 8));
    gl.uniform1i(uniforms.uSourceCount, sources.length);
    gl.uniform4fv(uniforms['uSourcePositionStrength[0]'], positions);
    gl.uniform3fv(uniforms['uSourceColor[0]'], colors);
    gl.uniform1i(uniforms.uPass, 0);
    for (let layer = 0; layer < dimensions[2]; layer++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, textures[2], 0, layer);
      gl.uniform1f(uniforms.uLayer, layer);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindTexture(gl.TEXTURE_3D, textures[2]);
    gl.uniform1i(uniforms.uPass, 1);
    for (let substep = 0; substep < substeps; substep++) {
      const next = 1 - current;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_3D, textures[current]);
      gl.uniform1f(uniforms.uTime, time + substep * substepDt);
      for (let layer = 0; layer < dimensions[2]; layer++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, textures[next], 0, layer);
        gl.uniform1f(uniforms.uLayer, layer);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      current = next;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, null);
    gl.bindVertexArray(null);
  }

  // Synchronous readback is deliberately opt-in and is never part of animation.
  function sampleStats({ stride = 1 } = {}) {
    assertAlive();
    stride = clamp(Number.isInteger(stride) ? stride : 1, 1, Math.max(...dimensions));
    const first = dimensions.map(size => Math.min(Math.floor(stride / 2), size - 1));
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, textures[current], 0, 0);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    const readType = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
    const readFormat = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
    if (readFormat !== gl.RGBA || (readType !== gl.FLOAT && readType !== gl.HALF_FLOAT)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      throw new Error('This GPU does not expose floating-point volume readback for diagnostics.');
    }
    const pixels = readType === gl.FLOAT ? new Float32Array(dimensions[0] * dimensions[1] * 4) : new Uint16Array(dimensions[0] * dimensions[1] * 4);
    const decode = readType === gl.FLOAT ? value => value : halfToFloat;
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.PACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.PACK_SKIP_ROWS, 0);
    gl.pixelStorei(gl.PACK_SKIP_PIXELS, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    let sumDensity = 0, minDensity = Infinity, maxDensity = 0, occupiedVoxels = 0, sampledVoxelCount = 0;
    const pigment = [0, 0, 0];
    try {
      for (let layer = first[2]; layer < dimensions[2]; layer += stride) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, textures[current], 0, layer);
        gl.readPixels(0, 0, dimensions[0], dimensions[1], readFormat, readType, pixels);
        for (let y = first[1]; y < dimensions[1]; y += stride) {
          for (let x = first[0]; x < dimensions[0]; x += stride) {
            const index = (y * dimensions[0] + x) * 4;
            const density = decode(pixels[index + 3]);
            if (!Number.isFinite(density)) throw new Error('The smoke volume contains a non-finite density.');
            sumDensity += density;
            minDensity = Math.min(minDensity, density);
            maxDensity = Math.max(maxDensity, density);
            if (density > 0.02) occupiedVoxels++;
            sampledVoxelCount++;
            for (let axis = 0; axis < 3; axis++) pigment[axis] += decode(pixels[index + axis]);
          }
        }
      }
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];
    return { sumDensity, meanDensity: sumDensity / sampledVoxelCount, minDensity, maxDensity,
      occupiedVoxels, occupiedFraction: occupiedVoxels / sampledVoxelCount,
      voxelCount, sampledVoxelCount, stride, pigment };
  }

  return { get texture() { return textures[current]; }, dimensions, step, clear, dispose, sampleStats };
}

export default createVolume;
