/**
 * Apply ASC CDL corrections to a 3D LUT.
 *
 * ASC CDL formula (per-channel):
 *   out = clamp(in * slope + offset) ^ power
 * Then apply saturation around Rec.709 luminance.
 *
 * Reference: ASC CDL v1.2 specification
 */

import type { Lut3D } from '../lut/types';
import type { CdlNode } from './types';

// Rec.709 luminance weights
const LUM_R = 0.2126;
const LUM_G = 0.7152;
const LUM_B = 0.0722;

/**
 * Apply CDL corrections to a 3D LUT. Returns a new Lut3D.
 * Operates on the LUT output values, not the input lattice positions.
 */
export function applyCdlToLut(lut: Lut3D, cdl: CdlNode): Lut3D {
  const { slope, offset, power, saturation } = cdl;
  const total = lut.size ** 3;
  const data = new Float32Array(lut.data);

  for (let i = 0; i < total; i++) {
    let r = data[i * 3 + 0];
    let g = data[i * 3 + 1];
    let b = data[i * 3 + 2];

    // SOP: clamp(in * slope + offset) ^ power
    r = Math.max(0, r * slope[0] + offset[0]) ** power[0];
    g = Math.max(0, g * slope[1] + offset[1]) ** power[1];
    b = Math.max(0, b * slope[2] + offset[2]) ** power[2];

    // Saturation around luminance
    if (saturation !== 1.0) {
      const luma = LUM_R * r + LUM_G * g + LUM_B * b;
      r = luma + saturation * (r - luma);
      g = luma + saturation * (g - luma);
      b = luma + saturation * (b - luma);
    }

    data[i * 3 + 0] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  }

  return {
    ...lut,
    data,
    metadata: {
      ...lut.metadata,
      comments: [
        ...lut.metadata.comments,
        `cdl(S:${slope.map((v) => v.toFixed(4)).join(',')}, O:${offset.map((v) => v.toFixed(4)).join(',')}, P:${power.map((v) => v.toFixed(4)).join(',')}, sat:${saturation.toFixed(4)})`,
      ],
    },
  };
}
