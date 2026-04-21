/**
 * LUT resampling — resize a 3D LUT to a different grid size.
 * Uses tetrahedral interpolation by default for accuracy.
 */

import type { Lut3D } from '../lut/types';
import { interpLut3D } from './interpolation';

/**
 * Resample a 3D LUT to a new grid size.
 * For each output node, evaluates the input LUT at the corresponding
 * normalized coordinate using the specified interpolation method.
 */
export function resample3D(
  src: Lut3D,
  targetSize: number,
  method: 'tetrahedral' | 'trilinear' = 'tetrahedral'
): Lut3D {
  if (targetSize < 2) throw new Error('Target size must be at least 2');

  const total = targetSize ** 3;
  const data = new Float32Array(total * 3);
  const step = 1 / (targetSize - 1);

  for (let bi = 0; bi < targetSize; bi++) {
    for (let gi = 0; gi < targetSize; gi++) {
      for (let ri = 0; ri < targetSize; ri++) {
        const inR = ri * step;
        const inG = gi * step;
        const inB = bi * step;

        // Scale to source domain
        const sampleR = src.domain.min[0] + inR * (src.domain.max[0] - src.domain.min[0]);
        const sampleG = src.domain.min[1] + inG * (src.domain.max[1] - src.domain.min[1]);
        const sampleB = src.domain.min[2] + inB * (src.domain.max[2] - src.domain.min[2]);

        const [outR, outG, outB] = interpLut3D(src, sampleR, sampleG, sampleB, method);
        const idx = ri + gi * targetSize + bi * targetSize * targetSize;
        data[idx * 3 + 0] = outR;
        data[idx * 3 + 1] = outG;
        data[idx * 3 + 2] = outB;
      }
    }
  }

  return {
    type: '3D',
    size: targetSize,
    domain: { ...src.domain },
    data,
    metadata: {
      ...src.metadata,
      comments: [
        ...src.metadata.comments,
        `Resampled from ${src.size}^3 to ${targetSize}^3 (${method})`,
      ],
    },
  };
}
