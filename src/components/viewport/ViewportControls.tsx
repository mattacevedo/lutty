import React from 'react';
import { useAppStore } from '../../store/index';
import type { DisplayMode, ColorMode, SliceAxis, InterpolationMethod } from '../../core/lut/types';
import { HelpTip } from '../ui/HelpTip';

export const ViewportControls: React.FC = () => {
  const viewport = useAppStore((s) => s.viewport);
  const setViewport = useAppStore((s) => s.setViewport);

  const sl = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, tip?: string) => (
    <label className="ctrl-row">
      <span className="ctrl-label">{label}{tip && <HelpTip text={tip} align="right" />}</span>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="ctrl-slider"
      />
      <span className="ctrl-value">{value.toFixed(2)}</span>
    </label>
  );

  const sel = <T extends string>(label: string, value: T, opts: { value: T; label: string }[], onChange: (v: T) => void, tip?: string) => (
    <label className="ctrl-row">
      <span className="ctrl-label">{label}{tip && <HelpTip text={tip} align="right" />}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="ctrl-select">
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );

  const tog = (label: string, value: boolean, onChange: (v: boolean) => void, shortcut?: string, tip?: string) => (
    <label className="ctrl-row ctrl-toggle" title={shortcut ? `Shortcut: ${shortcut}` : undefined}>
      <span className="ctrl-label">{label}{shortcut && <span className="shortcut-hint"> [{shortcut}]</span>}{tip && <HelpTip text={tip} align="right" />}</span>
      <button
        className={`toggle-btn ${value ? 'active' : ''}`}
        onClick={() => onChange(!value)}
      >{value ? 'ON' : 'OFF'}</button>
    </label>
  );

  return (
    <div className="viewport-controls">
      <div className="ctrl-section-title">Display</div>

      {sel<DisplayMode>('Mode', viewport.displayMode, [
        { value: 'lattice', label: 'Lattice' },
        { value: 'points', label: 'Points' },
        { value: 'mesh', label: 'Mesh' },
        { value: 'slice', label: 'Slice' },
      ], (v) => setViewport({ displayMode: v }),
        'How to draw the LUT in 3D. Lattice connects the points with edges so you can see the grid structure. Points shows dots only. Slice shows a flat cross-section through the cube.'
      )}

      {sel<ColorMode>('Color by', viewport.colorMode, [
        { value: 'destinationRGB', label: 'Destination RGB' },
        { value: 'sourceRGB', label: 'Source RGB' },
        { value: 'hue', label: 'Hue' },
        { value: 'luminance', label: 'Luminance' },
        { value: 'deltaMagnitude', label: 'Delta Magnitude' },
      ], (v) => setViewport({ colorMode: v }),
        'What color to paint each point. "Destination RGB" colors points by their output color. "Delta Magnitude" shows how far each point moved from the identity — bright = big change.'
      )}

      {tog('Identity Cube', viewport.showIdentity, (v) => setViewport({ showIdentity: v }), 'I',
        'Show the unmodified reference cube (a perfect grid). Comparing it to the transformed positions reveals the LUT\'s color shifts.'
      )}
      {tog('Transformed', viewport.showTransformed, (v) => setViewport({ showTransformed: v }), 'T',
        'Show the LUT\'s actual output points — where each color ends up after the transform is applied.'
      )}
      {tog('Clipped Nodes', viewport.showClippedHighlight, (v) => setViewport({ showClippedHighlight: v }), undefined,
        'Highlight any points whose output falls outside the [0, 1] range in red. Clipped values will look wrong or "blow out" in real images.'
      )}

      {sl('Point Size', viewport.pointSize, 1, 12, 0.5, (v) => setViewport({ pointSize: v }),
        'Size of each rendered point in pixels. Larger = easier to see; smaller = less visual clutter.'
      )}
      {sl('Opacity', viewport.opacity, 0.05, 1, 0.01, (v) => setViewport({ opacity: v }),
        'Transparency of the points. Lower opacity lets you see through the front layer to points behind it.'
      )}
      {sl('Density', viewport.densityFactor, 0.1, 1, 0.05, (v) => setViewport({ densityFactor: v }),
        'Fraction of LUT nodes to draw. At 1.0 all points are shown. Lower values thin the display for better performance with large LUTs.'
      )}

      {viewport.displayMode === 'slice' && (
        <>
          <div className="ctrl-section-title">Slice</div>
          {sel<SliceAxis>('Axis', viewport.sliceAxis, [
            { value: 'R', label: 'R (Red)' },
            { value: 'G', label: 'G (Green)' },
            { value: 'B', label: 'B (Blue)' },
          ], (v) => setViewport({ sliceAxis: v }),
            'Which color axis to cut along. For example, "G" shows all nodes where green input equals the slice position.'
          )}
          {sl('Position', viewport.slicePosition, 0, 1, 0.01, (v) => setViewport({ slicePosition: v }),
            'Where along the axis to take the slice. 0 = darkest end, 1 = brightest end.'
          )}
        </>
      )}

      <div className="ctrl-section-title">Orbit</div>
      {tog('Invert Vertical', viewport.invertVerticalOrbit, (v) => setViewport({ invertVerticalOrbit: v }), undefined,
        'Reverses the up/down drag direction when rotating the 3D view. Turn off if the camera feels backwards.'
      )}
      {tog('Invert Horizontal', viewport.invertHorizontalOrbit, (v) => setViewport({ invertHorizontalOrbit: v }), undefined,
        'Reverses the left/right drag direction when rotating the 3D view.'
      )}

      <div className="ctrl-section-title">Interpolation</div>
      {sel<InterpolationMethod>('Method', viewport.interpolation, [
        { value: 'tetrahedral', label: 'Tetrahedral' },
        { value: 'trilinear', label: 'Trilinear' },
      ], (v) => setViewport({ interpolation: v }),
        'How to blend between LUT nodes when sampling colors that fall between grid points. Tetrahedral is the industry standard (used by DaVinci Resolve and most broadcast gear) and gives smoother results.'
      )}
    </div>
  );
};
