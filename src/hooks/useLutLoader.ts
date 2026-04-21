/**
 * Hook for loading LUT files from drag-and-drop or file picker.
 */

import { useCallback } from 'react';
import { parseLutFile } from '../core/lut/parser';
import { validateLut } from '../core/lut/validation';
import { useAppStore } from '../store/index';
import type { LutEntry } from '../core/lut/types';
import { parseCdlFile } from '../core/cdl/parser';
import { applyCdlToLut } from '../core/cdl/apply';
import { makeIdentity3D } from '../core/lut/identity';

export interface LoadResult {
  success: boolean;
  error?: string;
  warnings?: string[];
}

export function useLutLoader() {
  const addLut = useAppStore((s) => s.addLut);

  const loadFile = useCallback(async (file: File): Promise<LoadResult> => {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      // Handle CDL file types — apply to a 33³ identity LUT
      if (ext === 'cdl' || ext === 'cc' || ext === 'ccc') {
        const text = await file.text();
        const cdlFile = parseCdlFile(text, file.name);
        const identity = makeIdentity3D(33);
        const nodes = cdlFile.nodes;
        for (let i = 0; i < nodes.length; i++) {
          const applied = applyCdlToLut(identity, nodes[i]);
          const nodeName = nodes[i].id ?? (nodes.length > 1 ? `${i + 1}` : '');
          const entry: LutEntry = {
            id: crypto.randomUUID(),
            name: `${file.name.replace(/\.[^.]+$/, '')}${nodeName ? ` (${nodeName})` : ''}`,
            lut: applied,
            loadedAt: Date.now(),
          };
          addLut(entry);
        }
        return { success: true };
      }

      const text = await file.text();
      const lut = parseLutFile(text, file.name);
      const validation = validateLut(lut);

      if (!validation.valid) {
        return { success: false, error: validation.errors.join('; ') };
      }

      const entry: LutEntry = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ''),
        lut,
        loadedAt: Date.now(),
      };

      addLut(entry);
      return { success: true, warnings: validation.warnings };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error loading LUT',
      };
    }
  }, [addLut]);

  const loadFiles = useCallback(async (files: FileList | File[]): Promise<LoadResult[]> => {
    const fileArray = Array.from(files);
    return Promise.all(fileArray.map(loadFile));
  }, [loadFile]);

  return { loadFile, loadFiles };
}
