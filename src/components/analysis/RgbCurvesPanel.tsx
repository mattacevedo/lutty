/**
 * RGB Curves panel — visualizes a 3D LUT as 1D per-channel transfer curves
 * sampled along the neutral axis (R=G=B=t).
 *
 * Rendered on a <canvas> element using the 2D canvas API (no Three.js needed).
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore, selectActiveLut } from '../../store/index';
import { extractCurves } from '../../core/analysis/curves';
import type { Lut3D } from '../../core/lut/types';
import { HelpTip } from '../ui/HelpTip';

const CHANNEL_COLORS = {
  r: '#ff5555',
  g: '#55ff55',
  b: '#5599ff',
  master: '#cccccc',
} as const;

type ChannelKey = keyof typeof CHANNEL_COLORS;

interface TooltipInfo {
  x: number;
  y: number;
  input: number;
  values: Partial<Record<ChannelKey, number>>;
}

export const RgbCurvesPanel: React.FC = () => {
  const activeLutEntry = useAppStore(selectActiveLut);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState<Record<ChannelKey, boolean>>({
    r: true, g: true, b: true, master: true,
  });
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  const lut3D = activeLutEntry?.lut.type === '3D' ? (activeLutEntry.lut as Lut3D) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !lut3D) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const PAD = 20;
    const plotW = W - PAD * 2;
    const plotH = H - PAD * 2;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0d0d0f';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = '#1c1c22';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = PAD + (i / 4) * plotW;
      const y = PAD + (i / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(x, PAD);
      ctx.lineTo(x, PAD + plotH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(PAD, y);
      ctx.lineTo(PAD + plotW, y);
      ctx.stroke();
    }

    // Identity diagonal
    ctx.strokeStyle = '#2a2a36';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + plotH);
    ctx.lineTo(PAD + plotW, PAD);
    ctx.stroke();
    ctx.setLineDash([]);

    // Curves
    const curves = extractCurves(lut3D, 256);
    const channels: ChannelKey[] = ['master', 'b', 'g', 'r'];

    for (const ch of channels) {
      if (!visible[ch]) continue;
      const data = curves[ch];

      ctx.strokeStyle = CHANNEL_COLORS[ch];
      ctx.lineWidth = ch === 'master' ? 1.5 : 1.5;
      ctx.globalAlpha = ch === 'master' ? 0.6 : 0.9;
      ctx.beginPath();

      for (let i = 0; i < data.length; i++) {
        const t = i / (data.length - 1);
        const px = PAD + t * plotW;
        const py = PAD + (1 - Math.max(0, Math.min(1, data[i]))) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Axes border
    ctx.strokeStyle = '#2a2a36';
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD, PAD, plotW, plotH);
  }, [lut3D, visible]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!lut3D || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const PAD = 20;
    const plotW = canvas.width - PAD * 2;
    const plotH = canvas.height - PAD * 2;

    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top)  * scaleY;

    if (cx < PAD || cx > PAD + plotW || cy < PAD || cy > PAD + plotH) {
      setTooltip(null);
      return;
    }

    const t = (cx - PAD) / plotW;
    const idx = Math.round(t * 255);
    const curves = extractCurves(lut3D, 256);

    const values: Partial<Record<ChannelKey, number>> = {};
    (Object.keys(CHANNEL_COLORS) as ChannelKey[]).forEach((ch) => {
      if (visible[ch]) values[ch] = curves[ch][idx];
    });

    setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, input: t, values });
  }, [lut3D, visible]);

  if (!activeLutEntry) return <div className="panel-empty"><span>No LUT loaded</span></div>;
  if (!lut3D) return <div className="panel-empty"><span>Curves require a 3D LUT</span></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="ctrl-section-title">
        RGB Transfer Curves (neutral axis)
        <HelpTip text="Shows how the LUT transforms grey values — inputs where red = green = blue. The diagonal dashed line is the identity (no change). A curve above the diagonal brightens; below darkens. Hover over the graph to read exact values." align="right" />
      </div>

      {/* Channel toggles */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(Object.entries(CHANNEL_COLORS) as [ChannelKey, string][]).map(([ch, color]) => (
          <button
            key={ch}
            className={`toggle-btn ${visible[ch] ? 'active' : ''}`}
            style={visible[ch] ? { borderColor: color, color } : {}}
            onClick={() => setVisible((v) => ({ ...v, [ch]: !v[ch] }))}
          >
            {ch.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={210}
          height={210}
          style={{ width: '100%', display: 'block', borderRadius: 4, cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        />
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: Math.min(tooltip.x + 8, 130),
            top: Math.max(tooltip.y - 60, 0),
            background: 'rgba(13,13,15,0.92)',
            border: '1px solid #2a2a36',
            borderRadius: 4,
            padding: '4px 8px',
            fontFamily: 'var(--font)',
            fontSize: 10,
            color: 'var(--text)',
            pointerEvents: 'none',
            lineHeight: 1.7,
          }}>
            <div style={{ color: 'var(--text-dim)' }}>in: {tooltip.input.toFixed(3)}</div>
            {(Object.entries(tooltip.values) as [ChannelKey, number][]).map(([ch, v]) => (
              <div key={ch} style={{ color: CHANNEL_COLORS[ch] }}>
                {ch.toUpperCase()}: {v.toFixed(4)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.4 }}>
        Samples LUT(t,t,t) for t in [0,1]. Shows per-channel response along the neutral axis.
      </div>
    </div>
  );
};
