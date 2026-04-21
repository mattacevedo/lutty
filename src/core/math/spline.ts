/**
 * Monotone cubic Hermite spline (Fritsch–Carlson method).
 *
 * Given a sorted set of control points [[x0,y0], [x1,y1], …], builds an
 * interpolator that:
 *   • Passes exactly through every control point
 *   • Never overshoots between adjacent points (monotone guarantee)
 *   • Returns the first/last y value for x outside the defined range
 *
 * The monotone guarantee is essential for colour-grading curves where
 * oscillation would invert tones and produce unintended artefacts.
 */

/** A sorted array of [x, y] pairs; x values must be strictly increasing. */
export type ControlPoints = [number, number][];

/**
 * Build a monotone cubic Hermite interpolator from the given control points.
 * Returns a function that evaluates the curve at any x in [−∞, +∞].
 */
export function monotonicSpline(pts: ControlPoints): (x: number) => number {
  const n = pts.length;
  if (n === 0) return () => 0;
  if (n === 1) return () => pts[0][1];
  if (n === 2) {
    // Linear segment — no need for cubic machinery
    const [x0, y0] = pts[0];
    const [x1, y1] = pts[1];
    return (x) => {
      if (x <= x0) return y0;
      if (x >= x1) return y1;
      return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
    };
  }

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);

  // ── Step 1: secant slopes ─────────────────────────────────────────────────
  const delta = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i++) {
    delta[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  }

  // ── Step 2: initial tangents (average of adjacent secants) ────────────────
  const m = new Array<number>(n);
  m[0]     = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = (delta[i - 1] + delta[i]) / 2;
  }

  // ── Step 3: Fritsch–Carlson monotonicity constraint ───────────────────────
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(delta[i]) < 1e-12) {
      // Flat segment — clamp both tangents to zero
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i]     / delta[i];
      const beta  = m[i + 1] / delta[i];
      const tau   = alpha * alpha + beta * beta;
      if (tau > 9) {
        // Rescale to satisfy the constraint |alpha|² + |beta|² ≤ 9
        const s = 3 / Math.sqrt(tau);
        m[i]     = s * alpha * delta[i];
        m[i + 1] = s * beta  * delta[i];
      }
    }
  }

  // ── Evaluator ─────────────────────────────────────────────────────────────
  return (x: number): number => {
    if (x <= xs[0])     return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];

    // Binary search for the containing interval
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid; else hi = mid;
    }

    const h  = xs[lo + 1] - xs[lo];
    const u  = (x - xs[lo]) / h;
    const u2 = u * u;
    const u3 = u2 * u;

    // Cubic Hermite basis functions
    const h00 =  2 * u3 - 3 * u2 + 1;
    const h10 =      u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 =      u3 -     u2;

    return h00 * ys[lo] + h10 * h * m[lo] + h01 * ys[lo + 1] + h11 * h * m[lo + 1];
  };
}
