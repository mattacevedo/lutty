import React, { useState } from 'react';
import { DiagnosticsPanel } from '../analysis/DiagnosticsPanel';
import { RgbCurvesPanel } from '../analysis/RgbCurvesPanel';
import { EditControls } from '../editor/EditControls';
import { ViewportControls } from '../viewport/ViewportControls';
import { MathExprPanel } from '../editor/MathExprPanel';
import { CdlPanel } from '../editor/CdlPanel';
import { ColorSpacePanel } from '../editor/ColorSpacePanel';
import { CurveEditorPanel } from '../editor/CurveEditorPanel';

type Group = 'analyze' | 'edit';
type AnalyzeTab = 'viewport' | 'diagnostics' | 'curves';
type EditTab = 'edit' | 'curves' | 'cdl' | 'math' | 'colorspace';

const ANALYZE_TABS: { id: AnalyzeTab; label: string }[] = [
  { id: 'viewport',    label: 'View'  },
  { id: 'diagnostics', label: 'Stats' },
  { id: 'curves',      label: 'Curves'},
];

const EDIT_TABS: { id: EditTab; label: string }[] = [
  { id: 'edit',       label: 'Edit'   },
  { id: 'curves',     label: 'Curves' },
  { id: 'cdl',        label: 'CDL'    },
  { id: 'math',       label: 'Math'   },
  { id: 'colorspace', label: 'Color'  },
];

export const RightPanel: React.FC = () => {
  const [group, setGroup] = useState<Group>('analyze');
  const [analyzeTab, setAnalyzeTab] = useState<AnalyzeTab>('viewport');
  const [editTab, setEditTab] = useState<EditTab>('edit');

  return (
    <div className="right-panel">
      {/* Group selector */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
        {(['analyze', 'edit'] as Group[]).map((g) => (
          <button
            key={g}
            className={`panel-tab ${group === g ? 'active' : ''}`}
            style={{ fontSize: 10, letterSpacing: 1 }}
            onClick={() => setGroup(g)}
          >
            {g === 'analyze' ? 'Analyze' : 'Edit'}
          </button>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="panel-tabs">
        {group === 'analyze'
          ? ANALYZE_TABS.map((t) => (
              <button
                key={t.id}
                className={`panel-tab ${analyzeTab === t.id ? 'active' : ''}`}
                onClick={() => setAnalyzeTab(t.id)}
              >
                {t.label}
              </button>
            ))
          : EDIT_TABS.map((t) => (
              <button
                key={t.id}
                className={`panel-tab ${editTab === t.id ? 'active' : ''}`}
                onClick={() => setEditTab(t.id)}
              >
                {t.label}
              </button>
            ))
        }
      </div>

      {/* Content */}
      <div className="panel-content">
        {group === 'analyze' && (
          <>
            {analyzeTab === 'viewport'    && <ViewportControls />}
            {analyzeTab === 'diagnostics' && <DiagnosticsPanel />}
            {analyzeTab === 'curves'      && <RgbCurvesPanel />}
          </>
        )}
        {group === 'edit' && (
          <>
            {editTab === 'edit'       && <EditControls />}
            {editTab === 'curves'     && <CurveEditorPanel />}
            {editTab === 'cdl'        && <CdlPanel />}
            {editTab === 'math'       && <MathExprPanel />}
            {editTab === 'colorspace' && <ColorSpacePanel />}
          </>
        )}
      </div>
    </div>
  );
};
