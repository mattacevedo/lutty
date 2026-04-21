/**
 * LUT editing controls panel.
 *
 * Sliders update the LUT live on every change, with the undo snapshot
 * committed only when the user releases the slider (pointer-up).
 * This keeps history clean — one undo step per drag gesture.
 */

import React, { useState, useRef, useCallback } from 'react';
import { useAppStore, selectActiveLut, selectCanUndo, selectCanRedo } from '../../store/index';
import { HelpTip } from '../ui/HelpTip';
import { applyGamma, applySaturation, applyContrast, applyGainOffset, applyHueRotation, clampOutputs } from '../../core/analysis/editing';
import { blendWithIdentity } from '../../core/math/composition';
import { makeIdentity3D } from '../../core/lut/identity';
import { resample3D } from '../../core/math/resampling';
import { downloadCube, download3DL } from '../../core/lut/serializer';
import { invertLut3D } from '../../core/math/inversion';
import { decomposeLut } from '../../core/analysis/decomposition';
import type { Lut3D } from '../../core/lut/types';

// ─── Live slider hook ─────────────────────────────────────────────────────────

/**
 * Returns slider props that apply a transform live on drag and commit to
 * history exactly once on pointer-up.
 *
 * @param value         controlled slider value
 * @param setValue      state setter for the slider
 * @param apply         function(baseData, currentValue) → new Float32Array
 * @param label         undo label
 */
function useLiveSlider(
  value: number,
  setValue: (v: number) => void,
  apply: (base: Float32Array, v: number) => Float32Array,
  label: string,
  getLut: () => Lut3D | null,
  setLutDataDirect: (id: string, data: Float32Array) => void,
  commitLutEdit: (id: string, newData: Float32Array, prevData: Float32Array, label: string) => void,
  getActiveLutId: () => string | null,
) {
  // Snapshot of LUT data at the moment the drag started
  const baseRef = useRef<Float32Array | null>(null);

  const onPointerDown = useCallback(() => {
    const lut = getLut();
    if (!lut) return;
    baseRef.current = new Float32Array(lut.data);
  }, [getLut]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setValue(v);
    const id = getActiveLutId();
    const base = baseRef.current;
    if (!id || !base) return;
    const newData = apply(base, v);
    setLutDataDirect(id, newData);
  }, [setValue, apply, getActiveLutId, setLutDataDirect]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLInputElement>) => {
    const v = parseFloat((e.target as HTMLInputElement).value);
    const id = getActiveLutId();
    const base = baseRef.current;
    if (!id || !base) return;
    const newData = apply(base, v);
    commitLutEdit(id, newData, base, `${label}(${v.toFixed(3)})`);
    baseRef.current = null;
  }, [apply, label, getActiveLutId, commitLutEdit]);

  return { onPointerDown, onChange, onPointerUp };
}

// ─── Component ────────────────────────────────────────────────────────────────

export const EditControls: React.FC = () => {
  const activeLutEntry = useAppStore(selectActiveLut);
  const updateLutData = useAppStore((s) => s.updateLutData);
  const setLutDataDirect = useAppStore((s) => s.setLutDataDirect);
  const commitLutEdit = useAppStore((s) => s.commitLutEdit);
  const addLut = useAppStore((s) => s.addLut);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore(selectCanUndo);
  const canRedo = useAppStore(selectCanRedo);
  const activeLutId = useAppStore((s) => s.activeLutId);

  const [gamma, setGamma] = useState(1.0);
  const [saturation, setSaturation] = useState(1.0);
  const [contrast, setContrast] = useState(1.0);
  const [pivot, setPivot] = useState(0.435);
  const [strength, setStrength] = useState(1.0);
  const [hueAngle, setHueAngle] = useState(0);
  const [gainR, setGainR] = useState(1.0);
  const [gainG, setGainG] = useState(1.0);
  const [gainB, setGainB] = useState(1.0);
  const [offsetR, setOffsetR] = useState(0.0);
  const [offsetG, setOffsetG] = useState(0.0);
  const [offsetB, setOffsetB] = useState(0.0);
  const [resampleSize, setResampleSize] = useState(33);
  const [invertWarning, setInvertWarning] = useState('');
  const [exportFormat, setExportFormat] = useState<'cube' | '3dl'>('cube');

  const lut3D = activeLutEntry?.lut.type === '3D' ? (activeLutEntry.lut as Lut3D) : null;

  // Stable getters for useLiveSlider (avoid stale closures)
  const getLut = useCallback(() =>
    (useAppStore.getState().luts.find(l => l.id === useAppStore.getState().activeLutId)?.lut as Lut3D | undefined) ?? null
  , []);
  const getActiveLutId = useCallback(() => useAppStore.getState().activeLutId, []);

  // ─── Per-slider live props ──────────────────────────────────────────────────

  const gammaSlider = useLiveSlider(
    gamma, setGamma,
    (base, v) => applyGamma({ ...lut3D!, data: base }, v).data,
    'gamma', getLut, setLutDataDirect, commitLutEdit, getActiveLutId,
  );

  const satSlider = useLiveSlider(
    saturation, setSaturation,
    (base, v) => applySaturation({ ...lut3D!, data: base }, v).data,
    'saturation', getLut, setLutDataDirect, commitLutEdit, getActiveLutId,
  );

  const contrastSlider = useLiveSlider(
    contrast, setContrast,
    (base, v) => applyContrast({ ...lut3D!, data: base }, v, pivot).data,
    'contrast', getLut, setLutDataDirect, commitLutEdit, getActiveLutId,
  );

  const pivotSlider = useLiveSlider(
    pivot, setPivot,
    (base, v) => applyContrast({ ...lut3D!, data: base }, contrast, v).data,
    'contrast-pivot', getLut, setLutDataDirect, commitLutEdit, getActiveLutId,
  );

  const strengthSlider = useLiveSlider(
    strength, setStrength,
    (base, v) => blendWithIdentity({ ...lut3D!, data: base }, v).data,
    'strength', getLut, setLutDataDirect, commitLutEdit, getActiveLutId,
  );

  const hueSlider = useLiveSlider(
    hueAngle, setHueAngle,
    (base, v) => applyHueRotation({ ...lut3D!, data: base }, v).data,
    'hue', getLut, setLutDataDirect, commitLutEdit, getActiveLutId,
  );

  // Gain/offset sliders — all six share the same apply fn
  const makeGainSlider = (
    val: number, setVal: (v: number) => void, label: string,
    getR: () => number, getG: () => number, getB: () => number,
    getOR: () => number, getOG: () => number, getOB: () => number,
    overrideIndex: 'gainR'|'gainG'|'gainB'|'offsetR'|'offsetG'|'offsetB',
  ) => useLiveSlider(
    val, setVal,
    (base, v) => {
      const gains  = { gainR: getR(),  gainG: getG(),  gainB: getB()  };
      const offsets= { offsetR: getOR(), offsetG: getOG(), offsetB: getOB() };
      const merged = { ...gains, ...offsets, [overrideIndex]: v };
      return applyGainOffset(
        { ...lut3D!, data: base },
        merged.gainR, merged.gainG, merged.gainB,
        merged.offsetR, merged.offsetG, merged.offsetB,
      ).data;
    },
    label, getLut, setLutDataDirect, commitLutEdit, getActiveLutId,
  );

  const gainRSlider  = makeGainSlider(gainR,  setGainR,  'gain-r',   () => gainR,  () => gainG,  () => gainB,  () => offsetR, () => offsetG, () => offsetB, 'gainR');
  const gainGSlider  = makeGainSlider(gainG,  setGainG,  'gain-g',   () => gainR,  () => gainG,  () => gainB,  () => offsetR, () => offsetG, () => offsetB, 'gainG');
  const gainBSlider  = makeGainSlider(gainB,  setGainB,  'gain-b',   () => gainR,  () => gainG,  () => gainB,  () => offsetR, () => offsetG, () => offsetB, 'gainB');
  const offRSlider   = makeGainSlider(offsetR,setOffsetR,'offset-r', () => gainR,  () => gainG,  () => gainB,  () => offsetR, () => offsetG, () => offsetB, 'offsetR');
  const offGSlider   = makeGainSlider(offsetG,setOffsetG,'offset-g', () => gainR,  () => gainG,  () => gainB,  () => offsetR, () => offsetG, () => offsetB, 'offsetG');
  const offBSlider   = makeGainSlider(offsetB,setOffsetB,'offset-b', () => gainR,  () => gainG,  () => gainB,  () => offsetR, () => offsetG, () => offsetB, 'offsetB');

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const sl = (
    label: string,
    value: number,
    min: number, max: number, step: number,
    sliderProps: ReturnType<typeof useLiveSlider>,
    extra?: React.ReactNode,
    tip?: string,
  ) => (
    <label className="ctrl-row">
      <span className="ctrl-label">{label}{tip && <HelpTip text={tip} align="right" />}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        {...sliderProps}
        className="ctrl-slider"
      />
      <span className="ctrl-value">{value.toFixed(step < 0.1 ? 3 : 2)}</span>
      {extra}
    </label>
  );

  const sectionTitle = (title: string, tip?: string) => (
    <div className="ctrl-section-title">
      {title}{tip && <HelpTip text={tip} align="right" />}
    </div>
  );

  if (!activeLutEntry) return <div className="panel-empty"><span>No LUT loaded</span></div>;
  if (!lut3D) return <div className="panel-empty"><span>Edit controls require a 3D LUT</span></div>;

  return (
    <div className="edit-controls">
      {/* History */}
      {sectionTitle('History', 'Step backwards or forwards through your edits. Each slider drag and button press creates one undo step.')}
      <div className="ctrl-row">
        <button className="btn-sm" onClick={undo} disabled={!canUndo} title="Ctrl+Z">↩ Undo</button>
        <button className="btn-sm" onClick={redo} disabled={!canRedo} title="Ctrl+Y">↪ Redo</button>
      </div>

      {/* LUT Strength */}
      {sectionTitle('LUT Strength', 'Blend between the original LUT and a plain identity (no change). At 1.0 the full LUT is applied; at 0.0 the LUT has no effect.')}
      {sl('Blend', strength, 0, 1, 0.01, strengthSlider)}

      {/* Gamma */}
      {sectionTitle('Gamma', 'Raises every output value to the power 1/gamma. Values above 1.0 brighten midtones; below 1.0 darkens them. 1.0 = no change.')}
      {sl('Gamma', gamma, 0.1, 4, 0.01, gammaSlider)}

      {/* Saturation */}
      {sectionTitle('Saturation', 'Controls how vivid the colors are. 1.0 = no change. 0.0 = fully desaturated (greyscale). Values above 1.0 boost color intensity.')}
      {sl('Saturation', saturation, 0, 3, 0.01, satSlider)}

      {/* Contrast */}
      {sectionTitle('Contrast', 'Expands or compresses the tonal range around the pivot point. Values above 1.0 increase contrast (deeper shadows, brighter highlights).')}
      {sl('Contrast', contrast, 0.1, 4, 0.01, contrastSlider)}
      {sl('Pivot', pivot, 0, 1, 0.005, pivotSlider, undefined, 'The brightness level that stays fixed when contrast is adjusted. Everything above it gets brighter; everything below it gets darker. Default 0.435 is a common mid-grey in log footage.')}

      {/* Hue Rotation */}
      {sectionTitle('Hue Rotation', 'Shifts all colors around the color wheel by the specified number of degrees. Useful for correcting a colour cast or creative hue shifts.')}
      {sl('Angle (°)', hueAngle, -180, 180, 1, hueSlider)}

      {/* Per-channel Slope / Offset */}
      {sectionTitle('Slope / Offset', 'Per-channel linear transform: output = input × slope + offset. Slope scales the signal (like gain); offset adds or subtracts a constant (like lift/black-level). This affects the entire tonal range uniformly.')}
      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, fontFamily: 'var(--font)' }}>
        out = in × slope + offset
      </div>
      <div className="gain-grid">
        {([
          ['R', gainR, gainRSlider, offsetR, offRSlider],
          ['G', gainG, gainGSlider, offsetG, offGSlider],
          ['B', gainB, gainBSlider, offsetB, offBSlider],
        ] as const).map(([ch, g, gProps, o, oProps]) => (
          <React.Fragment key={ch}>
            <span className="gain-ch">{ch}</span>
            <label className="ctrl-row compact">
              <span className="ctrl-label" style={{ flex: '0 0 40px' }}>Slope</span>
              <input type="range" min={0} max={3} step={0.01} value={g as number}
                {...(gProps as ReturnType<typeof useLiveSlider>)} className="ctrl-slider" />
              <span className="ctrl-value">{(g as number).toFixed(2)}</span>
            </label>
            <label className="ctrl-row compact">
              <span className="ctrl-label" style={{ flex: '0 0 40px' }}>Offset</span>
              <input type="range" min={-0.5} max={0.5} step={0.005} value={o as number}
                {...(oProps as ReturnType<typeof useLiveSlider>)} className="ctrl-slider" />
              <span className="ctrl-value">{(o as number).toFixed(3)}</span>
            </label>
          </React.Fragment>
        ))}
      </div>

      {/* Discrete operations (still button-driven) */}
      {sectionTitle('Clamp', 'Force all output values into the valid [0, 1] range. Any values that were outside that range (over-exposed highlights or below-zero shadows) get pinned to the nearest boundary.')}
      <button className="btn-sm full" onClick={() => {
        const result = clampOutputs(lut3D);
        updateLutData(activeLutEntry.id, result.data, 'clamp(0,1)');
      }}>Clamp Outputs to [0, 1]</button>

      {sectionTitle('Resample', 'Change the LUT grid resolution. A 33³ LUT has 33 steps per channel (35,937 nodes total). Going larger gives smoother results but produces a bigger file; going smaller reduces precision but is faster to process.')}
      <label className="ctrl-row">
        <span className="ctrl-label">Target Size</span>
        <select value={resampleSize} onChange={(e) => setResampleSize(parseInt(e.target.value))} className="ctrl-select">
          {[17, 33, 65].map((s) => <option key={s} value={s}>{s}³</option>)}
        </select>
      </label>
      <button className="btn-sm full" onClick={() => {
        const result = resample3D(lut3D, resampleSize);
        updateLutData(activeLutEntry.id, result.data, `resample(${resampleSize})`);
      }}>Resample LUT</button>

      {sectionTitle('Utilities', 'Extra tools for working with the active LUT.')}
      <button className="btn-sm full" onClick={() => {
        const id = makeIdentity3D(lut3D.size);
        addLut({ id: crypto.randomUUID(), name: `Identity ${lut3D.size}³`, lut: id, loadedAt: Date.now() });
      }}>Generate Identity Copy</button>

      <button className="btn-sm full" onClick={() => {
        const { lut, warnings, maxError } = invertLut3D(lut3D);
        setInvertWarning(warnings.join(' ') + ` Max error: ${maxError.toFixed(5)}`);
        addLut({ id: crypto.randomUUID(), name: `Inverse of ${activeLutEntry.name}`, lut, loadedAt: Date.now() });
      }}>Approximate Inversion</button>
      {invertWarning && <div className="warn-msg">{invertWarning}</div>}

      {sectionTitle('Decompose', 'Splits the LUT into two separate LUTs: one that only affects brightness/contrast (luminance), and one that only affects color (hue/saturation). Useful for inspecting or sharing just part of a look.')}
      <button className="btn-sm full" onClick={() => {
        const { luminanceLut, colorLut, warnings } = decomposeLut(lut3D);
        addLut({ id: crypto.randomUUID(), name: `${activeLutEntry.name} — Luminance`, lut: luminanceLut, loadedAt: Date.now() });
        addLut({ id: crypto.randomUUID(), name: `${activeLutEntry.name} — Color`, lut: colorLut, loadedAt: Date.now() });
        if (warnings.length > 0) setInvertWarning(warnings.join(' '));
      }}>Extract Luminance + Color Components</button>

      {sectionTitle('Export', 'Download the current LUT as a file. .cube is the most widely supported format (Adobe, DaVinci Resolve, Final Cut). .3dl is used by Autodesk Flame and older Lustre systems.')}
      <label className="ctrl-row">
        <span className="ctrl-label">Format</span>
        <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as 'cube' | '3dl')} className="ctrl-select">
          <option value="cube">.cube (Adobe/Resolve)</option>
          <option value="3dl">.3dl (Autodesk/Flame)</option>
        </select>
      </label>
      <button className="btn-sm full" onClick={() => {
        if (!activeLutId) return;
        if (exportFormat === '3dl') {
          if (lut3D) download3DL(lut3D, activeLutEntry.name + '.3dl');
        } else {
          downloadCube(activeLutEntry.lut, activeLutEntry.name + '.cube');
        }
      }}>Export {exportFormat === 'cube' ? '.cube' : '.3dl'} (Ctrl+E)</button>
    </div>
  );
};
