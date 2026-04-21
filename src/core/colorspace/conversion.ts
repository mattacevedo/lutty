/**
 * Apply color space conversion to a 3D LUT's output nodes.
 *
 * This re-maps the output values of a LUT from one RGB color space to another
 * via a 3x3 linear matrix (valid for color spaces sharing the same white point
 * or when a Bradford chromatic adaptation is not required).
 *
 * Use case: you have a LUT designed for, say, P3 output and want to convert
 * it so it outputs Rec.709 instead.
 */

import type { Lut3D } from '../lut/types';
import type { ColorPrimaries } from './primaries';
import { getConversionMatrix, applyMatrix } from './primaries';

/**
 * Apply a 3x3 matrix to every output node in a 3D LUT.
 * Returns a new Lut3D.
 */
export function applyMatrixToLut(lut: Lut3D, matrix: number[]): Lut3D {
  const total = lut.size ** 3;
  const data = new Float32Array(total * 3);

  for (let i = 0; i < total; i++) {
    const r = lut.data[i * 3 + 0];
    const g = lut.data[i * 3 + 1];
    const b = lut.data[i * 3 + 2];
    const [nr, ng, nb] = applyMatrix(matrix, r, g, b);
    data[i * 3 + 0] = nr;
    data[i * 3 + 1] = ng;
    data[i * 3 + 2] = nb;
  }

  return {
    ...lut,
    data,
    metadata: {
      ...lut.metadata,
      comments: [...lut.metadata.comments, 'color space matrix applied'],
    },
  };
}

/**
 * Convert a LUT's output nodes from source color space to destination color space.
 * Returns a new Lut3D with updated metadata.
 */
export function convertLutColorSpace(
  lut: Lut3D,
  src: ColorPrimaries,
  dst: ColorPrimaries,
): Lut3D {
  const matrix = getConversionMatrix(src, dst);
  const converted = applyMatrixToLut(lut, matrix);
  return {
    ...converted,
    metadata: {
      ...converted.metadata,
      title: `${lut.metadata.title ?? 'LUT'} (${src.name} → ${dst.name})`,
      comments: [
        ...lut.metadata.comments,
        `Color space conversion: ${src.name} → ${dst.name}`,
        `Matrix: [${matrix.map((v) => v.toFixed(6)).join(', ')}]`,
      ],
    },
  };
}
