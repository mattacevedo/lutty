/**
 * LUT parsers for .cube, .3dl, and .lut formats.
 *
 * All output values are stored as normalized floats.
 * For .cube: values are taken as-is (spec uses 0..1 or domain-scaled floats).
 * For .3dl: integer values are divided by the specified bit-depth max.
 */

import type { Lut, Lut1D, Lut3D, LutDomain, LutFormat, LutMetadata } from './types';

// ─── .cube ───────────────────────────────────────────────────────────────────

/**
 * Parse an Adobe/Resolve .cube file.
 * Handles 1D_SIZE, 3D_SIZE, LUT_1D_INPUT_RANGE, LUT_3D_INPUT_RANGE, DOMAIN_MIN/MAX.
 */
export function parseCube(text: string, filename?: string): Lut {
  const lines = text.split(/\r?\n/);
  const comments: string[] = [];
  let title: string | undefined;

  let size1D = 0;
  let size3D = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const dataLines: string[] = [];

  let inData = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (!inData) {
      if (line.startsWith('#')) {
        comments.push(line.slice(1).trim());
        continue;
      }

      const upper = line.toUpperCase();

      if (upper.startsWith('TITLE')) {
        title = line.slice(5).trim().replace(/^["']|["']$/g, '');
        continue;
      }

      if (upper.startsWith('LUT_1D_SIZE')) {
        size1D = parseInt(line.split(/\s+/)[1], 10);
        continue;
      }

      if (upper.startsWith('LUT_3D_SIZE')) {
        size3D = parseInt(line.split(/\s+/)[1], 10);
        continue;
      }

      if (upper.startsWith('DOMAIN_MIN') || upper.startsWith('LUT_1D_INPUT_RANGE') || upper.startsWith('LUT_3D_INPUT_RANGE')) {
        const parts = line.split(/\s+/).slice(1).map(Number);
        if (parts.length >= 3) {
          domainMin = [parts[0], parts[1], parts[2]];
        } else if (parts.length === 2) {
          // Some tools use min max for all channels
          domainMin = [parts[0], parts[0], parts[0]];
          domainMax = [parts[1], parts[1], parts[1]];
        }
        continue;
      }

      if (upper.startsWith('DOMAIN_MAX')) {
        const parts = line.split(/\s+/).slice(1).map(Number);
        if (parts.length >= 3) {
          domainMax = [parts[0], parts[1], parts[2]];
        }
        continue;
      }

      // First line that looks like a data row — switch to data mode
      if (/^-?[\d.eE+\-]/.test(line)) {
        inData = true;
        dataLines.push(line);
      }
    } else {
      dataLines.push(line);
    }
  }

  const domain: LutDomain = { min: domainMin, max: domainMax };
  const metadata: LutMetadata = {
    title,
    format: 'cube',
    comments,
    originalFilename: filename,
  };

  if (size1D > 0) {
    return parseCube1D(dataLines, size1D, domain, metadata);
  } else if (size3D > 0) {
    return parseCube3D(dataLines, size3D, domain, metadata);
  } else {
    throw new Error(
      'Could not determine LUT type: missing LUT_1D_SIZE or LUT_3D_SIZE keyword'
    );
  }
}

function parseCube1D(
  lines: string[],
  size: number,
  domain: LutDomain,
  metadata: LutMetadata
): Lut1D {
  const r = new Float32Array(size);
  const g = new Float32Array(size);
  const b = new Float32Array(size);

  let idx = 0;
  for (const line of lines) {
    if (idx >= size) break;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;
    r[idx] = parseFloat(parts[0]);
    g[idx] = parseFloat(parts[1]);
    b[idx] = parseFloat(parts[2]);
    idx++;
  }

  if (idx < size) {
    throw new Error(`Incomplete 1D LUT: expected ${size} rows, got ${idx}`);
  }

  return { type: '1D', size, domain, r, g, b, metadata };
}

function parseCube3D(
  lines: string[],
  size: number,
  domain: LutDomain,
  metadata: LutMetadata
): Lut3D {
  const total = size ** 3;
  const data = new Float32Array(total * 3);

  let idx = 0;
  for (const line of lines) {
    if (idx >= total) break;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;
    data[idx * 3 + 0] = parseFloat(parts[0]);
    data[idx * 3 + 1] = parseFloat(parts[1]);
    data[idx * 3 + 2] = parseFloat(parts[2]);
    idx++;
  }

  if (idx < total) {
    throw new Error(`Incomplete 3D LUT: expected ${total} rows, got ${idx}`);
  }

  return { type: '3D', size, domain, data, metadata };
}

// ─── .3dl ────────────────────────────────────────────────────────────────────

/**
 * Parse a .3dl file (Autodesk / Flame format).
 *
 * Format overview:
 *   - Optional header lines starting with '#'
 *   - A mesh size line: "Mesh <size> <bits>" or just an integer shaper table
 *   - Shaper LUT lines (optional, 1D pre-LUT)
 *   - 3D table: each line is "r g b" integers
 *
 * Many tools export slightly different variants; we handle the most common.
 */
export function parse3DL(text: string, filename?: string): Lut {
  const lines = text.split(/\r?\n/);
  const comments: string[] = [];
  let meshSize = 0;
  let bitDepth = 12; // default
  const dataLines: string[] = [];
  let inData = false;
  let shaperLines: string[] = [];
  let hasMeshHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      comments.push(line.slice(1).trim());
      continue;
    }

    if (!inData) {
      const upper = line.toUpperCase();
      if (upper.startsWith('MESH')) {
        // "Mesh <size> <bits>"
        const parts = line.split(/\s+/);
        meshSize = parseInt(parts[1], 10);
        bitDepth = parseInt(parts[2], 10) || 12;
        hasMeshHeader = true;
        inData = true;
        continue;
      }

      // Shaper LUT entry (single integer per line)
      if (/^\d+$/.test(line)) {
        shaperLines.push(line);
        continue;
      }

      // Multi-value data line
      if (/^\d+\s+\d+/.test(line)) {
        inData = true;
        dataLines.push(line);
        continue;
      }
    } else {
      dataLines.push(line);
    }
  }

  // If no Mesh header, try to infer size from data count
  if (!hasMeshHeader) {
    const count = dataLines.length;
    const cbrt = Math.round(Math.cbrt(count));
    if (cbrt ** 3 === count) {
      meshSize = cbrt;
    } else {
      throw new Error(
        `Cannot determine 3DL mesh size: ${count} data lines is not a perfect cube`
      );
    }
  }

  const maxVal = (1 << bitDepth) - 1;
  const total = meshSize ** 3;
  const data = new Float32Array(total * 3);

  let idx = 0;
  for (const line of dataLines) {
    if (idx >= total) break;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    data[idx * 3 + 0] = parseInt(parts[0], 10) / maxVal;
    data[idx * 3 + 1] = parseInt(parts[1], 10) / maxVal;
    data[idx * 3 + 2] = parseInt(parts[2], 10) / maxVal;
    idx++;
  }

  if (idx < total) {
    throw new Error(`Incomplete 3DL LUT: expected ${total} rows, got ${idx}`);
  }

  const domain: LutDomain = { min: [0, 0, 0], max: [1, 1, 1] };
  const metadata: LutMetadata = {
    format: '3dl',
    comments,
    originalFilename: filename,
  };

  return { type: '3D', size: meshSize, domain, data, metadata };
}

// ─── .lut (DaVinci / generic) ────────────────────────────────────────────────

/**
 * Parse a simple .lut file.
 * This handles the DaVinci-style 1D LUT format where lines are "index r g b".
 * Falls back to cube-like "r g b" rows if index prefix is absent.
 */
export function parseLut(text: string, filename?: string): Lut {
  const lines = text.split(/\r?\n/);
  const comments: string[] = [];
  const dataLines: string[] = [];
  let size = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#') || line.startsWith(';')) {
      comments.push(line.slice(1).trim());
      continue;
    }
    if (/^\d+\s+\d+/.test(line)) {
      dataLines.push(line);
    }
  }

  if (dataLines.length === 0) {
    throw new Error('No data lines found in .lut file');
  }

  // Detect if first column is index
  const firstParts = dataLines[0].split(/\s+/);
  const hasIndex = firstParts.length === 4;

  size = dataLines.length;
  const r = new Float32Array(size);
  const g = new Float32Array(size);
  const b = new Float32Array(size);
  const maxVal = hasIndex ? 1023 : 1; // common 10-bit .lut

  let idx = 0;
  for (const line of dataLines) {
    const parts = line.split(/\s+/);
    const offset = hasIndex ? 1 : 0;
    r[idx] = parseInt(parts[offset + 0], 10) / maxVal;
    g[idx] = parseInt(parts[offset + 1], 10) / maxVal;
    b[idx] = parseInt(parts[offset + 2], 10) / maxVal;
    idx++;
  }

  const domain: LutDomain = { min: [0, 0, 0], max: [1, 1, 1] };
  const metadata: LutMetadata = {
    format: 'lut',
    comments,
    originalFilename: filename,
  };

  return { type: '1D', size, domain, r, g, b, metadata };
}

// ─── Auto-detect parser ───────────────────────────────────────────────────────

/** Parse a LUT file, auto-detecting the format from filename and content. */
export function parseLutFile(text: string, filename: string): Lut {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  try {
    switch (ext) {
      case 'cube':
        return parseCube(text, filename);
      case '3dl':
        return parse3DL(text, filename);
      case 'lut':
        return parseLut(text, filename);
      default:
        // Try cube first (most common), then 3dl
        try { return parseCube(text, filename); } catch { /* try next */ }
        try { return parse3DL(text, filename); } catch { /* try next */ }
        return parseLut(text, filename);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse "${filename}": ${msg}`);
  }
}

/** Detect the format of a LUT file from its text content */
export function detectFormat(text: string): LutFormat {
  if (/LUT_1D_SIZE|LUT_3D_SIZE/i.test(text)) return 'cube';
  if (/^Mesh\s+\d+/im.test(text)) return '3dl';
  if (/^\d+\s+\d+\s+\d+\s+\d+/m.test(text)) return 'lut';
  return 'unknown';
}
