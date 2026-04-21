/**
 * Interactive per-channel curve editor — live preview.
 *
 * The lattice updates in real time as control points are dragged.
 * No "Apply" step is needed.  "Revert" restores the LUT to the state
 * it had when this panel was opened (or when the last Revert was clicked).
 *
 * Pattern:
 *   openingDataRef = Float32Array snapshot taken when LUT ID first changes
 *   curves          = React state: control points for M / R / G / B
 *   useEffect([curves]) → apply(curves, openingData) → setLutDataDirect
 *   Revert → setLutDataDirect(openingData) + reset curves
 *
 * No infinite loop: setLutDataDirect updates luts[] → re-render →
 *   curves unchanged → effect [curves] does NOT re-fire.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore, selectActiveLut } from '../../store/index';
import { applyChannelCurves } from '../../core/analysis/applyCurves';
import { monotonicSpline } from '../../core/math/spline';
import type { ControlPoints } from '../../core/math/spline';
import type { Lut3D } from '../../core/lut/types';
import { HelpTip } from '../ui/HelpTip';

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'master' | 'r' | 'g' | 'b';
type AllCurves = Record<Channel, ControlPoints>;

const defaultCurves = (): AllCurves => ({
  master: [[0, 0], [1, 1]],
  r:      [[0, 0], [1, 1]],
  g:      [[0, 0], [1, 1]],
  b:      [[0, 0], [1, 1]],
});

const CHANNEL_COLORS: Record<Channel, string> = {
  master: '#aaaaaa',
  r:      '#ff5555',
  g:      '#55ee55',
  b:      '#5599ff',
};

const CHANNELS: Channel[] = ['master', 'r', 'g', 'b'];

// ─── Canvas geometry ──────────────────────────────────────────────────────────

const PAD         = 24;
const CANVAS_SIZE = 244;
const PLOT        = CANVAS_SIZE - PAD * 2;
const HIT_R       = 10;
const PT_R        =  5;

function toCanvas(x: number, y: number): [number, number] {
  return [PAD + x * PLOT, PAD + (1 - y) * PLOT];
}

function fromCanvas(cx: number, cy: number): [number, number] {
  return [(cx - PAD) / PLOT, 1 - (cy - PAD) / PLOT];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function insertSorted(pts: ControlPoints, x: number, y: number): [ControlPoints, number] {
  let idx = pts.findIndex((p) => p[0] > x);
  if (idx === -1) idx = pts.length;
  const next = [...pts] as ControlPoints;
  next.splice(idx, 0, [x, y]);
  return [next, idx];
}

function hitTest(pts: ControlPoints, cx: number, cy: number): number {
  let best = -1, bestD = HIT_R * HIT_R;
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = toCanvas(pts[i][0], pts[i][1]);
    const d = (px - cx) ** 2 + (py - cy) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────

function drawCanvas(
  ctx: CanvasRenderingContext2D,
  curves: AllCurves,
  active: Channel,
  hoveredIdx: number,
  draggingIdx: number,
) {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Grid
  ctx.strokeStyle = '#1c1c22';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = PAD + (i / 4) * PLOT;
    ctx.beginPath(); ctx.moveTo(v, PAD);  ctx.lineTo(v, PAD + PLOT); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD, v);  ctx.lineTo(PAD + PLOT, v); ctx.stroke();
  }

  // Identity diagonal
  ctx.strokeStyle = '#2a2a36';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(PAD, PAD + PLOT);
  ctx.lineTo(PAD + PLOT, PAD);
  ctx.stroke();
  ctx.setLineDash([]);

  // Ghost curves (inactive channels, dimmed)
  for (const ch of CHANNELS) {
    if (ch === active) continue;
    const pts = curves[ch];
    if (pts.length < 2) continue;
    const fn = monotonicSpline(pts);
    ctx.strokeStyle = CHANNEL_COLORS[ch];
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const [cx, cy] = toCanvas(t, clamp01(fn(t)));
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Active curve
  const activePts = curves[active];
  const activeFn  = monotonicSpline(activePts);
  ctx.strokeStyle = CHANNEL_COLORS[active];
  ctx.lineWidth   = 2;
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const [cx, cy] = toCanvas(t, clamp01(activeFn(t)));
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  }
  ctx.stroke();

  // Control points
  for (let i = 0; i < activePts.length; i++) {
    const [cx, cy] = toCanvas(activePts[i][0], activePts[i][1]);
    const isActive   = i === hoveredIdx || i === draggingIdx;
    const isEndpoint = i === 0 || i === activePts.length - 1;
    ctx.beginPath();
    ctx.arc(cx, cy, isActive ? PT_R + 2 : PT_R, 0, Math.PI * 2);
    ctx.fillStyle   = isActive ? '#ffffff' : CHANNEL_COLORS[active];
    ctx.globalAlpha = isEndpoint ? 0.7 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // Border
  ctx.strokeStyle = '#2a2a36';
  ctx.lineWidth   = 1;
  ctx.strokeRect(PAD, PAD, PLOT, PLOT);
}

// ─── Component ────────────────────────────────────────────────────────────────

export const CurveEditorPanel: React.FC = () => {
  const activeLutEntry   = useAppStore(selectActiveLut);
  const setLutDataDirect = useAppStore((s) => s.setLutDataDirect);

  const [curves, setCurves]               = useState<AllCurves>(defaultCurves);
  const [activeChannel, setActiveChannel] = useState<Channel>('master');
  const [hoveredIdx, setHoveredIdx]       = useState(-1);

  const draggingIdxRef  = useRef(-1);
  // Snapshot of LUT data taken when this LUT was first opened — used for Revert
  const openingDataRef  = useRef<Float32Array | null>(null);
  const prevLutIdRef    = useRef<string | null>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);

  const lut3D = activeLutEntry?.lut.type === '3D'
    ? (activeLutEntry.lut as Lut3D)
    : null;

  // ─── Snapshot opening data when LUT ID changes ─────────────────────────────
  useEffect(() => {
    const id = activeLutEntry?.id ?? null;
    if (id === prevLutIdRef.current) return;
    prevLutIdRef.current = id;

    // Read pre-preview state directly from store to avoid stale lut3D
    if (id) {
      const entry = useAppStore.getState().luts.find((l) => l.id === id);
      if (entry?.lut.type === '3D') {
        openingDataRef.current = new Float32Array((entry.lut as Lut3D).data);
      }
    } else {
      openingDataRef.current = null;
    }

    // Reset curves whenever we switch to a different LUT
    setCurves(defaultCurves());
    setHoveredIdx(-1);
    draggingIdxRef.current = -1;
  }, [activeLutEntry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Live preview: apply curves to opening data → setLutDataDirect ─────────
  // Runs only when curves change.  setLutDataDirect updates activeLutEntry
  // (new reference) but does NOT change curves → no infinite loop.
  useEffect(() => {
    const base = openingDataRef.current;
    const id   = prevLutIdRef.current;
    if (!base || !id || !lut3D) return;

    // Build a scratch Lut3D using the opening data as the base
    const baseLut: Lut3D = { ...lut3D, data: base };
    const result = applyChannelCurves(baseLut, curves.master, curves.r, curves.g, curves.b);
    setLutDataDirect(id, result.data);
  }, [curves]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Canvas draw after every render ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCanvas(ctx, curves, activeChannel, hoveredIdx, draggingIdxRef.current);
  });

  // ─── Global mouseup (ends drag even outside canvas) ────────────────────────
  useEffect(() => {
    const onUp = () => { draggingIdxRef.current = -1; };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  // ─── Canvas coordinate helper ───────────────────────────────────────────────
  const toCanvasPx = useCallback((e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    return [
      (e.clientX - rect.left) * (CANVAS_SIZE / rect.width),
      (e.clientY - rect.top)  * (CANVAS_SIZE / rect.height),
    ];
  }, []);

  // ─── Mouse handlers ─────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || e.ctrlKey) return;
    const [cx, cy] = toCanvasPx(e);
    const pts = curves[activeChannel];
    const hit = hitTest(pts, cx, cy);

    if (hit >= 0) {
      draggingIdxRef.current = hit;
      setHoveredIdx(hit);
      return;
    }

    // Add new point inside the plot area (not too close to the edges)
    const [dx, dy] = fromCanvas(cx, cy);
    if (dx < 0.01 || dx > 0.99 || dy < -0.05 || dy > 1.05) return;

    const [newPts, newIdx] = insertSorted(pts, clamp01(dx), clamp01(dy));
    setCurves((prev) => ({ ...prev, [activeChannel]: newPts }));
    draggingIdxRef.current = newIdx;
    setHoveredIdx(newIdx);
  }, [curves, activeChannel, toCanvasPx]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const [cx, cy] = toCanvasPx(e);
    const pts = curves[activeChannel];
    const idx = draggingIdxRef.current;

    if (idx >= 0) {
      const [nx, ny] = fromCanvas(cx, cy);
      const isEndpoint = idx === 0 || idx === pts.length - 1;
      const newX = isEndpoint
        ? pts[idx][0]   // endpoints: lock x position
        : Math.max(pts[idx - 1][0] + 0.002, Math.min(pts[idx + 1][0] - 0.002, nx));
      const newPts = [...pts] as ControlPoints;
      newPts[idx] = [newX, clamp01(ny)];
      setCurves((prev) => ({ ...prev, [activeChannel]: newPts }));
      setHoveredIdx(idx);
    } else {
      setHoveredIdx(hitTest(pts, cx, cy));
    }
  }, [curves, activeChannel, toCanvasPx]);

  const handleMouseLeave = useCallback(() => {
    if (draggingIdxRef.current < 0) setHoveredIdx(-1);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const [cx, cy] = toCanvasPx(e);
    const pts = curves[activeChannel];
    const hit = hitTest(pts, cx, cy);
    if (hit <= 0 || hit >= pts.length - 1) return;  // can't delete endpoints
    const newPts = pts.filter((_, i) => i !== hit) as ControlPoints;
    setCurves((prev) => ({ ...prev, [activeChannel]: newPts }));
    setHoveredIdx(-1);
    draggingIdxRef.current = -1;
  }, [curves, activeChannel, toCanvasPx]);

  // ─── Revert: restore LUT to opening state and reset all curves ─────────────
  const handleRevert = useCallback(() => {
    const base = openingDataRef.current;
    const id   = prevLutIdRef.current;
    if (!base || !id) return;
    setLutDataDirect(id, new Float32Array(base));
    setCurves(defaultCurves());
    setHoveredIdx(-1);
    draggingIdxRef.current = -1;
  }, [setLutDataDirect]);

  const handleResetChannel = useCallback(() => {
    setCurves((prev) => ({ ...prev, [activeChannel]: [[0, 0], [1, 1]] as ControlPoints }));
    setHoveredIdx(-1);
    draggingIdxRef.current = -1;
  }, [activeChannel]);

  // ─── Cursor ─────────────────────────────────────────────────────────────────
  const cursor = hoveredIdx >= 0
    ? (draggingIdxRef.current >= 0 ? 'grabbing' : 'grab')
    : 'crosshair';

  if (!activeLutEntry) return <div className="panel-empty"><span>No LUT loaded</span></div>;
  if (!lut3D)          return <div className="panel-empty"><span>Curve editor requires a 3D LUT</span></div>;

  const customPts = curves[activeChannel].length - 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="ctrl-section-title">
        Curve Editor
        <HelpTip text="Drag control points to reshape per-channel curves. The 3D lattice updates live as you drag. Master affects all channels equally; R/G/B adjust individual channels on top. Click empty space to add a point, drag to move, right-click to delete. Revert undoes all curve work since this panel was opened." />
      </div>

      {/* Channel tabs + per-channel reset */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {CHANNELS.map((ch) => (
          <button
            key={ch}
            className={`toggle-btn ${activeChannel === ch ? 'active' : ''}`}
            style={activeChannel === ch ? { borderColor: CHANNEL_COLORS[ch], color: CHANNEL_COLORS[ch] } : {}}
            onClick={() => setActiveChannel(ch)}
            title={ch === 'master' ? 'Master — applied to R, G and B equally' : `${ch.toUpperCase()} channel only`}
          >
            {ch === 'master' ? 'M' : ch.toUpperCase()}
          </button>
        ))}
        <button
          className="btn-sm"
          style={{ marginLeft: 'auto', fontSize: 9 }}
          onClick={handleResetChannel}
          title={`Reset ${activeChannel === 'master' ? 'Master' : activeChannel.toUpperCase()} channel to identity`}
        >
          ↺ {activeChannel === 'master' ? 'M' : activeChannel.toUpperCase()}
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={{ width: '100%', display: 'block', borderRadius: 4, cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      />

      <div style={{ fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.4 }}>
        Click to add · drag to move · right-click to delete
        {customPts > 0 && (
          <span style={{ color: CHANNEL_COLORS[activeChannel] }}>
            {' '}· {customPts} point{customPts !== 1 ? 's' : ''} on {activeChannel === 'master' ? 'M' : activeChannel.toUpperCase()}
          </span>
        )}
      </div>

      {/* Revert */}
      <button className="btn-sm full" onClick={handleRevert}
        title="Restore the LUT to what it was when you opened this panel and clear all curves">
        ↺ Revert to Pre-Edit State
      </button>
    </div>
  );
};
