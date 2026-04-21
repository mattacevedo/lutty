import React, { useRef, useEffect, useCallback } from 'react';
import { useThreeScene } from '../../hooks/useThreeScene';

interface Props {
  onScreenshot?: (dataUrl: string) => void;
}

export const ThreeViewport: React.FC<Props> = ({ onScreenshot }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { handleResize, resetCamera, takeScreenshot } = useThreeScene(canvasRef);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (canvasRef.current) {
          canvasRef.current.width = width * window.devicePixelRatio;
          canvasRef.current.height = height * window.devicePixelRatio;
          canvasRef.current.style.width = `${width}px`;
          canvasRef.current.style.height = `${height}px`;
        }
        handleResize(width, height);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [handleResize]);

  const handleScreenshot = useCallback(() => {
    const url = takeScreenshot();
    if (url) onScreenshot?.(url);
  }, [takeScreenshot, onScreenshot]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#0d0d0f' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 6 }}>
        <button className="btn-icon" onClick={resetCamera} title="Reset Camera (R)">⟳</button>
        <button className="btn-icon" onClick={handleScreenshot} title="Screenshot">⬡</button>
      </div>
      <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, color: '#666', pointerEvents: 'none' }}>
        Drag: orbit · Shift+Drag: pan · Scroll: zoom
      </div>
    </div>
  );
};
