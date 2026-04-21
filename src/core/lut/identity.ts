/**
 * Identity LUT generators.
 * An identity LUT maps every input value to itself unchanged.
 */

import type { Lut1D, Lut3D } from './types';

/**
 * Generate a 3D identity LUT of the given size.
 * Output[r,g,b] = (r/(size-1), g/(size-1), b/(size-1))
 */
export function makeIdentity3D(size: number, title = 'Identity'): Lut3D {
  const total = size ** 3;
  const data = new Float32Array(total * 3);
  const step = 1 / (size - 1);

  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const idx = ri + gi * size + bi * size * size;
        data[idx * 3 + 0] = ri * step;
        data[idx * 3 + 1] = gi * step;
        data[idx * 3 + 2] = bi * step;
      }
    }
  }

  return {
    type: '3D',
    size,
    domain: { min: [0, 0, 0], max: [1, 1, 1] },
    data,
    metadata: { title, format: 'cube', comments: [`${size}^3 identity LUT`] },
  };
}

/**
 * Generate a 1D identity LUT of the given size.
 * Each channel maps input → input linearly.
 */
export function makeIdentity1D(size: number, title = 'Identity 1D'): Lut1D {
  const r = new Float32Array(size);
  const g = new Float32Array(size);
  const b = new Float32Array(size);
  const step = 1 / (size - 1);

  for (let i = 0; i < size; i++) {
    r[i] = g[i] = b[i] = i * step;
  }

  return {
    type: '1D',
    size,
    domain: { min: [0, 0, 0], max: [1, 1, 1] },
    r, g, b,
    metadata: { title, format: 'cube', comments: [`${size} entry 1D identity LUT`] },
  };
}

/** Common preset sizes */
export const PRESET_SIZES_3D = [17, 33, 65] as const;
export const PRESET_SIZES_1D = [256, 1024, 4096] as const;
