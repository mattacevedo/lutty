/**
 * Approximate LUT inversion.
 *
 * True LUT inversion is generally ill-posed — many LUTs are non-bijective,
 * and the inverse may not be unique or may require extrapolation.
 *
 * Strategy used here:
 *   For each node in the inverse grid, find the input that produces the
 *   closest output in the forward LUT, using an iterative Newton-like
 *   approach with tetrahedral interpolation.
 *
 * This is approximate and works best for LUTs that are close to bijective.
 * A warning is always returned indicating the limitation.
 */

import type { Lut3D } from '../lut/types';
import { interpLut3D } from './interpolation';

export interface InversionResult {
  lut: Lut3D;
  warnings: string[];
  maxError: number; // max Euclidean error after inversion
  meanError: number;
}

/** Check if a LUT is likely invertible (roughly monotonic in all axes) */
export function isLikelyInvertible(lut: Lut3D): boolean {
  const { data, size } = lut;
  let violations = 0;
  const sampleStep = Math.max(1, Math.floor(size / 8));

  // Sample diagonally along R=G=B axis
  for (let i = 0; i < size - sampleStep; i += sampleStep) {
    const idx0 = (i + i * size + i * size * size) * 3;
    const idx1 = ((i + sampleStep) + (i + sampleStep) * size + (i + sampleStep) * size * size) * 3;
    const lum0 = data[idx0] + data[idx0 + 1] + data[idx0 + 2];
    const lum1 = data[idx1] + data[idx1 + 1] + data[idx1 + 2];
    if (lum1 <= lum0) violations++;
  }

  return violations === 0;
}

/**
 * Approximate inversion via iterative gradient descent at each output node.
 * For each target output value, we search for the input that maps closest to it.
 *
 * This is O(size^3 * iterations) — use a modest size (≤33) to keep it fast.
 */
export function invertLut3D(lut: Lut3D, targetSize?: number): InversionResult {
  const warnings: string[] = [
    'LUT inversion is approximate. Results may be inaccurate for non-bijective LUTs.',
    'Always verify inversion quality before production use.',
  ];

  const outSize = targetSize ?? Math.min(lut.size, 33);
  const total = outSize ** 3;
  const data = new Float32Array(total * 3);
  const step = 1 / (outSize - 1);

  let maxError = 0;
  let totalError = 0;

  const MAX_ITER = 20;
  const LEARNING_RATE = 0.5;
  const TOLERANCE = 1e-5;

  for (let bi = 0; bi < outSize; bi++) {
    for (let gi = 0; gi < outSize; gi++) {
      for (let ri = 0; ri < outSize; ri++) {
        // Target output value
        const targetR = ri * step;
        const targetG = gi * step;
        const targetB = bi * step;

        // Initial guess: use target as input (good for near-identity LUTs)
        let x = targetR, y = targetG, z = targetB;

        for (let iter = 0; iter < MAX_ITER; iter++) {
          const [outR, outG, outB] = interpLut3D(lut, x, y, z);
          const errR = targetR - outR;
          const errG = targetG - outG;
          const errB = targetB - outB;
          const err = Math.sqrt(errR * errR + errG * errG + errB * errB);

          if (err < TOLERANCE) break;

          // Gradient step: move input toward reducing output error
          x = Math.max(0, Math.min(1, x + errR * LEARNING_RATE));
          y = Math.max(0, Math.min(1, y + errG * LEARNING_RATE));
          z = Math.max(0, Math.min(1, z + errB * LEARNING_RATE));
        }

        // Final error
        const [finalR, finalG, finalB] = interpLut3D(lut, x, y, z);
        const err = Math.sqrt(
          (targetR - finalR) ** 2 + (targetG - finalG) ** 2 + (targetB - finalB) ** 2
        );
        maxError = Math.max(maxError, err);
        totalError += err;

        const idx = ri + gi * outSize + bi * outSize * outSize;
        data[idx * 3 + 0] = x;
        data[idx * 3 + 1] = y;
        data[idx * 3 + 2] = z;
      }
    }
  }

  if (maxError > 0.01) {
    warnings.push(
      `High inversion error detected (max=${maxError.toFixed(4)}). LUT may not be bijective.`
    );
  }

  return {
    lut: {
      type: '3D',
      size: outSize,
      domain: { min: [0, 0, 0], max: [1, 1, 1] },
      data,
      metadata: {
        title: `Inverse of ${lut.metadata.title ?? 'LUT'}`,
        format: 'cube',
        comments: [
          `Approximate inverse (iterative gradient), max error: ${maxError.toFixed(6)}`,
        ],
      },
    },
    warnings,
    maxError,
    meanError: totalError / total,
  };
}
