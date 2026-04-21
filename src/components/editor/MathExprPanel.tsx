/**
 * Custom math expression editor.
 * Lets users apply arbitrary per-channel formulas to a 3D LUT.
 * Variables: r, g, b (current output values [0..1]), i (node index), n (total nodes), Math.
 */

import React, { useState, useCallback } from 'react';
import { useAppStore, selectActiveLut } from '../../store/index';
import { applyMathExpr, validateMathExpr } from '../../core/analysis/mathExpr';
import type { Lut3D } from '../../core/lut/types';
import { HelpTip } from '../ui/HelpTip';

const EXAMPLES = [
  { label: 'Boost reds', r: 'r * 1.2', g: 'g', b: 'b' },
  { label: 'Lift shadows', r: 'r * 0.9 + 0.05', g: 'g * 0.9 + 0.05', b: 'b * 0.9 + 0.05' },
  { label: 'Gamma 2.2 encode', r: 'Math.pow(Math.max(0,r), 1/2.2)', g: 'Math.pow(Math.max(0,g), 1/2.2)', b: 'Math.pow(Math.max(0,b), 1/2.2)' },
  { label: 'Invert', r: '1 - r', g: '1 - g', b: '1 - b' },
  { label: 'Clamp', r: 'Math.min(1, Math.max(0, r))', g: 'Math.min(1, Math.max(0, g))', b: 'Math.min(1, Math.max(0, b))' },
];

interface ExprInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  color: string;
}

const ExprInput: React.FC<ExprInputProps> = ({ label, value, onChange, color }) => {
  const validation = validateMathExpr(value);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ fontFamily: 'var(--font)', fontWeight: 'bold', color, width: 12 }}>{label}</span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>= f(r, g, b, i, n)</span>
        {validation.valid
          ? <span style={{ fontSize: 9, color: 'var(--ok)', marginLeft: 'auto' }}>✓</span>
          : <span style={{ fontSize: 9, color: 'var(--danger)', marginLeft: 'auto' }}>✗</span>
        }
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          background: 'var(--bg-surface)',
          border: `1px solid ${validation.valid ? 'var(--border)' : 'var(--danger)'}`,
          borderRadius: 'var(--radius)',
          color: 'var(--text)',
          fontFamily: 'var(--font)',
          fontSize: 11,
          padding: '3px 6px',
        }}
      />
      {!validation.valid && validation.error && (
        <div style={{ fontSize: 9, color: 'var(--danger)', marginTop: 2, wordBreak: 'break-word' }}>
          {validation.error}
        </div>
      )}
    </div>
  );
};

export const MathExprPanel: React.FC = () => {
  const activeLutEntry = useAppStore(selectActiveLut);
  const updateLutData = useAppStore((s) => s.updateLutData);

  const [exprR, setExprR] = useState('r');
  const [exprG, setExprG] = useState('g');
  const [exprB, setExprB] = useState('b');
  const [master, setMaster] = useState('');
  const [useMaster, setUseMaster] = useState(false);
  const [applyError, setApplyError] = useState('');

  const lut3D = activeLutEntry?.lut.type === '3D' ? (activeLutEntry.lut as Lut3D) : null;

  const effectiveR = useMaster && master ? master : exprR;
  const effectiveG = useMaster && master ? master : exprG;
  const effectiveB = useMaster && master ? master : exprB;

  const allValid =
    validateMathExpr(effectiveR).valid &&
    validateMathExpr(effectiveG).valid &&
    validateMathExpr(effectiveB).valid;

  const handleApply = useCallback(() => {
    if (!activeLutEntry || !lut3D) return;
    setApplyError('');
    try {
      const result = applyMathExpr(lut3D, effectiveR, effectiveG, effectiveB);
      updateLutData(activeLutEntry.id, result.data, `mathExpr`);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    }
  }, [activeLutEntry, lut3D, effectiveR, effectiveG, effectiveB, updateLutData]);

  if (!activeLutEntry) return <div className="panel-empty"><span>No LUT loaded</span></div>;
  if (!lut3D) return <div className="panel-empty"><span>Math expressions require a 3D LUT</span></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="ctrl-section-title">
        Per-Channel Expressions
        <HelpTip text="Write a JavaScript math formula to transform each colour node in the LUT. The variables r, g, b hold the node's current output values (0 to 1). You have access to all Math functions (Math.pow, Math.sin, etc.). The formula is evaluated for every node in the LUT when you click Apply." align="right" />
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6, lineHeight: 1.5 }}>
        Variables: <span style={{ fontFamily: 'var(--font)', color: 'var(--text-label)' }}>r g b</span> (current outputs, [0..1]),{' '}
        <span style={{ fontFamily: 'var(--font)', color: 'var(--text-label)' }}>i</span> (node index),{' '}
        <span style={{ fontFamily: 'var(--font)', color: 'var(--text-label)' }}>n</span> (total nodes),{' '}
        <span style={{ fontFamily: 'var(--font)', color: 'var(--text-label)' }}>Math</span>
      </div>

      <label className="ctrl-row ctrl-toggle" style={{ marginBottom: 4 }}>
        <span className="ctrl-label">Master mode<HelpTip text="Apply the same formula to R, G, and B simultaneously instead of writing a separate expression for each channel." align="right" /></span>
        <button
          className={`toggle-btn ${useMaster ? 'active' : ''}`}
          onClick={() => setUseMaster((v) => !v)}
        >{useMaster ? 'ON' : 'OFF'}</button>
      </label>

      {useMaster ? (
        <ExprInput label="M" value={master} onChange={setMaster} color="var(--text)" />
      ) : (
        <>
          <ExprInput label="R" value={exprR} onChange={setExprR} color="#f55" />
          <ExprInput label="G" value={exprG} onChange={setExprG} color="#5f5" />
          <ExprInput label="B" value={exprB} onChange={setExprB} color="#55f" />
        </>
      )}

      <button className="btn-sm full" onClick={handleApply} disabled={!allValid} style={{ marginTop: 6 }}>
        Apply to LUT
      </button>
      {applyError && <div className="error-msg">{applyError}</div>}

      <div className="ctrl-section-title" style={{ marginTop: 10 }}>Examples</div>
      {EXAMPLES.map((ex) => (
        <button key={ex.label} className="btn-sm full" onClick={() => {
          setUseMaster(false);
          setExprR(ex.r);
          setExprG(ex.g);
          setExprB(ex.b);
        }}>{ex.label}</button>
      ))}
    </div>
  );
};
