import { describe, it, expect } from 'vitest';
import { resample3D } from '../src/core/math/resampling';
import { makeIdentity3D } from '../src/core/lut/identity';
import { applyGamma } from '../src/core/analysis/editing';

describe('resample3D', () => {
  it('resampling identity LUT to a different size stays identity', () => {
    const src = makeIdentity3D(9);
    const dst = resample3D(src, 17);
    expect(dst.size).toBe(17);
    expect(dst.data.length).toBe(17 ** 3 * 3);

    // Check midpoint
    const mid = (8 + 8 * 17 + 8 * 17 * 17) * 3;
    expect(dst.data[mid]).toBeCloseTo(0.5, 2);
    expect(dst.data[mid + 1]).toBeCloseTo(0.5, 2);
    expect(dst.data[mid + 2]).toBeCloseTo(0.5, 2);
  });

  it('preserves corner values when upsampling', () => {
    const src = makeIdentity3D(5);
    const dst = resample3D(src, 17);

    // Corner (0,0,0)
    expect(dst.data[0]).toBeCloseTo(0, 4);
    expect(dst.data[1]).toBeCloseTo(0, 4);
    expect(dst.data[2]).toBeCloseTo(0, 4);

    // Corner (1,1,1) at index (16,16,16) in 17^3
    const lastIdx = (16 + 16 * 17 + 16 * 17 * 17) * 3;
    expect(dst.data[lastIdx]).toBeCloseTo(1, 4);
    expect(dst.data[lastIdx + 1]).toBeCloseTo(1, 4);
    expect(dst.data[lastIdx + 2]).toBeCloseTo(1, 4);
  });

  it('downsampling produces correct output size', () => {
    const src = makeIdentity3D(33);
    const dst = resample3D(src, 17);
    expect(dst.size).toBe(17);
    expect(dst.data.length).toBe(17 ** 3 * 3);
  });

  it('preserves LUT transform accuracy after resample', () => {
    // A simple power law LUT
    const src = applyGamma(makeIdentity3D(17), 2.2);
    const dst = resample3D(src, 9);

    // At the midpoint ~0.5, gamma 2.2 gives ~0.218
    const mid = (4 + 4 * 9 + 4 * 81) * 3;
    expect(dst.data[mid]).toBeCloseTo(0.5 ** (1 / 2.2), 1);
  });

  it('throws on target size < 2', () => {
    const src = makeIdentity3D(5);
    expect(() => resample3D(src, 1)).toThrow(/at least 2/);
  });

  it('preserves metadata and adds a comment', () => {
    const src = makeIdentity3D(5);
    src.metadata.title = 'Test';
    const dst = resample3D(src, 9);
    expect(dst.metadata.title).toBe('Test');
    expect(dst.metadata.comments.some((c) => c.includes('Resampled'))).toBe(true);
  });
});
