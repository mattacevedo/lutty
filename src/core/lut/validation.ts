/**
 * Validation helpers for LUT data integrity.
 */

import type { Lut, Lut1D, Lut3D } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Validate a parsed 3D LUT */
export function validate3DLUT(lut: Lut3D): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (lut.size < 2) errors.push(`LUT size ${lut.size} is too small (minimum 2)`);
  if (lut.size > 129) warnings.push(`LUT size ${lut.size} is unusually large`);

  const expected = lut.size ** 3 * 3;
  if (lut.data.length !== expected) {
    errors.push(
      `Data length mismatch: expected ${expected} values for size=${lut.size}, got ${lut.data.length}`
    );
  }

  for (let ch = 0; ch < 3; ch++) {
    if (lut.domain.min[ch] >= lut.domain.max[ch]) {
      errors.push(`Domain channel ${ch}: min (${lut.domain.min[ch]}) >= max (${lut.domain.max[ch]})`);
    }
  }

  // Check for NaN / Infinity
  let nanCount = 0;
  for (let i = 0; i < lut.data.length; i++) {
    if (!isFinite(lut.data[i])) nanCount++;
  }
  if (nanCount > 0) {
    errors.push(`LUT contains ${nanCount} non-finite values (NaN or Infinity)`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Validate a parsed 1D LUT */
export function validate1DLUT(lut: Lut1D): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (lut.size < 2) errors.push(`LUT size ${lut.size} is too small`);
  if (lut.r.length !== lut.size || lut.g.length !== lut.size || lut.b.length !== lut.size) {
    errors.push('Channel array lengths do not match declared size');
  }

  for (let ch = 0; ch < 3; ch++) {
    if (lut.domain.min[ch] >= lut.domain.max[ch]) {
      errors.push(`Domain channel ${ch}: min >= max`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateLut(lut: Lut): ValidationResult {
  if (lut.type === '1D') return validate1DLUT(lut);
  return validate3DLUT(lut);
}
