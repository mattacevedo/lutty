/**
 * Color space primaries and 3x3 RGB ↔ XYZ conversion matrices.
 *
 * All primaries are xy chromaticity coordinates (CIE 1931).
 * White point: D65 (0.3127, 0.3290) unless stated otherwise.
 *
 * Matrix computation follows the standard method:
 *   1. Convert xy chromaticities to XYZ using Y=1 normalization
 *   2. Solve for channel weights using the white point constraint
 *   3. Scale the column vectors to get the final 3x3 RGB→XYZ matrix
 */

export interface ColorPrimaries {
  rx: number; ry: number;
  gx: number; gy: number;
  bx: number; by: number;
  wx: number; wy: number;
  name: string;
}

// Standard color spaces (D65 white point)
export const REC709: ColorPrimaries = {
  rx: 0.640, ry: 0.330,
  gx: 0.300, gy: 0.600,
  bx: 0.150, by: 0.060,
  wx: 0.3127, wy: 0.3290,
  name: 'Rec.709 / sRGB',
};

export const P3_D65: ColorPrimaries = {
  rx: 0.680, ry: 0.320,
  gx: 0.265, gy: 0.690,
  bx: 0.150, by: 0.060,
  wx: 0.3127, wy: 0.3290,
  name: 'DCI-P3 D65',
};

export const REC2020: ColorPrimaries = {
  rx: 0.708, ry: 0.292,
  gx: 0.170, gy: 0.797,
  bx: 0.131, by: 0.046,
  wx: 0.3127, wy: 0.3290,
  name: 'Rec.2020',
};

export const ACES_AP0: ColorPrimaries = {
  rx: 0.73470, ry: 0.26530,
  gx: 0.00000, gy: 1.00000,
  bx: 0.00010, by: -0.07700,
  wx: 0.32168, wy: 0.33767,
  name: 'ACES AP0',
};

export const ACES_AP1: ColorPrimaries = {
  rx: 0.71300, ry: 0.29300,
  gx: 0.16500, gy: 0.83000,
  bx: 0.12800, by: 0.04400,
  wx: 0.32168, wy: 0.33767,
  name: 'ACES AP1 (ACEScg)',
};

export const ALL_PRIMARIES: ColorPrimaries[] = [REC709, P3_D65, REC2020, ACES_AP1, ACES_AP0];

// ─── Matrix utilities ─────────────────────────────────────────────────────────

/** Invert a 3x3 row-major matrix using Cramer's rule */
export function invertMatrix3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-10) throw new Error('Matrix is singular (non-invertible)');
  const inv = 1 / det;
  return [
    (e * i - f * h) * inv, (c * h - b * i) * inv, (b * f - c * e) * inv,
    (f * g - d * i) * inv, (a * i - c * g) * inv, (c * d - a * f) * inv,
    (d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv,
  ];
}

/** Multiply two 3x3 row-major matrices: result = A * B */
export function multiplyMatrix3x3(a: number[], b: number[]): number[] {
  return [
    a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
    a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
    a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
  ];
}

/** Apply a 3x3 row-major matrix to an RGB vector */
export function applyMatrix(m: number[], r: number, g: number, b: number): [number, number, number] {
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

/**
 * Compute the RGB→XYZ matrix for given primaries.
 * Uses the standard CIE derivation from xy chromaticity coordinates.
 */
export function computeRGBtoXYZ(p: ColorPrimaries): number[] {
  // Convert xy to XYZ with Y=1
  const Xr = p.rx / p.ry;
  const Yr = 1;
  const Zr = (1 - p.rx - p.ry) / p.ry;

  const Xg = p.gx / p.gy;
  const Yg = 1;
  const Zg = (1 - p.gx - p.gy) / p.gy;

  const Xb = p.bx / p.by;
  const Yb = 1;
  const Zb = (1 - p.bx - p.by) / p.by;

  // White point XYZ (Y=1 normalized)
  const Xw = p.wx / p.wy;
  const Yw = 1;
  const Zw = (1 - p.wx - p.wy) / p.wy;

  // Solve for channel weights: [Xr Xg Xb; Yr Yg Yb; Zr Zg Zb] * [Sr Sg Sb]^T = [Xw Yw Zw]^T
  const primMat = [Xr, Xg, Xb, Yr, Yg, Yb, Zr, Zg, Zb];
  const primInv = invertMatrix3x3(primMat);
  const [Sr, Sg, Sb] = applyMatrix(primInv, Xw, Yw, Zw);

  // RGB→XYZ = [Sr*Xr  Sg*Xg  Sb*Xb; Sr*Yr  Sg*Yg  Sb*Yb; Sr*Zr  Sg*Zg  Sb*Zb]
  return [
    Sr * Xr, Sg * Xg, Sb * Xb,
    Sr * Yr, Sg * Yg, Sb * Yb,
    Sr * Zr, Sg * Zg, Sb * Zb,
  ];
}

/**
 * Compute the conversion matrix from source color space to destination.
 * result = M_XYZ→dst * M_src→XYZ
 */
export function getConversionMatrix(src: ColorPrimaries, dst: ColorPrimaries): number[] {
  const srcToXYZ = computeRGBtoXYZ(src);
  const dstToXYZ = computeRGBtoXYZ(dst);
  const xyzToDst = invertMatrix3x3(dstToXYZ);
  return multiplyMatrix3x3(xyzToDst, srcToXYZ);
}
