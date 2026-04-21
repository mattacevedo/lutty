/**
 * Color space conversion panel.
 * Converts the output nodes of a 3D LUT from one RGB primaries to another
 * via a 3x3 linear matrix.
 */

import React, { useState, useMemo } from 'react';
import { useAppStore, selectActiveLut } from '../../store/index';
import { HelpTip } from '../ui/HelpTip';
import { convertLutColorSpace } from '../../core/colorspace/conversion';
import { ALL_PRIMARIES, getConversionMatrix, type ColorPrimaries } from '../../core/colorspace/primaries';
import type { Lut3D } from '../../core/lut/types';

export const ColorSpacePanel: React.FC = () => {
  const activeLutEntry = useAppStore(selectActiveLut);
  const updateLutData = useAppStore((s) => s.updateLutData);

  const [srcIdx, setSrcIdx] = useState(1); // P3 D65
  const [dstIdx, setDstIdx] = useState(0); // Rec.709
  const [showMatrix, setShowMatrix] = useState(false);

  const lut3D = activeLutEntry?.lut.type === '3D' ? (activeLutEntry.lut as Lut3D) : null;

  const src: ColorPrimaries = ALL_PRIMARIES[srcIdx];
  const dst: ColorPrimaries = ALL_PRIMARIES[dstIdx];
  const same = srcIdx === dstIdx;

  const matrix = useMemo(() => {
    if (same) return null;
    try { return getConversionMatrix(src, dst); }
    catch { return null; }
  }, [src, dst, same]);

  const handleApply = () => {
    if (!activeLutEntry || !lut3D || !matrix) return;
    const result = convertLutColorSpace(lut3D, src, dst);
    updateLutData(activeLutEntry.id, result.data, `colorspace(${src.name}→${dst.name})`);
  };

  const handleAddConverted = () => {
    if (!activeLutEntry || !lut3D || !matrix) return;
    const addLut = useAppStore.getState().addLut;
    const result = convertLutColorSpace(lut3D, src, dst);
    addLut({
      id: crypto.randomUUID(),
      name: `${activeLutEntry.name} (${src.name} → ${dst.name})`,
      lut: result,
      loadedAt: Date.now(),
    });
  };

  if (!activeLutEntry) return <div className="panel-empty"><span>No LUT loaded</span></div>;
  if (!lut3D) return <div className="panel-empty"><span>Color space conversion requires a 3D LUT</span></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="ctrl-section-title">
        Color Space Conversion
        <HelpTip text="Remaps the LUT's output from one set of colour primaries to another using a 3×3 linear matrix. Use this when a LUT was built for one colour space (e.g. P3) but you need it to work in another (e.g. Rec.709). Note: this only adjusts the gamut/primaries — it does not change the transfer function (gamma/log curve)." align="right" />
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 4 }}>
        Applies a 3×3 linear matrix to the LUT's <em>output nodes</em>, remapping
        them from the source primaries to the destination primaries.
      </div>

      <label className="ctrl-row">
        <span className="ctrl-label">Source<HelpTip text="The colour space the LUT was originally designed for." align="right" /></span>
        <select
          className="ctrl-select"
          value={srcIdx}
          onChange={(e) => setSrcIdx(Number(e.target.value))}
        >
          {ALL_PRIMARIES.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
        </select>
      </label>

      <label className="ctrl-row">
        <span className="ctrl-label">Destination<HelpTip text="The target colour space you want the LUT to work in after conversion." align="right" /></span>
        <select
          className="ctrl-select"
          value={dstIdx}
          onChange={(e) => setDstIdx(Number(e.target.value))}
        >
          {ALL_PRIMARIES.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
        </select>
      </label>

      {same && (
        <div className="warn-msg">Source and destination are the same — no conversion needed.</div>
      )}

      {!same && matrix && (
        <>
          <label className="ctrl-row ctrl-toggle" style={{ marginTop: 2 }}>
            <span className="ctrl-label">Show matrix</span>
            <button className={`toggle-btn ${showMatrix ? 'active' : ''}`} onClick={() => setShowMatrix((v) => !v)}>
              {showMatrix ? 'ON' : 'OFF'}
            </button>
          </label>

          {showMatrix && (
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '6px 8px',
              fontFamily: 'var(--font)',
              fontSize: 9,
              color: 'var(--text-label)',
              lineHeight: 1.8,
            }}>
              {[0, 1, 2].map((row) => (
                <div key={row}>
                  [{matrix.slice(row * 3, row * 3 + 3).map((v) => v.toFixed(6)).join('  ')}]
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button className="btn-sm" style={{ flex: 1 }} onClick={handleApply}>
              Apply in place
            </button>
            <button className="btn-sm" style={{ flex: 1 }} onClick={handleAddConverted}>
              Add as new LUT
            </button>
          </div>

          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.4 }}>
            Both spaces share D65 white point — no chromatic adaptation applied.
          </div>
        </>
      )}
    </div>
  );
};
