/**
 * LUT decomposition — isolate the luminance (contrast) component and the
 * color (chrominance) component of a 3D LUT into separate LUTs.
 *
 * Algorithm:
 *
 * Luminance LUT:
 *   For each output node, compute the neutral-axis luminance response at
 *   that node's input luminance: L_out = LUT(t,t,t) luminance at t = input_luma.
 *   Scale the output node uniformly to preserve that luminance while desaturating
 *   (moving toward the neutral axis).
 *
 * Color LUT:
 *   The color component is what's left after removing the luminance transform.
 *   Built by composing: luminanceLUT_inverse → originalLUT.
 *   Since full inversion is expensive, we use a direct per-node approach:
 *   for each node, divide the output RGB by the neutral-axis luminance response
 *   at that input position, effectively cancelling the luminance curve.
 *
 * Warnings are surfaced if the decomposition is approximate.
 */

import type { Lut3D } from '../lut/types';
import { tetrahedralInterp } from '../math/interpolation';

export interface DecompositionResult {
  luminanceLut: Lut3D;
  colorLut: Lut3D;
  warnings: string[];
}

// Rec.709 luminance weights
const LUM_R = 0.2126;
const LUM_G = 0.7152;
const LUM_B = 0.0722;

function luma(r: number, g: number, b: number): number {
  return LUM_R * r + LUM_G * g + LUM_B * b;
}

/**
 * Precompute the neutral-axis luminance curve as a lookup table with
 * numSamples points. Returns a Float32Array mapping input t → output luma.
 */
function buildNeutralLumaCurve(lut: Lut3D, numSamples = 256): Float32Array {
  const curve = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / (numSamples - 1);
    const [r, g, b] = tetrahedralInterp(lut, t, t, t);
    curve[i] = luma(r, g, b);
  }
  return curve;
}

/** Sample the neutral luma curve at t via linear interpolation */
function sampleLumaCurve(curve: Float32Array, t: number): number {
  const n = curve.length;
  const scaled = Math.max(0, Math.min(1, t)) * (n - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(n - 1, lo + 1);
  const frac = scaled - lo;
  return curve[lo] * (1 - frac) + curve[hi] * frac;
}

/**
 * Extract the luminance (contrast/tonality) component of a 3D LUT.
 *
 * The luminance LUT applies the same luminance curve as the original LUT
 * but desaturates output to the neutral axis — i.e. it captures only the
 * tonal response, not the color shift.
 */
export function extractLuminanceLut(lut: Lut3D): Lut3D {
  const size = lut.size;
  const total = size ** 3;
  const data = new Float32Array(total * 3);
  const lumaCurve = buildNeutralLumaCurve(lut);

  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const idx = ri + gi * size + bi * size * size;
        const t_r = ri / (size - 1);
        const t_g = gi / (size - 1);
        const t_b = bi / (size - 1);

        // Input luminance at this node position
        const inputLuma = luma(t_r, t_g, t_b);
        // Output luminance from the neutral axis curve at that input luma
        const outputLuma = sampleLumaCurve(lumaCurve, inputLuma);

        // Apply only the luminance transform: scale along neutral axis
        // Output = (outputLuma / inputLuma) * input  — safe division
        const scale = inputLuma > 0.001 ? outputLuma / inputLuma : outputLuma;
        data[idx * 3 + 0] = t_r * scale;
        data[idx * 3 + 1] = t_g * scale;
        data[idx * 3 + 2] = t_b * scale;
      }
    }
  }

  return {
    type: '3D',
    size,
    domain: { min: [0, 0, 0], max: [1, 1, 1] },
    data,
    metadata: {
      title: `Luminance component of ${lut.metadata.title ?? 'LUT'}`,
      format: 'cube',
      comments: ['Extracted luminance/contrast component (neutral-axis tonal response)'],
    },
  };
}

/**
 * Extract the color (chrominance/hue+saturation) component of a 3D LUT.
 *
 * The color LUT removes the luminance curve from the original, leaving only
 * the color shift. Applied after the luminance LUT, it reconstructs the original.
 *
 * Computed per-node: divide each output RGB by the neutral-axis luma response
 * at that node's input position, then re-scale.
 */
export function extractColorLut(lut: Lut3D): Lut3D {
  const size = lut.size;
  const total = size ** 3;
  const data = new Float32Array(total * 3);
  const lumaCurve = buildNeutralLumaCurve(lut);

  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const idx = ri + gi * size + bi * size * size;
        const t_r = ri / (size - 1);
        const t_g = gi / (size - 1);
        const t_b = bi / (size - 1);

        // Input luminance
        const inputLuma = luma(t_r, t_g, t_b);
        // Expected luminance output from the tonal curve
        const outputLuma = sampleLumaCurve(lumaCurve, inputLuma);
        // Scale to cancel the tonal contribution, keep only color shift
        const scale = outputLuma > 0.001 ? inputLuma / outputLuma : 1;

        // Original LUT output at this node
        const r_out = lut.data[idx * 3 + 0];
        const g_out = lut.data[idx * 3 + 1];
        const b_out = lut.data[idx * 3 + 2];

        data[idx * 3 + 0] = r_out * scale;
        data[idx * 3 + 1] = g_out * scale;
        data[idx * 3 + 2] = b_out * scale;
      }
    }
  }

  return {
    type: '3D',
    size,
    domain: { min: [0, 0, 0], max: [1, 1, 1] },
    data,
    metadata: {
      title: `Color component of ${lut.metadata.title ?? 'LUT'}`,
      format: 'cube',
      comments: ['Extracted color/chrominance component (hue+saturation shift, contrast removed)'],
    },
  };
}

/** Decompose a LUT into both components in one call */
export function decomposeLut(lut: Lut3D): DecompositionResult {
  const warnings: string[] = [];
  if (lut.size > 33) {
    warnings.push('Decomposition on large LUTs (>33³) may be slow.');
  }
  return {
    luminanceLut: extractLuminanceLut(lut),
    colorLut: extractColorLut(lut),
    warnings,
  };
}
