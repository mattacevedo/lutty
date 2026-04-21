import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/index';
import { HelpTip } from '../ui/HelpTip';
import { useLutLoader } from '../../hooks/useLutLoader';
import { makeIdentity3D } from '../../core/lut/identity';
import { downloadCube, download3DL, download1DLut } from '../../core/lut/serializer';
import { serializeToCube } from '../../core/lut/serializer';
import { parseCube } from '../../core/lut/parser';
import { composeLuts } from '../../core/math/composition';
import { compareLuts } from '../../core/analysis/diagnostics';
import { resample3D } from '../../core/math/resampling';
import type { Lut3D } from '../../core/lut/types';

export const LeftPanel: React.FC = () => {
  const luts = useAppStore((s) => s.luts);
  const activeLutId = useAppStore((s) => s.activeLutId);
  const setActiveLut = useAppStore((s) => s.setActiveLut);
  const removeLut = useAppStore((s) => s.removeLut);
  const renameLut = useAppStore((s) => s.renameLut);
  const reorderLuts = useAppStore((s) => s.reorderLuts);
  const addLut = useAppStore((s) => s.addLut);
  const setCompare = useAppStore((s) => s.setCompare);
  const compare = useAppStore((s) => s.compare);
  const { loadFiles } = useLutLoader();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Drag-to-reorder state
  const dragFromRef = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (editingId) renameInputRef.current?.select();
  }, [editingId]);

  const startRename = useCallback((id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingName(name);
  }, []);

  const commitRename = useCallback((id: string, fallback: string) => {
    renameLut(id, editingName.trim() || fallback);
    setEditingId(null);
  }, [editingName, renameLut]);

  const handleRenameKey = useCallback((e: React.KeyboardEvent, id: string, fallback: string) => {
    if (e.key === 'Enter') commitRename(id, fallback);
    if (e.key === 'Escape') setEditingId(null);
  }, [commitRename]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setError('');
    const results = await loadFiles(files);
    const errors = results.filter((r) => !r.success).map((r) => r.error);
    if (errors.length > 0) setError(errors.join('; '));
  }, [loadFiles]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragging(false), []);

  const handleExportSession = () => {
    const session = {
      version: 1,
      luts: luts.map((entry) => ({
        id: entry.id,
        name: entry.name,
        serialized: serializeToCube(entry.lut),
      })),
      activeLutId,
    };
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lutty-session.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportSession = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const session = JSON.parse(text);
        if (!Array.isArray(session.luts)) return;
        for (const item of session.luts) {
          const lut = parseCube(item.serialized, item.name);
          addLut({ id: item.id, name: item.name, lut, loadedAt: Date.now() });
        }
      } catch (err) {
        setError('Failed to import session: ' + (err instanceof Error ? err.message : String(err)));
      }
    });
    e.target.value = '';
  };

  const handleCompose = () => {
    const lut3Ds = luts.filter((l) => l.lut.type === '3D');
    if (lut3Ds.length < 2) { setError('Need at least 2 3D LUTs to compose'); return; }
    const a = lut3Ds[0].lut as Lut3D;
    const b = lut3Ds[1].lut as Lut3D;
    const composed = composeLuts(a, b);
    addLut({ id: crypto.randomUUID(), name: `${lut3Ds[0].name} → ${lut3Ds[1].name}`, lut: composed, loadedAt: Date.now() });
  };

  const handleCompare = () => {
    const lut3Ds = luts.filter((l) => l.lut.type === '3D');
    if (lut3Ds.length < 2) { setError('Need at least 2 3D LUTs to compare'); return; }
    const a = lut3Ds[0].lut as Lut3D;
    const b = lut3Ds[1].lut as Lut3D;
    const result = compareLuts(a, b, lut3Ds[0].id, lut3Ds[1].id, resample3D);
    setCompare({ lutBId: lut3Ds[1].id, result });
  };

  return (
    <div className="left-panel">
      <div className="panel-header">
        <span className="panel-title">LUTTY</span>
        <span className="panel-subtitle">LUT Inspector</span>
      </div>

      {/* Drop zone / file picker */}
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <span>Drop .cube / .3dl / .lut / .cdl / .cc / .ccc here</span>
        <span className="drop-hint">or click to browse (Ctrl+O)</span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".cube,.3dl,.lut,.cdl,.cc,.ccc"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {error && <div className="error-msg">{error}</div>}

      {/* Generate identity */}
      <div className="ctrl-section-title">
        Generate
        <HelpTip text="Create a fresh identity LUT — one that makes no changes to any colour. Useful as a starting point for building a new look from scratch, or for testing." align="right" />
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {[17, 33, 65].map((s) => (
          <button key={s} className="btn-sm" onClick={() => {
            const lut = makeIdentity3D(s);
            addLut({ id: crypto.randomUUID(), name: `Identity ${s}³`, lut, loadedAt: Date.now() });
          }}>Identity {s}³</button>
        ))}
      </div>

      {/* LUT list */}
      <div className="ctrl-section-title">
        Loaded LUTs
        <HelpTip text="All LUTs currently in memory. Click a name to make it active. Use the ↓c / ↓3 buttons to export, or × to remove it. LUTs larger than 33³ are not saved to your browser session — reload the page and you'll need to re-import them." align="right" />
      </div>
      <div className="lut-list">
        {luts.length === 0 && <div className="lut-empty">No LUTs loaded</div>}
        {luts.map((entry, idx) => (
          <div
            key={entry.id}
            className={`lut-item ${entry.id === activeLutId ? 'active' : ''} ${dragOverIdx === idx ? 'drag-over' : ''}`}
            onClick={() => { if (editingId !== entry.id) setActiveLut(entry.id); }}
            draggable
            onDragStart={(e) => {
              dragFromRef.current = idx;
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverIdx(idx);
            }}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFromRef.current !== null && dragFromRef.current !== idx) {
                reorderLuts(dragFromRef.current, idx);
              }
              dragFromRef.current = null;
              setDragOverIdx(null);
            }}
            onDragEnd={() => { dragFromRef.current = null; setDragOverIdx(null); }}
          >
            <span className="lut-drag-handle" title="Drag to reorder">⠿</span>
            {editingId === entry.id ? (
              <input
                ref={renameInputRef}
                className="lut-rename-input"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => commitRename(entry.id, entry.name)}
                onKeyDown={(e) => handleRenameKey(e, entry.id, entry.name)}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                className="lut-name"
                title="Double-click to rename"
                onDoubleClick={(e) => startRename(entry.id, entry.name, e)}
              >
                {entry.name}
              </div>
            )}
            <div className="lut-meta">
              {entry.lut.type === '3D'
                ? `3D ${entry.lut.size}³`
                : `1D ${entry.lut.size}`}
            </div>
            <div className="lut-actions">
              <button className="btn-icon" title="Export .cube" onClick={(e) => {
                e.stopPropagation();
                downloadCube(entry.lut, entry.name + '.cube');
              }}>↓c</button>
              {entry.lut.type === '3D' && (
                <button className="btn-icon" title="Export .3dl" onClick={(e) => {
                  e.stopPropagation();
                  download3DL(entry.lut as import('../../core/lut/types').Lut3D, entry.name + '.3dl');
                }}>↓3</button>
              )}
              {entry.lut.type === '1D' && (
                <button className="btn-icon" title="Export .lut" onClick={(e) => {
                  e.stopPropagation();
                  download1DLut(entry.lut as import('../../core/lut/types').Lut1D, entry.name + '.lut');
                }}>↓l</button>
              )}
              <button className="btn-icon btn-danger" title="Remove" onClick={(e) => {
                e.stopPropagation();
                removeLut(entry.id);
              }}>×</button>
            </div>
          </div>
        ))}
      </div>

      {/* Operations */}
      {luts.filter((l) => l.lut.type === '3D').length >= 2 && (
        <>
          <div className="ctrl-section-title">
            Operations (first 2 LUTs)
            <HelpTip text="Tools that work on a pair of LUTs. 'Compose' chains them: the output of A feeds into B, creating a single combined LUT. 'Compare' measures the per-node difference to see how similar two LUTs are." align="right" />
          </div>
          <button className="btn-sm full" onClick={handleCompose}>Compose A → B</button>
          <button className="btn-sm full" onClick={handleCompare}>Compare A vs B</button>
          {compare.result && (
            <div className="compare-result">
              <div>Δ min: {compare.result.deltaMin.toFixed(5)}</div>
              <div>Δ max: {compare.result.deltaMax.toFixed(5)}</div>
              <div>Δ mean: {compare.result.deltaMean.toFixed(5)}</div>
            </div>
          )}
        </>
      )}

      {/* Session */}
      <div className="ctrl-section-title">
        Session
        <HelpTip text="Save or restore your entire workspace. Export Session JSON saves all loaded LUTs (as text) to a single file so you can pick up where you left off. Import loads them back in." align="right" />
      </div>
      <button className="btn-sm full" onClick={handleExportSession}>Export Session JSON</button>
      <button className="btn-sm full" onClick={() => sessionInputRef.current?.click()}>Import Session JSON</button>
      <input
        ref={sessionInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportSession}
      />
    </div>
  );
};
