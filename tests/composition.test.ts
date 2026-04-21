import { describe, it, expect } from 'vitest';
import { composeLuts, blendLuts, blendWithIdentity } from '../src/core/math/composition';
import { makeIdentity3D } from '../src/core/lut/identity';
import { applyGamma } from '../src/core/analysis/editing';

describe('composeLuts', () => {
  it('identity composed with identity is identity', () => {
    const id = makeIdentity3D(9);
    const composed = composeLuts(id, id, 9);
    expect(composed.size).toBe(9);

    // Spot-check: midpoint should still map to itself
    const mid = (4 + 4 * 9 + 4 * 81) * 3; // ri=4,gi=4,bi=4 in 9^3 grid
    expect(composed.data[mid]).toBeCloseTo(0.5, 3);
    expect(composed.data[mid + 1]).toBeCloseTo(0.5, 3);
    expect(composed.data[mid + 2]).toBeCloseTo(0.5, 3);
  });

  it('composing with identity preserves the transform', () => {
    const id = makeIdentity3D(9);
    const gamma = applyGamma(id, 2.2);
    const composed = composeLuts(gamma, id, 9); // apply gamma then identity
    // Should be same as gamma
    for (let i = 0; i < composed.data.length; i++) {
      expect(composed.data[i]).toBeCloseTo(gamma.data[i], 3);
    }
  });

  it('sets title from both LUT names', () => {
    const a = makeIdentity3D(5);
    a.metadata.title = 'A';
    const b = makeIdentity3D(5);
    b.metadata.title = 'B';
    const composed = composeLuts(a, b, 5);
    expect(composed.metadata.title).toContain('A');
    expect(composed.metadata.title).toContain('B');
  });
});

describe('blendLuts', () => {
  it('t=0 gives identity (first LUT)', () => {
    const a = makeIdentity3D(5);
    const b = applyGamma(makeIdentity3D(5), 2);
    const blend = blendLuts(a, b, 0);
    for (let i = 0; i < blend.data.length; i++) {
      expect(blend.data[i]).toBeCloseTo(a.data[i], 6);
    }
  });

  it('t=1 gives full second LUT', () => {
    const a = makeIdentity3D(5);
    const b = applyGamma(makeIdentity3D(5), 2);
    const blend = blendLuts(a, b, 1);
    for (let i = 0; i < blend.data.length; i++) {
      expect(blend.data[i]).toBeCloseTo(b.data[i], 5);
    }
  });

  it('t=0.5 gives average of both LUTs', () => {
    const a = makeIdentity3D(3);
    const b = applyGamma(makeIdentity3D(3), 2);
    const blend = blendLuts(a, b, 0.5);
    for (let i = 0; i < blend.data.length; i++) {
      const expected = (a.data[i] + b.data[i]) / 2;
      expect(blend.data[i]).toBeCloseTo(expected, 5);
    }
  });
});

describe('blendWithIdentity', () => {
  it('strength=0 gives identity', () => {
    const gamma = applyGamma(makeIdentity3D(5), 2);
    const blend = blendWithIdentity(gamma, 0);
    const id = makeIdentity3D(5);
    for (let i = 0; i < blend.data.length; i++) {
      expect(blend.data[i]).toBeCloseTo(id.data[i], 5);
    }
  });

  it('strength=1 gives full LUT', () => {
    const gamma = applyGamma(makeIdentity3D(5), 2);
    const blend = blendWithIdentity(gamma, 1);
    for (let i = 0; i < blend.data.length; i++) {
      expect(blend.data[i]).toBeCloseTo(gamma.data[i], 5);
    }
  });
});
