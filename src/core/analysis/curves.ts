/**
 * Extract 1D RGB curve data from a 3D LUT by sampling along the neutral axis.
 *
 * For a 3D LUT, the "1D equivalent" per-channel curves are the neutral-axis projections:
 *   r_curve(t) = LUT(t, t, t).r
 *   g_curve(t) = LUT(t, t, t).g
 *   b_curve(t) = LUT(t, t, t).b
 *   master(t)  = 0.2126 * r + 0.7152 * g + 0.0722 * b  (Rec.709 luminance)
 *
 * This is the most meaningful representation for color grading LUTs.
 */

import type { Lut3D } from '../lut/types';
import { tetrahedralInterp } from '../math/interpolation';

export interface RgbCurveData {
  r:      Float32Array; // output R values along neutral axis
  g:      Float32Array; // output G values
  b:      Float32Array; // output B values
  master: Float32Array; // Rec.709 luminance
  input:  Float32Array; // shared input t values [0..1]
}

/**
 * Sample the LUT along the neutral axis (r=g=b=t) at numSamples evenly-spaced points.
 * Uses tetrahedral interpolation for accuracy.
 */
export function extractCurves(lut: Lut3D, numSamples = 256): RgbCurveData {
  const input  = new Float32Array(numSamples);
  const r      = new Float32Array(numSamples);
  const g      = new Float32Array(numSamples);
  const b      = new Float32Array(numSamples);
  const master = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / (numSamples - 1);
    input[i] = t;
    const [outR, outG, outB] = tetrahedralInterp(lut, t, t, t);
    r[i]      = outR;
    g[i]      = outG;
    b[i]      = outB;
    master[i] = 0.2126 * outR + 0.7152 * outG + 0.0722 * outB;
  }

  return { r, g, b, master, input };
}
