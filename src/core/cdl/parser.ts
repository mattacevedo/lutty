/**
 * ASC CDL file parsers (.cdl, .cc, .ccc).
 * Uses the browser-native DOMParser to handle XML.
 */

import type { CdlNode, CdlFile, CdlFormat } from './types';
import { defaultCdlNode } from './types';

function parseTriple(text: string | null | undefined): [number, number, number] | null {
  if (!text) return null;
  const parts = text.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return [parts[0], parts[1], parts[2]];
}

function parseSingle(text: string | null | undefined): number | null {
  if (!text) return null;
  const v = Number(text.trim());
  return isNaN(v) ? null : v;
}

function parseColorCorrection(el: Element): CdlNode {
  const node = defaultCdlNode();

  node.id = el.getAttribute('id') ?? undefined;

  // SopNode contains Slope, Offset, Power
  const sop = el.querySelector('SOPNode, SopNode');
  if (sop) {
    const slope  = parseTriple(sop.querySelector('Slope')?.textContent);
    const offset = parseTriple(sop.querySelector('Offset')?.textContent);
    const power  = parseTriple(sop.querySelector('Power')?.textContent);
    if (slope)  node.slope  = slope;
    if (offset) node.offset = offset;
    if (power)  node.power  = power;
  }

  // SatNode contains Saturation
  const sat = el.querySelector('SatNode, SaturationNode');
  if (sat) {
    const s = parseSingle(sat.querySelector('Saturation')?.textContent);
    if (s !== null) node.saturation = s;
  }

  return node;
}

function parseXml(text: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent?.slice(0, 200)}`);
  }
  return doc;
}

/** Parse a .cc file (single ColorCorrection element) */
export function parseCC(text: string): CdlFile {
  const doc = parseXml(text);
  const el = doc.querySelector('ColorCorrection');
  if (!el) throw new Error('No <ColorCorrection> element found in .cc file');
  return { format: 'cc', nodes: [parseColorCorrection(el)] };
}

/** Parse a .cdl file (ColorDecisionList > ColorDecision > ColorCorrection) */
export function parseCDL(text: string): CdlFile {
  const doc = parseXml(text);
  // Try ColorDecisionList first, fall back to bare ColorCorrection
  const corrections = doc.querySelectorAll('ColorDecisionList ColorDecision ColorCorrection, ColorDecision ColorCorrection');
  if (corrections.length > 0) {
    return { format: 'cdl', nodes: Array.from(corrections).map(parseColorCorrection) };
  }
  // Some .cdl files are bare ColorCorrection
  const bare = doc.querySelector('ColorCorrection');
  if (bare) return { format: 'cdl', nodes: [parseColorCorrection(bare)] };
  throw new Error('No ColorCorrection found in .cdl file');
}

/** Parse a .ccc file (ColorCorrectionCollection > multiple ColorCorrection elements) */
export function parseCCC(text: string): CdlFile {
  const doc = parseXml(text);
  const corrections = doc.querySelectorAll('ColorCorrectionCollection ColorCorrection, ColorCorrection');
  if (corrections.length === 0) throw new Error('No ColorCorrection elements found in .ccc file');
  return { format: 'ccc', nodes: Array.from(corrections).map(parseColorCorrection) };
}

/** Auto-detect CDL format from filename extension and parse accordingly */
export function parseCdlFile(text: string, filename: string): CdlFile {
  const ext = filename.split('.').pop()?.toLowerCase() as CdlFormat | undefined;
  if (ext === 'cc')  return parseCC(text);
  if (ext === 'cdl') return parseCDL(text);
  if (ext === 'ccc') return parseCCC(text);
  // Try all three
  try { return parseCCC(text); } catch { /* fall through */ }
  try { return parseCDL(text); } catch { /* fall through */ }
  return parseCC(text);
}
