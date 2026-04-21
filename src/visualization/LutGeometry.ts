/**
 * LUT geometry builder for Three.js.
 * Generates point clouds, lattice (connected grid), mesh, and slice geometries.
 */

import * as THREE from 'three';
import type { Lut3D } from '../core/lut/types';
import type { ViewportState } from '../store/index';
import type { ColorMode } from '../core/lut/types';
import { computeDisplacementMap } from '../core/analysis/diagnostics';

export class LutGeometry {
  object: THREE.Object3D;
  private isIdentity: boolean;
  private lut: Lut3D;

  constructor(lut: Lut3D, isIdentity: boolean, state: ViewportState) {
    this.lut = lut;
    this.isIdentity = isIdentity;
    this.object = new THREE.Group();
    this.build(state);
  }

  private build(state: ViewportState): void {
    const group = this.object as THREE.Group;
    // Clear existing children
    group.clear();

    const { displayMode, sliceAxis, slicePosition } = state;

    if (displayMode === 'slice') {
      const objs = buildSlice(this.lut, sliceAxis, slicePosition, this.isIdentity, state);
      objs.forEach((o) => group.add(o));
    } else if (displayMode === 'mesh') {
      const obj = buildMesh(this.lut, this.isIdentity, state);
      group.add(obj);
    } else if (displayMode === 'lattice') {
      const obj = buildLattice(this.lut, this.isIdentity, state);
      group.add(obj);
      const pts = buildPoints(this.lut, this.isIdentity, state);
      group.add(pts);
    } else {
      // points only
      const obj = buildPoints(this.lut, this.isIdentity, state);
      group.add(obj);
    }
  }

  updateMaterials(state: ViewportState): void {
    this.object.traverse((child) => {
      if (child instanceof THREE.Points && child.material instanceof THREE.PointsMaterial) {
        child.material.size = state.pointSize;
        child.material.opacity = this.isIdentity ? state.opacity * 0.4 : state.opacity;
        child.material.needsUpdate = true;
      }
      if (child instanceof THREE.LineSegments && child.material instanceof THREE.LineBasicMaterial) {
        child.material.opacity = this.isIdentity ? state.opacity * 0.3 : state.opacity * 0.6;
        child.material.needsUpdate = true;
      }
    });
  }

  /** Full rebuild required when display mode or slice changes */
  rebuild(state: ViewportState): void {
    this.lut; // keep reference
    (this.object as THREE.Group).clear();
    this.build(state);
  }

  dispose(): void {
    this.object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function rgbToHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h / 6 + 1) % 1;
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

function getNodeColor(
  ri: number, gi: number, bi: number, size: number,
  data: Float32Array, idx: number,
  displacements: Float32Array | null,
  colorMode: ColorMode,
  isIdentity: boolean
): [number, number, number] {
  const step = 1 / (size - 1);
  const outR = data[idx * 3 + 0];
  const outG = data[idx * 3 + 1];
  const outB = data[idx * 3 + 2];

  if (isIdentity || colorMode === 'sourceRGB') {
    return [ri * step, gi * step, bi * step];
  }

  switch (colorMode) {
    case 'destinationRGB':
      return [Math.max(0, outR), Math.max(0, outG), Math.max(0, outB)];
    case 'hue':
      return hsvToRgb(rgbToHue(outR, outG, outB), 1, 1);
    case 'luminance': {
      const lum = 0.2126 * outR + 0.7152 * outG + 0.0722 * outB;
      return [lum, lum, lum];
    }
    case 'deltaMagnitude': {
      if (displacements) {
        const d = Math.min(1, displacements[idx] * 4); // scale for visibility
        return hsvToRgb(0.66 - d * 0.66, 1, 0.9); // blue→red heatmap
      }
      return [0.5, 0.5, 0.5];
    }
    default:
      return [outR, outG, outB];
  }
}

// ─── Geometry builders ────────────────────────────────────────────────────────

function buildPoints(lut: Lut3D, isIdentity: boolean, state: ViewportState): THREE.Points {
  const { data, size } = lut;
  const { colorMode, densityFactor, pointSize, opacity, showClippedHighlight } = state;

  // Compute displacement map for delta coloring
  const displacements = colorMode === 'deltaMagnitude' ? computeDisplacementMap(lut) : null;

  // Density subsampling
  const step = Math.max(1, Math.round(1 / densityFactor));
  const points: number[] = [];
  const colors: number[] = [];

  for (let bi = 0; bi < size; bi += step) {
    for (let gi = 0; gi < size; gi += step) {
      for (let ri = 0; ri < size; ri += step) {
        const idx = ri + gi * size + bi * size * size;
        const r = data[idx * 3 + 0];
        const g = data[idx * 3 + 1];
        const b = data[idx * 3 + 2];

        // Position: use output values for transformed, input for identity
        if (isIdentity) {
          const s = 1 / (size - 1);
          points.push(ri * s, gi * s, bi * s);
        } else {
          points.push(r, g, b);
        }

        let [cr, cg, cb] = getNodeColor(ri, gi, bi, size, data, idx, displacements, colorMode, isIdentity);

        // Highlight clipped nodes
        if (showClippedHighlight && !isIdentity && (r < 0 || g < 0 || b < 0 || r > 1 || g > 1 || b > 1)) {
          cr = 1; cg = 0.1; cb = 0.8; // magenta for clipped
        }

        colors.push(cr, cg, cb);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: pointSize,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: isIdentity ? opacity * 0.4 : opacity,
    depthWrite: false,
  });

  return new THREE.Points(geo, mat);
}

function buildLattice(lut: Lut3D, isIdentity: boolean, state: ViewportState): THREE.LineSegments {
  const { data, size } = lut;
  const { colorMode, opacity, densityFactor } = state;

  const step = Math.max(1, Math.round(1 / densityFactor));
  const positions: number[] = [];
  const colors: number[] = [];

  function addLine(
    ri0: number, gi0: number, bi0: number,
    ri1: number, gi1: number, bi1: number
  ) {
    const i0 = ri0 + gi0 * size + bi0 * size * size;
    const i1 = ri1 + gi1 * size + bi1 * size * size;

    const getPos = (ri: number, gi: number, bi: number, idx: number) => {
      if (isIdentity) {
        const s = 1 / (size - 1);
        return [ri * s, gi * s, bi * s];
      }
      return [data[idx * 3], data[idx * 3 + 1], data[idx * 3 + 2]];
    };

    const getCol = (ri: number, gi: number, bi: number, idx: number): [number, number, number] => {
      return getNodeColor(ri, gi, bi, size, data, idx, null, colorMode, isIdentity);
    };

    const p0 = getPos(ri0, gi0, bi0, i0);
    const p1 = getPos(ri1, gi1, bi1, i1);
    const c0 = getCol(ri0, gi0, bi0, i0);
    const c1 = getCol(ri1, gi1, bi1, i1);

    positions.push(...p0, ...p1);
    colors.push(...c0, ...c1);
  }

  for (let bi = 0; bi < size; bi += step) {
    for (let gi = 0; gi < size; gi += step) {
      for (let ri = 0; ri < size; ri += step) {
        if (ri + step < size) addLine(ri, gi, bi, ri + step, gi, bi);
        if (gi + step < size) addLine(ri, gi, bi, ri, gi + step, bi);
        if (bi + step < size) addLine(ri, gi, bi, ri, gi, bi + step);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: isIdentity ? opacity * 0.25 : opacity * 0.55,
    depthWrite: false,
  });

  return new THREE.LineSegments(geo, mat);
}

function buildMesh(lut: Lut3D, isIdentity: boolean, state: ViewportState): THREE.Object3D {
  // For mesh mode: render surface faces of the cube boundary
  const { data, size } = lut;
  const { colorMode, opacity } = state;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const vertexMap = new Map<number, number>();
  let vertexCount = 0;

  function addVertex(ri: number, gi: number, bi: number): number {
    const key = ri + gi * size + bi * size * size;
    if (vertexMap.has(key)) return vertexMap.get(key)!;

    const idx = key;
    let px, py, pz;
    if (isIdentity) {
      const s = 1 / (size - 1);
      px = ri * s; py = gi * s; pz = bi * s;
    } else {
      px = data[idx * 3]; py = data[idx * 3 + 1]; pz = data[idx * 3 + 2];
    }
    positions.push(px, py, pz);

    const [cr, cg, cb] = getNodeColor(ri, gi, bi, size, data, idx, null, colorMode, isIdentity);
    colors.push(cr, cg, cb);

    const vIdx = vertexCount++;
    vertexMap.set(key, vIdx);
    return vIdx;
  }

  // Build triangulated faces on the 6 faces of the cube
  const addFace = (
    fixed: 'r' | 'g' | 'b',
    fixedVal: number,
    u: 'r' | 'g' | 'b',
    v: 'r' | 'g' | 'b'
  ) => {
    for (let ui = 0; ui < size - 1; ui++) {
      for (let vi = 0; vi < size - 1; vi++) {
        const get = (ui2: number, vi2: number) => {
          const coords: Record<string, number> = { r: 0, g: 0, b: 0 };
          coords[fixed] = fixedVal;
          coords[u] = ui2;
          coords[v] = vi2;
          return addVertex(coords.r, coords.g, coords.b);
        };
        const a = get(ui, vi), b = get(ui + 1, vi);
        const c = get(ui, vi + 1), d = get(ui + 1, vi + 1);
        indices.push(a, b, c, b, d, c);
      }
    }
  };

  addFace('b', 0, 'r', 'g');
  addFace('b', size - 1, 'r', 'g');
  addFace('g', 0, 'r', 'b');
  addFace('g', size - 1, 'r', 'b');
  addFace('r', 0, 'g', 'b');
  addFace('r', size - 1, 'g', 'b');

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: isIdentity ? opacity * 0.2 : opacity * 0.7,
    wireframe: false,
  });

  return new THREE.Mesh(geo, mat);
}

function buildSlice(
  lut: Lut3D,
  axis: 'R' | 'G' | 'B',
  position: number,
  isIdentity: boolean,
  state: ViewportState
): THREE.Object3D[] {
  const { data, size } = lut;
  const { colorMode, opacity, pointSize } = state;

  // Slice index along the chosen axis
  const sliceIdx = Math.round(Math.max(0, Math.min(1, position)) * (size - 1));

  const positions: number[] = [];
  const colors: number[] = [];

  const iter = (a: number, b: number): [number, number, number] => {
    switch (axis) {
      case 'R': return [sliceIdx, a, b]; // ri fixed
      case 'G': return [a, sliceIdx, b]; // gi fixed
      case 'B': return [a, b, sliceIdx]; // bi fixed
    }
  };

  for (let ai = 0; ai < size; ai++) {
    for (let bi = 0; bi < size; bi++) {
      const [ri, gi, bi2] = iter(ai, bi);
      const idx = ri + gi * size + bi2 * size * size;
      const r = data[idx * 3 + 0], g = data[idx * 3 + 1], b3 = data[idx * 3 + 2];

      if (isIdentity) {
        const s = 1 / (size - 1);
        positions.push(ri * s, gi * s, bi2 * s);
      } else {
        positions.push(r, g, b3);
      }

      const [cr, cg, cb] = getNodeColor(ri, gi, bi2, size, data, idx, null, colorMode, isIdentity);
      colors.push(cr, cg, cb);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: pointSize + 2,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: isIdentity ? opacity * 0.4 : opacity,
    depthWrite: false,
  });

  const pts = new THREE.Points(geo, mat);

  // Also add grid lines connecting slice points
  const linePositions: number[] = [];
  const lineColors: number[] = [];

  const addLine = (ai0: number, bi0: number, ai1: number, bi1: number) => {
    const [ri0, gi0, bi0_] = iter(ai0, bi0);
    const [ri1, gi1, bi1_] = iter(ai1, bi1);
    const idx0 = ri0 + gi0 * size + bi0_ * size * size;
    const idx1 = ri1 + gi1 * size + bi1_ * size * size;

    const getP = (ri: number, gi: number, bi: number, idx: number) => {
      if (isIdentity) { const s = 1 / (size - 1); return [ri * s, gi * s, bi * s]; }
      return [data[idx * 3], data[idx * 3 + 1], data[idx * 3 + 2]];
    };

    linePositions.push(...getP(ri0, gi0, bi0_, idx0), ...getP(ri1, gi1, bi1_, idx1));
    const c0 = getNodeColor(ri0, gi0, bi0_, size, data, idx0, null, colorMode, isIdentity);
    const c1 = getNodeColor(ri1, gi1, bi1_, size, data, idx1, null, colorMode, isIdentity);
    lineColors.push(...c0, ...c1);
  };

  for (let ai = 0; ai < size; ai++) {
    for (let bi = 0; bi < size - 1; bi++) {
      addLine(ai, bi, ai, bi + 1);
    }
  }
  for (let bi = 0; bi < size; bi++) {
    for (let ai = 0; ai < size - 1; ai++) {
      addLine(ai, bi, ai + 1, bi);
    }
  }

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
  const lineMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true,
    opacity: isIdentity ? opacity * 0.2 : opacity * 0.5,
  });

  return [pts, new THREE.LineSegments(lineGeo, lineMat)];
}
