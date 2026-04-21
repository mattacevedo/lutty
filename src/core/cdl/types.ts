/**
 * ASC CDL (Color Decision List) types.
 * Spec: https://web.archive.org/web/20150701180011/http://www.oscars.org/science-technology/council/projects/cdl.html
 */

export interface CdlNode {
  id?: string;
  /** Per-channel slope (default [1,1,1]) — multiplicative gain before offset */
  slope: [number, number, number];
  /** Per-channel offset (default [0,0,0]) — additive shift after slope */
  offset: [number, number, number];
  /** Per-channel power (default [1,1,1]) — exponent applied after clamp */
  power: [number, number, number];
  /** Saturation (default 1.0) — Rec.709 luma-preserving desaturation */
  saturation: number;
}

export type CdlFormat = 'cdl' | 'cc' | 'ccc';

export interface CdlFile {
  format: CdlFormat;
  nodes: CdlNode[];
}

export function defaultCdlNode(): CdlNode {
  return {
    slope:      [1, 1, 1],
    offset:     [0, 0, 0],
    power:      [1, 1, 1],
    saturation: 1.0,
  };
}
