import { describe, it, expect } from 'vitest';
import { computeDiagnostics, computeDisplacementMap, compareLuts } from '../src/core/analysis/diagnostics';
import { makeIdentity3D } from '../src/core/lut/identity';
import { applyGamma, clampOutputs } from '../src/core/analysis/editing';
import { resample3D } from '../src/core/math/resampling';

describe('computeDiagnostics — identity LUT', () => {
  const lut = makeIdentity3D(5);
  const diag = computeDiagnostics(lut, 'test');

  it('reports near-zero displacement for identity', () => {
    expect(diag.displacementMax).toBeCloseTo(0, 4);
    expect(diag.displacementMean).toBeCloseTo(0, 4);
  });

  it('reports no clipped nodes', () => {
    expect(diag.clippedBelow).toBe(0);
    expect(diag.clippedAbove).toBe(0);
  });

  it('reports correct output ranges', () => {
    expect(diag.rOutputMin).toBeCloseTo(0, 4);
    expect(diag.rOutputMax).toBeCloseTo(1, 4);
  });

  it('reports identity as likely invertible', () => {
    expect(diag.likelyInvertible).toBe(true);
  });

  it('reports no neutral axis deviation', () => {
    expect(diag.neutralAxisMaxDeviation).toBeCloseTo(0, 4);
  });

  it('reports no crossovers for identity', () => {
    expect(diag.hasCrossovers).toBe(false);
  });
});

describe('computeDiagnostics — transformed LUT', () => {
  it('reports positive displacement for non-identity LUT', () => {
    const lut = applyGamma(makeIdentity3D(9), 2.2);
    const diag = computeDiagnostics(lut, 'gamma');
    expect(diag.displacementMax).toBeGreaterThan(0.01);
    expect(diag.displacementMean).toBeGreaterThan(0);
  });

  it('detects clipped nodes', () => {
    // Build a LUT with outputs exceeding [0,1]
    const lut = applyGamma(makeIdentity3D(5), 0.5); // gamma < 1 boosts bright values
    // Force one node to be above 1
    const overclipped = { ...lut, data: new Float32Array(lut.data) };
    overclipped.data[0] = 1.5; // force clip above
    const diag = computeDiagnostics(overclipped, 'clip');
    expect(diag.clippedAbove).toBeGreaterThan(0);
  });
});

describe('computeDisplacementMap', () => {
  it('returns all zeros for identity', () => {
    const lut = makeIdentity3D(5);
    const map = computeDisplacementMap(lut);
    for (let i = 0; i < map.length; i++) {
      expect(map[i]).toBeCloseTo(0, 5);
    }
  });

  it('returns non-zero for transformed LUT', () => {
    const lut = applyGamma(makeIdentity3D(5), 2);
    const map = computeDisplacementMap(lut);
    const maxDisp = Math.max(...map);
    expect(maxDisp).toBeGreaterThan(0);
  });

  it('returns array of correct length', () => {
    const lut = makeIdentity3D(7);
    const map = computeDisplacementMap(lut);
    expect(map.length).toBe(7 ** 3);
  });
});

describe('compareLuts', () => {
  it('identity compared to itself has zero delta', () => {
    const a = makeIdentity3D(5);
    const b = makeIdentity3D(5);
    const result = compareLuts(a, b, 'a', 'b', resample3D);
    expect(result.deltaMax).toBeCloseTo(0, 5);
    expect(result.deltaMean).toBeCloseTo(0, 5);
  });

  it('delta between different LUTs is positive', () => {
    const a = makeIdentity3D(5);
    const b = applyGamma(makeIdentity3D(5), 2);
    const result = compareLuts(a, b, 'a', 'b', resample3D);
    expect(result.deltaMax).toBeGreaterThan(0);
    expect(result.deltaMean).toBeGreaterThan(0);
  });

  it('handles size mismatch by resampling', () => {
    const a = makeIdentity3D(9);
    const b = applyGamma(makeIdentity3D(17), 2);
    const result = compareLuts(a, b, 'a', 'b', resample3D);
    expect(result.deltaData.length).toBe(9 ** 3); // smaller size wins
  });
});

describe('diagnostics histogram', () => {
  it('histogram sums are nonzero for non-identity LUT', () => {
    const lut = applyGamma(makeIdentity3D(9), 2);
    const diag = computeDiagnostics(lut, 'test');
    const sum = Array.from(diag.displacementHistogram).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0);
  });
});
