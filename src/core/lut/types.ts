/**
 * Core LUT data types.
 * All RGB values are normalized floats in [0,1] unless explicitly stated.
 * Internal storage uses Float32Array for performance.
 */

/** Axis-aligned domain for a LUT channel */
export interface LutDomain {
  min: [number, number, number]; // [r_min, g_min, b_min]
  max: [number, number, number]; // [r_max, g_max, b_max]
}

/** Source file format */
export type LutFormat = 'cube' | '3dl' | 'lut' | 'unknown';

/** Metadata parsed from the LUT file */
export interface LutMetadata {
  title?: string;
  format: LutFormat;
  comments: string[];
  originalFilename?: string;
}

/**
 * 1D LUT data.
 * Each channel table has `size` entries mapping [domain.min → domain.max] → output.
 * Storage: separate Float32Array per channel.
 */
export interface Lut1D {
  type: '1D';
  size: number;            // number of entries per channel
  domain: LutDomain;
  // output values, length = size each
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  metadata: LutMetadata;
}

/**
 * 3D LUT data.
 * Grid of size^3 output RGB values.
 *
 * Indexing convention (matching .cube spec):
 *   index = r + g*size + b*size^2
 *   i.e., R is the fastest-varying axis.
 *
 * Storage: interleaved Float32Array of length size^3 * 3
 *   [r0,g0,b0, r1,g1,b1, ...]
 */
export interface Lut3D {
  type: '3D';
  size: number;            // grid edge length (e.g. 33 → 33^3 nodes)
  domain: LutDomain;
  // interleaved output values, length = size^3 * 3
  data: Float32Array;
  metadata: LutMetadata;
}

/** Union of supported LUT types */
export type Lut = Lut1D | Lut3D;

/** A loaded LUT with a stable ID for use in the app state */
export interface LutEntry {
  id: string;
  name: string;
  lut: Lut;
  loadedAt: number; // Date.now()
}

/** Interpolation method for 3D LUT evaluation */
export type InterpolationMethod = 'tetrahedral' | 'trilinear';

/** Color mode for viewport point coloring */
export type ColorMode =
  | 'sourceRGB'
  | 'destinationRGB'
  | 'hue'
  | 'luminance'
  | 'deltaMagnitude';

/** Viewport display mode */
export type DisplayMode = 'points' | 'lattice' | 'mesh' | 'slice';

/** Slice axis for slice display mode */
export type SliceAxis = 'R' | 'G' | 'B';

/** Result of LUT diagnostics analysis */
export interface LutDiagnostics {
  lutId: string;
  size: number;
  is1D: boolean;
  domainMin: [number, number, number];
  domainMax: [number, number, number];

  // Per-node displacement from identity
  displacementMin: number;
  displacementMax: number;
  displacementMean: number;
  displacementStdDev: number;

  // Channel output ranges
  rOutputMin: number; rOutputMax: number;
  gOutputMin: number; gOutputMax: number;
  bOutputMin: number; bOutputMax: number;

  // Clipping
  clippedBelow: number; // count of nodes with any channel < 0
  clippedAbove: number; // count of nodes with any channel > 1
  clippedNodeIndices: Uint32Array; // indices of clipped nodes

  // Monotonicity (1D only)
  rMonotonic?: boolean;
  gMonotonic?: boolean;
  bMonotonic?: boolean;

  // Neutral axis
  neutralAxisMaxDeviation: number;
  neutralAxisMeanDeviation: number;

  // Channel crossover regions (non-trivial crosstalk)
  hasCrossovers: boolean;

  // Inversion estimate
  likelyInvertible: boolean;

  // Displacement histogram buckets (20 bins 0..maxDisplacement)
  displacementHistogram: Float32Array;
}

/** Edit operation for the history stack */
export interface EditOperation {
  id: string;
  label: string;
  timestamp: number;
  prevData: Float32Array;
  prevSize: number;
  nextData: Float32Array;
  nextSize: number;
}

/** App session — serializable to JSON for export/import */
export interface AppSession {
  version: number;
  luts: Array<{
    id: string;
    name: string;
    serialized: string; // .cube text
  }>;
  activeLutId: string | null;
  viewportSettings: {
    displayMode: DisplayMode;
    colorMode: ColorMode;
    showIdentity: boolean;
    showTransformed: boolean;
    pointSize: number;
    opacity: number;
    interpolation: InterpolationMethod;
    sliceAxis: SliceAxis;
    slicePosition: number;
  };
}

/** Comparison between two LUTs (same size required after resampling) */
export interface LutComparison {
  lutAId: string;
  lutBId: string;
  // Per-node Euclidean RGB distance
  deltaData: Float32Array; // length = size^3
  deltaMin: number;
  deltaMax: number;
  deltaMean: number;
}
