/**
 * LUT composition operations.
 *
 * compose(A, B): creates a new LUT equivalent to applying A then B.
 * blend(A, B, t): linear blend between two same-size LUTs.
 * blendWithIdentity(A, t): blend a LUT with identity by strength [0..1].
 */

import type { Lut3D } from '../lut/types';
import { makeIdentity3D } from '../lut/identity';
import { interpLut3D } from './interpolation';
import { resample3D } from './resampling';

/**
 * Compose two LUTs: apply A first, then B.
 * Output[i] = B(A(input[i]))
 * Both LUTs are resampled to targetSize before composition.
 */
export function composeLuts(
  a: Lut3D,
  b: Lut3D,
  targetSize: number = Math.max(a.size, b.size),
  method: 'tetrahedral' | 'trilinear' = 'tetrahedral'
): Lut3D {
  // Resample both to target size if needed
  const lutA = a.size === targetSize ? a : resample3D(a, targetSize, method);
  const lutB = b.size === targetSize ? b : resample3D(b, targetSize, method);

  const total = targetSize ** 3;
  const data = new Float32Array(total * 3);

  for (let i = 0; i < total; i++) {
    // First apply A
    const rA = lutA.data[i * 3 + 0];
    const gA = lutA.data[i * 3 + 1];
    const bA = lutA.data[i * 3 + 2];
    // Then apply B to the result of A
    const [rOut, gOut, bOut] = interpLut3D(lutB, rA, gA, bA, method);
    data[i * 3 + 0] = rOut;
    data[i * 3 + 1] = gOut;
    data[i * 3 + 2] = bOut;
  }

  return {
    type: '3D',
    size: targetSize,
    domain: { min: [0, 0, 0], max: [1, 1, 1] },
    data,
    metadata: {
      title: `Composed: ${a.metadata.title ?? 'A'} → ${b.metadata.title ?? 'B'}`,
      format: 'cube',
      comments: [
        `Composed LUT: ${a.metadata.title ?? 'A'} then ${b.metadata.title ?? 'B'}`,
        `Size: ${targetSize}^3, method: ${method}`,
      ],
    },
  };
}

/**
 * Blend two LUTs by linear interpolation at each node.
 * t=0 → pure A, t=1 → pure B.
 * Both LUTs are resampled to targetSize if needed.
 */
export function blendLuts(
  a: Lut3D,
  b: Lut3D,
  t: number,
  targetSize: number = Math.max(a.size, b.size)
): Lut3D {
  const lutA = a.size === targetSize ? a : resample3D(a, targetSize);
  const lutB = b.size === targetSize ? b : resample3D(b, targetSize);

  const total = targetSize ** 3;
  const data = new Float32Array(total * 3);
  const tClamped = Math.max(0, Math.min(1, t));
  const oneMinusT = 1 - tClamped;

  for (let i = 0; i < total * 3; i++) {
    data[i] = lutA.data[i] * oneMinusT + lutB.data[i] * tClamped;
  }

  return {
    type: '3D',
    size: targetSize,
    domain: { min: [0, 0, 0], max: [1, 1, 1] },
    data,
    metadata: {
      title: `Blend(${a.metadata.title ?? 'A'}, ${b.metadata.title ?? 'B'}, ${t.toFixed(2)})`,
      format: 'cube',
      comments: [`Blend of A and B at t=${t.toFixed(4)}`],
    },
  };
}

/**
 * Blend a LUT with identity by strength t.
 * t=0 → identity, t=1 → full LUT effect.
 */
export function blendWithIdentity(lut: Lut3D, strength: number): Lut3D {
  const identity = makeIdentity3D(lut.size);
  return blendLuts(identity, lut, Math.max(0, Math.min(1, strength)));
}
