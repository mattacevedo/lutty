/**
 * ASC CDL editor panel.
 * Slope / Offset / Power per-channel + Saturation.
 * Can load .cdl / .cc / .ccc files and export to any of those formats.
 */

import React, { useState, useRef, useCallback } from 'react';
import { useAppStore, selectActiveLut } from '../../store/index';
import { HelpTip } from '../ui/HelpTip';
import { applyCdlToLut } from '../../core/cdl/apply';
import { parseCdlFile } from '../../core/cdl/parser';
import { downloadCdl } from '../../core/cdl/serializer';
import type { CdlNode } from '../../core/cdl/types';
import { defaultCdlNode } from '../../core/cdl/types';
import type { Lut3D } from '../../core/lut/types';

function NumInput({
  value, onChange, min = -Infinity, max = Infinity, step = 0.001,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      className="num-input"
      value={value.toFixed(4)}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
      }}
    />
  );
}

export const CdlPanel: React.FC = () => {
  const activeLutEntry = useAppStore(selectActiveLut);
  const updateLutData = useAppStore((s) => s.updateLutData);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cdl, setCdl] = useState<CdlNode>(defaultCdlNode());
  const [gang, setGang] = useState(false);
  const [exportFormat, setExportFormat] = useState<'cc' | 'cdl' | 'ccc'>('cc');
  const [loadError, setLoadError] = useState('');

  const lut3D = activeLutEntry?.lut.type === '3D' ? (activeLutEntry.lut as Lut3D) : null;

  // Gang helper — when gang is on, changing one channel changes all three
  const setSlope = useCallback((ch: 0 | 1 | 2, v: number) => {
    setCdl((prev) => {
      const slope = [...prev.slope] as [number, number, number];
      if (gang) { slope[0] = v; slope[1] = v; slope[2] = v; }
      else slope[ch] = v;
      return { ...prev, slope };
    });
  }, [gang]);

  const setOffset = useCallback((ch: 0 | 1 | 2, v: number) => {
    setCdl((prev) => {
      const offset = [...prev.offset] as [number, number, number];
      if (gang) { offset[0] = v; offset[1] = v; offset[2] = v; }
      else offset[ch] = v;
      return { ...prev, offset };
    });
  }, [gang]);

  const setPower = useCallback((ch: 0 | 1 | 2, v: number) => {
    setCdl((prev) => {
      const power = [...prev.power] as [number, number, number];
      if (gang) { power[0] = v; power[1] = v; power[2] = v; }
      else power[ch] = v;
      return { ...prev, power };
    });
  }, [gang]);

  const handleApply = () => {
    if (!activeLutEntry || !lut3D) return;
    const result = applyCdlToLut(lut3D, cdl);
    updateLutData(activeLutEntry.id, result.data, 'cdl');
  };

  const handleReset = () => setCdl(defaultCdlNode());

  const handleLoadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setLoadError('');
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCdlFile(text, file.name);
      if (parsed.nodes.length > 0) setCdl(parsed.nodes[0]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
    e.target.value = '';
  };

  const CH_COLORS = ['#f55', '#5f5', '#55f'] as const;
  const CH_LABELS = ['R', 'G', 'B'] as const;

  const row = (label: string, values: [number, number, number], setFn: (ch: 0|1|2, v: number) => void, min: number, max: number) => (
    <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 1fr 1fr', gap: 4, alignItems: 'center', marginBottom: 3 }}>
      <span style={{ fontSize: 10, color: 'var(--text-label)' }}>{label}</span>
      {([0, 1, 2] as const).map((ch) => (
        <div key={ch} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 8, color: CH_COLORS[ch], fontFamily: 'var(--font)' }}>{CH_LABELS[ch]}</span>
          <NumInput value={values[ch]} onChange={(v) => setFn(ch, v)} min={min} max={max} />
        </div>
      ))}
    </div>
  );

  if (!activeLutEntry) return <div className="panel-empty"><span>No LUT loaded</span></div>;
  if (!lut3D) return <div className="panel-empty"><span>CDL requires a 3D LUT</span></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="ctrl-section-title">
        ASC CDL
        <HelpTip text="ASC CDL (Color Decision List) is the industry-standard format for basic colour corrections. It defines Slope, Offset, Power (like contrast), and Saturation. Used on almost every professional film and TV production." align="right" />
      </div>

      <label className="ctrl-row ctrl-toggle">
        <span className="ctrl-label">Gang channels<HelpTip text="When Gang is ON, adjusting any one channel (R, G, or B) automatically sets all three channels to the same value. Handy for making neutral corrections." align="right" /></span>
        <button className={`toggle-btn ${gang ? 'active' : ''}`} onClick={() => setGang((v) => !v)}>
          {gang ? 'ON' : 'OFF'}
        </button>
      </label>

      <div style={{ marginTop: 6 }}>
        {row('Slope', cdl.slope,  setSlope,  0,    4)}
        {row('Offset', cdl.offset, setOffset, -1,   1)}
        {row('Power',  cdl.power,  setPower,  0.01, 4)}
      </div>

      <div style={{ fontSize: 9, color: 'var(--text-dim)', margin: '2px 0 4px', fontFamily: 'var(--font)' }}>
        out = clamp(in × slope + offset) ^ power
      </div>

      <label className="ctrl-row" style={{ marginTop: 4 }}>
        <span className="ctrl-label">Saturation<HelpTip text="Scales color intensity after SOP is applied. Uses Rec.709 luma weights, which match human brightness perception. 1.0 = no change; 0.0 = greyscale." align="right" /></span>
        <NumInput value={cdl.saturation} onChange={(v) => setCdl((p) => ({ ...p, saturation: v }))} min={0} max={4} />
      </label>

      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <button className="btn-sm" style={{ flex: 1 }} onClick={handleApply}>Apply to LUT</button>
        <button className="btn-sm" onClick={handleReset}>Reset</button>
      </div>

      <div className="ctrl-section-title" style={{ marginTop: 10 }}>
        Load CDL File
        <HelpTip text="Import a CDL correction from an existing .cc, .cdl, or .ccc file — the kind typically exported by on-set colour tools, DITs, or Resolve. The values will load into the fields above ready to apply." align="right" />
      </div>
      <button className="btn-sm full" onClick={() => fileInputRef.current?.click()}>
        Load .cdl / .cc / .ccc
      </button>
      <input ref={fileInputRef} type="file" accept=".cdl,.cc,.ccc" style={{ display: 'none' }} onChange={handleLoadFile} />
      {loadError && <div className="error-msg">{loadError}</div>}

      <div className="ctrl-section-title" style={{ marginTop: 10 }}>
        Export CDL
        <HelpTip text="Save the current Slope/Offset/Power/Saturation values as a standalone CDL file that other applications can read." align="right" />
      </div>
      <label className="ctrl-row">
        <span className="ctrl-label">Format</span>
        <select className="ctrl-select" value={exportFormat} onChange={(e) => setExportFormat(e.target.value as typeof exportFormat)}>
          <option value="cc">.cc (ColorCorrection)</option>
          <option value="cdl">.cdl (ColorDecisionList)</option>
          <option value="ccc">.ccc (Collection)</option>
        </select>
      </label>
      <button className="btn-sm full" onClick={() => downloadCdl(cdl, exportFormat)}>
        Export .{exportFormat}
      </button>
    </div>
  );
};
