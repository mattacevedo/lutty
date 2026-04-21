/**
 * Global keyboard shortcut handler.
 *
 * Shortcuts:
 *   Ctrl/Cmd+O — open file picker
 *   Ctrl/Cmd+E — export active LUT
 *   R          — reset camera
 *   Ctrl/Cmd+Z — undo
 *   Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z — redo
 *   I          — toggle identity cube
 *   T          — toggle transformed cube
 *   G          — toggle grid/lines
 *   P          — cycle display mode
 *   C          — cycle color mode
 */

import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/index';
import { downloadCube } from '../core/lut/serializer';

type Callback = () => void;

interface ShortcutCallbacks {
  onOpenFile?: Callback;
}

const DISPLAY_MODES = ['points', 'lattice', 'mesh', 'slice'] as const;
const COLOR_MODES = ['sourceRGB', 'destinationRGB', 'hue', 'luminance', 'deltaMagnitude'] as const;

export function useKeyboardShortcuts(callbacks: ShortcutCallbacks = {}) {
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const setViewport = useAppStore((s) => s.setViewport);
  const viewport = useAppStore((s) => s.viewport);
  const activeLut = useAppStore((s) => s.luts.find((l) => l.id === s.activeLutId));

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;

    // Ignore when typing in inputs
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) return;

    if (mod && e.key === 'o') {
      e.preventDefault();
      callbacks.onOpenFile?.();
      return;
    }

    if (mod && e.key === 'e') {
      e.preventDefault();
      if (activeLut) downloadCube(activeLut.lut);
      return;
    }

    if (mod && (e.key === 'z') && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }

    if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }

    // Single-key shortcuts (no modifier)
    if (!mod) {
      switch (e.key.toLowerCase()) {
        case 'r':
          // Dispatch custom event for camera reset
          window.dispatchEvent(new CustomEvent('lutty:resetCamera'));
          break;
        case 'i':
          setViewport({ showIdentity: !viewport.showIdentity });
          break;
        case 't':
          setViewport({ showTransformed: !viewport.showTransformed });
          break;
        case 'p': {
          const cur = DISPLAY_MODES.indexOf(viewport.displayMode as typeof DISPLAY_MODES[number]);
          setViewport({ displayMode: DISPLAY_MODES[(cur + 1) % DISPLAY_MODES.length] });
          break;
        }
        case 'c': {
          const cur = COLOR_MODES.indexOf(viewport.colorMode as typeof COLOR_MODES[number]);
          setViewport({ colorMode: COLOR_MODES[(cur + 1) % COLOR_MODES.length] });
          break;
        }
      }
    }
  }, [undo, redo, setViewport, viewport, activeLut, callbacks]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
