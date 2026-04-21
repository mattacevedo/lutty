/**
 * LUT editing operations — all non-destructive transforms applied at the node level.
 * Each function takes a Lut3D and returns a new Lut3D with the transform applied.
 */

import type { Lut3D } from '../lut/types';

function cloneData(lut: Lut3D): Float32Array {
  return new Float32Array(lut.data);
}

function withData(lut: Lut3D, data: Float32Array, label: string): Lut3D {
  return {
    ...lut,
    data,
    metadata: {
      ...lut.metadata,
      comments: [...lut.metadata.comments, label],
    },
  };
}

/** Apply gamma correction to all output values: out = in^(1/gamma) */
export function applyGamma(lut: Lut3D, gamma: number): Lut3D {
  if (gamma <= 0) throw new Error('Gamma must be positive');
  const data = cloneData(lut);
  const inv = 1 / gamma;
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(0, data[i]) ** inv;
  }
  return withData(lut, data, `gamma(${gamma.toFixed(3)})`);
}

/** Scale saturation of all output values (1.0 = no change) */
export function applySaturation(lut: Lut3D, saturation: number): Lut3D {
  const data = cloneData(lut);
  const total = lut.size ** 3;
  for (let i = 0; i < total; i++) {
    const r = data[i * 3 + 0];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    // Rec.709 luminance weights
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    data[i * 3 + 0] = luma + (r - luma) * saturation;
    data[i * 3 + 1] = luma + (g - luma) * saturation;
    data[i * 3 + 2] = luma + (b - luma) * saturation;
  }
  return withData(lut, data, `saturation(${saturation.toFixed(3)})`);
}

/**
 * Apply contrast around a pivot point.
 * contrast=1.0 → no change; >1 increases contrast; <1 reduces.
 */
export function applyContrast(lut: Lut3D, contrast: number, pivot = 0.435): Lut3D {
  const data = cloneData(lut);
  for (let i = 0; i < data.length; i++) {
    data[i] = (data[i] - pivot) * contrast + pivot;
  }
  return withData(lut, data, `contrast(${contrast.toFixed(3)}, pivot=${pivot.toFixed(3)})`);
}

/**
 * Per-channel slope and offset: out = in * slope + offset.
 * This is a full-range linear transform (same as CDL Slope+Offset without Power).
 * Not the same as "Gain" in DaVinci Resolve — Resolve's Gain is a highlight-specific
 * tool, whereas this multiplier affects the entire tonal range uniformly.
 */
export function applyGainOffset(
  lut: Lut3D,
  gainR: number, gainG: number, gainB: number,
  offsetR: number, offsetG: number, offsetB: number
): Lut3D {
  const data = cloneData(lut);
  const total = lut.size ** 3;
  for (let i = 0; i < total; i++) {
    data[i * 3 + 0] = data[i * 3 + 0] * gainR + offsetR;
    data[i * 3 + 1] = data[i * 3 + 1] * gainG + offsetG;
    data[i * 3 + 2] = data[i * 3 + 2] * gainB + offsetB;
  }
  return withData(lut, data, `gain(${gainR.toFixed(2)},${gainG.toFixed(2)},${gainB.toFixed(2)}) offset(${offsetR.toFixed(3)},${offsetG.toFixed(3)},${offsetB.toFixed(3)})`);
}

/**
 * Rotate hue by angle (degrees) using a rotation matrix in linear RGB.
 * This is approximate — accurate hue rotation requires a perceptual color space.
 */
export function applyHueRotation(lut: Lut3D, angleDeg: number): Lut3D {
  const data = cloneData(lut);
  const total = lut.size ** 3;
  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Rotation matrix around neutral axis in RGB space
  const w = [0.57735, 0.57735, 0.57735]; // unit vector along neutral axis
  // Rodrigues' rotation formula
  const m = [
    cos + w[0] * w[0] * (1 - cos),  w[0] * w[1] * (1 - cos) - w[2] * sin, w[0] * w[2] * (1 - cos) + w[1] * sin,
    w[1] * w[0] * (1 - cos) + w[2] * sin, cos + w[1] * w[1] * (1 - cos),  w[1] * w[2] * (1 - cos) - w[0] * sin,
    w[2] * w[0] * (1 - cos) - w[1] * sin, w[2] * w[1] * (1 - cos) + w[0] * sin, cos + w[2] * w[2] * (1 - cos),
  ];

  for (let i = 0; i < total; i++) {
    const r = data[i * 3 + 0];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    data[i * 3 + 0] = m[0] * r + m[1] * g + m[2] * b;
    data[i * 3 + 1] = m[3] * r + m[4] * g + m[5] * b;
    data[i * 3 + 2] = m[6] * r + m[7] * g + m[8] * b;
  }
  return withData(lut, data, `hueRotation(${angleDeg.toFixed(1)}deg)`);
}

/** Clamp all output values to [0, 1] */
export function clampOutputs(lut: Lut3D): Lut3D {
  const data = cloneData(lut);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(0, Math.min(1, data[i]));
  }
  return withData(lut, data, 'clamp(0,1)');
}
