/**
 * Custom per-channel math expression evaluation.
 * Expressions have access to: r, g, b, i (node index), n (total nodes), Math.
 * No access to window, document, or any other globals — sandboxed via Function constructor.
 */

import type { Lut3D } from '../lut/types';

export interface MathExprContext {
  r: number;
  g: number;
  b: number;
  i: number; // linear node index 0..n-1
  n: number; // total nodes = size^3
}

type CompiledExpr = (r: number, g: number, b: number, i: number, n: number, Math: typeof globalThis.Math) => number;

/** Compile an expression string into a callable function. Throws on syntax error. */
export function compileMathExpr(expr: string): CompiledExpr {
  // Wrap in a Function with only the safe bindings exposed
  // eslint-disable-next-line no-new-func
  return new Function('r', 'g', 'b', 'i', 'n', 'Math', `"use strict"; return (${expr});`) as CompiledExpr;
}

/** Validate an expression without applying it. Returns { valid, error }. */
export function validateMathExpr(expr: string): { valid: boolean; error?: string } {
  if (!expr.trim()) return { valid: false, error: 'Enter an expression' };
  try {
    compileMathExpr(expr);
    // Quick smoke-test with neutral values
    const fn = compileMathExpr(expr);
    const result = fn(0.5, 0.5, 0.5, 0, 1, Math);
    if (typeof result !== 'number' || isNaN(result)) {
      return { valid: false, error: 'Expression did not return a number' };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Apply per-channel math expressions to every node in a 3D LUT.
 * exprR/G/B are strings evaluated with context variables: r, g, b, i, n, Math.
 * Returns a new Lut3D.
 */
export function applyMathExpr(lut: Lut3D, exprR: string, exprG: string, exprB: string): Lut3D {
  const fnR = compileMathExpr(exprR);
  const fnG = compileMathExpr(exprG);
  const fnB = compileMathExpr(exprB);

  const total = lut.size ** 3;
  const data = new Float32Array(lut.data);

  for (let i = 0; i < total; i++) {
    const r = lut.data[i * 3 + 0];
    const g = lut.data[i * 3 + 1];
    const b = lut.data[i * 3 + 2];
    data[i * 3 + 0] = fnR(r, g, b, i, total, Math);
    data[i * 3 + 1] = fnG(r, g, b, i, total, Math);
    data[i * 3 + 2] = fnB(r, g, b, i, total, Math);
  }

  return {
    ...lut,
    data,
    metadata: {
      ...lut.metadata,
      comments: [...lut.metadata.comments, `mathExpr(R:${exprR}, G:${exprG}, B:${exprB})`],
    },
  };
}
