import React, { useEffect } from 'react';
import { useAppStore, selectActiveLut, selectActiveDiagnostics } from '../../store/index';
import { computeDiagnostics } from '../../core/analysis/diagnostics';
import type { LutDiagnostics } from '../../core/lut/types';
import { HelpTip } from '../ui/HelpTip';

const Metric: React.FC<{ label: string; value: string | number; warn?: boolean; ok?: boolean }> = ({
  label, value, warn, ok
}) => (
  <div className={`metric-row ${warn ? 'metric-warn' : ok ? 'metric-ok' : ''}`}>
    <span className="metric-label">{label}</span>
    <span className="metric-value">{value}</span>
  </div>
);

const DisplacementHistogram: React.FC<{ histogram: Float32Array; max: number }> = ({ histogram, max: _max }) => {
  return (
    <div className="histogram">
      {Array.from(histogram).map((v, i) => (
        <div
          key={i}
          className="hist-bar"
          style={{ height: `${Math.round(v * 100)}%` }}
          title={`Bin ${i}: ${(v * 100).toFixed(1)}%`}
        />
      ))}
    </div>
  );
};

export const DiagnosticsPanel: React.FC = () => {
  const activeLutEntry = useAppStore(selectActiveLut);
  const diagnostics = useAppStore(selectActiveDiagnostics);
  const cacheDiagnostics = useAppStore((s) => s.cacheDiagnostics);
  const activeLutId = useAppStore((s) => s.activeLutId);

  // Compute diagnostics when active LUT changes
  useEffect(() => {
    if (!activeLutEntry || !activeLutId) return;
    if (diagnostics && diagnostics.lutId === activeLutId) return;

    // Compute in a rAF to avoid blocking renders
    requestAnimationFrame(() => {
      const diag = computeDiagnostics(activeLutEntry.lut, activeLutId);
      cacheDiagnostics(activeLutId, diag);
    });
  }, [activeLutEntry, activeLutId, diagnostics, cacheDiagnostics]);

  if (!activeLutEntry) {
    return (
      <div className="panel-empty">
        <span>No LUT loaded</span>
      </div>
    );
  }

  if (!diagnostics) {
    return <div className="panel-loading">Computing diagnostics…</div>;
  }

  const d: LutDiagnostics = diagnostics;

  return (
    <div className="diagnostics-panel">
      <div className="ctrl-section-title">LUT Info<HelpTip text="Basic metadata about the loaded LUT — its type, grid size, and the input range it was designed for (usually 0 to 1)." align="right" /></div>
      <Metric label="Type" value={d.is1D ? '1D' : '3D'} />
      <Metric label="Size" value={d.is1D ? `${d.size}` : `${d.size}³ (${d.size ** 3} nodes)`} />
      <Metric label="Domain Min" value={d.domainMin.map((v) => v.toFixed(4)).join(', ')} />
      <Metric label="Domain Max" value={d.domainMax.map((v) => v.toFixed(4)).join(', ')} />

      <div className="ctrl-section-title">Displacement from Identity<HelpTip text="How far each output node has moved from its original neutral position. A displacement of 0 means the LUT does nothing at that point. High max displacement means the LUT makes dramatic changes." align="right" /></div>
      <Metric label="Min" value={d.displacementMin.toFixed(6)} />
      <Metric label="Max" value={d.displacementMax.toFixed(6)} warn={d.displacementMax > 0.5} />
      <Metric label="Mean" value={d.displacementMean.toFixed(6)} />
      <Metric label="Std Dev" value={d.displacementStdDev.toFixed(6)} />

      <div className="ctrl-section-title">Displacement Distribution<HelpTip text="A histogram showing how many nodes have each level of displacement. Tall bars on the left = most nodes barely move. Tall bars on the right = most nodes shift dramatically." align="right" /></div>
      <DisplacementHistogram histogram={d.displacementHistogram} max={d.displacementMax} />

      <div className="ctrl-section-title">Output Ranges<HelpTip text="The minimum and maximum values the LUT outputs for each channel. Values outside [0, 1] will be clipped by most renderers and can cause blown-out highlights or crushed shadows." align="right" /></div>
      <Metric label="R" value={`${d.rOutputMin.toFixed(4)} → ${d.rOutputMax.toFixed(4)}`} warn={d.rOutputMin < 0 || d.rOutputMax > 1} />
      <Metric label="G" value={`${d.gOutputMin.toFixed(4)} → ${d.gOutputMax.toFixed(4)}`} warn={d.gOutputMin < 0 || d.gOutputMax > 1} />
      <Metric label="B" value={`${d.bOutputMin.toFixed(4)} → ${d.bOutputMax.toFixed(4)}`} warn={d.bOutputMin < 0 || d.bOutputMax > 1} />

      <div className="ctrl-section-title">Clipping<HelpTip text="Number of LUT nodes with output values outside the legal [0, 1] range. Even one clipped node can cause visible artefacts in images — colours that should look smooth will abruptly hit a wall." align="right" /></div>
      <Metric label="Below 0" value={d.clippedBelow} warn={d.clippedBelow > 0} ok={d.clippedBelow === 0} />
      <Metric label="Above 1" value={d.clippedAbove} warn={d.clippedAbove > 0} ok={d.clippedAbove === 0} />

      <div className="ctrl-section-title">Neutral Axis<HelpTip text="How much the LUT shifts grey (equal R=G=B) values toward a colour cast. A deviation of 0 means pure greys stay grey. A high deviation means the LUT tints your grey tones." align="right" /></div>
      <Metric label="Max deviation" value={d.neutralAxisMaxDeviation.toFixed(6)} warn={d.neutralAxisMaxDeviation > 0.01} ok={d.neutralAxisMaxDeviation < 0.001} />
      <Metric label="Mean deviation" value={d.neutralAxisMeanDeviation.toFixed(6)} />

      {d.is1D && (
        <>
          <div className="ctrl-section-title">Monotonicity (1D)</div>
          <Metric label="R monotonic" value={d.rMonotonic ? 'Yes' : 'No'} ok={d.rMonotonic} warn={!d.rMonotonic} />
          <Metric label="G monotonic" value={d.gMonotonic ? 'Yes' : 'No'} ok={d.gMonotonic} warn={!d.gMonotonic} />
          <Metric label="B monotonic" value={d.bMonotonic ? 'Yes' : 'No'} ok={d.bMonotonic} warn={!d.bMonotonic} />
        </>
      )}

      <div className="ctrl-section-title">Quality<HelpTip text="Overall health indicators. Channel crossovers mean R, G, and B curves cross each other — usually fine for creative LUTs but can cause odd hue shifts. 'Likely invertible' means the LUT can probably be reversed without too much error." align="right" /></div>
      <Metric label="Channel crossovers" value={d.hasCrossovers ? 'Detected' : 'None'} warn={d.hasCrossovers} ok={!d.hasCrossovers} />
      <Metric label="Likely invertible" value={d.likelyInvertible ? 'Yes' : 'No'} ok={d.likelyInvertible} warn={!d.likelyInvertible} />
    </div>
  );
};
