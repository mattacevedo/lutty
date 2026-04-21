import { describe, it, expect } from 'vitest';
import { tetrahedralInterp, trilinearInterp, interpLut3D } from '../src/core/math/interpolation';
import { makeIdentity3D } from '../src/core/lut/identity';

const TOLERANCE = 1e-5;

// Helper: make a simple 2x2x2 LUT that maps input directly to output (identity)
function makeSmallIdentity() {
  return makeIdentity3D(2);
}

describe('tetrahedralInterp — identity LUT', () => {
  const lut = makeIdentity3D(17);

  it('returns identity at grid corners', () => {
    const [r, g, b] = tetrahedralInterp(lut, 0, 0, 0);
    expect(r).toBeCloseTo(0, 5);
    expect(g).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(0, 5);

    const [r2, g2, b2] = tetrahedralInterp(lut, 1, 1, 1);
    expect(r2).toBeCloseTo(1, 4);
    expect(g2).toBeCloseTo(1, 4);
    expect(b2).toBeCloseTo(1, 4);
  });

  it('interpolates mid-point correctly', () => {
    const [r, g, b] = tetrahedralInterp(lut, 0.5, 0.5, 0.5);
    expect(r).toBeCloseTo(0.5, 3);
    expect(g).toBeCloseTo(0.5, 3);
    expect(b).toBeCloseTo(0.5, 3);
  });

  it('interpolates arbitrary point correctly', () => {
    const [r, g, b] = tetrahedralInterp(lut, 0.3, 0.6, 0.1);
    expect(r).toBeCloseTo(0.3, 2);
    expect(g).toBeCloseTo(0.6, 2);
    expect(b).toBeCloseTo(0.1, 2);
  });

  it('clamps out-of-range inputs', () => {
    const [r, g, b] = tetrahedralInterp(lut, -0.5, 1.5, 0.5);
    expect(r).toBeGreaterThanOrEqual(-0.01);
    expect(g).toBeLessThanOrEqual(1.01);
  });
});

describe('trilinearInterp — identity LUT', () => {
  const lut = makeIdentity3D(17);

  it('returns identity at grid point (0.5, 0.5, 0.5)', () => {
    const [r, g, b] = trilinearInterp(lut, 0.5, 0.5, 0.5);
    expect(r).toBeCloseTo(0.5, 3);
    expect(g).toBeCloseTo(0.5, 3);
    expect(b).toBeCloseTo(0.5, 3);
  });

  it('is consistent with tetrahedral at grid nodes', () => {
    const lut2 = makeIdentity3D(5);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const [tr, tg, tb] = tetrahedralInterp(lut2, t, t, t);
      const [lr, lg, lb] = trilinearInterp(lut2, t, t, t);
      expect(tr).toBeCloseTo(lr, 4);
      expect(tg).toBeCloseTo(lg, 4);
      expect(tb).toBeCloseTo(lb, 4);
    }
  });
});

describe('interpLut3D dispatch', () => {
  const lut = makeIdentity3D(9);

  it('dispatches to tetrahedral by default', () => {
    const [r] = interpLut3D(lut, 0.7, 0.2, 0.4);
    const [r2] = tetrahedralInterp(lut, 0.7, 0.2, 0.4);
    expect(r).toBeCloseTo(r2, 6);
  });

  it('dispatches to trilinear when specified', () => {
    const [r] = interpLut3D(lut, 0.7, 0.2, 0.4, 'trilinear');
    const [r2] = trilinearInterp(lut, 0.7, 0.2, 0.4);
    expect(r).toBeCloseTo(r2, 6);
  });
});

describe('interpolation with non-identity LUT', () => {
  it('correctly interpolates a contrast-boosted LUT', () => {
    // Build a simple 3D LUT with a known transform: output = input^2
    const lut = makeIdentity3D(5);
    for (let i = 0; i < lut.data.length; i++) {
      lut.data[i] = lut.data[i] ** 2;
    }

    // At input 0.5, 0.5, 0.5: output should be close to 0.25, 0.25, 0.25
    const [r, g, b] = tetrahedralInterp(lut, 0.5, 0.5, 0.5);
    expect(r).toBeCloseTo(0.25, 1); // interpolation has some error vs exact
    expect(g).toBeCloseTo(0.25, 1);
    expect(b).toBeCloseTo(0.25, 1);
  });
});
