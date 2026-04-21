import { describe, it, expect } from 'vitest';
import { parseCube, parse3DL, parseLut, parseLutFile } from '../src/core/lut/parser';
import type { Lut1D, Lut3D } from '../src/core/lut/types';

// ─── .cube 3D ─────────────────────────────────────────────────────────────────

describe('parseCube — 3D', () => {
  const basic3D = `
TITLE "Test3D"
# A test LUT
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0

0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`.trim();

  it('parses a 2^3 identity LUT', () => {
    const lut = parseCube(basic3D) as Lut3D;
    expect(lut.type).toBe('3D');
    expect(lut.size).toBe(2);
    expect(lut.data.length).toBe(2 ** 3 * 3);
    expect(lut.metadata.title).toBe('Test3D');
    expect(lut.metadata.comments).toContain('A test LUT');
  });

  it('reads domain correctly', () => {
    const lut = parseCube(basic3D) as Lut3D;
    expect(lut.domain.min).toEqual([0, 0, 0]);
    expect(lut.domain.max).toEqual([1, 1, 1]);
  });

  it('stores R as fastest-varying axis', () => {
    const lut = parseCube(basic3D) as Lut3D;
    // First entry: r=0,g=0,b=0 → (0,0,0)
    expect(lut.data[0]).toBeCloseTo(0);
    // Second entry: r=1,g=0,b=0 → (1,0,0)
    expect(lut.data[3]).toBeCloseTo(1);
    expect(lut.data[4]).toBeCloseTo(0);
  });

  it('throws on incomplete data', () => {
    const incomplete = 'LUT_3D_SIZE 2\n0.0 0.0 0.0\n1.0 0.0 0.0\n';
    expect(() => parseCube(incomplete)).toThrow(/Incomplete/);
  });

  it('throws when no size keyword found', () => {
    expect(() => parseCube('0.0 0.0 0.0\n')).toThrow(/LUT_1D_SIZE|LUT_3D_SIZE/i);
  });
});

// ─── .cube 1D ─────────────────────────────────────────────────────────────────

describe('parseCube — 1D', () => {
  const basic1D = `
LUT_1D_SIZE 4
LUT_1D_INPUT_RANGE 0.0 1.0

0.0 0.0 0.0
0.333 0.333 0.333
0.666 0.666 0.666
1.0 1.0 1.0
`.trim();

  it('parses a 4-entry 1D LUT', () => {
    const lut = parseCube(basic1D) as Lut1D;
    expect(lut.type).toBe('1D');
    expect(lut.size).toBe(4);
    expect(lut.r.length).toBe(4);
    expect(lut.g.length).toBe(4);
    expect(lut.b.length).toBe(4);
  });

  it('reads values correctly', () => {
    const lut = parseCube(basic1D) as Lut1D;
    expect(lut.r[0]).toBeCloseTo(0);
    expect(lut.r[3]).toBeCloseTo(1);
  });
});

// ─── .3dl ────────────────────────────────────────────────────────────────────

describe('parse3DL', () => {
  it('parses a 2^3 3DL LUT', () => {
    // 8 entries for a 2x2x2 grid, 12-bit (max 4095)
    const content = [
      'Mesh 2 12',
      '0 0 0',
      '4095 0 0',
      '0 4095 0',
      '4095 4095 0',
      '0 0 4095',
      '4095 0 4095',
      '0 4095 4095',
      '4095 4095 4095',
    ].join('\n');
    const lut = parse3DL(content) as Lut3D;
    expect(lut.type).toBe('3D');
    expect(lut.size).toBe(2);
    expect(lut.data[0]).toBeCloseTo(0);
    expect(lut.data[3]).toBeCloseTo(1);
  });

  it('throws on non-cubic count without mesh header', () => {
    const content = '1 2 3\n4 5 6\n7 8 9\n';
    expect(() => parse3DL(content)).toThrow(/Cannot determine/);
  });
});

// ─── Auto-detect ──────────────────────────────────────────────────────────────

describe('parseLutFile — auto-detect', () => {
  it('detects .cube files by extension', () => {
    const content = 'LUT_3D_SIZE 2\n' + Array(8).fill('0.5 0.5 0.5').join('\n');
    const lut = parseLutFile(content, 'test.cube');
    expect(lut.type).toBe('3D');
  });

  it('detects .3dl files by extension', () => {
    const content = 'Mesh 2 12\n' + Array(8).fill('2048 2048 2048').join('\n');
    const lut = parseLutFile(content, 'test.3dl');
    expect(lut.type).toBe('3D');
  });
});
