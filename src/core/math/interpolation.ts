/**
 * 3D LUT interpolation — tetrahedral (preferred) and trilinear.
 *
 * All coordinates are assumed to be in [0, 1] normalized input space.
 * The LUT data array is indexed as: idx = r + g*size + b*size^2 (R fastest).
 *
 * Tetrahedral interpolation is preferred because it:
 *  - Preserves neutrals better than trilinear
 *  - Is the standard used by DaVinci Resolve, Nuke, etc.
 *  - Has O(same) cost but better accuracy
 */

import type { Lut3D } from '../lut/types';

/** Read a single output channel from the flat interleaved data array */
function sample(data: Float32Array, size: number, ri: number, gi: number, bi: number): [number, number, number] {
  // Clamp indices to valid range
  const r = Math.max(0, Math.min(size - 1, ri));
  const g = Math.max(0, Math.min(size - 1, gi));
  const b = Math.max(0, Math.min(size - 1, bi));
  const idx = (r + g * size + b * size * size) * 3;
  return [data[idx], data[idx + 1], data[idx + 2]];
}

/**
 * Apply tetrahedral interpolation to evaluate the LUT at a normalized RGB point.
 * Returns [r, g, b] output values.
 *
 * Based on Colour & Vision Research Laboratory tetrahedral algorithm.
 */
export function tetrahedralInterp(lut: Lut3D, inR: number, inG: number, inB: number): [number, number, number] {
  const { data, size, domain } = lut;

  // Map normalized input to LUT lattice coordinate
  const scale = size - 1;
  const scaleR = (inR - domain.min[0]) / (domain.max[0] - domain.min[0]) * scale;
  const scaleG = (inG - domain.min[1]) / (domain.max[1] - domain.min[1]) * scale;
  const scaleB = (inB - domain.min[2]) / (domain.max[2] - domain.min[2]) * scale;

  // Integer lower bounds, clamped
  let r0 = Math.floor(scaleR);
  let g0 = Math.floor(scaleG);
  let b0 = Math.floor(scaleB);

  r0 = Math.max(0, Math.min(size - 2, r0));
  g0 = Math.max(0, Math.min(size - 2, g0));
  b0 = Math.max(0, Math.min(size - 2, b0));

  const r1 = r0 + 1;
  const g1 = g0 + 1;
  const b1 = b0 + 1;

  // Fractional parts
  const fr = Math.max(0, Math.min(1, scaleR - r0));
  const fg = Math.max(0, Math.min(1, scaleG - g0));
  const fb = Math.max(0, Math.min(1, scaleB - b0));

  // 8 corners of the unit cube in lattice space
  const c000 = sample(data, size, r0, g0, b0);
  const c100 = sample(data, size, r1, g0, b0);
  const c010 = sample(data, size, r0, g1, b0);
  const c110 = sample(data, size, r1, g1, b0);
  const c001 = sample(data, size, r0, g0, b1);
  const c101 = sample(data, size, r1, g0, b1);
  const c011 = sample(data, size, r0, g1, b1);
  const c111 = sample(data, size, r1, g1, b1);

  // Tetrahedral interpolation — 6 tetrahedra cover the unit cube.
  // Select tetrahedron based on ordering of fr, fg, fb.
  let outR: number, outG: number, outB: number;

  if (fr >= fg && fg >= fb) {
    // Tetrahedron 1: fr >= fg >= fb
    outR = (1 - fr) * c000[0] + (fr - fg) * c100[0] + (fg - fb) * c110[0] + fb * c111[0];
    outG = (1 - fr) * c000[1] + (fr - fg) * c100[1] + (fg - fb) * c110[1] + fb * c111[1];
    outB = (1 - fr) * c000[2] + (fr - fg) * c100[2] + (fg - fb) * c110[2] + fb * c111[2];
  } else if (fr >= fb && fb >= fg) {
    // Tetrahedron 2: fr >= fb >= fg
    outR = (1 - fr) * c000[0] + (fr - fb) * c100[0] + (fb - fg) * c101[0] + fg * c111[0];
    outG = (1 - fr) * c000[1] + (fr - fb) * c100[1] + (fb - fg) * c101[1] + fg * c111[1];
    outB = (1 - fr) * c000[2] + (fr - fb) * c100[2] + (fb - fg) * c101[2] + fg * c111[2];
  } else if (fb >= fr && fr >= fg) {
    // Tetrahedron 3: fb >= fr >= fg
    outR = (1 - fb) * c000[0] + (fb - fr) * c001[0] + (fr - fg) * c101[0] + fg * c111[0];
    outG = (1 - fb) * c000[1] + (fb - fr) * c001[1] + (fr - fg) * c101[1] + fg * c111[1];
    outB = (1 - fb) * c000[2] + (fb - fr) * c001[2] + (fr - fg) * c101[2] + fg * c111[2];
  } else if (fg >= fr && fr >= fb) {
    // Tetrahedron 4: fg >= fr >= fb
    outR = (1 - fg) * c000[0] + (fg - fr) * c010[0] + (fr - fb) * c110[0] + fb * c111[0];
    outG = (1 - fg) * c000[1] + (fg - fr) * c010[1] + (fr - fb) * c110[1] + fb * c111[1];
    outB = (1 - fg) * c000[2] + (fg - fr) * c010[2] + (fr - fb) * c110[2] + fb * c111[2];
  } else if (fg >= fb && fb >= fr) {
    // Tetrahedron 5: fg >= fb >= fr
    outR = (1 - fg) * c000[0] + (fg - fb) * c010[0] + (fb - fr) * c011[0] + fr * c111[0];
    outG = (1 - fg) * c000[1] + (fg - fb) * c010[1] + (fb - fr) * c011[1] + fr * c111[1];
    outB = (1 - fg) * c000[2] + (fg - fb) * c010[2] + (fb - fr) * c011[2] + fr * c111[2];
  } else {
    // Tetrahedron 6: fb >= fg >= fr
    outR = (1 - fb) * c000[0] + (fb - fg) * c001[0] + (fg - fr) * c011[0] + fr * c111[0];
    outG = (1 - fb) * c000[1] + (fb - fg) * c001[1] + (fg - fr) * c011[1] + fr * c111[1];
    outB = (1 - fb) * c000[2] + (fb - fg) * c001[2] + (fg - fr) * c011[2] + fr * c111[2];
  }

  return [outR, outG, outB];
}

/**
 * Trilinear interpolation — simpler but less accurate than tetrahedral.
 * Used as fallback or for comparison.
 */
export function trilinearInterp(lut: Lut3D, inR: number, inG: number, inB: number): [number, number, number] {
  const { data, size, domain } = lut;
  const scale = size - 1;

  const scaleR = (inR - domain.min[0]) / (domain.max[0] - domain.min[0]) * scale;
  const scaleG = (inG - domain.min[1]) / (domain.max[1] - domain.min[1]) * scale;
  const scaleB = (inB - domain.min[2]) / (domain.max[2] - domain.min[2]) * scale;

  let r0 = Math.floor(scaleR);
  let g0 = Math.floor(scaleG);
  let b0 = Math.floor(scaleB);

  r0 = Math.max(0, Math.min(size - 2, r0));
  g0 = Math.max(0, Math.min(size - 2, g0));
  b0 = Math.max(0, Math.min(size - 2, b0));

  const r1 = r0 + 1;
  const g1 = g0 + 1;
  const b1 = b0 + 1;

  const fr = Math.max(0, Math.min(1, scaleR - r0));
  const fg = Math.max(0, Math.min(1, scaleG - g0));
  const fb = Math.max(0, Math.min(1, scaleB - b0));

  const c000 = sample(data, size, r0, g0, b0);
  const c100 = sample(data, size, r1, g0, b0);
  const c010 = sample(data, size, r0, g1, b0);
  const c110 = sample(data, size, r1, g1, b0);
  const c001 = sample(data, size, r0, g0, b1);
  const c101 = sample(data, size, r1, g0, b1);
  const c011 = sample(data, size, r0, g1, b1);
  const c111 = sample(data, size, r1, g1, b1);

  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    out[ch] =
      c000[ch] * (1 - fr) * (1 - fg) * (1 - fb) +
      c100[ch] * fr * (1 - fg) * (1 - fb) +
      c010[ch] * (1 - fr) * fg * (1 - fb) +
      c110[ch] * fr * fg * (1 - fb) +
      c001[ch] * (1 - fr) * (1 - fg) * fb +
      c101[ch] * fr * (1 - fg) * fb +
      c011[ch] * (1 - fr) * fg * fb +
      c111[ch] * fr * fg * fb;
  }

  return out;
}

/** Dispatch interpolation based on method */
export function interpLut3D(
  lut: Lut3D,
  r: number, g: number, b: number,
  method: 'tetrahedral' | 'trilinear' = 'tetrahedral'
): [number, number, number] {
  if (method === 'trilinear') return trilinearInterp(lut, r, g, b);
  return tetrahedralInterp(lut, r, g, b);
}

/**
 * Evaluate a 1D LUT via linear interpolation.
 * Input is a normalized [0,1] value per channel.
 */
export function interpLut1D(
  r: Float32Array, g: Float32Array, b: Float32Array,
  size: number,
  inR: number, inG: number, inB: number
): [number, number, number] {
  function interp1(table: Float32Array, x: number): number {
    const scaled = Math.max(0, Math.min(1, x)) * (size - 1);
    const lo = Math.floor(scaled);
    const hi = Math.min(size - 1, lo + 1);
    const frac = scaled - lo;
    return table[lo] * (1 - frac) + table[hi] * frac;
  }
  return [interp1(r, inR), interp1(g, inG), interp1(b, inB)];
}
