/**
 * Apply per-channel 1D curves (defined by control points) to a 3D LUT.
 *
 * Processing order:
 *   1. Master curve  — applied to ALL channels equally
 *   2. R/G/B curves  — applied per-channel on top of Master
 *
 * Each curve is a monotone cubic Hermite spline built from its control
 * points (see spline.ts).  Identity curves [[0,0],[1,1]] are skipped for
 * performance.
 */

import type { Lut3D } from '../lut/types';
import { monotonicSpline, type ControlPoints } from '../math/spline';

export type { ControlPoints };

/** The two-point identity curve — makes no change to the values it is applied to. */
export const IDENTITY_CURVE: ControlPoints = [[0, 0], [1, 1]];

function isIdentity(pts: ControlPoints): boolean {
  return (
    pts.length === 2 &&
    pts[0][0] === 0 && pts[0][1] === 0 &&
    pts[1][0] === 1 && pts[1][1] === 1
  );
}

/**
 * Apply four 1D curves (master, r, g, b) to every node in `lut`.
 * Returns a new Lut3D; the original is not mutated.
 */
export function applyChannelCurves(
  lut: Lut3D,
  masterPts: ControlPoints,
  rPts: ControlPoints,
  gPts: ControlPoints,
  bPts: ControlPoints,
): Lut3D {
  const doMaster = !isIdentity(masterPts);
  const doR      = !isIdentity(rPts);
  const doG      = !isIdentity(gPts);
  const doB      = !isIdentity(bPts);

  if (!doMaster && !doR && !doG && !doB) return lut;   // nothing to do

  const masterFn = doMaster ? monotonicSpline(masterPts) : null;
  const rFn      = doR      ? monotonicSpline(rPts)      : null;
  const gFn      = doG      ? monotonicSpline(gPts)      : null;
  const bFn      = doB      ? monotonicSpline(bPts)      : null;

  const data  = new Float32Array(lut.data);
  const total = lut.size ** 3;

  for (let i = 0; i < total; i++) {
    let r = data[i * 3];
    let g = data[i * 3 + 1];
    let b = data[i * 3 + 2];

    // 1. Master (all channels)
    if (masterFn) { r = masterFn(r); g = masterFn(g); b = masterFn(b); }

    // 2. Per-channel
    if (rFn) r = rFn(r);
    if (gFn) g = gFn(g);
    if (bFn) b = bFn(b);

    data[i * 3]     = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  }

  return {
    ...lut,
    data,
    metadata: {
      ...lut.metadata,
      comments: [...lut.metadata.comments, 'curves'],
    },
  };
}
