/**
 * Sample LUT generator — run with: npx tsx scripts/generate-samples.ts
 * Generates 3 sample .cube LUTs into public/sample-luts/
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

const OUT_DIR = join(import.meta.dirname, '..', 'public', 'sample-luts');

function fmt(n: number): string {
  return n.toFixed(10);
}

function generateIdentity(size: number): string {
  const lines = [
    `TITLE "Identity ${size}^3"`,
    `# Clean identity LUT — output equals input`,
    `LUT_3D_SIZE ${size}`,
    `DOMAIN_MIN 0.0 0.0 0.0`,
    `DOMAIN_MAX 1.0 1.0 1.0`,
    '',
  ];
  const step = 1 / (size - 1);
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++)
        lines.push(`${fmt(r * step)} ${fmt(g * step)} ${fmt(b * step)}`);
  return lines.join('\n');
}

/** Warm grade: boost reds/yellows, reduce blues, mild S-curve */
function generateWarmGrade(size: number): string {
  const lines = [
    `TITLE "Warm Grade"`,
    `# Cinematic warm look: golden tones, reduced blues, mild S-curve`,
    `LUT_3D_SIZE ${size}`,
    `DOMAIN_MIN 0.0 0.0 0.0`,
    `DOMAIN_MAX 1.0 1.0 1.0`,
    '',
  ];
  const step = 1 / (size - 1);

  function sCurve(x: number): number {
    // Simple S-curve: x^1.5 * (3 - 2x^0.5) — approximate
    return x < 0.5
      ? 2 * x * x
      : 1 - 2 * (1 - x) * (1 - x);
  }

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const ri = r * step, gi = g * step, bi = b * step;
        // Warm grade: lift reds, subtle green shift, reduce blues
        const ro = Math.min(1, sCurve(ri) * 1.08 + 0.01);
        const go = Math.min(1, sCurve(gi) * 1.02 + 0.005);
        const bo = Math.max(0, sCurve(bi) * 0.88 - 0.01);
        lines.push(`${fmt(ro)} ${fmt(go)} ${fmt(bo)}`);
      }
    }
  }
  return lines.join('\n');
}

/** High-contrast bleach bypass: desaturate + strong S-curve */
function generateBleachBypass(size: number): string {
  const lines = [
    `TITLE "Bleach Bypass"`,
    `# Classic bleach bypass look: high contrast, reduced saturation, retained grain`,
    `LUT_3D_SIZE ${size}`,
    `DOMAIN_MIN 0.0 0.0 0.0`,
    `DOMAIN_MAX 1.0 1.0 1.0`,
    '',
  ];
  const step = 1 / (size - 1);

  function contrast(x: number, str = 1.6, pivot = 0.42): number {
    return Math.max(0, Math.min(1, (x - pivot) * str + pivot));
  }

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const ri = r * step, gi = g * step, bi = b * step;
        const luma = 0.2126 * ri + 0.7152 * gi + 0.0722 * bi;
        // Partial desaturation
        const sat = 0.35;
        const rDesat = luma + (ri - luma) * sat;
        const gDesat = luma + (gi - luma) * sat;
        const bDesat = luma + (bi - luma) * sat;
        // High contrast S-curve
        const ro = contrast(rDesat);
        const go = contrast(gDesat);
        const bo = contrast(bDesat);
        lines.push(`${fmt(ro)} ${fmt(go)} ${fmt(bo)}`);
      }
    }
  }
  return lines.join('\n');
}

// Generate at 17^3 (compact enough for distribution)
const SIZE = 17;

writeFileSync(join(OUT_DIR, 'identity-17.cube'), generateIdentity(SIZE));
writeFileSync(join(OUT_DIR, 'warm-grade-17.cube'), generateWarmGrade(SIZE));
writeFileSync(join(OUT_DIR, 'bleach-bypass-17.cube'), generateBleachBypass(SIZE));

console.log(`✓ Generated 3 sample LUTs in ${OUT_DIR}`);
