/**
 * Global app state via Zustand.
 * All internal processing uses Float32Array + normalized [0,1] RGB.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  LutEntry,
  LutDiagnostics,
  LutComparison,
  DisplayMode,
  ColorMode,
  InterpolationMethod,
  SliceAxis,
  EditOperation,
  Lut3D,
} from '../core/lut/types';
import { serializeToCube } from '../core/lut/serializer';
import { parseCube } from '../core/lut/parser';

// ─── Viewport state ───────────────────────────────────────────────────────────

export interface ViewportState {
  displayMode: DisplayMode;
  colorMode: ColorMode;
  showIdentity: boolean;
  showTransformed: boolean;
  pointSize: number;
  opacity: number;
  interpolation: InterpolationMethod;
  sliceAxis: SliceAxis;
  slicePosition: number;   // 0..1
  densityFactor: number;   // 0..1 (1 = all points)
  showDisplacementVectors: boolean;
  showClippedHighlight: boolean;
  invertVerticalOrbit: boolean;
  invertHorizontalOrbit: boolean;
}

// ─── Image preview state ─────────────────────────────────────────────────────

export type PreviewMode = 'sideBySide' | 'wipe' | 'difference';

export interface PreviewImage {
  id: string;
  filename: string;
}

export interface PreviewState {
  images: PreviewImage[];
  activeImageId: string | null;
  mode: PreviewMode;
  wipePosition: number;           // 0..1 horizontal split for wipe mode
  showFalseColor: boolean;
  lutStrength: number;            // 0..1 blend with identity
}

// ─── Edit history ─────────────────────────────────────────────────────────────

export interface HistoryState {
  stack: EditOperation[];
  cursor: number; // points to the current position in the stack
}

// ─── Compare state ────────────────────────────────────────────────────────────

export interface CompareState {
  lutBId: string | null;
  result: LutComparison | null;
}

// ─── Full app state ───────────────────────────────────────────────────────────

export interface AppState {
  // LUT library
  luts: LutEntry[];
  activeLutId: string | null;

  // Diagnostics cache (keyed by LUT id)
  diagnosticsCache: Record<string, LutDiagnostics>;

  // Viewport
  viewport: ViewportState;

  // Image preview
  preview: PreviewState;

  // Edit history (per active LUT)
  history: Record<string, HistoryState>;

  // Compare
  compare: CompareState;

  // Actions
  addLut: (entry: LutEntry) => void;
  removeLut: (id: string) => void;
  renameLut: (id: string, name: string) => void;
  reorderLuts: (fromIndex: number, toIndex: number) => void;
  setActiveLut: (id: string | null) => void;
  /** Update LUT data and push an undo snapshot. Use for discrete "Apply" operations. */
  updateLutData: (id: string, data: Float32Array, label: string) => void;
  /**
   * Update LUT data WITHOUT touching history. Use during continuous drag for live preview.
   * Call commitLutEdit when the drag ends to push the undo snapshot.
   */
  setLutDataDirect: (id: string, data: Float32Array) => void;
  /**
   * Explicitly commit an edit to history, providing both the new data and the
   * pre-drag snapshot as prevData. Call this on pointer-up after live preview.
   */
  commitLutEdit: (id: string, newData: Float32Array, prevData: Float32Array, label: string) => void;
  cacheDiagnostics: (id: string, diag: LutDiagnostics) => void;
  setViewport: (patch: Partial<ViewportState>) => void;
  setPreview: (patch: Partial<PreviewState>) => void;
  addPreviewImage: (img: PreviewImage) => void;
  removePreviewImage: (id: string) => void;
  setActivePreviewImage: (id: string) => void;
  reorderPreviewImages: (fromIndex: number, toIndex: number) => void;
  setCompare: (patch: Partial<CompareState>) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: (lutId: string) => void;
}

const defaultViewport: ViewportState = {
  displayMode: 'lattice',
  colorMode: 'destinationRGB',
  showIdentity: true,
  showTransformed: true,
  pointSize: 3,
  opacity: 0.85,
  interpolation: 'tetrahedral',
  sliceAxis: 'G',
  slicePosition: 0.5,
  densityFactor: 1,
  showDisplacementVectors: false,
  showClippedHighlight: true,
  invertVerticalOrbit: true,
  invertHorizontalOrbit: false,
};

const defaultPreview: PreviewState = {
  images: [],
  activeImageId: null,
  mode: 'sideBySide',
  wipePosition: 0.5,
  showFalseColor: false,
  lutStrength: 1,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, _get) => ({
      luts: [],
      activeLutId: null,
      diagnosticsCache: {},
      viewport: defaultViewport,
      preview: defaultPreview,
      history: {},
      compare: { lutBId: null, result: null },

      addLut: (entry) =>
        set((state) => ({
          luts: [...state.luts, entry],
          activeLutId: state.activeLutId ?? entry.id,
        })),

      removeLut: (id) =>
        set((state) => {
          const luts = state.luts.filter((l) => l.id !== id);
          const diagnosticsCache = { ...state.diagnosticsCache };
          delete diagnosticsCache[id];
          const activeLutId =
            state.activeLutId === id ? (luts[0]?.id ?? null) : state.activeLutId;
          return { luts, activeLutId, diagnosticsCache };
        }),

      renameLut: (id, name) =>
        set((state) => ({
          luts: state.luts.map((l) => l.id === id ? { ...l, name } : l),
        })),

      reorderLuts: (from, to) =>
        set((state) => {
          const luts = [...state.luts];
          const [item] = luts.splice(from, 1);
          luts.splice(to, 0, item);
          return { luts };
        }),

      setActiveLut: (id) => set({ activeLutId: id }),

      updateLutData: (id, newData, label) =>
        set((state) => {
          const lutIndex = state.luts.findIndex((l) => l.id === id);
          if (lutIndex === -1) return {};

          const entry = state.luts[lutIndex];
          if (entry.lut.type !== '3D') return {};

          const prevData = new Float32Array(entry.lut.data);
          const prevSize = entry.lut.size;

          // Push to history
          const hist = state.history[id] ?? { stack: [], cursor: -1 };
          const op: EditOperation = {
            id: crypto.randomUUID(),
            label,
            timestamp: Date.now(),
            prevData,
            prevSize,
            nextData: new Float32Array(newData),
            nextSize: (entry.lut as Lut3D).size,
          };

          // Truncate future on new operation
          const newStack = [...hist.stack.slice(0, hist.cursor + 1), op];
          const newCursor = newStack.length - 1;

          const updatedLuts = [...state.luts];
          updatedLuts[lutIndex] = {
            ...entry,
            lut: { ...(entry.lut as Lut3D), data: newData },
          };

          // Invalidate diagnostics cache for this LUT
          const diagnosticsCache = { ...state.diagnosticsCache };
          delete diagnosticsCache[id];

          return {
            luts: updatedLuts,
            history: {
              ...state.history,
              [id]: { stack: newStack, cursor: newCursor },
            },
            diagnosticsCache,
          };
        }),

      setLutDataDirect: (id, newData) =>
        set((state) => {
          const lutIndex = state.luts.findIndex((l) => l.id === id);
          if (lutIndex === -1) return {};
          const entry = state.luts[lutIndex];
          if (entry.lut.type !== '3D') return {};
          const updatedLuts = [...state.luts];
          updatedLuts[lutIndex] = {
            ...entry,
            lut: { ...(entry.lut as Lut3D), data: newData },
          };
          const diagnosticsCache = { ...state.diagnosticsCache };
          delete diagnosticsCache[id];
          return { luts: updatedLuts, diagnosticsCache };
        }),

      commitLutEdit: (id, newData, prevData, label) =>
        set((state) => {
          const lutIndex = state.luts.findIndex((l) => l.id === id);
          if (lutIndex === -1) return {};
          const entry = state.luts[lutIndex];
          if (entry.lut.type !== '3D') return {};

          const hist = state.history[id] ?? { stack: [], cursor: -1 };
          const op: EditOperation = {
            id: crypto.randomUUID(),
            label,
            timestamp: Date.now(),
            prevData,
            prevSize: (entry.lut as Lut3D).size,
            nextData: new Float32Array(newData),
            nextSize: (entry.lut as Lut3D).size,
          };
          const newStack = [...hist.stack.slice(0, hist.cursor + 1), op];

          const updatedLuts = [...state.luts];
          updatedLuts[lutIndex] = {
            ...entry,
            lut: { ...(entry.lut as Lut3D), data: newData },
          };
          const diagnosticsCache = { ...state.diagnosticsCache };
          delete diagnosticsCache[id];

          return {
            luts: updatedLuts,
            history: { ...state.history, [id]: { stack: newStack, cursor: newStack.length - 1 } },
            diagnosticsCache,
          };
        }),

      cacheDiagnostics: (id, diag) =>
        set((state) => ({
          diagnosticsCache: { ...state.diagnosticsCache, [id]: diag },
        })),

      setViewport: (patch) =>
        set((state) => ({ viewport: { ...state.viewport, ...patch } })),

      setPreview: (patch) =>
        set((state) => ({ preview: { ...state.preview, ...patch } })),

      addPreviewImage: (img) =>
        set((state) => ({
          preview: {
            ...state.preview,
            images: [...state.preview.images, img],
            activeImageId: img.id,
          },
        })),

      removePreviewImage: (id) =>
        set((state) => {
          const images = state.preview.images.filter((i) => i.id !== id);
          const activeImageId =
            state.preview.activeImageId === id
              ? (images[images.length - 1]?.id ?? null)
              : state.preview.activeImageId;
          return { preview: { ...state.preview, images, activeImageId } };
        }),

      setActivePreviewImage: (id) =>
        set((state) => ({ preview: { ...state.preview, activeImageId: id } })),

      reorderPreviewImages: (from, to) =>
        set((state) => {
          const images = [...state.preview.images];
          const [item] = images.splice(from, 1);
          images.splice(to, 0, item);
          return { preview: { ...state.preview, images } };
        }),

      setCompare: (patch) =>
        set((state) => ({ compare: { ...state.compare, ...patch } })),

      undo: () =>
        set((state) => {
          const { activeLutId, luts, history } = state;
          if (!activeLutId) return {};

          const hist = history[activeLutId];
          if (!hist || hist.cursor < 0) return {};

          const op = hist.stack[hist.cursor];
          if (!op) return {};

          const lutIndex = luts.findIndex((l) => l.id === activeLutId);
          if (lutIndex === -1) return {};

          const entry = luts[lutIndex];
          if (entry.lut.type !== '3D') return {};

          const updatedLuts = [...luts];
          updatedLuts[lutIndex] = {
            ...entry,
            lut: {
              ...(entry.lut as Lut3D),
              data: op.prevData,
              size: op.prevSize,
            },
          };

          const diagnosticsCache = { ...state.diagnosticsCache };
          delete diagnosticsCache[activeLutId];

          return {
            luts: updatedLuts,
            history: {
              ...history,
              [activeLutId]: { ...hist, cursor: hist.cursor - 1 },
            },
            diagnosticsCache,
          };
        }),

      redo: () =>
        set((state) => {
          const { activeLutId, luts, history } = state;
          if (!activeLutId) return {};

          const hist = history[activeLutId];
          if (!hist || hist.cursor >= hist.stack.length - 1) return {};

          const nextCursor = hist.cursor + 1;
          const op = hist.stack[nextCursor];
          if (!op) return {};

          const lutIndex = luts.findIndex((l) => l.id === activeLutId);
          if (lutIndex === -1) return {};

          const entry = luts[lutIndex];
          if (entry.lut.type !== '3D') return {};

          const updatedLuts = [...luts];
          updatedLuts[lutIndex] = {
            ...entry,
            lut: {
              ...(entry.lut as Lut3D),
              data: op.nextData,
              size: op.nextSize,
            },
          };

          const diagnosticsCache = { ...state.diagnosticsCache };
          delete diagnosticsCache[activeLutId];

          return {
            luts: updatedLuts,
            history: {
              ...history,
              [activeLutId]: { ...hist, cursor: nextCursor },
            },
            diagnosticsCache,
          };
        }),

      clearHistory: (lutId) =>
        set((state) => ({
          history: { ...state.history, [lutId]: { stack: [], cursor: -1 } },
        })),
    }),
    {
      name: 'lutty-session',
      // Only persist viewport settings and non-binary data
      partialize: (state) => ({
        activeLutId: state.activeLutId,
        viewport: state.viewport,
        preview: {
          ...state.preview,
          images: [] as PreviewImage[],
          activeImageId: null as string | null,
        },
        // Persist LUTs as serialized .cube text.
        // Skip LUTs larger than 33³ to stay within the ~5MB localStorage quota.
        // (A 65³ LUT produces ~11MB of text — well over the limit.)
        luts: state.luts
          .filter((entry) => {
            if (entry.lut.type === '1D') return true;
            return (entry.lut as Lut3D).size <= 33;
          })
          .map((entry) => ({
            id: entry.id,
            name: entry.name,
            loadedAt: entry.loadedAt,
            _serialized: serializeToCube(entry.lut),
          })),
      }),
      // On rehydration, re-parse the serialized LUTs
      merge: (persisted: unknown, current: AppState) => {
        const p = persisted as Partial<typeof current & {
          luts: Array<{ id: string; name: string; loadedAt: number; _serialized: string }>;
        }>;

        const rehydratedLuts: LutEntry[] = [];
        if (Array.isArray(p.luts)) {
          for (const item of p.luts) {
            try {
              if (item._serialized) {
                const lut = parseCube(item._serialized, item.name);
                rehydratedLuts.push({ id: item.id, name: item.name, lut, loadedAt: item.loadedAt });
              }
            } catch { /* skip malformed entries */ }
          }
        }

        return {
          ...current,
          ...(p as Partial<AppState>),
          viewport: {
            ...defaultViewport,
            ...((p as Partial<AppState>).viewport ?? {}),
          },
          preview: {
            ...defaultPreview,
            ...((p as Partial<AppState>).preview ?? {}),
            images: [] as PreviewImage[],
            activeImageId: null as string | null,
          },
          luts: rehydratedLuts,
        };
      },
    }
  )
);

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectActiveLut = (state: AppState) =>
  state.luts.find((l) => l.id === state.activeLutId);

export const selectActiveDiagnostics = (state: AppState) =>
  state.activeLutId ? state.diagnosticsCache[state.activeLutId] : undefined;

export const selectCanUndo = (state: AppState) => {
  if (!state.activeLutId) return false;
  const hist = state.history[state.activeLutId];
  return hist ? hist.cursor >= 0 : false;
};

export const selectCanRedo = (state: AppState) => {
  if (!state.activeLutId) return false;
  const hist = state.history[state.activeLutId];
  return hist ? hist.cursor < hist.stack.length - 1 : false;
};
