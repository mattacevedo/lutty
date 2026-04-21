/**
 * LUT diagnostics — computes all analysis metrics for a 3D or 1D LUT.
 */

import type { Lut, Lut1D, Lut3D, LutDiagnostics, LutComparison } from '../lut/types';

const HISTOGRAM_BINS = 20;

/** Compute full diagnostics for a LUT */
export function computeDiagnostics(lut: Lut, lutId: string): LutDiagnostics {
  if (lut.type === '1D') return diagnose1D(lut, lutId);
  return diagnose3D(lut, lutId);
}

function diagnose3D(lut: Lut3D, lutId: string): LutDiagnostics {
  const { data, size, domain } = lut;
  const total = size ** 3;
  const step = 1 / (size - 1);

  let dispMin = Infinity, dispMax = -Infinity, dispSum = 0, dispSumSq = 0;
  let rMin = Infinity, rMax = -Infinity;
  let gMin = Infinity, gMax = -Infinity;
  let bMin = Infinity, bMax = -Infinity;
  let clippedBelow = 0, clippedAbove = 0;
  const clippedIndices: number[] = [];

  const displacements = new Float32Array(total);

  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const idx = ri + gi * size + bi * size * size;
        const r = data[idx * 3 + 0];
        const g = data[idx * 3 + 1];
        const b = data[idx * 3 + 2];

        // Expected identity value at this node
        const idR = ri * step;
        const idG = gi * step;
        const idB = bi * step;

        const dr = r - idR;
        const dg = g - idG;
        const db = b - idB;
        const disp = Math.sqrt(dr * dr + dg * dg + db * db);

        displacements[idx] = disp;
        dispSum += disp;
        dispSumSq += disp * disp;
        if (disp < dispMin) dispMin = disp;
        if (disp > dispMax) dispMax = disp;

        if (r < rMin) rMin = r; if (r > rMax) rMax = r;
        if (g < gMin) gMin = g; if (g > gMax) gMax = g;
        if (b < bMin) bMin = b; if (b > bMax) bMax = b;

        const isBelow = r < 0 || g < 0 || b < 0;
        const isAbove = r > 1 || g > 1 || b > 1;
        if (isBelow) { clippedBelow++; clippedIndices.push(idx); }
        else if (isAbove) { clippedAbove++; clippedIndices.push(idx); }
      }
    }
  }

  const mean = dispSum / total;
  const variance = dispSumSq / total - mean * mean;
  const stdDev = Math.sqrt(Math.max(0, variance));

  // Displacement histogram
  const histogram = new Float32Array(HISTOGRAM_BINS);
  if (dispMax > dispMin) {
    const range = dispMax - dispMin;
    for (let i = 0; i < total; i++) {
      const bin = Math.min(
        HISTOGRAM_BINS - 1,
        Math.floor(((displacements[i] - dispMin) / range) * HISTOGRAM_BINS)
      );
      histogram[bin]++;
    }
    // Normalize to [0,1]
    const histMax = Math.max(...histogram);
    if (histMax > 0) for (let i = 0; i < HISTOGRAM_BINS; i++) histogram[i] /= histMax;
  }

  // Neutral axis: sample where R=G=B
  let neutralMaxDev = 0, neutralMeanDev = 0;
  const neutralSamples = Math.min(size, 64);
  for (let i = 0; i < neutralSamples; i++) {
    const t = i / (neutralSamples - 1);
    const ni = Math.round(t * (size - 1));
    const idx = ni + ni * size + ni * size * size;
    const r = data[idx * 3 + 0];
    const g = data[idx * 3 + 1];
    const b = data[idx * 3 + 2];
    const avg = (r + g + b) / 3;
    const dev = Math.sqrt((r - avg) ** 2 + (g - avg) ** 2 + (b - avg) ** 2);
    neutralMaxDev = Math.max(neutralMaxDev, dev);
    neutralMeanDev += dev;
  }
  neutralMeanDev /= neutralSamples;

  // Channel crossover: check if any output channel ordering differs from input
  let hasCrossovers = false;
  outerLoop: for (let bi = 0; bi < size && !hasCrossovers; bi++) {
    for (let gi = 0; gi < size && !hasCrossovers; gi++) {
      for (let ri = 0; ri < size && !hasCrossovers; ri++) {
        // Skip near-neutral
        if (Math.abs(ri - gi) < 2 && Math.abs(gi - bi) < 2) continue;
        const idx = ri + gi * size + bi * size * size;
        const r = data[idx * 3 + 0];
        const g = data[idx * 3 + 1];
        const b = data[idx * 3 + 2];
        // Check if channel ordering is different from input ordering
        const inputMaxCh = ri >= gi ? (ri >= bi ? 0 : 2) : (gi >= bi ? 1 : 2);
        const outputMaxCh = r >= g ? (r >= b ? 0 : 2) : (g >= b ? 1 : 2);
        if (inputMaxCh !== outputMaxCh) hasCrossovers = true;
      }
    }
  }

  return {
    lutId,
    size,
    is1D: false,
    domainMin: domain.min,
    domainMax: domain.max,
    displacementMin: dispMin === Infinity ? 0 : dispMin,
    displacementMax: dispMax === -Infinity ? 0 : dispMax,
    displacementMean: mean,
    displacementStdDev: stdDev,
    rOutputMin: rMin, rOutputMax: rMax,
    gOutputMin: gMin, gOutputMax: gMax,
    bOutputMin: bMin, bOutputMax: bMax,
    clippedBelow,
    clippedAbove,
    clippedNodeIndices: new Uint32Array(clippedIndices),
    rMonotonic: undefined,
    gMonotonic: undefined,
    bMonotonic: undefined,
    neutralAxisMaxDeviation: neutralMaxDev,
    neutralAxisMeanDeviation: neutralMeanDev,
    hasCrossovers,
    likelyInvertible: clippedBelow === 0 && clippedAbove === 0 && !hasCrossovers,
    displacementHistogram: histogram,
  };
}

function diagnose1D(lut: Lut1D, lutId: string): LutDiagnostics {
  const { r, g, b, size, domain } = lut;

  let dispMin = Infinity, dispMax = -Infinity, dispSum = 0, dispSumSq = 0;
  const histogram = new Float32Array(HISTOGRAM_BINS);
  const displacements: number[] = [];

  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    const dr = r[i] - t, dg = g[i] - t, db = b[i] - t;
    const disp = Math.sqrt(dr * dr + dg * dg + db * db);
    displacements.push(disp);
    dispSum += disp;
    dispSumSq += disp * disp;
    if (disp < dispMin) dispMin = disp;
    if (disp > dispMax) dispMax = disp;
  }

  const mean = dispSum / size;
  const variance = dispSumSq / size - mean * mean;
  const stdDev = Math.sqrt(Math.max(0, variance));

  if (dispMax > dispMin) {
    const range = dispMax - dispMin;
    for (const d of displacements) {
      const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor(((d - dispMin) / range) * HISTOGRAM_BINS));
      histogram[bin]++;
    }
    const histMax = Math.max(...histogram);
    if (histMax > 0) for (let i = 0; i < HISTOGRAM_BINS; i++) histogram[i] /= histMax;
  }

  // Monotonicity check
  let rMono = true, gMono = true, bMono = true;
  for (let i = 1; i < size; i++) {
    if (r[i] < r[i - 1]) rMono = false;
    if (g[i] < g[i - 1]) gMono = false;
    if (b[i] < b[i - 1]) bMono = false;
  }

  let clippedBelow = 0, clippedAbove = 0;
  for (let i = 0; i < size; i++) {
    if (r[i] < 0 || g[i] < 0 || b[i] < 0) clippedBelow++;
    if (r[i] > 1 || g[i] > 1 || b[i] > 1) clippedAbove++;
  }

  return {
    lutId, size, is1D: true,
    domainMin: domain.min, domainMax: domain.max,
    displacementMin: dispMin === Infinity ? 0 : dispMin,
    displacementMax: dispMax === -Infinity ? 0 : dispMax,
    displacementMean: mean, displacementStdDev: stdDev,
    rOutputMin: Math.min(...r), rOutputMax: Math.max(...r),
    gOutputMin: Math.min(...g), gOutputMax: Math.max(...g),
    bOutputMin: Math.min(...b), bOutputMax: Math.max(...b),
    clippedBelow, clippedAbove, clippedNodeIndices: new Uint32Array(0),
    rMonotonic: rMono, gMonotonic: gMono, bMonotonic: bMono,
    neutralAxisMaxDeviation: 0, neutralAxisMeanDeviation: 0,
    hasCrossovers: false,
    likelyInvertible: rMono && gMono && bMono && clippedBelow === 0 && clippedAbove === 0,
    displacementHistogram: histogram,
  };
}

/**
 * Compare two LUTs node-by-node.
 * Both must be 3D and will be resampled to the smaller size if they differ.
 */
export function compareLuts(
  a: Lut3D,
  b: Lut3D,
  lutAId: string,
  lutBId: string,
  resampleFn: (lut: Lut3D, size: number) => Lut3D
): LutComparison {
  const targetSize = Math.min(a.size, b.size);
  const lutA = a.size === targetSize ? a : resampleFn(a, targetSize);
  const lutB = b.size === targetSize ? b : resampleFn(b, targetSize);

  const total = targetSize ** 3;
  const deltaData = new Float32Array(total);
  let deltaMin = Infinity, deltaMax = -Infinity, deltaSum = 0;

  for (let i = 0; i < total; i++) {
    const dr = lutA.data[i * 3] - lutB.data[i * 3];
    const dg = lutA.data[i * 3 + 1] - lutB.data[i * 3 + 1];
    const db = lutA.data[i * 3 + 2] - lutB.data[i * 3 + 2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    deltaData[i] = dist;
    if (dist < deltaMin) deltaMin = dist;
    if (dist > deltaMax) deltaMax = dist;
    deltaSum += dist;
  }

  return {
    lutAId, lutBId,
    deltaData,
    deltaMin: deltaMin === Infinity ? 0 : deltaMin,
    deltaMax: deltaMax === -Infinity ? 0 : deltaMax,
    deltaMean: deltaSum / total,
  };
}

/** Per-node displacement from identity, returned as a Float32Array of length size^3 */
export function computeDisplacementMap(lut: Lut3D): Float32Array {
  const { data, size } = lut;
  const total = size ** 3;
  const displacements = new Float32Array(total);
  const step = 1 / (size - 1);

  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const idx = ri + gi * size + bi * size * size;
        const r = data[idx * 3 + 0] - ri * step;
        const g = data[idx * 3 + 1] - gi * step;
        const b = data[idx * 3 + 2] - bi * step;
        displacements[idx] = Math.sqrt(r * r + g * g + b * b);
      }
    }
  }

  return displacements;
}
