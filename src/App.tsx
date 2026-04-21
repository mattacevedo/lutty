import React, { useRef, useCallback, useState, useEffect } from 'react';
import { LeftPanel } from './components/layout/LeftPanel';
import { RightPanel } from './components/layout/RightPanel';
import { ThreeViewport } from './components/viewport/ThreeViewport';
import { BottomTray } from './components/layout/BottomTray';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

const MIN_TRAY_HEIGHT = 80;
const MAX_TRAY_HEIGHT = 600;
const DEFAULT_TRAY_HEIGHT = 220;

const MIN_RIGHT_WIDTH = 180;
const MAX_RIGHT_WIDTH = 520;
const DEFAULT_RIGHT_WIDTH = 240;

const App: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [trayHeight, setTrayHeight] = useState(DEFAULT_TRAY_HEIGHT);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const centerRef = useRef<HTMLElement>(null);
  const isDraggingRef = useRef(false);
  const isRightDraggingRef = useRef(false);

  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  useKeyboardShortcuts({ onOpenFile: handleOpenFile });

  const handleScreenshot = useCallback((dataUrl: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'lutty-viewport.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // Draggable bottom splitter
  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Draggable right-panel splitter
  const onRightDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isRightDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current && centerRef.current) {
        const rect = centerRef.current.getBoundingClientRect();
        const newHeight = rect.bottom - e.clientY;
        setTrayHeight(Math.max(MIN_TRAY_HEIGHT, Math.min(MAX_TRAY_HEIGHT, newHeight)));
      }
      if (isRightDraggingRef.current) {
        const newWidth = window.innerWidth - e.clientX;
        setRightWidth(Math.max(MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, newWidth)));
      }
    };

    const onMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      if (isRightDraggingRef.current) {
        isRightDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="app-shell" style={{ gridTemplateColumns: `220px 1fr 5px ${rightWidth}px` }}>
      <aside className="panel-left">
        <LeftPanel />
      </aside>

      <main className="panel-center" ref={centerRef}>
        <div className="viewport-area">
          <ThreeViewport onScreenshot={handleScreenshot} />
        </div>

        <div
          className="split-handle"
          onMouseDown={onDividerMouseDown}
          title="Drag to resize"
        />

        <BottomTray height={trayHeight} />
      </main>

      <div
        className="split-handle-v"
        onMouseDown={onRightDividerMouseDown}
        title="Drag to resize"
      />

      <aside className="panel-right">
        <RightPanel />
      </aside>
    </div>
  );
};

export default App;
