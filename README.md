# LUTTY

A professional LUT (Look-Up Table) visualizer and editor for the browser. Inspired by [Lattice](https://lut.robot-ranch.io). No plugins, no server — runs fully client-side.

---

## Features

### Import & Export
- Import `.cube` (Adobe/Resolve), `.3dl` (Autodesk/Flame), `.lut` (DaVinci 1D), `.cdl`, `.cc`, `.ccc`
- Export `.cube` (1D and 3D), `.3dl` (12-bit), `.lut` (10-bit 1D)
- Full metadata preservation on round-trip

### 3D Visualization
- Lattice, point cloud, mesh, and slice display modes
- Source RGB, destination RGB, hue, luminance, and delta magnitude color modes
- Displacement vectors, clipping highlight, axis labels
- Density control for large LUTs (>65³)
- GPU-accelerated via Three.js / WebGL

### Image Preview
- Side-by-side, wipe, and difference comparison modes
- Multiple images via filmstrip — compare how a LUT affects different shots
- WebGL2 shader LUT application with float-precision 3D texture (no 8-bit banding)
- False-color difference mode
- LUT strength blend control

### Diagnostics
- Displacement stats (min, max, mean, std dev)
- Per-channel output ranges
- Clipping detection
- Neutral axis deviation
- Monotonicity and invertibility analysis
- Displacement histogram
- LUT comparison (per-node Euclidean delta)

### Non-Destructive Editing
- Gamma, saturation, contrast, gain/offset, hue rotation
- CDL (slope, offset, power, saturation)
- Interactive curve editor (M/R/G/B channels, live lattice preview)
- Per-channel math expressions (`r`, `g`, `b`, `i`, `n`, `Math`)
- Color space conversion (Rec.709, P3, ACES AP0/AP1, DCI-P3)
- LUT compose, blend, invert, resample
- Full undo/redo per LUT

### Workspace
- LUT library with drag-to-reorder and inline rename
- Session export/import as JSON
- localStorage persistence (LUTs ≤ 33³)
- Resizable panels

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+O` | Open file picker |
| `Cmd/Ctrl+E` | Export active LUT as .cube |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `R` | Reset viewport camera |
| `I` | Toggle identity cube |
| `T` | Toggle transformed cube |
| `P` | Cycle display mode |
| `C` | Cycle color mode |

---

## Tech Stack

- **React 19** + TypeScript
- **Three.js** — 3D lattice viewport
- **WebGL2** — GPU-accelerated image preview (float 3D texture LUT)
- **Zustand** — state management with localStorage persistence
- **Vite 8** — build tooling

---

## Running Locally

```bash
npm install
npm run dev
# http://localhost:5173
```

## Tests

```bash
npm test
# 49 tests: parser, interpolation, composition, resampling, diagnostics
```

## Build

```bash
npm run build
# Fully static output in dist/ — deploy anywhere
```

---

## Supported Formats

| Format | Import | Export | Notes |
|--------|--------|--------|-------|
| `.cube` | ✓ | ✓ | Adobe/Resolve, 1D and 3D, domain min/max |
| `.3dl`  | ✓ | ✓ | Autodesk/Flame, 12-bit integers |
| `.lut`  | ✓ | ✓ | DaVinci-style 1D, 10-bit integers |
| `.cdl` / `.cc` / `.ccc` | ✓ | — | ASC CDL color correction |

---

## Interpolation

| Method | Notes |
|--------|-------|
| **Tetrahedral** | Matches DaVinci Resolve and Nuke — production default |
| **Trilinear** | 8-corner weighted average — useful for comparison |

---

## Sample LUTs

Three ready-to-use LUTs are included in `public/sample-luts/`:

| File | Description |
|------|-------------|
| `identity-17.cube` | 17³ identity baseline |
| `warm-grade-17.cube` | Warm cinematic look — boosted reds, S-curve |
| `bleach-bypass-17.cube` | High-contrast desaturated look |

---

## Limitations

- LUT inversion is approximate (iterative gradient descent) — check the reported max error
- No ICC profile support — intentionally excluded to avoid hidden color management
- 3D display for LUTs > 65³ may be slow — use the Density slider
- 1D LUT editing (gain/gamma/etc.) requires a 3D LUT

---

## License

MIT
