/**
 * LUT serializers — export to .cube format.
 * Preserves metadata (title, comments, domain) when possible.
 */

import type { Lut, Lut1D, Lut3D } from './types';

const LUT_BIT_DEPTH = 10;
const LUT_MAX_VAL = (1 << LUT_BIT_DEPTH) - 1; // 1023

const FLOAT_PRECISION = 10; // decimal places in output

function fmt(n: number): string {
  // Use a fixed precision but strip unnecessary trailing zeros after decimal
  return n.toFixed(FLOAT_PRECISION);
}

/** Serialize a 1D LUT to .cube text */
export function serialize1D(lut: Lut1D): string {
  const lines: string[] = [];

  if (lut.metadata.title) {
    lines.push(`TITLE "${lut.metadata.title}"`);
  }
  for (const c of lut.metadata.comments) {
    lines.push(`# ${c}`);
  }
  lines.push('');
  lines.push(`LUT_1D_SIZE ${lut.size}`);
  lines.push(
    `LUT_1D_INPUT_RANGE ${fmt(lut.domain.min[0])} ${fmt(lut.domain.max[0])}`
  );
  lines.push('');

  for (let i = 0; i < lut.size; i++) {
    lines.push(`${fmt(lut.r[i])} ${fmt(lut.g[i])} ${fmt(lut.b[i])}`);
  }

  return lines.join('\n');
}

/** Serialize a 3D LUT to .cube text */
export function serialize3D(lut: Lut3D): string {
  const lines: string[] = [];

  if (lut.metadata.title) {
    lines.push(`TITLE "${lut.metadata.title}"`);
  }
  for (const c of lut.metadata.comments) {
    lines.push(`# ${c}`);
  }
  lines.push('');
  lines.push(`LUT_3D_SIZE ${lut.size}`);

  const { min, max } = lut.domain;
  lines.push(`DOMAIN_MIN ${fmt(min[0])} ${fmt(min[1])} ${fmt(min[2])}`);
  lines.push(`DOMAIN_MAX ${fmt(max[0])} ${fmt(max[1])} ${fmt(max[2])}`);
  lines.push('');

  const total = lut.size ** 3;
  for (let i = 0; i < total; i++) {
    const r = lut.data[i * 3 + 0];
    const g = lut.data[i * 3 + 1];
    const b = lut.data[i * 3 + 2];
    lines.push(`${fmt(r)} ${fmt(g)} ${fmt(b)}`);
  }

  return lines.join('\n');
}

/** Serialize any LUT to .cube text */
export function serializeToCube(lut: Lut): string {
  if (lut.type === '1D') return serialize1D(lut);
  return serialize3D(lut);
}

/**
 * Serialize a 3D LUT to Autodesk .3dl text.
 * Format: `Mesh <intervals> <bitDepth>` header, then size^3 lines of R G B integers.
 * intervals = size - 1; bitDepth determines output scale (12-bit → max value 4095).
 */
export function serialize3DL(lut: Lut3D, bitDepth: 12 | 16 = 12): string {
  const lines: string[] = [];
  const intervals = lut.size - 1;
  const maxVal = (1 << bitDepth) - 1; // 4095 or 65535

  lines.push(`# Exported by Lutty`);
  if (lut.metadata.title) lines.push(`# ${lut.metadata.title}`);
  lines.push('');
  lines.push(`Mesh ${intervals} ${bitDepth}`);
  lines.push('');

  const total = lut.size ** 3;
  for (let i = 0; i < total; i++) {
    const r = Math.round(Math.max(0, Math.min(1, lut.data[i * 3 + 0])) * maxVal);
    const g = Math.round(Math.max(0, Math.min(1, lut.data[i * 3 + 1])) * maxVal);
    const b = Math.round(Math.max(0, Math.min(1, lut.data[i * 3 + 2])) * maxVal);
    lines.push(`${r} ${g} ${b}`);
  }

  return lines.join('\n');
}

/** Trigger a browser download of a .3dl file */
export function download3DL(lut: Lut3D, filename?: string): void {
  const text = serialize3DL(lut);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? (lut.metadata.originalFilename?.replace(/\.[^.]+$/, '.3dl') ?? 'output.3dl');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Serialize a 1D LUT to DaVinci-style .lut text.
 * Format: index r g b — 10-bit integers (0–1023) per line.
 */
export function serialize1DLut(lut: Lut1D): string {
  const lines: string[] = [];
  lines.push('# Exported by LUTTY');
  if (lut.metadata.title) lines.push(`# ${lut.metadata.title}`);
  lines.push('');
  for (let i = 0; i < lut.size; i++) {
    const r = Math.round(Math.max(0, Math.min(1, lut.r[i])) * LUT_MAX_VAL);
    const g = Math.round(Math.max(0, Math.min(1, lut.g[i])) * LUT_MAX_VAL);
    const b = Math.round(Math.max(0, Math.min(1, lut.b[i])) * LUT_MAX_VAL);
    lines.push(`${i} ${r} ${g} ${b}`);
  }
  return lines.join('\n');
}

/** Trigger a browser download of a .lut file */
export function download1DLut(lut: Lut1D, filename?: string): void {
  const text = serialize1DLut(lut);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? (lut.metadata.originalFilename?.replace(/\.[^.]+$/, '.lut') ?? 'output.lut');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Trigger a browser download of a .cube file */
export function downloadCube(lut: Lut, filename?: string): void {
  const text = serializeToCube(lut);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? (lut.metadata.originalFilename?.replace(/\.[^.]+$/, '.cube') ?? 'output.cube');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
